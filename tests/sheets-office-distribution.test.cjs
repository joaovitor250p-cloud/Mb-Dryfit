'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const sheets=fs.readFileSync(path.join(root,'src/ProductionSheets.tsx'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');

test('abas da distribuição são Distribuição e Todas as fichas, sem Fichas dos costureiros',()=>{
 assert.match(sheets,/Distribuição \(\{pending\.length\}\)/);
 assert.match(sheets,/Todas as fichas \(\{submitted\.length\}\)/);
 assert.doesNotMatch(sheets,/>Fichas dos costureiros</);
 assert.doesNotMatch(sheets,/tab==='tailors'/);
 assert.doesNotMatch(sheets,/tab==='history'/);
});
test('listas de oficinas abrem as fichas compatíveis com cada costureiro',()=>{
 assert.match(sheets,/<details className="sheet-office-group"/);
 assert.match(sheets,/groups\.map\(group=>/);
 assert.match(sheets,/group\.items\.map\(s=>/);
 assert.match(sheets,/const compatibleOffices=/);
 assert.match(sheets,/canSewType\(name,type,/);
 assert.match(sheets,/const unclassified=/);
});
test('cards para enviar fichas têm data, valor individual e confirmação de envio',()=>{
 assert.match(sheets,/sheet-send-card/);
 assert.match(sheets,/Data de envio/);
 assert.match(sheets,/sendDates\[s\.id\]\?\?todayInput\(\)/);
 assert.match(sheets,/Valor por peça \(R\$\)/);
 assert.match(sheets,/Confirmar envio e criar OC/);
 assert.match(sheets,/void assign\(s,group\.name\)/);
 assert.match(sheets,/priceOverride\[priceId\]/);
});
test('data de envio define data da OC e prazo 10 dias após envio',()=>{
 assert.match(sheets,/const sentISO=sendDates\[s\.id\]\?\?todayInput\(\)/);
 assert.match(sheets,/const sentDate=new Date/);
 assert.match(sheets,/todayInputFromDate\(sentDate\)!==sentISO/);
 assert.match(sheets,/due=new Date\(sentDate\.getFullYear\(\),sentDate\.getMonth\(\),sentDate\.getDate\(\)\+10\)/);
 assert.match(sheets,/sent:br\(sentDate\),due:br\(due\)/);
});
test('criação da OC e distribuição da ficha continuam em lote atômico, sem remover OCs pagas',()=>{
 assert.match(sheets,/const orderRef=doc\(db,'cut_orders',s\.id\)/);
 assert.match(sheets,/batch\.update\(doc\(db,'production_sheets',s\.id\)/);
 assert.match(sheets,/batch\.set\(orderRef,order\)/);
 assert.match(sheets,/await batch\.commit\(\)/);
 assert.doesNotMatch(sheets,/deleteDoc\(doc\(db,'cut_orders'/);
 assert.match(rules,/request\.resource\.data\.office == getAfter/);
});
test('após confirmar envio há impressão e Todas as fichas inclui busca e filtro de oficina',()=>{
 assert.match(sheets,/print\(lastAssigned\)/);
 assert.match(sheets,/Imprimir ficha enviada/);
 assert.match(sheets,/setLastAssigned\(/);
 assert.match(sheets,/Filtrar fichas por oficina/);
 assert.match(sheets,/Pesquisar ficha por OC, REF ou modelo/);
 assert.match(sheets,/historyOffice==='pending'/);
 assert.match(sheets,/s\.status==='assigned'&&workshopKey\(s\.assignedTailor\)===historyOffice/);
 assert.match(sheets,/sheet-history-card/);
});
test('JSX das fichas é analisável pelo compilador TypeScript',()=>{
 const result=ts.transpileModule(sheets,{fileName:'src/ProductionSheets.tsx',reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
});
