'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
test('fichas enviadas visíveis na criação e na distribuição com opção de PDF',()=>{
  const s=read('src/ProductionSheets.tsx');
  assert.match(s,/tab==='all'&&canEdit/);
  assert.match(s,/tab==='history'&&canDistribute/);
  assert.match(s,/submitted\.filter|submitted=sheets\.filter/);
  assert.match(s,/Baixar PDF \/ Imprimir/);
  assert.match(s,/historical\.slice\(0,historyLimit\)/);
});
test('layout da ficha: detalhes à direita, sem data de retirada, com volumes no rodapé',()=>{
  const sheet=read('src/SheetPrint.tsx');
  assert.match(sheet,/\['cor','p','m','g','gg','xg','detalhes'\]/);
  assert.match(sheet,/\['CORES','P','M','G','GG','XG','DETALHES'\]/);
  const editor=read('src/ProductionSheets.tsx');
  assert.match(editor,/\['CORES','P','M','G','GG','XG','DETALHES'\]/);
  assert.match(sheet,/VOL\.:/);
  assert.doesNotMatch(sheet,/Data retirada:/);
  assert.match(editor,/VOL\. — Quantidade de volumes:/);
  assert.match(editor,/Tipo de roupa \(escolha ou escreva\):/);
  assert.doesNotMatch(editor,/Data retirada:/);
});
test('regras permitem novos tipos e volumes sem bloquear fichas antigas',()=>{
  const rules=read('firestore.rules');
  assert.match(rules,/\('volumes' in d\)/);
  assert.match(rules,/d\.pieceType\.size\(\) <= 80/);
  assert.match(rules,/d\.types\.size\(\) <= 20/);
  assert.match(rules,/d\.withdrawalDate is string/); // campo legado preservado
});
test('preço de referência aceita tipo personalizado escrito',()=>{
 const page=read('src/ReferencePrices.tsx');
 assert.match(page,/normalizedGarmentType\(type\)/);
 assert.match(page,/reference-types-list/);
 assert.match(read('src/ProductionSheets.tsx'),/normalizedGarmentType\(p\.type\)===type/);
});
test('tipo personalizado exige oficina com categoria cadastrada',()=>{
  const compiled=ts.transpileModule(read('src/lib/referencePrices.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const mock={workshopKey:s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim()};
  const ex={};vm.runInNewContext(compiled,{exports:ex,require:()=>mock});
  assert.equal(ex.normalizedGarmentType('Jaqueta'),'JAQUETA');
  assert.equal(ex.canSewType('Costureiro Novo','Jaqueta',['Jaqueta']),true);
  assert.equal(ex.canSewType('Costureiro Novo','Jaqueta',[]),false);
  assert.equal(ex.canSewType('Mauro','Jaqueta',[]),false);
  assert.equal(ex.canSewType('Mauro','Manga Longa',[]),true);
});
test('arquivos TSX e TS alterados sem erros de parser TypeScript',()=>{
  for(const f of ['src/SheetPrint.tsx','src/ProductionSheets.tsx','src/CutOrders.tsx','src/WorkshopsPage.tsx','src/lib/referencePrices.ts','src/ReferencePrices.tsx']){
    const result=ts.transpileModule(read(f),{fileName:f,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});
    assert.equal((result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,f);
  }
});
