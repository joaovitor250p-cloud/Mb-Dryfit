import { useEffect, useState } from 'react';
import { sendPasswordResetEmail } from 'firebase/auth';
import { collection, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch, type DocumentData } from 'firebase/firestore';
import { auth, db } from './lib/firebase';
import { CheckCircle2, RefreshCw, Shield, UserCheck, UserRoundX, Mail } from 'lucide-react';

type Role = 'admin' | 'editor' | 'viewer';
type Section = 'catalog' | 'samples' | 'cuts';
type Account = { uid: string; email: string; role: Role; permissions: Section[]; disabled: boolean };
type Request = { uid: string; email: string; status: 'pending' | 'approved' | 'denied' };
const ALL: Section[] = ['catalog', 'samples', 'cuts'];
const SECTIONS: { value: Section; label: string }[] = [
  { value: 'catalog', label: 'Catálogo de modelos' },
  { value: 'samples', label: 'Amostras' },
  { value: 'cuts', label: 'Cortes' },
];
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível salvar.';
const asSections = (value: unknown): Section[] => Array.isArray(value) ? value.filter((s): s is Section => ALL.includes(s as Section)) : ALL;
const asAccount = (uid: string, data: DocumentData): Account => ({
  uid, email: String(data.email || ''),
  role: data.role === 'admin' ? 'admin' : data.role === 'editor' ? 'editor' : 'viewer',
  permissions: asSections(data.permissions), disabled: data.disabled === true,
});

// Spark: contas são criadas pelo próprio usuário no Firebase Authentication.
// Somente um admin pré-existente no Firestore aprova acesso e autoriza áreas.
export default function AccountsAdmin({selfUid}: {selfUid: string}) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [drafts, setDrafts] = useState<Record<string, {role: 'viewer' | 'editor'; permissions: Section[]}>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!db) return;
    const unsubscribeAccounts = onSnapshot(collection(db, 'user_roles'), snapshot => {
      setAccounts(snapshot.docs.map(d => asAccount(d.id, d.data())));
    }, e => setError('Não foi possível listar as contas: ' + e.message));
    const unsubscribeRequests = onSnapshot(collection(db, 'access_requests'), snapshot => {
      setRequests(snapshot.docs.map(d => ({
        uid: d.id, email: String(d.data().email || ''),
        status: d.data().status === 'approved' ? 'approved' : d.data().status === 'denied' ? 'denied' : 'pending',
      })));
    }, e => setError('Não foi possível listar solicitações: ' + e.message));
    return () => { unsubscribeAccounts(); unsubscribeRequests(); };
  }, []);

  const draftFor = (uid: string, account?: Account) => drafts[uid] || {
    role: account?.role === 'editor' ? 'editor' as const : 'viewer' as const,
    permissions: account?.permissions || ['catalog' as const],
  };
  const setDraft = (uid: string, draft: {role: 'viewer' | 'editor'; permissions: Section[]}) =>
    setDrafts(old => ({...old, [uid]: draft}));
  const toggle = (uid: string, key: Section, account?: Account) => {
    const draft = draftFor(uid, account);
    setDraft(uid, {...draft, permissions: draft.permissions.includes(key)
      ? draft.permissions.filter(s => s !== key)
      : [...draft.permissions, key]});
  };
  const execute = async (key: string, work: () => Promise<void>, success: string) => {
    setBusy(key); setError(''); setMessage('');
    try { await work(); setMessage(success); }
    catch(e) { setError(errorText(e)); }
    finally { setBusy(null); }
  };
  const approve = (request: Request) => {
    if (!db || !auth?.currentUser || !window.confirm(`Aprovar ${request.email} para acessar o MB REFERENCIAS?`)) return;
    const draft = draftFor(request.uid);
    if (!draft.permissions.length) { setError('Selecione pelo menos uma área.'); return; }
    void execute(request.uid, async () => {
      const batch = writeBatch(db);
      batch.set(doc(db, 'user_roles', request.uid), {
        email: request.email, role: draft.role, permissions: draft.permissions,
        disabled: false, approvedAt: serverTimestamp(), approvedBy: auth.currentUser!.uid,
      });
      batch.update(doc(db, 'access_requests', request.uid), {
        status: 'approved', reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser!.uid,
      });
      await batch.commit();
    }, 'Acesso liberado. A pessoa poderá entrar nas áreas selecionadas.');
  };
  const deny = (request: Request) => {
    if (!db || !auth?.currentUser || !window.confirm(`Recusar a solicitação de ${request.email}?`)) return;
    void execute(request.uid, () => updateDoc(doc(db, 'access_requests', request.uid), {
      status: 'denied', reviewedAt: serverTimestamp(), reviewedBy: auth.currentUser!.uid,
    }), 'Solicitação recusada.');
  };
  const savePermissions = (account: Account) => {
    if (!db || !auth?.currentUser) return;
    const draft = draftFor(account.uid, account);
    if (!draft.permissions.length) { setError('Selecione pelo menos uma área.'); return; }
    void execute(account.uid, () => updateDoc(doc(db, 'user_roles', account.uid), {
      role: draft.role, permissions: draft.permissions,
      updatedAt: serverTimestamp(), updatedBy: auth.currentUser!.uid,
    }), 'Permissões atualizadas.');
  };
  const setDisabled = (account: Account) => {
    if (!db || !auth?.currentUser || !window.confirm(`${account.disabled ? 'Reativar' : 'Bloquear'} o acesso de ${account.email || account.uid}?`)) return;
    void execute(account.uid, () => updateDoc(doc(db, 'user_roles', account.uid), {
      disabled: !account.disabled, updatedAt: serverTimestamp(), updatedBy: auth.currentUser!.uid,
    }), account.disabled ? 'Acesso reativado.' : 'Acesso bloqueado. A conta de login foi preservada.');
  };
  const sendReset = (account: Account) => {
    if (!auth || !account.email || !window.confirm(`Enviar um link de redefinição de senha para ${account.email}?`)) return;
    void execute(account.uid, () => sendPasswordResetEmail(auth, account.email), 'Solicitação de recuperação enviada. A pessoa deve consultar seu e-mail.');
  };
  const pending = requests.filter(r => r.status === 'pending' && !accounts.some(a => a.uid === r.uid));

  return <div className="account-admin">
    <div className="admin-warning"><Shield size={19}/><span><strong>Modo gratuito (Spark).</strong> Cada pessoa clica em <strong>Criar conta</strong> na tela inicial. A conta aguarda sua aprovação, sem acesso aos modelos nem às OCs. Você libera as áreas abaixo. Não usamos Cloud Functions.</span></div>
    {error && <div className="production-alert" role="alert">{error}</div>}
    {message && <div className="production-ok"><CheckCircle2 size={16}/>{message}</div>}
    <div className="account-list-head"><h3>Solicitações aguardando aprovação ({pending.length})</h3></div>
    {!pending.length && <div className="admin-warning">Nenhuma solicitação pendente. Peça à pessoa para criar a própria conta na página inicial e volte aqui.</div>}
    {pending.map(request => {
      const draft = draftFor(request.uid);
      return <section className="account-item" key={request.uid}>
        <div className="account-identity"><div><strong>{request.email}</strong><small>Aguardando sua autorização</small></div></div>
        <label className="account-role-label">Perfil<select disabled={!!busy} value={draft.role} onChange={e => setDraft(request.uid, {...draft, role: e.target.value as 'viewer' | 'editor'})}><option value="viewer">Consulta (somente ver)</option><option value="editor">Editor (pode alterar)</option></select></label>
        <div className="account-perms"><strong>Áreas que poderá acessar</strong><div className="account-checkboxes">{SECTIONS.map(s => <label key={s.value}><input type="checkbox" disabled={!!busy} checked={draft.permissions.includes(s.value)} onChange={() => toggle(request.uid, s.value)}/>{s.label}</label>)}</div></div>
        <div className="account-buttons"><button className="primary-button" disabled={!!busy || !draft.permissions.length} onClick={() => approve(request)}><UserCheck size={15}/> Aprovar acesso</button><button className="outline-button" disabled={!!busy} onClick={() => deny(request)}>Recusar</button></div>
      </section>;
    })}
    <div className="account-list-head"><h3>Contas autorizadas ({accounts.length})</h3><RefreshCw size={17}/></div>
    <div className="account-list">{accounts.map(account => {
      const admin = account.role === 'admin';
      const locked = !!busy || admin || account.uid === selfUid;
      const draft = draftFor(account.uid, account);
      return <section key={account.uid} className="account-item">
        <div className="account-identity"><div><strong>{account.email || account.uid}</strong><small>{admin ? 'Administrador principal' : account.disabled ? 'Acesso bloqueado' : 'Acesso liberado'}{account.uid === selfUid ? ' · Você' : ''}</small></div></div>
        {!admin && <>
          <label className="account-role-label">Perfil<select disabled={locked} value={draft.role} onChange={e => setDraft(account.uid, {...draft, role: e.target.value as 'viewer' | 'editor'})}><option value="viewer">Consulta</option><option value="editor">Editor</option></select></label>
          <div className="account-checkboxes">{SECTIONS.map(s => <label key={s.value}><input disabled={locked} type="checkbox" checked={draft.permissions.includes(s.value)} onChange={() => toggle(account.uid, s.value, account)}/>{s.label}</label>)}</div>
          <div className="account-buttons"><button className="outline-button" disabled={locked || !draft.permissions.length} onClick={() => savePermissions(account)}><Shield size={14}/> Salvar acessos</button><button className="outline-button" disabled={locked} onClick={() => setDisabled(account)}><UserRoundX size={14}/>{account.disabled ? 'Reativar' : 'Bloquear'}</button>{account.email && <button className="outline-button" disabled={!!busy} onClick={() => sendReset(account)}><Mail size={14}/> Enviar recuperação de senha</button>}</div>
        </>}
      </section>;
    })}</div>
    <p className="account-note"><strong>Importante:</strong> bloquear o acesso não exclui a identidade do Firebase Authentication. Excluir definitivamente uma conta ou definir sua senha diretamente exige o Console do Firebase (Authentication → Users). Por segurança, o painel não permite criar outros administradores. Sua conta admin atual deve continuar preservada.</p>
  </div>;
}
