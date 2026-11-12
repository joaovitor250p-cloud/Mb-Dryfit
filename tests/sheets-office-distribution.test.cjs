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
 assert.match(sheets,/Costureiro \/ oficina<select/);
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
 assert.match(sheets,/Costureiros \(\{assigned\.length\}\)/);
 assert.match(sheets,/tab==='sent'&&canDistribute/);
 assert.match(sheets,/sentGroups\.map\(group=>/);
 assert.match(sheets,/const sentFiltered=assigned\.filter/);
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
