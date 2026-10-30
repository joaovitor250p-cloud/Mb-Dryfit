import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData } from 'firebase/firestore';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { CheckCircle2, FileText, Pencil, Plus, Search, Trash2, UserSquare2, X } from 'lucide-react';
import brandLogo from './assets/mb-dryfit-logo.webp';
import { readPageMemory, usePageMemory } from './lib/pageMemory';
import { safeProviderMessage } from './lib/safeMessage';

type Props = { db: Firestore; user: User; canEdit: boolean };
type InfoRecord = { id: string; name: string; value: string; pix: string; pixName: string; notes: string };
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const mapDoc = (id:string, d:DocumentData): InfoRecord => ({ id, name: String(d.name || ''), value: String(d.value || ''), pix: String(d.pix || ''), pixName: String(d.pixName || ''), notes: String(d.notes || '') });

export default function InfoPage({ db, user, canEdit }: Props) {
  const pageMemoryKey = `mb-referencias:${user.uid}:info`;
  const [initialPageState] = useState(() => readPageMemory(pageMemoryKey, { queryText: '' }));
  const [items, setItems] = useState<InfoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState(String(initialPageState.queryText || ''));
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<InfoRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [pix, setPix] = useState('');
  const [pixName, setPixName] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  usePageMemory(pageMemoryKey, { queryText }, !loading);

  useEffect(() => onSnapshot(query(collection(db, 'mb_info'), orderBy('name')), snap => {
    setItems(snap.docs.map(d => mapDoc(d.id, d.data())));
    setLoading(false);
  }, e => { setError('Não foi possível carregar as informações: ' + safeProviderMessage(e)); setLoading(false); }), [db]);

  const filtered = useMemo(() => items.filter(item => !queryText.trim() || normalize([item.name, item.value, item.pix, item.pixName, item.notes].join(' ')).includes(normalize(queryText))), [items, queryText]);
  const reset = () => { setEditing(null); setName(''); setValue(''); setPix(''); setPixName(''); setNotes(''); setOpen(false); };
  const openNew = () => { setEditing(null); setName(''); setValue(''); setPix(''); setPixName(''); setNotes(''); setOpen(true); };
  const openEdit = (item: InfoRecord) => { setEditing(item); setName(item.name); setValue(item.value); setPix(item.pix); setPixName(item.pixName); setNotes(item.notes); setOpen(true); };
  const notify = (msg:string, isError=false) => { setError(isError ? msg : ''); setMessage(isError ? '' : msg); };

  const save = async () => {
    if (!canEdit || busy) return;
    if (!name.trim()) return notify('Informe o nome.', true);
    setBusy(true);
    try {
      const payload = { name: name.trim(), value: value.trim(), pix: pix.trim(), pixName: pixName.trim(), notes: notes.trim(), updatedAt: serverTimestamp(), updatedBy: user.uid };
      if (editing) await updateDoc(doc(db, 'mb_info', editing.id), payload);
      else await setDoc(doc(collection(db, 'mb_info')), { ...payload, createdAt: serverTimestamp(), createdBy: user.uid });
      notify(editing ? 'Registro atualizado.' : 'Registro adicionado.');
      reset();
    } catch (e) { notify(safeProviderMessage(e, 'Não foi possível salvar.'), true); }
    finally { setBusy(false); }
  };

  const remove = async (item: InfoRecord) => {
    if (!canEdit || busy || !window.confirm(`Excluir o registro de ${item.name}?`)) return;
    setBusy(true);
    try { await deleteDoc(doc(db, 'mb_info', item.id)); notify('Registro excluído.'); }
    catch (e) { notify(safeProviderMessage(e, 'Não foi possível excluir.'), true); }
    finally { setBusy(false); }
  };

  return <div className="page-wrap extra-page info-page">
    <div className="page-heading">
      <div className="page-heading-copy">
        <div className="page-brand-row"><img className="page-brand-logo" src={brandLogo} alt="MB DryFit"/><div><span className="eyebrow">CADASTRO INTERNO</span><h1>Informações MB</h1></div></div>
        <p>Valores, chaves PIX e titulares organizados em fichas fáceis de consultar.</p>
      </div>
      {canEdit && <div className="heading-actions"><button className="primary-button" onClick={openNew} disabled={busy}><Plus size={16}/> Novo registro</button></div>}
    </div>
    {error && <div className="production-alert" role="alert">{error}</div>}
    {message && <div className="production-ok"><CheckCircle2 size={16}/>{message}</div>}
    <section className="stats-grid extra-stats"><div className="stat-card"><div className="stat-icon teal"><UserSquare2/></div><div><span>Registros</span><strong>{filtered.length}</strong><small>Informações filtradas</small></div></div><div className="stat-card"><div className="stat-icon amber"><FileText/></div><div><span>Busca rápida</span><strong>{queryText ? 'Ativa' : 'Livre'}</strong><small>Pesquise por nome, PIX ou valor</small></div></div></section>
    <section className="catalog-panel extra-panel">
      <div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Pesquisar nome, PIX, valor ou observação..."/></label></div>
      {loading ? <div className="empty-state">Carregando informações...</div> : !filtered.length ? <div className="empty-state"><FileText size={28}/><strong>Nenhum registro encontrado</strong></div> : <div className="simple-list">{filtered.map(item => {
        const showPixName = !!item.pixName.trim() && normalize(item.pixName) !== normalize(item.name);
        return <article key={item.id} className="simple-card info-card fade-in-up">
          <div className="info-card-head"><div className="info-card-identity"><strong>{item.name}</strong><span>Valor cadastrado</span></div><b className="info-amount">{item.value || 'Sem valor informado'}</b></div>
          <div className={`info-grid ${showPixName ? '' : 'single-info-field'}`}>
            <div><small>PIX</small><span>{item.pix || '—'}</span></div>
            {showPixName && <div><small>Titular do PIX</small><span>{item.pixName}</span></div>}
          </div>
          {item.notes && <p>{item.notes}</p>}
          {canEdit && <div className="simple-card-actions"><button className="outline-button" onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button className="danger-button" onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}
        </article>;
      })}</div>}
    </section>
    {open && <div className="modal-backdrop" onMouseDown={e=>{ if (e.target === e.currentTarget) reset(); }}><section className="modal extra-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">INFORMAÇÕES MB</span><h2>{editing ? 'Editar registro' : 'Novo registro'}</h2></div><button className="icon-button" onClick={reset} aria-label="Fechar"><X/></button></div><form className="modal-form" onSubmit={e=>{e.preventDefault(); void save();}}><label>Nome *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: José"/></label><div className="production-form-grid"><label>Valor<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Ex.: R$ 2.500,00"/></label><label>PIX<input value={pix} onChange={e=>setPix(e.target.value)} placeholder="Chave PIX"/></label></div><label>Nome do titular do PIX<input value={pixName} onChange={e=>setPixName(e.target.value)} placeholder="Titular da chave"/></label><label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional" rows={3}/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar registro'}</button></div></form></section></div>}
  </div>;
}
