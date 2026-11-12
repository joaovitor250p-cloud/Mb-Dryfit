'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const sheets=source('src/ProductionSheets.tsx');
const page=source('src/Enfesto.tsx');
const inventory=source('src/lib/purchasesInventory.ts');
const rules=source('firestore.rules');
const app=source('src/App.tsx');

test('ficha nova é enviada ao Enfesto antes de chegar à distribuição',()=>{
 assert.match(sheets,/status:status==='draft'\?'draft':'enfesto'/);
 assert.match(sheets,/Enviar para enfesto/);
 assert.match(sheets,/const pending=sheets\.filter\(s=>s\.status==='pending'&&s\.enfestoConfirmationId===s\.id\)/);
 assert.match(page,/s\.status==='enfesto'\|\|\(s\.status==='pending'&&!s\.enfestoConfirmationId\)/);
 assert.match(sheets,/const orderRef=doc\(db,'cut_orders',s\.id\)/);
});

test('concluir enfesto é uma transação única com liberação da ficha e baixa de estoque',()=>{
 assert.match(page,/confirmEnfestoConsumption\(\{db,company:companyId,uid:user\.uid/);
 assert.match(page,/confirmationId:s\.id,sheetId:s\.id,oc:s\.oc/);
 assert.match(page,/Marcar FEITO e liberar ficha/);
 assert.match(inventory,/const linkedSheet=sheetId\?doc\(db,'production_sheets',sheetId\):null/);
 assert.match(inventory,/if\(linkedSheet\)t\.update\(linkedSheet,\{status:'pending'/);
 assert.match(inventory,/const existing=await t\.get\(source\)/);
 assert.match(inventory,/if\(existing\.exists\(\)\)throw Error/);
 assert.match(inventory,/if\(kind==='enfesto_out'&&!previous\[i\]\.exists\(\)\)/);
 assert.match(inventory,/before\[i\]\+deltas\[i\]\.amount<0/);
 assert.match(inventory,/if\(deltas\.length>\(sheetId\?5:7\)\)/);
});

test('as permissões garantem que uma ficha não é distribuída sem conclusão válida',()=>{
 assert.match(rules,/request\.resource\.data\.status in \['draft','enfesto'\]/);
 assert.match(rules,/resource\.data\.get\('enfestoConfirmationId', ''\) == sheetId/);
 assert.match(rules,/getAfter\([^)]*enfesto_confirmations/);
 assert.match(rules,/getAfter\([^)]*production_sheets/);
 assert.match(rules,/get\([^)]*production_sheets/);
 assert.match(rules,/canWrite\('enfesto'\)/);
 assert.match(rules,/canWrite\('sheet_distribution'\)/);
 assert.match(rules,/get\([^)]*production_sheets[^)]*\)\.data\.get\('enfestoConfirmationId', ''\) == orderId/);
 assert.match(source('src/AccountsAdmin.tsx'),/Enfesto \(confirmar tecido e liberar fichas\)/);
 assert.match(source('functions/index.js'),/'enfesto'/);
 assert.match(app,/enfesto:\{label:'Enfesto'/);
});

test('tela de Enfesto compila em JSX sem erros sintáticos',()=>{
 const result=ts.transpileModule(page,{fileName:'src/Enfesto.tsx',reportDiagnostics:true,compilerOptions:{
  jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext
 }});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 assert.equal(errors.length,0,errors.map(e=>ts.flattenDiagnosticMessageText(e.messageText,' ')).join('; '));
});
