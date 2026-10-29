import {useEffect,useState} from 'react';
import {httpsCallable} from 'firebase/functions';
import {functions} from './lib/firebase';
import {CheckCircle2, Plus, RotateCcw, Shield, Trash2, UserRoundX} from 'lucide-react';

type Role='admin'|'editor'|'viewer';
type Section='catalog'|'samples'|'cuts';
type Account={uid:string,email:string,role:Role,permissions:Section[],disabled:boolean};
const SECTIONS:{value:Section,label:string}[]=[{value:'catalog',label:'Catálogo de modelos'},{value:'samples',label:'Amostras'},{value:'cuts',label:'Cortes'}];
const ALL:Section[]=['catalog','samples','cuts'];
const errorText=(e:unknown)=>e instanceof Error?e.message:'Falha na operação';

export default function AccountsAdmin({selfUid}:{selfUid:string}){
 const [accounts,setAccounts]=useState<Account[]>([]);
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[message,setMessage]=useState(''),[error,setError]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[role,setRole]=useState<Role>('viewer');
 const [permissions,setPermissions]=useState<Section[]>(['catalog']);
 const [active,setActive]=useState<string|null>(null),[newPassword,setNewPassword]=useState('');
 const call=async(action:string,data:Record<string,unknown>={})=>{
  if(!functions)throw Error('Firebase Functions não configurado. Confira a publicação no Firebase.');
  const result=await httpsCallable<Record<string,unknown>,Record<string,any>>(functions,'manageAccount')({action,...data});
  return result.data;
 };
 const load=async()=>{setLoading(true);setError('');try{const result=await call('list');setAccounts(result.users||[])}catch(e){setError(errorText(e))}finally{setLoading(false)}};
 useEffect(()=>{void load()},[]);
 const execute=async(action:string,data:Record<string,unknown>,success:string)=>{
  setBusy(true);setError('');setMessage('');
  try{await call(action,data);setMessage(success);setActive(null);setNewPassword('');await load()}
  catch(e){setError(errorText(e))}
  finally{setBusy(false)}
 };
 const create=async(e:React.FormEvent)=>{e.preventDefault();if(password.length<12){setError('A senha inicial precisa ter pelo menos 12 caracteres.');return}await execute('create',{email,password,role,permissions:role==='admin'?ALL:permissions},'Conta criada. Compartilhe a senha inicial de forma privada.');setPassword('')};
 const toggle=(key:Section)=>setPermissions(v=>v.includes(key)?v.filter(x=>x!==key):[...v,key]);
 const toggleAccount=(u:Account,key:Section)=>{
  const next=u.permissions.includes(key)?u.permissions.filter(x=>x!==key):[...u.permissions,key];
  setAccounts(users=>users.map(x=>x.uid===u.uid?{...x,permissions:next}:x));
 };
 return <div className="account-admin">
  <div className="admin-warning"><Shield size={18}/><span>Somente administradores podem gerenciar contas. Criar, excluir, desativar e trocar senhas exige a função segura do Firebase. A senha nunca é exibida depois de criada.</span></div>
  {error&&<div className="production-alert" role="alert">{error}</div>}
  {message&&<div className="production-ok"><CheckCircle2 size={16}/>{message}</div>}
  <form className="account-create" onSubmit={e=>void create(e)}>
   <h3><Plus size={18}/> Criar conta</h3>
   <div className="account-form-grid"><label>E-mail<input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="pessoa@empresa.com"/></label>
   <label>Senha inicial (mín. 12 caracteres)<input required type="password" minLength={12} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <label>Perfil<select value={role} onChange={e=>setRole(e.target.value as Role)}><option value="viewer">Consulta (somente ver)</option><option value="editor">Editor</option><option value="admin">Administrador (acesso total)</option></select></label></div>
   <div className="account-perms"><strong>Pode acessar</strong><div className="account-checkboxes">{SECTIONS.map(x=><label key={x.value}><input disabled={role==='admin'} type="checkbox" checked={role==='admin'||permissions.includes(x.value)} onChange={()=>toggle(x.value)}/>{x.label}</label>)}</div></div>
   <button className="primary-button" disabled={busy||loading} type="submit">{busy?'Salvando...':'Criar conta'}</button>
  </form>
  <div className="account-list-head"><h3>Contas autorizadas ({accounts.length})</h3><button className="outline-button" disabled={busy} onClick={()=>void load()}><RotateCcw size={15}/> Atualizar</button></div>
  {loading?<p>Carregando contas...</p>:accounts.length===0?<p>Nenhuma conta retornada.</p>:<div className="account-list">{accounts.map(u=><section key={u.uid} className="account-item">
   <div className="account-identity"><div><strong>{u.email||u.uid}</strong> {u.uid===selfUid&&<small>(você)</small>}<small>{u.disabled?'DESATIVADA':'Ativa'} · {u.uid.slice(0,8)}…</small></div>
   <select aria-label={`Perfil de ${u.email}`} value={u.role} disabled={busy||u.uid===selfUid} onChange={e=>setAccounts(a=>a.map(x=>x.uid===u.uid?{...x,role:e.target.value as Role}:x))}><option value="viewer">Consulta</option><option value="editor">Editor</option><option value="admin">Administrador</option></select></div>
   <div className="account-checkboxes">{SECTIONS.map(x=><label key={x.value}><input type="checkbox" disabled={busy||u.role==='admin'} checked={u.role==='admin'||u.permissions.includes(x.value)} onChange={()=>toggleAccount(u,x.value)}/>{x.label}</label>)}</div>
   <div className="account-buttons"><button className="outline-button" disabled={busy||u.uid===selfUid} onClick={()=>void execute('update',{uid:u.uid,role:u.role,permissions:u.role==='admin'?ALL:u.permissions},'Permissões atualizadas.')}><Shield size={14}/> Salvar acessos</button>
   <button className="outline-button" disabled={busy||u.uid===selfUid} onClick={()=>{if(window.confirm(`${u.disabled?'Ativar':'Desativar'} ${u.email}?`))void execute('disable',{uid:u.uid,disabled:!u.disabled},'Situação da conta atualizada.')}}><UserRoundX size={14}/>{u.disabled?'Ativar':'Desativar'}</button>
   <button className="outline-button" disabled={busy} onClick={()=>{setActive(active===u.uid?null:u.uid);setNewPassword('')}}>Trocar senha</button>
   <button className="danger-button" disabled={busy||u.uid===selfUid} onClick={()=>{if(window.prompt(`Para excluir a conta ${u.email}, digite EXCLUIR.\nAs OCs e modelos continuarão salvos.`)==='EXCLUIR')void execute('delete',{uid:u.uid},'Conta excluída.')}}><Trash2 size={14}/> Excluir conta</button></div>
   {active===u.uid&&<form className="account-password" onSubmit={e=>{e.preventDefault();if(window.confirm(`Definir nova senha para ${u.email}? Isso invalidará o acesso anterior.`))void execute('password',{uid:u.uid,password:newPassword},'Senha alterada. A pessoa precisará entrar novamente.')}}><label>Nova senha (mín. 12 caracteres)<input type="password" autoComplete="new-password" minLength={12} required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><button className="primary-button" disabled={busy}>Atualizar senha</button></form>}
  </section>)}</div>}
 </div>;
}
