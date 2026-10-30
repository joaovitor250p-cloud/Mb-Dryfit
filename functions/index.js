'use strict';
const {onCall,HttpsError}=require('firebase-functions/v2/https');
const {initializeApp}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const {getFirestore,FieldValue}=require('firebase-admin/firestore');
initializeApp();
const auth=getAuth();
const db=getFirestore();
const SECTIONS=['catalog','samples','cuts'];
const roles=['admin','editor','viewer'];
const cleanPermissions=(v)=>Array.isArray(v)?[...new Set(v.filter(s=>SECTIONS.includes(s)))]:[...SECTIONS];
const fail=(message,code='invalid-argument')=>{throw new HttpsError(code,message)};
const cleanRole=v=>roles.includes(v)?v:fail('Perfil inválido.');
const dataObject=v=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const recentAuth=req=>{const t=Number(req.auth?.token?.auth_time||0);if(!t||Date.now()/1000-t>900)fail('Por segurança, saia e entre novamente para administrar contas.','failed-precondition')};
async function adminOnly(req){
 if(!req.auth?.uid)fail('Entre na sua conta para continuar.','unauthenticated');
 const [role,user]=await Promise.all([db.collection('user_roles').doc(req.auth.uid).get(),auth.getUser(req.auth.uid)]);
 if(!role.exists||role.data().role!=='admin'||role.data().disabled===true||user.disabled)fail('Acesso exclusivo do administrador.','permission-denied');
 return req.auth.uid;
}
async function requireTarget(uid){
 if(typeof uid!=='string'||uid.length<5||uid.length>128)fail('Identificador de conta inválido.');
 return auth.getUser(uid);
}
exports.manageAccount=onCall({region:'us-central1',maxInstances:4},async(req)=>{
 const adminUid=await adminOnly(req);
 const d=dataObject(req.data);const action=String(d.action||'');
 if(action==='list'){
  const s=await db.collection('user_roles').limit(500).get();
  const items=await Promise.all(s.docs.map(async x=>{
   const r=x.data();let authDisabled=true,authEmail=String(r.email||'');
   try{const u=await auth.getUser(x.id);authDisabled=u.disabled;authEmail=u.email||authEmail}catch(e){if(e.code!=='auth/user-not-found')throw e}
   return {uid:x.id,email:authEmail,role:roles.includes(r.role)?r.role:'viewer',permissions:cleanPermissions(r.permissions),disabled:r.disabled===true||authDisabled};
  }));
  return {users:items};
 }
 recentAuth(req);
 if(action==='create'){
  const email=String(d.email||'').trim().toLowerCase();const password=String(d.password||'');const role=cleanRole(d.role);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)fail('Informe um e-mail válido.');
  if(password.length<12||password.length>1000)fail('A senha inicial deve ter pelo menos 12 caracteres.');
  const permissions=role==='admin'?[...SECTIONS]:cleanPermissions(d.permissions);
  const user=await auth.createUser({email,password,emailVerified:false,disabled:false});
  try{await db.collection('user_roles').doc(user.uid).set({email,role,permissions,disabled:false,createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp(),updatedBy:adminUid})}
  catch(err){await auth.deleteUser(user.uid);throw err}
  return {uid:user.uid};
 }
 const uid=String(d.uid||'');await requireTarget(uid);
 if(uid===adminUid&&['disable','delete'].includes(action))fail('Não é possível desativar ou excluir a própria conta administradora.','failed-precondition');
 if(action==='update'){
  const role=cleanRole(d.role);
  if(uid===adminUid&&role!=='admin')fail('Não é possível retirar seu próprio perfil administrador.','failed-precondition');
  const permissions=role==='admin'?[...SECTIONS]:cleanPermissions(d.permissions);
  const existing=await db.collection('user_roles').doc(uid).get();
  if(!existing.exists)fail('Conta sem perfil autorizado.','not-found');
  await db.collection('user_roles').doc(uid).update({role,permissions,updatedAt:FieldValue.serverTimestamp(),updatedBy:adminUid});return {ok:true};
 }
 if(action==='disable'){
  const disabled=d.disabled===true;
  const target=await db.collection('user_roles').doc(uid).get();if(!target.exists)fail('Conta sem perfil autorizado.','not-found');
  await auth.updateUser(uid,{disabled});
  await target.ref.update({disabled,updatedAt:FieldValue.serverTimestamp(),updatedBy:adminUid});
  if(disabled)await auth.revokeRefreshTokens(uid);
  return {ok:true};
 }
 if(action==='password'){
  const password=String(d.password||'');if(password.length<12||password.length>1000)fail('A nova senha deve ter pelo menos 12 caracteres.');
  await auth.updateUser(uid,{password});await auth.revokeRefreshTokens(uid);return {ok:true};
 }
 if(action==='delete'){
  // Nunca apaga os modelos, as OCs e o histórico produzidos por essa conta.
  await auth.deleteUser(uid);
  await db.collection('user_roles').doc(uid).delete();return {ok:true};
 }
 fail('Ação não autorizada.');
});
