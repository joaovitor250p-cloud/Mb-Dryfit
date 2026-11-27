'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const sheets=fs.readFileSync(path.join(root,'src/ProductionSheets.tsx'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');


test('troca de costureiro só aparece para usuário autorizado e sincroniza OC sem pagamentos',()=>{
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 const admin=fs.readFileSync(path.join(root,'src/AccountsAdmin.tsx'),'utf8');
 assert.match(admin,/tailor_reassignment/);
 assert.match(app,/canReassignTailor=\{editor&&\(admin\|\|access\.includes\('tailor_reassignment'\)\)\&\&permitted\('sheet_distribution'\)\}/);
 assert.match(sheets,/canReassignTailor\?<div className="sheet-reassign-area">/);
 assert.match(sheets,/const reassignSentSheet=async\(s:Sheet\)=>/);
 assert.match(sheets,/s\.status==='assigned'&&reassignControl\(s\)/);
 assert.match(sheets,/const legacyMatches=/);
 assert.match(rules,/'reassignmentOrderId'/);
 assert.match(rules,/'reassignmentSheetId'/);

 assert.match(sheets,/batch\.update\(sheetRef,\{assignedTailor:target,reassignmentOrderId:orderRef\.id,updatedAt:serverTimestamp\(\),updatedBy:user\.uid\}\)/);
 assert.match(sheets,/batch\.update\(orderRef,\{office:target,reassignmentSheetId:s\.id,updatedAt:serverTimestamp\(\),updatedBy:user\.uid\}\)/);
 assert.match(sheets,/batch\.set\(doc\(collection\(db,'audit_log'\)\)/);
 assert.match(sheets,/await batch\.commit\(\)/);
 assert.match(sheets,/const divergence=workshopKey\(financialOffice\)!==workshopKey\(current\)/);
 assert.doesNotMatch(sheets,/batch\.update\(orderRef,\{[^}]*paymentDone/);
 assert.match(rules,/function canReassignTailor\(\)/);
 assert.match(rules,/canWrite\('tailor_reassignment'\)/);
 assert.match(rules,/request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)/);
 assert.match(rules,/\.hasOnly\(\['office','reassignmentSheetId','updatedAt','updatedBy'\]\)/);
 assert.match(rules,/\.hasOnly\(\['assignedTailor','reassignmentOrderId','updatedAt','updatedBy'\]\)/);
});

test('ficha enviada informa permissão ausente e PWA busca JS/CSS atualizados',()=>{
 const sw=fs.readFileSync(path.join(root,'public/sw.js'),'utf8');
 const startAll=sheets.indexOf("{tab==='all'&&");
 const startDistribution=sheets.indexOf("{tab==='distribution'&&");
 const all=sheets.slice(startAll,startDistribution);
 assert.match(all,/canDistribute&&!canReassignTailor/);
 assert.match(all,/Contas e permissões/);
 assert.match(all,/s\.status==='assigned'&&reassignControl\(s\)/);
 assert.match(sw,/2026-11-27-criador-quatro-etapas-revisao-global/);
 assert.match(sw,/fetch\(req, \{cache:'no-cache'\}\)/);
 assert.match(sw,/caches\.match\(req\)/);
});

test('troca de costureiro existe nas fichas finalizadas e nas em andamento',()=>{
 const startAll=sheets.indexOf("{tab==='all'&&");
 const startDistribution=sheets.indexOf("{tab==='distribution'&&");
 const startSent=sheets.indexOf("{tab==='sent'&&");
 const endSent=sheets.indexOf("{isAdmin&&initialTab==='create'",startSent);
 assert.ok(startAll>=0&&startDistribution>startAll&&startSent>startDistribution&&endSent>startSent);
 assert.match(sheets.slice(startAll,startDistribution),/s\.status==='assigned'&&reassignControl\(s\)/);
 assert.match(sheets.slice(startSent,endSent),/reassignControl\(s\)/);
 assert.match(sheets.slice(startAll,startDistribution),/sheet-reassign-guidance/);
 assert.match(sheets.slice(startSent,endSent),/Costureiros — fichas em andamento/);
});

test('OCs e Pagamentos usa ação autorizada e grava ficha e OC juntas',()=>{
 const cut=fs.readFileSync(path.join(root,'src/CutOrders.tsx'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 assert.match(app,/<CutOrders db=\{db!\} user=\{user\} canEdit=\{editor&&permitted\('orders'\)\} canReassignTailor=/);
 assert.match(cut,/const prepareTailorTransfer=async\(order:Order\)=>/);
 assert.match(cut,/const confirmTailorTransfer=async\(\)=>/);
 assert.match(cut,/batch\.update\(sheetRef,\{assignedTailor:target,reassignmentOrderId:orderRef\.id/);
 assert.match(cut,/batch\.update\(orderRef,\{office:target,reassignmentSheetId:sheetRef\.id/);
 assert.match(cut,/Trocar costureiro na ficha/);
 assert.match(cut,/Somente o dono ou alguém autorizado pode alterar o costureiro/);
 assert.doesNotMatch(cut,/batch\.update\(orderRef,\{office:target,paymentDone/);
});

test('reconcilia OC divergente, aceita OC sem ficha e preserva pagamentos',()=>{
 const cut=fs.readFileSync(path.join(root,'src/CutOrders.tsx'),'utf8');
 const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
 assert.doesNotMatch(sheets,/OCs sem ficha cadastrada/);
 assert.match(sheets,/s\.status==='pending'&&canDistribute&&/);
 assert.match(sheets,/Confirmar distribuição/);
 assert.match(sheets,/canAddTailor&&/);
 assert.match(app,/onAddTailor=/);
 assert.match(sheets,/Costureiro \/ oficina \* \(obrigatório\)<select required/);
 assert.match(cut,/const sheetOffice=canonicalWorkshopName/);
 assert.match(cut,/transfer\.sheetId/);
 assert.match(cut,/batch\.update\(orderRef,\{office:target,updatedAt:serverTimestamp\(\),updatedBy:user\.uid\}\)/);
 assert.match(rules,/resource\.data\.office == resource\.data\.office/);
 assert.match(rules,/resource\.data\.get\('reassignmentSheetId',null\) == null/);
 assert.match(rules,/canReassignTailor\(\)/);
 assert.doesNotMatch(sheets,/O costureiro foi modificado em outro aparelho ou os registros estão divergentes/);
});

test('Todas as fichas mostra seleção direta de costureiro nas fichas pendentes, sem seção extra',()=>{
 const all=sheets.slice(sheets.indexOf("{tab==='all'&&"),sheets.indexOf("{tab==='distribution'&&"));
 const sent=sheets.slice(sheets.indexOf("{tab==='sent'&&"));
 assert.match(all,/s\.status==='pending'&&canDistribute&&/);
 assert.match(all,/sheet-pending-assign/);
 assert.match(all,/void assign\(s\)/);
 assert.match(all,/Costureiro \/ oficina \* \(obrigatório\)<select required/);
 assert.doesNotMatch(all,/OCs sem ficha cadastrada/);
 assert.match(sent,/reassignControl\(s\)/);
});
test('erro de permissão informa etapa e projeto Firebase para OC enviada',()=>{
 assert.match(sheets,/let stage='consultar OC por ID'/);
 assert.match(sheets,/stage='localizar OC financeira antiga'/);
 assert.match(sheets,/stage='consultar ficha enviada'/);
 assert.match(sheets,/stage='gravação atômica de ficha, OC e auditoria'/);
 assert.match(sheets,/db\.app\.options\.projectId/);
 assert.match(sheets,/Nenhum pagamento foi alterado/);
});

test('Todas as fichas usa apenas OCs entregues e Costureiros mostra andamento, inclusive OC legada',()=>{
 assert.match(sheets,/const statusForSheet=\(s:Sheet\)=>orderStatuses\[s\.id\]\|\|orderStatusByOc\[normalizeOcNumber\(s\.oc\)\]/);
 assert.match(sheets,/const completedSheets=assigned\.filter\(s=>statusForSheet\(s\)==='ENTREGUE'\)/);
 assert.match(sheets,/const atOffice=assigned\.filter\(s=>statusForSheet\(s\)!=='ENTREGUE'\)/);
 assert.match(sheets,/const phaseSheets=phaseFilter==='enfesto'\?inEnfesto:phaseFilter==='office'\?atOffice:completedSheets/);
 assert.match(sheets,/Todas as fichas \(\{completedSheets\.length\}\)/);
 assert.match(sheets,/Costureiros \(\{atOffice\.length\}\)/);
 assert.match(sheets,/const sentFiltered=atOffice\.filter/);
});

test('transferência OC754 não exige acesso cruzado ao documento em outro ID e limita os campos',()=>{
 const cut=rules.slice(rules.indexOf('match /cut_orders/{orderId}'),rules.indexOf('function validExpense'));
 const sheet=rules.slice(rules.indexOf('match /production_sheets/{sheetId}'),rules.indexOf('allow delete:',rules.indexOf('match /production_sheets/{sheetId}')));
 assert.match(cut,/canReassignTailor\(\)/);
 assert.match(cut,/\.hasOnly\(\['office','reassignmentSheetId','updatedAt','updatedBy'\]\)/);
 assert.match(sheet,/\.hasOnly\(\['assignedTailor','reassignmentOrderId','updatedAt','updatedBy'\]\)/);
 assert.doesNotMatch(cut,/getAfter\(\/databases\/\$\(database\)\/documents\/production_sheets\/\$\(request\.resource\.data\.reassignmentSheetId\)\)/);
 assert.doesNotMatch(sheet,/getAfter\(\/databases\/\$\(database\)\/documents\/cut_orders\/\$\(request\.resource\.data\.reassignmentOrderId\)\)/);
});
test('a distribuição lista fichas disponíveis, não lista de costureiros',()=>{
 assert.match(sheets,/Centro de Distribuição/);
 assert.match(sheets,/filteredPending\.map\(s=>/);
 assert.doesNotMatch(sheets,/groups\.map\(group=>/);
 assert.match(sheets,/const filteredPending=pending\.filter/);
 assert.match(sheets,/const pending=sheets\.filter\(s=>s\.status==='pending'\)\.sort\(compareOcDesc\)/);
 assert.match(sheets,/sheet-pending-grid/);
 assert.match(sheets,/return <details className="sheet-distribution-item"/);
 assert.match(sheets,/sheet-distribution-summary/);
 assert.match(sheets,/sheet-distribution-body/);
});

test('dentro de cada ficha escolhe costureiro, data de envio e valor',()=>{
 assert.match(sheets,/Costureiro \/ oficina \* \(obrigatório\)<select required/);
 assert.match(sheets,/value=\{selectedOffice\}/);
 assert.match(sheets,/setTailor\(v=>\(\{\.\.\.v,\[s\.id\]:e\.target\.value\}\)\)/);
 assert.match(sheets,/const candidates=compatibleOffices\(s\)/);
 assert.match(sheets,/canSewType\(name,type,/);
 assert.match(sheets,/Data de envio/);
 assert.match(sheets,/sendDates\[s\.id\]\?\?todayInput\(\)/);
 assert.match(sheets,/Valor por peça \(R\$\)/);
 assert.match(sheets,/priceOverride\[priceId\]/);
 assert.match(sheets,/void assign\(s\)/);
 assert.match(sheets,/const name=canonicalWorkshopName\(tailor\[s\.id\]\|\|''\)/);
});

test('confirmar envio cria OC com data escolhida e prazo de dez dias',()=>{
 assert.match(sheets,/const sentISO=sendDates\[s\.id\]\?\?todayInput\(\)/);
 assert.match(sheets,/const sentDate=new Date/);
 assert.match(sheets,/todayInputFromDate\(sentDate\)!==sentISO/);
 assert.match(sheets,/due=new Date\(sentDate\.getFullYear\(\),sentDate\.getMonth\(\),sentDate\.getDate\(\)\+10\)/);
 assert.match(sheets,/sent:br\(sentDate\),due:br\(due\)/);
 assert.match(sheets,/const orderRef=doc\(db,'cut_orders',s\.id\)/);
 assert.match(sheets,/batch\.update\(doc\(db,'production_sheets',s\.id\)/);
 assert.match(sheets,/batch\.set\(orderRef,order\)/);
 assert.match(sheets,/await batch\.commit\(\)/);
 assert.match(rules,/request\.resource\.data\.office == getAfter/);
});

test('enviadas vão para Costureiros e ficam disponíveis para impressão A4',()=>{
 assert.match(sheets,/Costureiros \(\{atOffice\.length\}\)/);
 assert.match(sheets,/tab==='sent'&&canDistribute/);
 assert.match(sheets,/sentGroups\.map\(group=>/);
 assert.match(sheets,/const sentFiltered=atOffice\.filter/);
 assert.match(sheets,/group\.items\.map\(s=>/);
 assert.match(sheets,/print\(lastAssigned\)/);
 assert.match(sheets,/BAIXAR \/ IMPRIMIR FICHA ENVIADA/);
 assert.match(sheets,/print\(\{\.\.\.s,assignedTailor:s\.assignedTailor\|\|''\}\)/);
});

test('Todas as fichas mantém pesquisa e filtro de oficinas',()=>{
 assert.match(sheets,/tab==='all'&&\(canEdit\|\|canDistribute\)/);
 assert.match(sheets,/Filtrar fichas por oficina/);
 assert.match(sheets,/Pesquisar ficha por OC, REF ou modelo/);
 assert.match(sheets,/historyOffice==='pending'/);
 assert.match(sheets,/s\.status==='assigned'&&workshopKey\(s\.assignedTailor\)===historyOffice/);
 assert.match(sheets,/sheet-compact-list/);
});

test('ordena OC numericamente da maior para a menor, inclusive com zeros à esquerda',()=>{
 const start=sheets.indexOf('const compareOcDesc=');
 const end=sheets.indexOf('const storedColorsKey=',start);
 assert.ok(start>=0&&end>start,'comparator source');
 const compiled=ts.transpileModule(sheets.slice(start,end)+'\nexports.compare=compareOcDesc;',{
  compilerOptions:{target:ts.ScriptTarget.ES2020}
 }).outputText;
 const context={exports:{}};
 vm.runInNewContext(compiled,context);
 const entries=['9','100','7','050','11','003','2'].map(oc=>({oc}));
 assert.deepEqual(entries.sort(context.exports.compare).map(o=>o.oc),['100','050','11','9','7','003','2']);
 assert.match(sheets,/const pending=sheets\.filter\(s=>s\.status==='pending'\)\.sort\(compareOcDesc\)/);
 assert.match(sheets,/const assigned=sheets\.filter\(s=>s\.status==='assigned'\)\.sort\(compareOcDesc\)/);
 assert.match(sheets,/const submitted=sheets\.filter\(s=>s\.status==='pending'\|\|s\.status==='assigned'\)\.sort\(compareOcDesc\)/);
});

test('cores usadas em fichas anteriores ficam disponíveis nas novas e também no aparelho',()=>{
 assert.match(sheets,/sheet\.colors\|\|\[\]/);
 assert.match(sheets,/const colorOptions=useMemo/);
 assert.match(sheets,/storedColorsKey/);
 assert.match(sheets,/localStorage\.setItem/);
 assert.match(sheets,/onBlur=\{k==='cor'\?e=>rememberColor/);
 assert.match(sheets,/list=\{k==='cor'\?'sheet-color-suggestions'/);
 assert.match(sheets,/<datalist id="sheet-color-suggestions">/);
 const start=sheets.indexOf('const colorOptions=useMemo(');
 const end=sheets.indexOf('const rememberColor=',start);
 const compiled=ts.transpileModule(sheets.slice(start,end)+'\nexports.options=colorOptions;',{
  compilerOptions:{target:ts.ScriptTarget.ES2020}
 }).outputText;
 const ctx={exports:{},sheets:[{colors:[{cor:'Preto'},{cor:'AZUL'},{cor:'preto'}]}],savedColors:['azul','Verde'],normalizeColorName:v=>String(v).toLocaleUpperCase('pt-BR').trim(),useMemo:fn=>fn()};
 vm.runInNewContext(compiled,ctx);
 assert.deepEqual([...ctx.exports.options],['AZUL','PRETO','VERDE']);
});

test('JSX da tela de fichas não contém erros de sintaxe',()=>{
 const result=ts.transpileModule(sheets,{fileName:'src/ProductionSheets.tsx',reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
});
