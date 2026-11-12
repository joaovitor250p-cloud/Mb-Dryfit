'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('src/lib/sheetCatalogAutofill.ts');
const js=ts.transpileModule(source,{fileName:'src/lib/sheetCatalogAutofill.ts',reportDiagnostics:true,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}});
const diagnostics=(js.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
assert.equal(diagnostics.length,0,diagnostics.map(x=>x.messageText).join('\n'));
const context={exports:{},require(id){
 if(id==='./modelTypes')return {modelType(name){
  const first=String(name).toUpperCase().split(' ')[0];
  return first==='BERM'?'bermudas':first==='CAM'?'camisas':first==='CAMISETA'?'camisetas':first==='REGATA'?'regatas':'outros';
 }};
 throw Error('Unexpected require '+id);
}};
vm.runInNewContext(js.outputText,context);
const {upperField,normalizeColorName,garmentNameWithoutColorOrSize,lookupReference,garmentTypeFromCatalog,normalizeReferenceNumber}=context.exports;

test('REF seleciona modelo único removendo cor e tamanho no catálogo',()=>{
 const models=[
  {reference:'10030',name:'BERM DRY NIKE PRETO G'},
  {reference:'10030',name:'BERM DRY NIKE AZUL M'},
  {reference:'10089',name:'CAMISETA UV BRANCA GG'}
 ];
 const found=lookupReference(models,'10030');
 assert.deepEqual([...found.names],['BERM DRY']);
 assert.equal(found.suggestedName,'BERM DRY');
 assert.equal(found.suggestedType,'BERMUDA');
 const top=lookupReference(models,'10089');
 assert.equal(top.suggestedName,'CAMISETA UV');
 assert.equal(top.suggestedType,'CAMISETA');
});
test('não inventa modelo quando a REF tem várias peças diferentes',()=>{
 const found=lookupReference([
  {reference:'10001',name:'CAM LISA PRETO P'},
  {reference:'10001',name:'CAM MANGA LONGA BRANCO M'}
 ],'10001');
 assert.equal(found.suggestedName,'');
 assert.equal(found.suggestedType,'');
 assert.equal(found.names.length,2);
});
test('não remove descrições da peça, somente tokens completos de cores e tamanhos',()=>{
 assert.equal(garmentNameWithoutColorOrSize('BERM DRY PRETO R.L. GG'),'BERM DRY R.L.');
 assert.equal(garmentNameWithoutColorOrSize('CAMISETA PREMIUM AZUL MARINHO M'),'CAMISETA PREMIUM');
 assert.equal(upperField('camiseta composição algodão'),'CAMISETA COMPOSIÇÃO ALGODÃO');
 assert.equal(normalizeColorName('  azul    marinho  '),'AZUL MARINHO');
 assert.equal(garmentTypeFromCatalog('BERM DRY'),'BERMUDA');
 assert.equal(garmentTypeFromCatalog('CAM UV M.LON'),'M.L.');
});
test('REF 10162 fica numérica e usa só o nome técnico comum, sem marca ou símbolos',()=>{
 const models=[
  {reference:'REF.10162',name:'CAM UV M.LON ADIDAS SIMB CEN C/ TRAN S/R'},
  {reference:'10162',name:'CAM UV M.LON NIKE FACÃO VAZ T.UNI.F.L R.D'},
  {reference:'10162',name:'CAM UV M.LON NIKE SIMB BAS C/ T.F.L'}
 ];
 const result=lookupReference(models,'REF.10162');
 assert.equal(normalizeReferenceNumber('REF.10162'),'10162');
 assert.equal(result.suggestedName,'CAM UV M.LON');
 assert.equal(result.suggestedType,'M.L.');
 assert.equal(result.names.length,3);
 assert.ok(result.names.every(s=>!/NIKE|ADIDAS|SIMB|FACÃO|VAZ|\bBAS\b|\bCEN\b/.test(s)));
 assert.equal(garmentNameWithoutColorOrSize('CAM UV M.LON NIKE FACÃO VAZ T.UNI.F.L R.D'),'CAM UV M.LON T.UNI.F.L R.D');
});
test('ficha pega catálogo, normaliza campos e oferece impressão nas três etapas',()=>{
 const app=read('src/App.tsx'),sheets=read('src/ProductionSheets.tsx'),enfesto=read('src/EnfestoPage.tsx');
 assert.match(app,/catalogModels=\{models\}/);
 assert.match(app,/view==='sheets' \|\| view==='sheet_distribution'/);
 assert.match(sheets,/const referenceMatch=lookupReference\(catalogModels,form\.reference\)/);
 assert.match(sheets,/const changeReference=/);
 assert.match(sheets,/const uppercaseSheetForm=/);
 assert.match(sheets,/const normalized=uppercaseSheetForm\(form\)/);
 assert.match(sheets,/normalizeColorName\(input\)/);
 assert.match(sheets,/sheet-reference-options/);
 assert.match(sheets,/referenceMatch\.names\.length>1/);
 assert.match(sheets,/inputMode=\{key==='reference'\?'numeric'/);
 assert.match(sheets,/normalizeReferenceNumber\(raw\)/);
 assert.match(sheets,/const submitted=sheets\.filter\(s=>s\.status==='pending'\|\|s\.status==='assigned'\)/);
 assert.match(sheets,/className="sheet-distribution-item"/);
 assert.match(sheets,/BAIXAR \/ IMPRIMIR PDF/);
 assert.match(enfesto,/enfesto-print-button/);
 assert.match(enfesto,/enfesto-list-print/);
 assert.match(enfesto,/section==='completed'&&<button/);
 assert.match(enfesto,/createPortal\(<SheetPrint sheet=\{printSheet\}/);
});
test('Fichas de Produção compactas: somente OC no cabeçalho; conteúdo ao expandir',()=>{
 const source=read('src/ProductionSheets.tsx');
 assert.match(source,/className="sheet-compact-item"/);
 assert.match(source,/<summary><span className="sheet-oc-label">OC \{s\.oc\|\|'—'\}<\/span><ChevronDown/);
 assert.match(source,/className="sheet-compact-detail"/);
 assert.match(source,/BAIXAR \/ IMPRIMIR FICHA PDF/);
});
test('PDF em OC somente quando ficha distribuída foi verificada no Firebase',()=>{
 const source=read('src/CutOrders.tsx');
 assert.match(source,/const hasNewProductionSheet=/);
 assert.match(source,/const sheetCandidates=useMemo/);
 assert.match(source,/getDoc\(doc\(db,'production_sheets',id\)\)/);
 assert.match(source,/snapshot\.exists\(\)&&snapshot\.data\(\)\.status==='assigned'/);
 assert.match(source,/const hasVerifiedSheet=/);
 assert.match(source,/hasVerifiedSheet\(o\)&&<button/);
 assert.doesNotMatch(source,/\{hasNewProductionSheet\(o\)&&<button/);
});
test('alinhamento da ficha e maiúsculas continuam no CSS de tela e PDF',()=>{
 const css=read('src/styles.css');
 assert.match(css,/\.sheet-compact-list/);
 assert.match(css,/\.sheet-paper \.sheet-table-wrap \.sheet-table input/);
 assert.match(css,/text-align:center/);
 assert.match(css,/\.sheet-print-only \.sheet-paper,\s*\.sheet-print-only \.sheet-paper \*/);
});
test('arquivos TSX editados não têm erros de sintaxe',()=>{
 for(const f of ['src/App.tsx','src/ProductionSheets.tsx','src/EnfestoPage.tsx','src/CutOrders.tsx']){
  const out=ts.transpileModule(read(f),{fileName:f,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});
  const errors=(out.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,f+': '+errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
 }
});
