'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const dir=path.join(__dirname,'..');
const read=x=>fs.readFileSync(path.join(dir,x),'utf8');

test('OCs 752, 753 e 754 possuem painel dedicado e não são recriadas arbitrariamente',()=>{
 const panel=read('src/ProtectedEnfestoOcs.tsx');
 assert.match(panel,/protectedProductionOcs\.map/);
 assert.match(panel,/onSnapshot\(collection\(db,'cut_orders'\)/);
 assert.match(panel,/const existing=sheets\.filter/);
 assert.match(panel,/isAdmin/);
 assert.match(panel,/transaction\.get\(ref\)/);
 assert.match(panel,/if\(existing\.exists\(\)\)throw/);
 assert.match(panel,/model,reference,pieceType:garmentTypeFromCatalog/);
 assert.match(panel,/status:'enfesto'/);
 assert.match(panel,/createdAt:serverTimestamp\(\),createdBy:user\.uid/);
 assert.match(panel,/não serão apagados nem substituídos/i);
 assert.match(panel,/informe as cores reais/i);
 assert.match(panel,/a soma dos tamanhos/i);
});
test('ficha existente só reativa Enfesto se não estiver finalizada ou na oficina',()=>{
 const panel=read('src/ProtectedEnfestoOcs.tsx');
 assert.match(panel,/status==='completed'/);
 assert.match(panel,/\['draft','pending'\]\.includes/);
 assert.match(panel,/if\(current\.data\(\)\.enfestoCompletedAt\|\|job\.exists\(\)/);
 assert.match(panel,/if\(current\.data\(\)\.assignedTailor\)/);
 assert.match(panel,/transaction\.update\(sheetRef,\{status:'enfesto'/);
});
test('Firestore limita a reabertura às três OCs e apenas ao administrador',()=>{
 const rules=read('firestore.rules');
 assert.match(rules,/isAdmin\(\)\s+&& canWrite\('enfesto'\)\s+&& resource\.data\.oc in \['752','753','754'\]/);
 assert.match(rules,/resource\.data\.status in \['draft','pending'\]/);
 assert.match(rules,/request\.resource\.data\.status == 'enfesto'/);
 assert.match(rules,/resource\.data\.get\('enfestoCompletedAt',null\) == null/);
 assert.match(rules,/status != 'completed'/);
 assert.match(rules,/hasOnly\(\['status','updatedAt','updatedBy'\]\)/);
});
test('confirmar enfesto mostra o número da OC e o Centro de Distribuição antes de movimentar estoque',()=>{
 const page=read('src/EnfestoPage.tsx');
 assert.match(page,/const requestFinalize=\(\)=>/);
 assert.match(page,/setConfirmFinish\(\{sheetId:sheet\.id,oc:sheet\.oc,noStock\}\)/);
 assert.match(page,/role="alertdialog" aria-modal="true"/);
 assert.match(page,/OC \{confirmFinish\.oc\} — Confirmar como FEITO\?/);
 assert.match(page,/CENTRO DE DISTRIBUIÇÃO → Distribuir fichas/);
 assert.match(page,/onClick=\{\(\)=>void finalize\(\)\}/);
 assert.match(page,/onClick=\{requestFinalize\}/);
 assert.doesNotMatch(page,/window\.confirm\(noStock/);
 assert.match(page,/validateEnfesto\(draft\.rows,stocks,noStock\)/);
 assert.match(page,/confirmFinish\.sheetId!==sheet\.id/);
});
test('conclusão troca o status para pending sem criar uma segunda OC',()=>{
 const inventory=read('src/lib/purchasesInventory.ts'),page=read('src/EnfestoPage.tsx');
 assert.match(inventory,/t\.update\(sheetRef,\{status:'pending'/);
 assert.match(page,/finishEnfestoWithoutStock/);
 assert.match(page,/confirmEnfestoConsumption/);
 assert.match(page,/Ficha liberada para o CENTRO DE DISTRIBUIÇÃO/);
});
test('distribuir ficha de OC histórica nunca sobrescreve OC e pagamentos existentes',()=>{
 const source=read('src/ProductionSheets.tsx');
 assert.match(source,/isProtectedProductionOc\(s\.oc\)/);
 assert.match(source,/where\('oc','==',s\.oc\)/);
 assert.match(source,/if\(legacyOrders&&legacyOrders\.size>1\)/);
 assert.match(source,/if\(oldStatus==='ENTREGUE'\)/);
 assert.match(source,/if\(!legacy\)batch\.set\(orderRef,order\)/);
 assert.match(source,/OC financeira já existente foi preservada/);
});
test('OCs protegidas com ficha vinculada e distribuída poderão imprimir PDF',()=>{
 const orders=read('src/CutOrders.tsx');
 assert.match(orders,/isProtectedProductionOc\(o\.oc\)/);
 assert.match(orders,/snapshot\.exists\(\)&&snapshot\.data\(\)\.status==='assigned'/);
});
test('todos os novos TSX são sintaticamente válidos',()=>{
 for(const p of ['src/ProtectedEnfestoOcs.tsx','src/EnfestoPage.tsx','src/ProductionSheets.tsx','src/CutOrders.tsx','src/App.tsx']){
  const r=ts.transpileModule(read(p),{fileName:p,reportDiagnostics:true,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2020}});
  const errors=(r.diagnostics||[]).filter(x=>x.category===ts.DiagnosticCategory.Error);
  assert.equal(errors.length,0,p+': '+errors.map(x=>ts.flattenDiagnosticMessageText(x.messageText,' ')).join('; '));
 }
});
