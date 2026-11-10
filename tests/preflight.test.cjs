'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root=path.resolve(__dirname,'..');
function source(file){return fs.readFileSync(path.join(root,file),'utf8')}
function evaluateWorkshopNamesModule(){
  const code=ts.transpileModule(source('src/lib/workshopNames.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,module:{exports}},{timeout:2000});return exports;
}
const workshopNames=evaluateWorkshopNamesModule();
function evaluatePriceModule(){
  const code=ts.transpileModule(source('src/lib/referencePrices.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};
  const requireLocal=name=>{if(name==='./workshopNames')return workshopNames;throw Error('Import inesperado no teste: '+name)};
  vm.runInNewContext(code,{exports,module:{exports},require:requireLocal},{timeout:2000});return exports;
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
test('impressão da ficha isolada e oficinas sem consultas de OCs',()=>{
  assert.match(source('src/ProductionSheets.tsx'),/createPortal\(/);
  assert.match(source('src/ProductionSheets.tsx'),/document\.body/);
  assert.match(source('src/styles.css'),/body> #root\{display:none!important\}/);
  assert.doesNotMatch(source('src/WorkshopsPage.tsx'),/collection\(db,'cut_orders'\)/);
  assert.doesNotMatch(source('src/WorkshopsPage.tsx'),/exportOCs|expandedOrders|workshop-oc-panel/);
  assert.match(source('src/WorkshopsPage.tsx'),/address:address\.trim\(\)/);
  assert.match(source('src/WorkshopsPage.tsx'),/services:editing\?\.services\|\|\[\]/);
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


test('menus agrupados, sem criar novas permissões, e ajustes mantidos entre telas',()=>{
  const app=source('src/App.tsx');
  assert.match(app,/const viewOrder:View\[\]=\['catalog','samples','orders','expenses','sheets','sheet_distribution','settings'\]/);
  assert.match(app,/SettingsHub/);
  assert.match(app,/SamplesAndCuts/);
  assert.match(app,/canViewSamples=\{admin\|\|access\.includes\('samples'\)\}/);
  assert.match(source('src/SettingsHub.tsx'),/Informações MB/);
  assert.match(source('src/SettingsHub.tsx'),/Preços de REF/);
  assert.match(source('src/SamplesAndCuts.tsx'),/> Cortes<\/button>/);
  assert.match(source('src/SamplesAndCuts.tsx'),/visited\.filter/);
});

test('sexta-feira usa data selecionada e grava pagamento na coleção cut_orders',()=>{
  const code=source('src/CutOrders.tsx');
  assert.match(code,/const paymentDate=toBR\(fridayDate\)/);
  assert.match(code,/paymentDone:'OK',paidAt:paymentDate/);
  assert.match(code,/batch\.update\(doc\(db,'cut_orders',o\.id\)/);
  assert.match(code,/markPaid\(\[o\]\)/);
  assert.match(code,/markPaid\(g\.list\)/);
  assert.match(code,/navigator\.clipboard\.writeText\(pix\)/);
  assert.match(code,/pixByOffice\.get\(norm\(g\.name\)\)/);
  assert.match(source('firestore.rules'),/canView\('workshops'\) \|\| canView\('sheet_distribution'\) \|\| canWrite\('orders'\)/);
});

test('resumo em planilha única possui barra de rolagem horizontal',()=>{
  const code=source('src/CutOrders.tsx');
  assert.match(code,/order-scrollbar-top/);
  assert.match(code,/order-scroll/);
  assert.match(code,/cols\.summary\.map/);
  assert.doesNotMatch(code,/\{\(\['summary','dates','finance','all'\]/);
  assert.match(source('src/styles.css'),/\.order-table\{display:table!important/);
});

test('endereço é opcional para documentos antigos do Firestore',()=>{
  const rules=source('firestore.rules');
  assert.match(rules,/\(!\('address' in d\) \|\| \(d\.address is string && d\.address\.size\(\) <= 800\)\)/);
  assert.match(source('src/WorkshopsPage.tsx'),/Endereço completo/);
});

test('virada do mês conserva históricos de gastos e pagamentos sem gravações destrutivas',()=>{
  const code=ts.transpileModule(source('src/lib/monthlyAccounting.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,module:{exports},Date},{timeout:2000});
  assert.equal(exports.currentAccountingMonth(new Date(2026,9,31)), '2026-10');
  assert.equal(exports.currentAccountingMonth(new Date(2026,10,1)), '2026-11');
  assert.equal(exports.expenseMonth('2026-10-30'), '2026-10');
  assert.equal(exports.expenseMonth('2026-11-01'), '2026-11');
  assert.equal(exports.expenseMonth('2026-02-31'), 'undated');
  assert.equal(exports.paymentMonth('31/10/2026'),'2026-10');
  assert.equal(exports.paymentMonth('06/11/2026'),'2026-11');
  assert.equal(exports.paymentMonth('31/02/2026'),'undated');
});

test('edições usam modais sobrepostos à aplicação e interrupção de consultas ocultas',()=>{
  for(const file of ['ExpensesPage.tsx','WorkshopsPage.tsx','SampleWorkflow.tsx','InfoPage.tsx','CutOrders.tsx']){
    assert.match(source(`src/${file}`),/createPortal\(/,file);
    assert.match(source(`src/${file}`),/pageActive/,file);
  }
  for(const file of ['ExpensesPage.tsx','ProductionSheets.tsx','CutOrders.tsx','WorkshopsPage.tsx','ReferencePrices.tsx','InfoPage.tsx']){
    assert.match(source(`src/${file}`),/onSnapshot\(/,file);
    assert.match(source(`src/${file}`),/(if\s*\(!pageActive\)|if\s*\(!active\|\|)/,file);
  }
});

test('exclusão de gastos é visível e segue a permissão do Firestore',()=>{
  assert.match(source('src/ExpensesPage.tsx'),/expense-row-actions/);
  assert.match(source('src/ExpensesPage.tsx'),/batch\.delete\(doc\(db, 'expenses', item\.id\)\)/);
  assert.match(source('firestore.rules'),/match \/expenses\/\{expenseId\}[\s\S]*?allow delete: if canWrite\('expenses'\)/);
  assert.match(source('src/CutOrders.tsx'),/monthlyPaid/);
});

test('planilhas financeiras mantêm valores corretos com ponto e vírgula',()=>{
  const code=ts.transpileModule(source('src/lib/financeNumbers.ts'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,module:{exports}},{timeout:2000});
  const parse=exports.parseFinanceNumber;
  for(const [value,number] of [['4,50',4.5],['4.50',4.5],['R$ 1.072,50',1072.5],['1,072.50',1072.5],['1000',1000],['0,00',0],['2.000',2000]])assert.equal(parse(value),number,value);
  for(const invalid of ['','abc','R$','4,5,2','1..5'])assert.ok(Number.isNaN(parse(invalid)),invalid);
});

test('ficha de produção acessível diretamente pela OC, com PDF A4 e permissão restrita',()=>{
  const orders=source('src/CutOrders.tsx'), sheet=source('src/SheetPrint.tsx');
  const rules=source('firestore.rules'), print=source('src/ProductionSheets.tsx');
  assert.match(orders,/showFriday: false/);
  assert.match(orders,/getDoc\(doc\(db,'production_sheets',o\.id\)\)/);
  assert.match(orders,/sheet\.status!=='assigned'/);
  assert.match(orders,/aria-label=\{`Ficha OC \${o\.oc}`\}/);
  assert.match(orders,/printSheet&&pageActive&&createPortal\(<SheetPrint/);
  assert.match(orders,/document\.title=`Ficha_OC_/);
  assert.match(print,/createPortal\(<SheetPrint sheet=\{printSheet\}/);
  assert.match(sheet,/sheet\.assignedTailor/);
  assert.match(sheet,/GERAL: \{total\}/);
  assert.match(source('src/styles.css'),/body> :not\(\.sheet-print-only\)\{display:none!important\}/);
  assert.match(rules,/allow get: if canView\('sheets'\) \|\| canView\('sheet_distribution'\)[\s\S]*?canView\('orders'\) && resource\.data\.status == 'assigned'/);
  assert.match(rules,/allow list: if canView\('sheets'\) \|\| canView\('sheet_distribution'\)/);
});


test('costureiros com letras, acentos e grafias equivalentes usam o mesmo agrupamento',()=>{
  const {workshopKey,canonicalWorkshopName}=workshopNames;
  for(const value of ['VIGILIO','Vigilio','Virgilio','VIRGÍLIO','  virgílio  ','vigílio']) {
    assert.equal(workshopKey(value),'VIRGILIO',value);
    assert.equal(canonicalWorkshopName(value),'VIRGÍLIO',value);
  }
  assert.equal(workshopKey(' Mauro  '),workshopKey('MAURO'));
  assert.equal(canonicalWorkshopName('dario medina'),'DARIO MEDINA');
  assert.equal(canonicalWorkshopName('  Dona   Francisca '),'DONA FRANCISCA');
  assert.notEqual(workshopKey('VITOR'),workshopKey('VICTOR')); // sem misturar homônimos
  assert.equal(prices.eligibleTypes('MAURO').includes('Camiseta'),true);
  assert.equal(prices.eligibleTypes('Rodrigo').includes('Bermuda'),true);
  assert.equal(prices.eligibleTypes('VIGILIO').includes('Calça'),true);
});

test('ordens de corte, PIX, cadastro e fichas compartilham a mesma chave de oficina',()=>{
  const orders=source('src/CutOrders.tsx'),workshops=source('src/WorkshopsPage.tsx'),sheets=source('src/ProductionSheets.tsx');
  assert.match(orders,/const norm=\(s:string\)=>workshopKey\(s\)/);
  assert.match(orders,/office:canonicalWorkshopName\(d.office\)/);
  assert.match(orders,/pixByOffice\.get\(norm\(g.name\)\)/);
  assert.match(workshops,/name:canonicalWorkshopName\(name\)/);
  assert.match(workshops,/workshopKey\(w.name\)===workshopKey\(name\)/);
  assert.match(sheets,/workshopKey\(w.name\)===workshopKey\(name\)/);
  assert.match(sheets,/const name=canonicalWorkshopName\(tailor\[s.id\]\|\|''\)/);
});

test('a distribuição filtra costureiros pela peça e respeita os tipos cadastrados',()=>{
  const {canSewType,normalizedGarmentType}=prices;
  assert.equal(normalizedGarmentType('Camisa'),'Camiseta');
  assert.equal(normalizedGarmentType('Manga Longa'),'M.L.');
  assert.equal(normalizedGarmentType('Calça'),'Calça');
  for(const type of ['Camiseta','M.L.','Regata']){
    for(const name of ['Mauro','Dario Medina','Jony','Rodrigo'])assert.equal(canSewType(name,type),true,`${name} deve fazer ${type}`);
    assert.equal(canSewType('Dona Francisca',type),false);
  }
  for(const type of ['Bermuda','Calça']){
    for(const name of ['Rodrigo','Dona Francisca','Ramiro','Vitor','Theodoro','VIGILIO'])assert.equal(canSewType(name,type),true,`${name} deve fazer ${type}`);
    for(const name of ['Mauro','Dario Medina','Jony'])assert.equal(canSewType(name,type),false,`${name} não faz ${type}`);
  }
  assert.equal(canSewType('Nova Oficina','Bermuda'),false,'cadastro desconhecido sem tipos não deve ser elegível');
  assert.equal(canSewType('Nova Oficina','Bermuda',['Bermuda']),true,'novas oficinas com tipos devem ser selecionáveis');
  assert.equal(canSewType('Nova Oficina','Calça',['Bermuda']),false,'não mostrar para outra categoria');
  assert.equal(canSewType('Mauro','Bermuda',['Camiseta']),false);
  const sheets=source('src/ProductionSheets.tsx');
  assert.match(sheets,/available\.filter\(n=>canSewType\(n,type,/);
  assert.match(sheets,/if\(!type\|\|!canSewType\(name,type,options\)\)/);
  assert.match(sheets,/setTailor\(v=>\(\{\.\.\.v,\[s\.id\]:''\}\)\)/);
  assert.match(sheets,/Selecione primeiro o tipo de roupa/);
});

test('pagamento de sexta fica por mês e data, sem a seleção visual de semanas',()=>{
  const code=source('src/CutOrders.tsx');
  assert.match(code,/Histórico de pagamentos por mês/);
  assert.match(code,/Sexta-feira<input type="date"/);
  assert.doesNotMatch(code,/firstFridayOfMonth\(month\)/);
  assert.doesNotMatch(code,/order-week-options|order-week-choice|order-week-current|paymentWeeks/);
  assert.match(code,/batch\.update\(doc\(db,'cut_orders',o\.id\)/);
});
