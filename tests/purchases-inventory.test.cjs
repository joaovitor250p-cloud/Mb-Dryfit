const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/lib/purchasesInventory.ts'),'utf8');
const output=ts.transpileModule(source,{fileName:'purchasesInventory.ts',compilerOptions:{
  module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020
},reportDiagnostics:true});
assert.deepEqual(output.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error)||[],[]);
const context={exports:{},module:{exports:{}},require(name){if(name==='firebase/firestore')return {};throw Error('Dependência inesperada '+name)},crypto:webcrypto,TextEncoder};
vm.runInNewContext(output.outputText,context);
const api=context.exports;

test('quantidade de tecido com 3 casas decimais não perde precisão',()=>{
 assert.equal(api.qtyMilli('12,500'),12500);
 assert.equal(api.qtyMilli('1.2'),1200);
 assert.equal(api.qtyMilli('0,001'),1);
 assert.equal(Number.isNaN(api.qtyMilli('0')),true);
 assert.equal(Number.isNaN(api.qtyMilli('-2')),true);
 assert.equal(Number.isNaN(api.qtyMilli('1,1234')),true);
});
test('monetário aceita valores brasileiros e rejeita inválidos',()=>{
 assert.equal(api.cents('1.234,50'),123450);
 assert.equal(api.cents('4.50'),450);
 assert.equal(api.cents('12,50'),1250);
 assert.equal(Number.isNaN(api.cents('sem valor')),true);
});
test('identificador de estoque é igual para caixa e acentos normalizados',async()=>{
 const first=await api.stockId('Malha Dry Fit','PRETO','KG');
 const second=await api.stockId('MALHA DRY FIT','preto','KG');
 assert.equal(first,second);
 assert.notEqual(first,await api.stockId('MALHA DRY FIT','AZUL','KG'));
 assert.notEqual(first,await api.stockId('MALHA DRY FIT','PRETO','M'));
});
test('nota com tecido exige cor e unidade apropriada antes de permitir entrada',()=>{
 const inv={supplier:'FORNECEDOR',total:'100',lines:[{
   description:'MALHA',color:'',kind:'tecido',unit:'KG',quantity:'2',unitPrice:'50',total:'100'
 }]};
 assert.throws(()=>api.validateInvoice(inv),/cor/);
 inv.lines[0].color='PRETO';inv.lines[0].unit='UN';
 assert.throws(()=>api.validateInvoice(inv),/KG ou metro/);
 inv.lines[0].unit='M';
 assert.doesNotThrow(()=>api.validateInvoice(inv));
});
test('integração de enfesto é uma operação transacional idempotente',()=>{
 assert.match(source,/export async function confirmEnfestoConsumption/);
 assert.match(source,/runTransaction\(db,async t=>/);
 assert.match(source,/if\(existing\.exists\(\)\)throw Error/);
 assert.match(source,/before\[i\]\+deltas\[i\]\.amount<0/);
 assert.match(source,/kind==='enfesto_out'/);
 const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
 assert.match(rules,/match \/companies\/\{companyId\}/);
 assert.match(rules,/currentCompany\(\) == companyId/);
 assert.match(rules,/match \/enfesto_confirmations\/\{confirmationId\}/);
 assert.match(rules,/match \/stock_movements\/\{movementId\}/);
 assert.match(rules,/allow update, delete: if false/);
});
test('layout tem dois indicadores e controle de estoque por cor',()=>{
 const component=fs.readFileSync(path.join(root,'src/PurchasesStock.tsx'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 assert.match(component,/Importar Nota Fiscal/);
 assert.match(component,/Importar Boleto/);
 assert.match(component,/confirmEnfestoConsumption/);
 assert.match(component,/Estoque por tecido e cor/);
 assert.match(app,/purchases:\{label:'Compras e estoque'/);
});
