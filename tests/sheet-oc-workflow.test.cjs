'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const compiled=ts.transpileModule(read('src/lib/sheetOcSequence.ts'),{
 fileName:'src/lib/sheetOcSequence.ts',
 reportDiagnostics:true,
 compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}
});
assert.equal((compiled.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error).length,0);
const ctx={exports:{}};
vm.runInNewContext(compiled.outputText,ctx);

test('as OCs 752, 753 e 754 são protegidas e a próxima é 755 após limpeza',()=>{
 assert.equal(ctx.exports.nextProductionOc([{oc:'752'},{oc:'753'},{oc:'754'}]),'755');
 for(const oc of ['752','753','754','0752','0753','0754']){
  assert.equal(ctx.exports.isProtectedProductionOc(oc),true,oc);
 }
 assert.equal(ctx.exports.isProtectedProductionOc('755'),false);
});
test('a sequência considera OCs antigas e novas, sem reutilizar número existente',()=>{
 assert.equal(ctx.exports.nextProductionOc([{oc:'752'},{oc:'753'}],[{oc:'1201'},{oc:'1230'}]),'1231');
 assert.equal(ctx.exports.nextProductionOc([{oc:'754'},{oc:'755'}],[{oc:'755'}]),'756');
 assert.equal(ctx.exports.nextProductionOc([]),'755');
 assert.equal(ctx.exports.normalizeOcNumber('abc'),0);
});
test('criação já mostra próxima OC e cliente MB editável',()=>{
 const page=read('src/ProductionSheets.tsx');
 assert.match(page,/const \[ocAuto,setOcAuto\]=useState\(true\)/);
 assert.match(page,/const nextOc=useMemo\(\(\)=>nextProductionOc\(sheets,orderOcs\.map/);
 assert.match(page,/if\(!canEdit\|\|editingId\|\|!ocAuto\)return/);
 assert.match(page,/if\(key==='oc'\)setOcAuto\(false\)/);
 assert.match(page,/getDocs\(firestoreQuery\(collection\(db,'production_sheets'\),where\('oc','==',form\.oc\.trim\(\)\)\)\)/);
 assert.match(page,/getDocs\(firestoreQuery\(collection\(db,'cut_orders'\),where\('oc','==',form\.oc\.trim\(\)\)\)/);
 assert.match(page,/client:'MB'/);
 assert.match(page,/field\('client','CLIENTE:'\)/);
 assert.match(page,/setMessage\(status==='draft'/);
 assert.doesNotMatch(page,/setMessage\(status='draft'/);
});
test('CLIENTE é opcional nos dados antigos e autorizado para fichas novas',()=>{
 const page=read('src/ProductionSheets.tsx');
 const print=read('src/SheetPrint.tsx');
 const rules=read('firestore.rules');
 assert.match(page,/client:upperField\(sheet\.client\|\|'MB'\)/);
 assert.match(print,/client\?: string/);
 assert.match(print,/sheet\.client\?\.trim\(\)\|\|'MB'/);
 assert.match(rules,/'model','reference','client','pieceType'/);
 assert.match(rules,/!\('client' in d\) \|\| \(d\.client is string && d\.client\.size\(\) <= 120\)/);
});
test('a ficha imprime linhas vazias sem omitir o quadro de cores e tamanhos',()=>{
 const print=read('src/SheetPrint.tsx');
 assert.match(print,/while\(rows\.length<8\)rows\.push\(emptyRow\(\)\)/);
 assert.match(print,/const filled=rows/);
 assert.match(print,/sheet\.color/);
 assert.match(print,/CORES/);
 assert.match(print,/GERAL:/);
});
test('três cartões clicáveis mostram Enfesto, Oficina e Finalizadas',()=>{
 const page=read('src/ProductionSheets.tsx');
 for(const title of ['FICHAS EM ENFESTO','FICHAS NA OFICINA','FICHAS FINALIZADAS'])assert.ok(page.includes(title));
 assert.match(page,/const completedSheets=assigned\.filter\(s=>orderStatuses\[s\.id\]==='ENTREGUE'\)/);
 assert.match(page,/const atOffice=assigned\.filter\(s=>orderStatuses\[s\.id\]!=='ENTREGUE'\)/);
 assert.match(page,/setPhaseFilter\('enfesto'\)/);
 assert.match(page,/setPhaseFilter\('office'\)/);
 assert.match(page,/setPhaseFilter\('done'\)/);
 assert.match(page,/phaseSheets\.filter\(s=>/);
 assert.match(page,/BAIXAR \/ IMPRIMIR FICHA PDF/);
});
test('botão ENTREGAR usa salvamento com amostra sem mexer no pagamento',()=>{
 const order=read('src/CutOrders.tsx');
 assert.match(order,/const markDelivered=async\(order:Order\)/);
 assert.match(order,/await save\(\{\.\.\.order,status:'ENTREGUE',deliveredFlag:'OK',deliveredAt:/);
 assert.match(order,/const save=async\(override\?:Order\)/);
 assert.match(order,/const needsSample = row\.status === 'ENTREGUE'/);
 assert.match(order,/transaction\.set\(sampleRef,/);
 assert.match(order,/className=\{done\(o\)\?'order-delivered-inline is-done'/);
 assert.match(order,/disabled=\{busy\|\|done\(o\)\}/);
});
test('limpeza nunca seleciona OCs protegidas e não inclui pagamentos ou estoque',()=>{
 const cleanup=read('src/ProductionCleanup.tsx'),rules=read('firestore.rules');
 assert.match(cleanup,/isProtectedProductionOc\(item\.data\.oc\)/);
 assert.match(cleanup,/await remove\(current\.jobs,'enfesto_jobs'\)/);
 assert.match(cleanup,/await remove\(current\.sheets,'production_sheets'\)/);
 assert.doesNotMatch(cleanup,/remove\(current\.(orders|payments|inventory)/);
 assert.match(cleanup,/APAGAR FICHAS/);
 assert.match(cleanup,/backup-fichas-enfesto-/);
 assert.match(rules,/allow delete: if isAdmin\(\)\s+&& resource\.data\.oc != '752'/);
});
test('arquivos TSX alterados têm sintaxe válida',()=>{
 for(const file of ['src/ProductionSheets.tsx','src/ProductionCleanup.tsx','src/CutOrders.tsx','src/SheetPrint.tsx','src/EnfestoPage.tsx','src/App.tsx']){
  const result=ts.transpileModule(read(file),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
  const errors=(result.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,file+': '+errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
 }
});
