const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname,'..');
const read = rel => fs.readFileSync(path.join(root,rel),'utf8');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const orders = read('src/CutOrders.tsx');
const samples = read('src/SampleWorkflow.tsx');
const rules = read('firestore.rules');

test('manifest PWA da MB abre sem barra de endereço quando instalado',()=>{
  assert.equal(manifest.display,'standalone');
  assert.equal(manifest.start_url,'./');
  assert.equal(manifest.scope,'./');
  assert.deepEqual(manifest.icons.map(i=>i.sizes),['192x192','512x512','512x512']);
  for(const icon of manifest.icons) assert.ok(fs.existsSync(path.join(root,'public',icon.src.replace(/^\.\//,''))));
  assert.match(read('index.html'),/manifest\.webmanifest/);
  assert.match(read('src/main.tsx'),/serviceWorker\.register/);
});

test('página separada para instalar com alternativa quando prompt não aparece',()=>{
  const html=read('public/instalar.html');
  assert.match(html,/beforeinstallprompt/);
  assert.match(html,/Android/);
  assert.match(html,/Chrome ou Edge/);
  assert.match(html,/Instalar MB REFERÊNCIAS/);
  assert.match(html,/id="como-instalar"/);
  assert.match(html,/id="recursos"/);
  assert.match(html,/beforeinstallprompt/);
  assert.match(html,/id="install-guide"/);
  assert.match(html,/prefers-reduced-motion/);
  assert.match(html,/data-device="android"/);
  assert.match(html,/data-device="desktop"/);
  const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(script,'A página deve conter código de instalação');
  assert.doesNotThrow(()=>new Function(script));
});

test('service worker não guarda endpoints de dados de Firebase',()=>{
  const sw=read('public/sw.js');
  assert.match(sw,/req\.mode === 'navigate'/);
  assert.match(sw,/assets\|icons/);
  assert.match(sw,/new URL\(req\.url\)\.origin !== BASE\.origin/);
  assert.doesNotMatch(sw,/firestore\.googleapis|identitytoolkit/);
});

test('OC entregue cria amostra na mesma transação, sem apagar foto existente',()=>{
  assert.match(orders,/row\.status === 'ENTREGUE'/);
  assert.match(orders,/runTransaction\(db, async transaction/);
  assert.match(orders,/transaction\.(?:set|update)\(orderRef/);
  assert.match(orders,/transaction\.set\(sampleRef/);
  assert.match(orders,/sampleSnap\.exists\(\)/);
  assert.match(orders,/quantity: row\.qty\.trim\(\)/);
  assert.match(orders,/imageData: '', status: 'done'/);
  assert.doesNotMatch(orders,/transaction\.update\(sampleRef,\s*\{[^}]*imageData:/);
});

test('amostras são apenas consulta e a edição/cadastro de fotos fica em Cortes',()=>{
  assert.match(samples,/view === 'samples'\s*\? true/);
  assert.match(samples,/Quantidade total/);
  assert.match(samples,/missingDataFromOrder/);
  assert.match(samples,/linkedOrders/);
  assert.doesNotMatch(samples,/view==='samples'&&<div className="production-actions"/);
  assert.match(samples,/canEdit&&view==='cuts'&&<div className="production-actions"/);
  assert.match(samples,/view==='cuts'&&<>[\s\S]*?Adicionar corte \/ foto/);
  assert.match(samples,/canEdit&&<InitialCutCsvImport/);
  assert.match(samples,/Para adicionar ou editar fotos, utilize a aba Cortes/);
  assert.match(samples,/SEM CÓDIGO|SEM REF/);
});

test('regras aceitam quantity e vínculo, limitando entrega automática a order ENTREGUE',()=>{
  assert.match(rules,/'quantity',\s*'orderId'/);
  assert.match(rules,/function deliveredOrderForSample/);
  assert.match(rules,/\.data\.status == 'ENTREGUE'/);
  assert.match(rules,/deliveredOrderForSample\(request\.resource\.data\)/);
  assert.match(rules,/validProduction\(\)/);
  assert.match(rules,/canWrite\('orders'\)/);
});

test('JS e TSX alterados sem erro de parser',()=>{
  const ts=require('/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript');
  for(const rel of ['src/CutOrders.tsx','src/SampleWorkflow.tsx','src/main.tsx']){
    const result=ts.transpileModule(read(rel),{fileName:rel,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}});
    const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.equal(errors.length,0,rel+': '+errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
  }
  for(const rel of ['public/sw.js']) new Function(read(rel));
});

test('tema colorido preserva a ficha A4 e o modo escuro',()=>{
  const css=read('src/styles.css');
  const sheet=read('src/SheetPrint.tsx');
  assert.match(css,/Visual colorido, inspirado em quadros/);
  assert.match(css,/@media screen \{/);
  assert.match(css,/\.dark \.app-shell \.sidebar/);
  assert.match(css,/--mb-purple/);
  assert.match(css,/--mb-green/);
  assert.match(css,/@media print/);
  assert.match(sheet,/\['CORES','P','M','G','GG','XG','DETALHES'\]/);
  assert.match(sheet,/sheet-paper-a4/);
});
