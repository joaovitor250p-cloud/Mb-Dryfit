'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('src/lib/enfestoWorkflow.ts');
const output=ts.transpileModule(source,{fileName:'src/lib/enfestoWorkflow.ts',compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},reportDiagnostics:true});
assert.deepEqual((output.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error),[]);
const ctx={exports:{},require(name){
 if(name==='./purchasesInventory')return {decimal(raw){
  let value=String(raw||'').replace(/\./g,'').replace(',','.');
  if(/^\d+\.\d+$/.test(String(raw||''))&&!String(raw||'').includes(','))value=String(raw);
  return Number(value)||NaN;
 },qtyMilli(raw){
  const n=Number(raw);return n>0&&Number.isInteger(n*1000)?n*1000:NaN;
 }};
 throw Error('Unexpected require '+name);
}};
vm.runInNewContext(output.outputText,ctx);
const api=ctx.exports;
const row=(color,qty)=>({cor:color,p:String(qty),m:'',g:'',gg:'',xg:''});
const filled=(color,expected,stockId='')=>({cor:color,expected,layers:'10',weightPerLayer:'1,200',cutPieces:String(expected),stockId,consumption:'',checked:true});

test('a ficha cria linhas de enfesto por cor e soma quantidades sem duplicar',()=>{
 const items=api.makeEnfestoRows([row('PRETO',100),row('BRANCO',50)]);
 assert.equal(items.length,2);
 assert.equal(items[0].expected,100);
 assert.equal(items[1].expected,50);
 assert.equal(api.totalExpected(items),150);
 assert.equal(api.totalCut(items),150);
});
test('camadas vezes peso por folha calcula consumo em KG',()=>{
 const item=filled('PRETO',100);
 assert.equal(api.calculatedKg(item),12);
 assert.equal(api.calculateConsumption(item,'KG'),12);
 item.consumption='10,500';
 assert.equal(api.calculateConsumption(item,'KG'),10.5);
});
test('sem marcar todas as cores como conferidas, não libera distribuição',()=>{
 const rows=[filled('PRETO',100)];
 rows[0].checked=false;
 assert.match(api.validateEnfesto(rows,[],true),/Confirme o corte/);
 rows[0].checked=true;
 assert.equal(api.validateEnfesto(rows,[],true),'');
});
test('consumo só permite tecido da mesma cor e saldo suficiente',()=>{
 const row=filled('PRETO',100,'stock1');
 const stocks=[{id:'stock1',material:'DRYFIT',color:'PRETO',unit:'KG',kind:'tecido',quantityMilli:15000}];
 assert.equal(api.validateEnfesto([row],stocks,false),'');
 assert.match(api.validateEnfesto([row],[{...stocks[0],quantityMilli:9000}],false),/Estoque insuficiente/);
 assert.match(api.validateEnfesto([row],[{...stocks[0],color:'AZUL'}],false),/não confere/);
});
test('reabertura recupera camadas e confere novamente quando quantidade da ficha muda',()=>{
 const previous=[filled('PRETO',100,'stock1')];
 const same=api.makeEnfestoRows([row('Preto',100)],previous);
 assert.equal(same[0].layers,'10');
 const changed=api.makeEnfestoRows([row('PRETO',110)],previous);
 assert.equal(changed[0].checked,false);
 assert.equal(changed[0].cutPieces,'110');
});
test('fichas novas entram em enfesto, somente finalizadas entram na distribuição',()=>{
 const sheets=read('src/ProductionSheets.tsx');
 assert.match(sheets,/const save=async\(status:'draft'\|'enfesto'\)/);
 assert.match(sheets,/save\('enfesto'\)/);
 assert.match(sheets,/const pending=sheets\.filter\(s=>s\.status==='pending'\)/);
 assert.match(sheets,/Ficha enviada ao Enfesto e Corte/);
 assert.match(sheets,/const assigned=sheets\.filter\(s=>s\.status==='assigned'\)/);
});
test('conclusão e baixa de estoque são atômicas e identificadas pela ficha',()=>{
 const inventory=read('src/lib/purchasesInventory.ts');
 assert.match(inventory,/export async function finishEnfestoWithoutStock/);
 assert.match(inventory,/export async function confirmEnfestoConsumption/);
 assert.match(inventory,/sourceId!==linkedSheet\.sheetId/);
 assert.match(inventory,/t\.set\(jobRef,/);
 assert.match(inventory,/t\.update\(sheetRef,\{status:'pending'/);
 assert.match(inventory,/if\(existing\.exists\(\)\)throw Error/);
 assert.match(inventory,/before\[i\]\+deltas\[i\]\.amount<0/);
});
test('permissão de Enfesto é independente e transição é protegida por documento concluído',()=>{
 const rules=read('firestore.rules'),app=read('src/App.tsx'),admin=read('src/AccountsAdmin.tsx');
 assert.match(rules,/match \/enfesto_jobs\/\{sheetId\}/);
 assert.match(rules,/data\.status in \['draft','completed'\]/);
 assert.match(rules,/resource\.data\.status == 'enfesto'/);
 assert.match(rules,/function validEnfestoHandoff\(sheetId\)/);
 assert.match(rules,/job\.status == 'completed'/);
 assert.match(rules,/job\.completedBy == request\.auth\.uid/);
 assert.match(rules,/canWrite\('enfesto'\)/);
 assert.match(admin,/value: 'enfesto'/);
 assert.match(app,/item==='enfesto' \? <EnfestoPage/);
});
test('Enfesto e Corte tem progresso, cards por cor e conclusão explícita',()=>{
 const page=read('src/EnfestoPage.tsx');
 for(const field of ['Camadas','Peso por folha','Peças cortadas','Tecido da cor no estoque','Consumo real','Cor cortada e conferida','Salvar progresso','Finalizar Enfesto e liberar ficha']){
  assert.ok(page.includes(field),field);
 }
 assert.match(page,/readLocal\(user\.uid,sheet\.id\)/);
 assert.match(page,/runTransaction\(db,async transaction=>/);
 assert.match(page,/confirmEnfestoConsumption/);
});
test('Enfesto mostra apenas a lista normal e ordena OCs do menor para o maior',()=>{
 const page=read('src/EnfestoPage.tsx'),app=read('src/App.tsx');
 assert.match(page,/const ocOrder=\(a:Sheet,b:Sheet\)=>a\.oc\.localeCompare\(b\.oc,'pt-BR',\{numeric:true\}\)/);
 assert.match(page,/const waiting=useMemo\(\(\)=>sheets\.filter\(x=>x\.status==='enfesto'\)\.sort\(ocOrder\)/);
 assert.match(page,/const completed=useMemo\(\(\)=>sheets\.filter\(x=>!!x\.enfestoCompletedAt&&x\.status!=='enfesto'\)\.sort\(ocOrder\)/);
 assert.doesNotMatch(page,/ProtectedEnfestoOcs/);
 assert.doesNotMatch(page,/OCs 752, 753 e 754/);
 assert.match(app,/item==='enfesto' \? <EnfestoPage/);
});
test('Ao confirmar Enfesto, ficha vai à distribuição e cria OC quando enviada ao costureiro',()=>{
 const inventory=read('src/lib/purchasesInventory.ts'),sheets=read('src/ProductionSheets.tsx'),page=read('src/EnfestoPage.tsx');
 assert.match(page,/confirmFinish\.sheetId!==sheet\.id/);
 assert.match(page,/CENTRO DE DISTRIBUIÇÃO → Distribuir fichas/);
 assert.match(inventory,/t\.update\(sheetRef,\{status:'pending'/);
 assert.match(sheets,/const pending=sheets\.filter\(s=>s\.status==='pending'\)/);
 assert.match(sheets,/const assign=async\(s:Sheet\)/);
 assert.match(sheets,/batch\.update\(doc\(db,'production_sheets',s\.id\),\{status:'assigned'/);
 assert.match(sheets,/if\(!legacy\)batch\.set\(orderRef,order\);await batch\.commit\(\)/);
 assert.match(sheets,/A OC foi criada em OCs e pagamentos/);
 assert.match(sheets,/OC financeira já existente foi preservada/);
});
test('os arquivos TSX do fluxo não têm erro de sintaxe',()=>{
 for(const path of ['src/EnfestoPage.tsx','src/ProductionSheets.tsx','src/App.tsx']){
  const src=read(path);
  const result=ts.transpileModule(src,{fileName:path,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});
  const errors=(result.diagnostics||[]).filter(e=>e.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,path+': '+errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
 }
});
