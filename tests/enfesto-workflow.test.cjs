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

test('edição salva da ficha sincroniza imediatamente cores e quantidades do enfesto',()=>{
 const original=[{cor:'PRETO',p:'10',m:'20',g:'',gg:'',xg:''},{cor:'AZUL',p:'',m:'12',g:'',gg:'',xg:''}];
 const saved=[filled('PRETO',30,'black-stock'),filled('AZUL',12,'blue-stock')];
 const corrected=[{cor:'PRETO',p:'10',m:'18',g:'2',gg:'',xg:''},{cor:'AZUL',p:'',m:'12',g:'',gg:'',xg:''},{cor:'VERDE',p:'5',m:'',g:'',gg:'',xg:''}];
 const rows=api.reconcileEnfestoRowsAfterSheetEdit(original,corrected,saved);
 assert.equal(rows.length,3);
 assert.equal(rows[0].expected,30,'total PRETO permanece 30');
 assert.equal(rows[0].checked,false,'mudança de P/M/G precisa nova conferência mesmo com total igual');
 assert.equal(rows[0].stockId,'','não manter tecido de cor alterada');
 assert.equal(rows[1].checked,true,'cor inalterada conserva conferência');
 assert.equal(rows[1].stockId,'blue-stock');
 assert.equal(rows[2].cor,'VERDE','nova cor disponível imediatamente');
 assert.equal(rows[2].expected,5);
 assert.equal(rows[2].checked,false);
 const renamed=api.reconcileEnfestoRowsAfterSheetEdit(original,[{...original[0],cor:'MARINHO'}],saved);
 assert.equal(renamed.length,1);
 assert.equal(renamed[0].cor,'MARINHO');
 assert.equal(renamed[0].checked,false);
});
test('assinatura da ficha identifica novos tamanhos, mesmo com total igual',()=>{
 const a=[{cor:'PRETO',p:'10',m:'20',g:'',gg:'',xg:''}];
 const b=[{cor:'PRETO',p:'10',m:'18',g:'2',gg:'',xg:''}];
 assert.notEqual(api.sheetColorsSignature(a),api.sheetColorsSignature(b));
 assert.equal(api.sheetColorsSignature(a),api.sheetColorsSignature([{m:20,p:10,cor:'PRETO',g:0,gg:'',xg:''}]));
});
test('Enfesto recebe revisão em tempo real, invalida cache e protege salvamento antigo',()=>{
 const page=read('src/EnfestoPage.tsx'),creator=read('src/ProductionSheets.tsx');
 assert.match(page,/onSnapshot\(collection\(db,'production_sheets'\)/);
 assert.match(page,/sheetColorsSignature\(x\.colors\|\|\[\]\)/);
 assert.match(page,/changedIds\.includes\(selectedSheetRef\.current\)/);
 assert.match(page,/localStorage\.removeItem\(localKey\(user\.uid,id\)\)/);
 assert.match(page,/draftVersions\.current\[sheet\.id\]===signature/);
 assert.match(page,/sheetColorsSignature\(current\.data\(\)\.colors/);
 assert.match(page,/Atualização automática ativa/);
 assert.match(creator,/await runTransaction\(db,async transaction=>/);
 assert.match(creator,/transaction\.update\(sheetRef,updates\)/);
 assert.match(creator,/transaction\.update\(jobRef,\{rows:nextRows/);
 assert.match(creator,/ficha e PDF atualizados para todos/); 
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
test('corrigir em Distribuição mantém a fase pending e não reabre Enfesto concluído',()=>{
 const creator=read('src/ProductionSheets.tsx'),rules=read('firestore.rules');
 assert.match(creator,/\['enfesto','pending','assigned'\]\.includes\(s\.status\)/);
 assert.match(creator,/creatorStageSheets/);
 assert.match(creator,/current\.data\(\)\.status!==original\.status/);
 assert.match(creator,/original\.status==='enfesto'&&job\?\.exists\(\)/);
 assert.match(rules,/resource\.data\.status in \['enfesto','pending','assigned'\]/);
 assert.match(rules,/request\.resource\.data\.status == resource\.data\.status/);
 assert.match(rules,/resource\.data\.status in \['pending','assigned'\]/);
});
test('correção de ficha enviada é feita pelo criador ou dono, não na tela do Enfesto',()=>{
 const creator=read('src/ProductionSheets.tsx');
 const page=read('src/EnfestoPage.tsx');
 const rules=read('firestore.rules');
 assert.match(creator,/const creatorSheets=sheets\.filter\(s=>isAdmin\|\|s\.createdBy===user\.uid\)/);
 assert.match(creator,/const editEnfestoSheet=\(s:Sheet\)=>/);
 assert.match(creator,/const saveEditedEnfesto=async\(approved=false\)=>/);
 assert.match(creator,/Alterar ficha/);
 assert.match(creator,/Salvar correção da ficha/);
 assert.match(creator,/transaction\.update\(sheetRef,updates\)/);
 assert.match(creator,/transaction\.update\(jobRef,\{rows:nextRows,updatedAt:serverTimestamp\(\),updatedBy:user\.uid\}\)/);
 assert.match(creator,/reconcileEnfestoRowsAfterSheetEdit\(previousColors,colors,oldRows\)/);
 assert.match(creator,/action:'production_sheet_revision'/);
 assert.match(page,/sheetColorVersions=useRef/);
 assert.doesNotMatch(page,/EDITAR COR DA FICHA|Editar cores da ficha|Corrigir cor|correctSheetColor/);
 assert.match(rules,/resource\.data\.createdBy == request\.auth\.uid/);
 assert.match(rules,/\.hasOnly\(\['rows','updatedAt','updatedBy'\]\)/);
 assert.match(rules,/request\.resource\.data\.oc == resource\.data\.oc/);
 assert.match(rules,/resource\.data\.status == 'enfesto'/);
});
test('quatro cartões substituem os três antigos acima da Nova ficha sem duplicar dentro do painel',()=>{
 const page=read('src/ProductionSheets.tsx');
 assert.doesNotMatch(page,/FICHAS EM ENFESTO|FICHAS NA OFICINA|FICHAS FINALIZADAS/);
 assert.doesNotMatch(page,/className="sheet-phase-cards"/);
 const top=page.indexOf('creator-stage-tiles creator-stage-tiles-top');
 const tabs=page.indexOf("className={initialTab==='create'?'creator-toolbar':'sheet-tabs'}");
 const panel=page.indexOf('className="sheet-list creator-stage-panel"');
 assert.ok(top>0&&top<tabs&&tabs<panel,'cartões aparecem acima das abas');
 assert.equal((page.match(/className="creator-stage-tiles"/g)||[]).length,0,'não repetir cartões no interior do painel');
 assert.match(page,/onClick=\{\(\)=>\{setCreatorStage\(stage.id\);setCreatorSearch\(''\);setTab\('drafts'\)\}\}/);
 for(const name of ['Em Enfesto','Acabamento \/ Distribuição','Costureiros','Finalizadas'])assert.ok(page.includes(name));
 assert.match(page,/Não é uma falha na Distribuição/);
 assert.match(page,/permissão insuficiente ou regras de correção ainda não publicadas/);
});
test('criador abre nos quatro cartões e não no formulário ou nas abas antigas',()=>{
 const page=read('src/ProductionSheets.tsx');
 assert.match(page,/useState<'create'\|'drafts'\|'all'\|'distribution'\|'sent'>\(initialTab==='create'\?'drafts':'distribution'\)/);
 assert.match(page,/useEffect\(\(\)=>setTab\(initialTab==='create'\?'drafts':'distribution'\)/);
 assert.match(page,/initialTab==='create'&&canEdit&&<div className="creator-stage-tiles creator-stage-tiles-top"/);
 assert.match(page,/onClick=\{\(\)=>\{setCreatorStage\(stage\.id\);setCreatorSearch\(''\);setTab\('drafts'\)\}\}/);
 assert.match(page,/className=\{initialTab==='create'\?'creator-toolbar':'sheet-tabs'\}/);
 assert.match(page,/\+ Nova ficha<\/button>/);
 assert.match(page,/> Voltar aos quatro cartões<\/button>/);
 assert.doesNotMatch(page,/>Painel de fichas \(\{creatorSheets\.length\}\)<\/button>/);
 assert.match(page,/initialTab==='distribution'&&<button type="button" className=\{tab==='all'/);
});
test('painel do criador tem quatro etapas, agrupamento de costureiro e confirmação de revisão',()=>{
 const page=read('src/ProductionSheets.tsx'),rules=read('firestore.rules');
 for(const name of ['Em Enfesto','Acabamento / Distribuição','Costureiros','Finalizadas'])assert.ok(page.includes(name));
 assert.match(page,/creatorStageSheets/);
 assert.match(page,/creatorTailorGroups/);
 assert.match(page,/Baixar ficha PDF/);
 assert.match(page,/revisionConfirm&&createPortal/);
 assert.match(page,/OC \{revisionConfirm\.oc\}/);
 assert.match(page,/\{revisionConfirm\.reference\}/);
 assert.match(page,/\{revisionConfirm\.model\}/);
 assert.match(page,/saveEditedEnfesto\(true\)/);
 assert.match(page,/original\.status==='enfesto'\?await transaction\.get\(jobRef\):null/);
 assert.match(rules,/resource\.data\.status in \['enfesto','pending','assigned'\]/);
 assert.match(rules,/request\.resource\.data\.status == resource\.data\.status/);
});
test('Enfesto e Corte tem progresso, cards por cor e conclusão explícita',()=>{
 const page=read('src/EnfestoPage.tsx');
 for(const field of ['Camadas','Peso por folha','Peças cortadas','Tecido da cor no estoque','Consumo real','Cor cortada e conferida','Salvar progresso','Finalizar Enfesto e liberar ficha']){
  assert.ok(page.includes(field),field);
 }
 assert.match(page,/readLocal\(user\.uid,sheet\.id,signature\)/);
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
