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


test('folhas por cor usam o menor tamanho positivo e peso único calcula 12 kg e 9,6 kg',()=>{
 const colors=[
  {cor:'PRETA',p:'10',m:'20',g:'20',gg:'10',xg:'0'},
  {cor:'AZUL',p:'8',m:'12',g:'16',gg:'',xg:'0'}
 ];
 const rows=api.makeEnfestoRows(colors);
 assert.equal(rows[0].layers,'10');
 assert.equal(rows[1].layers,'8');
 assert.equal(api.isBlackColor(rows[0].cor),true);
 const updated=api.withSharedSheetWeight(rows,'1,200');
 assert.equal(updated[0].weightPerLayer,'1,200');
 assert.equal(updated[1].weightPerLayer,'1,200');
 assert.equal(api.calculateConsumption(updated[0],'KG'),12);
 assert.equal(api.calculateConsumption(updated[1],'KG'),9.6);
});
test('reabrir progresso preserva camadas preenchidas e peso previamente salvo',()=>{
 const colors=[{cor:'PRETA',p:'10',m:'20',g:'',gg:'',xg:''}];
 const old=[{cor:'PRETA',expected:30,layers:'7',weightPerLayer:'0,850',cutPieces:'30',stockId:'old-id',consumption:'',checked:true}];
 const rows=api.makeEnfestoRows(colors,old);
 assert.equal(rows[0].layers,'7');
 assert.equal(rows[0].weightPerLayer,'0,850');
 assert.equal(rows[0].stockId,'old-id');
 assert.equal(rows[0].checked,true);
});
test('sem preto, mesma alteração de peso se aplica a todas as cores',()=>{
 const rows=api.makeEnfestoRows([row('BRANCO',10),row('VERDE',8)]);
 assert.equal(rows.some(r=>api.isBlackColor(r.cor)),false);
 const updated=api.withSharedSheetWeight(rows,'1,200');
 assert.equal(api.calculatedKg(updated[0]),12);
 assert.equal(api.calculatedKg(updated[1]),9.6);
});

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
 assert.equal(api.calculateConsumption(item,'KG'),12); // KG sempre usa folhas × peso
 assert.equal(api.calculateConsumption(item,'M'),10.5); // em metros usa o consumo informado
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
test('atalho editar cor e versão visíveis no cabeçalho do Enfesto',()=>{
 const page=read('src/EnfestoPage.tsx');
 const css=read('src/enfesto.css');
 assert.match(page,/EDITAR COR DA FICHA/);
 assert.match(page,/Correção de cor disponível · versão 27\/11/);
 assert.match(page,/enfesto-header-edit-color/);
 assert.match(css,/\.enfesto-header-edit-color/);
 assert.match(page,/newColor\.trim\(\)\.replace\(\/\\s\+\/g/);
});
test('enfesto corrige nome da cor na ficha e progresso sem alterar quantidades',()=>{
 const page=read('src/EnfestoPage.tsx'),rules=read('firestore.rules'),style=read('src/enfesto.css');
 assert.match(page,/const correctSheetColor=async\(\)=>/);
 assert.match(page,/transaction\.update\(sheetRef,\{colors,colorCorrectionIndex:item\.index,updatedAt:serverTimestamp\(\),updatedBy:user\.uid\}\)/);
 assert.match(page,/transaction\.update\(jobRef,\{rows:savedRows,updatedAt:serverTimestamp\(\),updatedBy:user\.uid\}\)/);
 assert.match(page,/action:'correcao_cor_enfesto'/);
 assert.match(page,/setSuccess\('Cor corrigida na ficha/);
 assert.match(page,/stockId:'',consumption:'',checked:false/);
 assert.match(page,/disabled=\{busy\|\|!canEdit\|\|sheet\.status!=='enfesto'\}/);
 assert.match(page,/Editar cores da ficha/);
 assert.match(page,/enfesto-color-access/);
 assert.match(page,/Corrigir cor/);
 assert.match(page,/Salvar cor na ficha e no sistema/);
 assert.match(page,/status==='completed'/);
 assert.match(rules,/\.hasOnly\(\['colors','colorCorrectionIndex','updatedAt','updatedBy'\]\)/);
 assert.match(rules,/\.diff\(resource\.data\.colors\[request\.resource\.data\.colorCorrectionIndex\]\)\.affectedKeys\(\)\.hasOnly\(\['cor'\]\)/);
 assert.match(rules,/resource\.data\.colors\.removeAll/);
 assert.match(style,/\.enfesto-color-correction/);
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
