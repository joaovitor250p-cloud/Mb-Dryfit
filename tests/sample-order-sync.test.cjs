const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=path=>fs.readFileSync(path,'utf8');
let ts;
try { ts=require('typescript'); }
catch { ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript'); }
const filename=path.join(root,'src/lib/sampleOrderSync.ts');
const compiled=ts.transpileModule(read(filename), {fileName:filename,reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
const errors=(compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
assert.equal(errors.length,0);
const moduleObj={exports:{}};
vm.runInNewContext(compiled.outputText,{module:moduleObj,exports:moduleObj.exports});
const u=moduleObj.exports;
const sample=(fields={})=>({oc:' 777 ',name:'SEM MODELO',reference:'SEM CÓDIGO',tailor:'NÃO INFORMADO',quantity:'',...fields});
const order=(fields={})=>({id:'ord-777',oc:'777',model:'BERMUDA DRY FIT',ref:'10275',office:'VIRGÍLIO',qty:'429',...fields});

test('completa quantidade, REF, costureiro e modelo pela OC sem substituir campos que existem',()=>{
  const patch=u.missingDataFromOrder(sample(),order());
  assert.equal(patch.name,'BERMUDA DRY FIT');
  assert.equal(patch.reference,'10275');
  assert.equal(patch.tailor,'VIRGÍLIO');
  assert.equal(patch.quantity,'429');
  assert.equal(patch.orderId,'ord-777');
  assert.equal(Object.keys(patch).length,5);
});
test('preserva todos os campos preenchidos, inclusive quantidade que diverge da OC',()=>{
  const patch=u.missingDataFromOrder(sample({name:'PEÇA MANUAL',reference:'REF.10089',tailor:'JONY',quantity:'300'}),order());
  assert.equal(Object.keys(patch).length,0);
});
test('aceita quantidades inteiras formatadas e rejeita números ambíguos',()=>{
  for(const [input,expected] of [['1.200','1200'],['1,200','1200'],['4.500.000','4500000'],['420,00','420'],['429','429'],['12.5',''],['-25',''],['abc','']]){
    assert.equal(u.quantityFromOrder(input),expected,String(input));
  }
});
test('OC 777, O.C. 777 e 777 representam o mesmo número',()=>{
  assert.equal(u.normalizeSampleOC('OC 777'),'777');
  assert.equal(u.normalizeSampleOC('O.C. 777'),'777');
  assert.equal(u.normalizeSampleOC('777'),'777');
  assert.equal(u.normalizeSampleOC('OC-777'),'777');
});
test('sem REF na OC não inventa referência, mas completa quantidade e costureiro',()=>{
  const patch=u.missingDataFromOrder(sample(),order({ref:''}));
  assert.equal(patch.reference,undefined);
  assert.equal(patch.quantity,'429');
  assert.equal(patch.tailor,'VIRGÍLIO');
});
test('mesma OC registrada duas vezes não gera associação ambígua; orderId explícito vence',()=>{
  const second=order({id:'outra-oc',office:'MAURO'});
  const lookup=u.buildOrderLookup([order(),second]);
  assert.equal(u.orderForSample(sample(),lookup),null);
  assert.equal(u.orderForSample(sample({orderId:'outra-oc'}),lookup).office,'MAURO');
});
test('OCs diferentes não são misturadas mesmo com referência igual',()=>{
  assert.equal(Object.keys(u.missingDataFromOrder(sample(),order({oc:'778'}))).length,0);
});
test('componentes passam permissão de OCs e sincronizam todos os registros somente por comando explícito',()=>{
  const app=read(path.join(root,'src/App.tsx'));
  const shared=read(path.join(root,'src/SamplesAndCuts.tsx'));
  const workflow=read(path.join(root,'src/SampleWorkflow.tsx'));
  assert.match(app,/canReadOrders=\{permitted\('orders'\)\}/);
  assert.match(shared,/canReadOrders=\{canReadOrders\}/);
  assert.match(workflow,/getDocs\(collection\(db,'cut_orders'\)\)/);
  assert.match(workflow,/runTransaction\(db,async transaction/);
  assert.match(workflow,/transaction\.get\(doc\(db,'production_samples'/);
  assert.match(workflow,/Completar dados pelas OCs/);
  assert.doesNotMatch(workflow,/transaction\.update\(snapshot\.ref,\{[^}]*imageData/);
});
