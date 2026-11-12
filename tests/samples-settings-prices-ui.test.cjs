'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
const samples=fs.readFileSync(path.join(root,'src/SampleWorkflow.tsx'),'utf8');
const referencePrices=fs.readFileSync(path.join(root,'src/ReferencePrices.tsx'),'utf8');

function sampleSummary(items){
 const start=samples.indexOf('const samplePieces=useMemo(()=>{');
 const end=samples.indexOf('const incorrectTailorNames=',start);
 assert.ok(start>=0&&end>start,'a soma deve vir dos dados reais das amostras');
 const snippet=samples.slice(start,end);
 const compiled=ts.transpileModule(snippet+'\nexports.result=samplePieces;', {
  compilerOptions:{target:ts.ScriptTarget.ES2020}
 }).outputText;
 const ctx={exports:{},items,useMemo:callback=>callback()};
 vm.runInNewContext(compiled,ctx);
 return {total:ctx.exports.result.total,missing:ctx.exports.result.missing};
}

test('Amostras destaca soma de peças e não total de cadastros',()=>{
 const records=[{quantity:'420'},{quantity:'80'},{quantity:'1.200'},{quantity:''},{quantity:'inválida'}];
 assert.deepEqual(sampleSummary(records),{total:1700,missing:2});
 assert.match(samples,/samplePieces\.total\.toLocaleString\('pt-BR'\)/);
 assert.doesNotMatch(samples,/Registros cadastrados, com ou sem foto/);
});

test('cadastros incompletos não inventam quantidade e valores zero não são registros',()=>{
 assert.deepEqual(sampleSummary([{quantity:'0'},{quantity:' 100 '},{quantity:'1,5'},{quantity:null}]),{total:100,missing:2});
});

test('Configurações reúne Informações, Oficinas e Preços como telas independentes',()=>{
 assert.match(app,/label:'CONFIGURAÇÕES',items:\['info','workshops','prices'\]/);
 assert.match(app,/item==='info' \? <InfoPage/);
 assert.match(app,/item==='workshops' \? <WorkshopsPage/);
 assert.match(app,/item==='prices' \? <ReferencePrices/);
 assert.doesNotMatch(app,/item==='settings' \? <SettingsHub/);
 assert.match(app,/section==='prices'\?access\.includes\('workshops'\)/);
 assert.match(app,/items=group\.items\.filter\(item=>availableViews\.includes\(item\)\)/);
});

test('rótulos do menu identificam as funções existentes',()=>{
 for(const text of ['Amostras e cortes','OCs e pagamentos','Fichas de produção','Distribuir fichas','Compras e estoque','Controle de gastos','Informações e PIX','Oficinas e costureiros','Preços padrão por REF']){
  assert.ok(app.includes(text),'menu precisa identificar '+text);
 }
});

test('busca de REF tem filtros visuais, resultados ao vivo e botão limpar',()=>{
 assert.match(referencePrices,/className="ref-price-search-field"/);
 assert.match(referencePrices,/type="search"/);
 assert.match(referencePrices,/onChange=\{e=>setFilter\(e\.target\.value\)\}/);
 assert.match(referencePrices,/aria-live="polite"/);
 assert.match(referencePrices,/setTypeFilter\(kind\)/);
 assert.match(referencePrices,/setFilter\(''\)/);
 assert.match(referencePrices,/visible\.map\(r=>/);
});

test('cadastro de preços continua gravando no mesmo caminho e edição permanece disponível',()=>{
 assert.match(referencePrices,/setDoc\(doc\(db,'reference_prices',KEY\(kind,ref\)\)/);
 assert.match(referencePrices,/onClick=\{\(\)=>startEdit\(r\)\}/);
 assert.match(referencePrices,/onClick=\{\(\)=>void importStarter\(\)\}/);
});
