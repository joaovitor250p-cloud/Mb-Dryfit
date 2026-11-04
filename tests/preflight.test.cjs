'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root=path.resolve(__dirname,'..');
function source(file){return fs.readFileSync(path.join(root,file),'utf8')}
function evaluatePriceModule(){
  const code=ts.transpileModule(source('src/lib/referencePrices.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={}; vm.runInNewContext(code,{exports,module:{exports}},{timeout:2000});return exports;
}
const prices=evaluatePriceModule();
test('conversão segura de preços com vírgula e ponto',()=>{
  assert.equal(prices.parsePrice('4,50'),4.5);
  assert.equal(prices.parsePrice('4.50'),4.5);
  assert.equal(prices.parsePrice('R$ 1.234,56'),1234.56);
  assert.equal(prices.parsePrice('10'),10);
  for(const invalid of ['', '0','-5','1..5','abc','4,567','4.500.0'])assert.equal(Number.isNaN(prices.parsePrice(invalid)),true,invalid);
});
test('preços corrigidos de referências',()=>{
  const at=(type,reference)=>prices.STARTER_PRICES.filter(r=>r.type===type&&r.reference===reference);
  assert.equal(prices.parsePrice(at('Camiseta','10088')[0].price),3.5);
  assert.equal(prices.parsePrice(at('Camiseta','10089')[0].price),3.5);
  assert.equal(prices.parsePrice(at('Camiseta','10216')[0].price),3.5);
  assert.equal(prices.parsePrice(at('Camiseta','10127')[0].price),4.5);
  assert.equal(prices.parsePrice(at('M.L.','10002')[0].price),5);
  assert.equal(prices.parsePrice(at('Bermuda','10275')[0].price),8);
  assert.equal(prices.parsePrice(at('Bermuda','10030')[0].price),10);
  assert.equal(at('Bermuda','10275').length,1);
  assert.equal(at('Bermuda','10728').length,0);
  assert.equal(prices.TAILORS.length,9);
});
test('não há duplicação de tipo + referência no cadastro inicial',()=>{
  const keys=prices.STARTER_PRICES.map(x=>prices.KEY(x.type,x.reference));
  assert.equal(new Set(keys).size,keys.length);
  assert.equal(keys.every(x=>typeof x==='string'&&x.length>0),true);
});
test('permissões da função administrativa abrangem as novas páginas',()=>{
  const f=source('functions/index.js');
  for(const name of ['orders','workshops','sheets','sheet_distribution'])assert.match(f,new RegExp("const SECTIONS=\\[[^\\]]*'"+name+"'"));
  assert.match(source('firestore.rules'),/match \/cut_orders\/\{orderId\}/);
  assert.match(source('firestore.rules'),/getAfter\(/);
});
test('impressão separada do conteúdo do site e oficinas com OCs reais',()=>{
  assert.match(source('src/ProductionSheets.tsx'),/createPortal\(/);
  assert.match(source('src/ProductionSheets.tsx'),/document\.body/);
  assert.match(source('src/styles.css'),/body> #root\{display:none!important\}/);
  assert.match(source('src/WorkshopsPage.tsx'),/collection\(db,'cut_orders'\)/);
  assert.match(source('src/WorkshopsPage.tsx'),/canSeeOrders/);
});
test('arquivos TS e TSX do projeto sem erros sintáticos',()=>{
  const walk=folder=>fs.readdirSync(folder,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(folder,x.name)):/\.tsx?$/.test(x.name)&&!x.name.endsWith('.d.ts')?[path.join(folder,x.name)]:[]);
  const list=walk(path.join(root,'src'));assert.ok(list.length>10);
  for(const file of list){
    const output=ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}});
    const errors=(output.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.equal(errors.length,0,file+': '+errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
  }
});

// Navegação e exclusão: testes estruturais para evitar regressões em versões futuras.
test('as abas visitadas permanecem montadas, e a memória de scroll respeita a aba ativa',()=>{
  const app=source('src/App.tsx'), memory=source('src/lib/pageMemory.ts');
  assert.match(app,/visitedViews\.filter\(permitted\)\.map\(/);
  assert.match(app,/hidden=\{view!==item\}/);
  assert.match(app,/PageActiveContext\.Provider value=\{view===item\}/);
  assert.match(app,/viewScroll\.current\[view\]=window\.scrollY/);
  assert.match(memory,/if \(!active\) return/);
  assert.match(source('src/styles.css'),/\.view-parked.*display: none/);
});
test('exclusão de OC exige confirmação e a regra do Firestore permite somente admin',()=>{
  const orders=source('src/CutOrders.tsx'), rules=source('firestore.rules');
  assert.match(orders,/setDeleteTarget\(o\)/);
  assert.match(orders,/setDeleteTarget\(editing\)/);
  assert.match(orders,/isAdmin&&<button[^>]*order-delete-button/);
  assert.match(orders,/role=\"alertdialog\"/);
  assert.match(orders,/Excluir a OC \{deleteTarget\.oc\}\?/);
  assert.match(orders,/await deleteDoc\(doc\(db,'cut_orders',target\.id\)\)/);
  assert.match(rules,/match \/cut_orders\/\{orderId\}[\s\S]*?allow delete: if isAdmin\(\);/);
  assert.match(source('src/ProductionSheets.tsx'),/batch\.set\(orderRef,order\)/);
});
