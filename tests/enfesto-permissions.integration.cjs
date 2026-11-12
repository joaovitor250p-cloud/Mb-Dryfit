'use strict';
const {test,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const firebase=require('firebase/compat/app');
require('firebase/compat/firestore');
const stamp=()=>firebase.firestore.FieldValue.serverTimestamp();
const timestamp=()=>firebase.firestore.Timestamp.fromDate(new Date('2026-11-12T12:00:00Z'));
let env;
async function setup(uid='admin_enfesto'){
 if(!env){
  env=await initializeTestEnvironment({projectId:'demo-mb-referencias-enfesto',firestore:{rules:fs.readFileSync(path.join(__dirname,'../firestore.rules'),'utf8')}});
 }
 await env.clearFirestore();
 const sheetId='ficha1212';
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await db.doc('user_roles/'+uid).set({role:'admin',permissions:['catalog','samples','cuts','orders','expenses','info','workshops','sheets','enfesto','sheet_distribution','purchases'],disabled:false,companyId:'mb-principal'});
  await db.doc('production_sheets/'+sheetId).set({
   model:'test',reference:'10001',pieceType:'Camiseta',fabric:'DRYFIT',volumes:'1',
   composition:'',trims:'',officeInstructions:'',oc:'1212',withdrawalDate:'',
   tailorInstructions:'',finishingInstructions:'',
   colors:[{cor:'BRANCO',p:'66',m:'0',g:'0',gg:'0',xg:'0'}],
   status:'enfesto',assignedTailor:'',createdAt:timestamp(),createdBy:'criador',
   updatedAt:timestamp(),updatedBy:'criador',assignedAt:null,assignedBy:null
  });
  await db.doc('companies/mb-principal/inventory/stockBranco').set({
   material:'DRYFIT',color:'BRANCO',kind:'tecido',unit:'KG',
   quantityMilli:500000,lastMovementId:'seed1',lastDeltaMilli:500000,
   updatedAt:timestamp(),updatedBy:'admin',createdAt:timestamp()
  });
 });
 return {db:env.authenticatedContext(uid).firestore(),uid,sheetId};
}
after(async()=>{if(env)await env.cleanup()});

test('administrador lê fichas, enfesto e estoque nas regras atuais',async()=>{
 const {db}=await setup();
 for(const col of ['production_sheets','enfesto_jobs','companies/mb-principal/inventory']){
  const got=await db.collection(col).get();
  assert.ok(got,'Consulta à coleção '+col);
 }
});
test('não permite liberar uma ficha sem job Enfesto concluído',async()=>{
 const {db,uid,sheetId}=await setup();
 await assert.rejects(
  db.doc('production_sheets/'+sheetId).update({
   status:'pending',enfestoCompletedAt:stamp(),enfestoCompletedBy:uid,
   updatedAt:stamp(),updatedBy:uid
  }),
  e=>e.code==='permission-denied'
 );
 assert.equal((await db.doc('production_sheets/'+sheetId).get()).data().status,'enfesto');
});
test('não permite acesso de gravação a pessoa sem permissão Enfesto',async()=>{
 const uid='sem_enfesto';
 const {sheetId}=await setup(uid);
 await env.withSecurityRulesDisabled(async ctx=>ctx.firestore().doc('user_roles/'+uid).update({
  role:'editor',permissions:['catalog','sheets'],disabled:false
 }));
 const db=env.authenticatedContext(uid).firestore();
 await assert.rejects(
  db.doc('enfesto_jobs/'+sheetId).set({
   sheetId,oc:'1212',status:'draft',rows:[{cor:'BRANCO',expected:66,layers:'12',weightPerLayer:'1',cutPieces:'66',stockId:'',consumption:'',checked:true}],
   notes:'',stockConfirmed:false,createdAt:stamp(),createdBy:uid,
   updatedAt:stamp(),updatedBy:uid
  }),
  e=>e.code==='permission-denied'
 );
});
test('salvar progresso no enfesto não gera PERMISSION_DENIED',async()=>{
 const {db,uid,sheetId}=await setup();
 await db.runTransaction(async t=>{
  const job= db.doc('enfesto_jobs/'+sheetId),sheet=db.doc('production_sheets/'+sheetId);
  const [old,current]=await Promise.all([t.get(job),t.get(sheet)]);
  assert.equal(old.exists,false);
  assert.equal(current.data().status,'enfesto');
  t.set(job,{
   sheetId,oc:'1212',status:'draft',rows:[{cor:'BRANCO',expected:66,layers:'12',weightPerLayer:'11',cutPieces:'66',stockId:'',consumption:'',checked:true}],
   notes:'',stockConfirmed:false,createdAt:stamp(),createdBy:uid,updatedAt:stamp(),updatedBy:uid
  },{merge:true});
 });
 assert.equal((await db.doc('enfesto_jobs/'+sheetId).get()).data().status,'draft');
});
test('finalizar enfesto sem estoque libera ficha e registra conclusão',async()=>{
 const {db,uid,sheetId}=await setup();
 await db.runTransaction(async t=>{
  const sheet=db.doc('production_sheets/'+sheetId),job=db.doc('enfesto_jobs/'+sheetId);
  const [current,old]=await Promise.all([t.get(sheet),t.get(job)]);
  assert.equal(current.data().status,'enfesto');
  assert.equal(old.exists,false);
  t.set(job,{
   sheetId,oc:'1212',status:'completed',rows:[{cor:'BRANCO',expected:66,layers:'12',weightPerLayer:'11',cutPieces:'66',stockId:'',consumption:'',checked:true}],
   notes:'',stockConfirmed:false,createdAt:stamp(),createdBy:uid,
   completedAt:stamp(),completedBy:uid,updatedAt:stamp(),updatedBy:uid
  },{merge:true});
  t.update(sheet,{status:'pending',enfestoCompletedAt:stamp(),enfestoCompletedBy:uid,updatedAt:stamp(),updatedBy:uid});
 });
 assert.equal((await db.doc('production_sheets/'+sheetId).get()).data().status,'pending');
});
test('finalizar com baixa atômica de tecido e criar histórico de movimentos',async()=>{
 const {db,uid,sheetId}=await setup();
 const source=db.doc('companies/mb-principal/enfesto_confirmations/'+sheetId);
 const job=db.doc('enfesto_jobs/'+sheetId);
 const sheet=db.doc('production_sheets/'+sheetId);
 const stock=db.doc('companies/mb-principal/inventory/stockBranco');
 const movement=db.doc('companies/mb-principal/stock_movements/movimento1212');
 await db.runTransaction(async t=>{
  const [existing,current,oldJob,previous]=await Promise.all([t.get(source),t.get(sheet),t.get(job),t.get(stock)]);
  assert.equal(existing.exists,false);
  assert.equal(current.data().status,'enfesto');
  assert.equal(previous.data().quantityMilli,500000);
  t.set(source,{oc:'1212',status:'confirmed',notes:'',lines:[{stockId:'stockBranco',quantityMilli:12000,unit:'KG',color:'BRANCO'}],createdAt:stamp(),createdBy:uid});
  t.set(job,{
   sheetId,oc:'1212',status:'completed',rows:[{cor:'BRANCO',expected:66,layers:'12',weightPerLayer:'1',cutPieces:'66',stockId:'stockBranco',consumption:'12',checked:true}],
   notes:'',stockConfirmed:true,createdAt:stamp(),createdBy:uid,completedAt:stamp(),completedBy:uid,updatedAt:stamp(),updatedBy:uid
  },{merge:true});
  t.update(sheet,{status:'pending',enfestoCompletedAt:stamp(),enfestoCompletedBy:uid,updatedAt:stamp(),updatedBy:uid});
  t.set(movement,{stockId:'stockBranco',kind:'enfesto_out',sourceId:sheetId,oc:'1212',beforeMilli:500000,deltaMilli:-12000,afterMilli:488000,material:'DRYFIT',color:'BRANCO',unit:'KG',createdAt:stamp(),createdBy:uid});
  t.update(stock,{quantityMilli:488000,lastMovementId:'movimento1212',lastDeltaMilli:-12000,updatedAt:stamp(),updatedBy:uid});
 });
 assert.equal((await db.doc('production_sheets/'+sheetId).get()).data().status,'pending');
 assert.equal((await stock.get()).data().quantityMilli,488000);
});

test('finalizar com três cores no mesmo Enfesto sem estourar limite de regras',async()=>{
 const {db,uid,sheetId}=await setup();
 const colors=['BRANCO','PRETO','AZUL'];
 const ids=['stockBranco','stockPreto','stockAzul'];
 await env.withSecurityRulesDisabled(async ctx=>{
  const privileged=ctx.firestore();
  await privileged.doc('production_sheets/'+sheetId).update({colors:colors.map(c=>({cor:c,p:'66',m:'0',g:'0',gg:'0',xg:'0'}))});
  for(let i=1;i<3;i++){
   await privileged.doc('companies/mb-principal/inventory/'+ids[i]).set({
    material:'DRYFIT',color:colors[i],kind:'tecido',unit:'KG',quantityMilli:500000,
    lastMovementId:'seed'+(i+1),lastDeltaMilli:500000,
    updatedAt:timestamp(),updatedBy:'admin',createdAt:timestamp()
   });
  }
 });
 const source=db.doc('companies/mb-principal/enfesto_confirmations/'+sheetId);
 const sheet=db.doc('production_sheets/'+sheetId);
 const job=db.doc('enfesto_jobs/'+sheetId);
 const stockRefs=ids.map(id=>db.doc('companies/mb-principal/inventory/'+id));
 const movementRefs=ids.map((_,i)=>db.doc('companies/mb-principal/stock_movements/oc1212_cor'+i));
 await db.runTransaction(async t=>{
  const snapshots=await Promise.all([t.get(source),t.get(sheet),t.get(job),...stockRefs.map(ref=>t.get(ref))]);
  assert.equal(snapshots[0].exists,false);
  assert.equal(snapshots[1].data().status,'enfesto');
  t.set(source,{
   oc:'1212',status:'confirmed',notes:'',
   lines:ids.map((id,i)=>({stockId:id,quantityMilli:12000,unit:'KG',color:colors[i]})),
   createdAt:stamp(),createdBy:uid
  });
  t.set(job,{
   sheetId,oc:'1212',status:'completed',rows:colors.map((c,i)=>({
    cor:c,expected:66,layers:'12',weightPerLayer:'1',cutPieces:'66',
    stockId:ids[i],consumption:'12',checked:true
   })),
   notes:'',stockConfirmed:true,createdAt:stamp(),createdBy:uid,completedAt:stamp(),completedBy:uid,updatedAt:stamp(),updatedBy:uid
  },{merge:true});
  t.update(sheet,{status:'pending',enfestoCompletedAt:stamp(),enfestoCompletedBy:uid,updatedAt:stamp(),updatedBy:uid});
  for(let i=0;i<3;i++){
   t.set(movementRefs[i],{
    stockId:ids[i],kind:'enfesto_out',sourceId:sheetId,oc:'1212',
    beforeMilli:500000,deltaMilli:-12000,afterMilli:488000,
    material:'DRYFIT',color:colors[i],unit:'KG',createdAt:stamp(),createdBy:uid
   });
   t.update(stockRefs[i],{
    quantityMilli:488000,lastMovementId:movementRefs[i].id,lastDeltaMilli:-12000,
    updatedAt:stamp(),updatedBy:uid
   });
  }
 });
 assert.equal((await sheet.get()).data().status,'pending');
 for(const stock of stockRefs)assert.equal((await stock.get()).data().quantityMilli,488000);
});
