'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const workshopKey=name=>String(name??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
function load(relative,mocks={}){
  const result=ts.transpileModule(read(relative),{
    fileName:relative,
    reportDiagnostics:true,
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
  });
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,relative);
  const out={exports:{}};
  vm.runInNewContext(result.outputText,{
    exports:out.exports,module:out,require:key=>{
      if(key==='./workshopNames')return {workshopKey};
      if(key in mocks)return mocks[key];
      throw Error('Dependência inesperada: '+key);
    }
  },{filename:relative});
  return out.exports;
}
const ref=load('src/lib/referencePrices.ts');
const price=load('src/lib/orderPriceSuggestion.ts',{
  './referencePrices':ref,
  './modelTypes':{modelType:()=> 'camisetas'}
});
const suggest=(reference,base=[],specials=[],office='MAURO',model='CAMISETA DRY FIT')=>
  price.suggestOrderPiecePrice(reference,model,office,base,specials);

test('Mauro: sem exceção, preços de 5,00 e 5,50 viram 6,00',()=>{
  assert.equal(suggest('10253').price,'6,00');
  assert.equal(suggest('10283').price,'6,00');
  assert.equal(suggest('10088').price,'6,00');
  assert.equal(suggest('10283').source,'mauro_minimo');
});
test('Mauro: preço padrão de 6,00 ou acima permanece igual à tabela REF',()=>{
  assert.equal(suggest('10025').price,'6,00');
  const regular=[{reference:'10283',type:'Camiseta',price:'7,50'}];
  assert.equal(suggest('10283',regular).price,'7,50');
  assert.equal(suggest('10283',regular).source,'referencia');
});
test('Mauro: preços especiais já cadastrados continuam inclusive abaixo de 6',()=>{
  const workshops=[{name:'Mauro',specialPrices:[
    {reference:'10088',type:'Camiseta',price:'4,00'},
    {reference:'10283',type:'Camiseta',price:'4,20'},
    {reference:'10025',type:'Camiseta',price:'8,50'}
  ]}];
  assert.equal(suggest('10088',[],workshops).price,'4,00');
  assert.equal(suggest('10283',[],workshops).price,'4,20');
  assert.equal(suggest('10025',[],workshops).price,'8,50');
  assert.equal(suggest('10088',[],workshops).source,'costureiro');
});
test('Outros costureiros mantêm os preços de REF e não ganham piso de Mauro',()=>{
  assert.equal(suggest('10283',[],[],'JONY').price,'5,50');
  assert.equal(suggest('10088',[],[],'DARIO MEDINA').price,'3,50');
});
test('REF nova sem preço não recebe preço inventado',()=>{
  assert.equal(suggest('999999'),null);
  assert.equal(ref.priceWithMauroMinimum('MAURO',''), '');
});
test('Regra comum não aplica piso a exceção especial explícita',()=>{
  assert.equal(ref.priceWithMauroMinimum('MAURO','4,50',true),'4,50');
  assert.equal(ref.priceWithMauroMinimum('MAURO','5,50'),'6,00');
  assert.equal(ref.priceWithMauroMinimum('MAURO','6,00'),'6,00');
  assert.equal(ref.priceWithMauroMinimum('MAURO','7,25'),'7,25');
  assert.equal(ref.priceWithMauroMinimum('JONY','4,50'),'4,50');
});
test('Distribuição de fichas e Nova OC usam a mesma regra',()=>{
  const distribution=read('src/ProductionSheets.tsx');
  const orders=read('src/CutOrders.tsx');
  const suggestion=read('src/lib/orderPriceSuggestion.ts');
  assert.match(distribution,/if\(special\)return special\.price/);
  assert.match(distribution,/priceWithMauroMinimum\(name,standard\?\.price\?\?''\)/);
  assert.match(suggestion,/priceWithMauroMinimum\(office,raw,source\.source==='costureiro'\)/);
  assert.match(orders,/suggestOrderPiecePrice\(/);
});
