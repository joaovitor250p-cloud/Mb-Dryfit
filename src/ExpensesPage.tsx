import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData } from 'firebase/firestore';
import { collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore';
import { CalendarDays, Camera, CheckCircle2, ChevronDown, ImagePlus, Pencil, Plus, Receipt, Search, Trash2, Wallet, X } from 'lucide-react';
import brandLogo from './assets/mb-dryfit-logo.png';
import { optimizePhoto } from './lib/photos';
import PhotoLightbox from './PhotoLightbox';

type Props = { db: Firestore; user: User; canEdit: boolean };
type Expense = { id: string; name: string; amount: string; date: string; notes: string; createdBy?: string };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const toBR = (iso:string) => /^\d{4}-\d\d-\d\d$/.test(iso) ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '—';
const num = (raw:string) => { const cleaned=String(raw).replace(/[^\d,.-]/g,''); const normalized=cleaned.includes(',')?cleaned.replace(/\./g,'').replace(',','.'):cleaned; const n=Number(normalized); return Number.isFinite(n) ? n : NaN; };
const money = (raw:string) => { const n=num(raw); return Number.isFinite(n) ? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—'; };
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const mapDoc = (id:string, d:DocumentData): Expense => ({ id, name: String(d.name || ''), amount: String(d.amount ?? ''), date: String(d.date || ''), notes: String(d.notes || ''), createdBy: String(d.createdBy || '') });
const RECEIPT_DOC_ID = 'receipt';

export default function ExpensesPage({ db, user, canEdit }: Props) {
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [receiptCache, setReceiptCache] = useState<Record<string,string>>({});
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [receiptFormLoading, setReceiptFormLoading] = useState(false);
  const [receiptFormError, setReceiptFormError] = useState('');
  const [receiptLightbox, setReceiptLightbox] = useState<{src:string;title:string;detail:string}|null>(null);
  const [busy, setBusy] = useState(false);
  const receiptCameraInput = useRef<HTMLInputElement>(null);
  const receiptGalleryInput = useRef<HTMLInputElement>(null);
  const receiptRequest = useRef(0);

  useEffect(() => onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), snap => {
    setItems(snap.docs.map(d => mapDoc(d.id, d.data())));
    setLoading(false);
  }, e => { setError('Não foi possível carregar os gastos: ' + e.message); setLoading(false); }), [db]);

  const filtered = useMemo(() => items.filter(item => !queryText.trim() || normalize([item.name, item.notes, item.date, item.amount].join(' ')).includes(normalize(queryText))), [items, queryText]);
  const total = useMemo(() => filtered.reduce((sum, item) => sum + (Number.isFinite(num(item.amount)) ? num(item.amount) : 0), 0), [filtered]);
  const latestDate = useMemo(() => filtered.reduce((latest,item)=>item.date>latest?item.date:latest,'') || '', [filtered]);
  const notify = (msg:string, isError=false) => { setError(isError ? msg : ''); setMessage(isError ? '' : msg); };

  const reset = () => {
    receiptRequest.current += 1;
    setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setReceiptImage('');
    setReceiptFormLoading(false); setReceiptFormError(''); setOpen(false);
  };
  const openNew = () => {
    receiptRequest.current += 1;
    setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setReceiptImage('');
    setReceiptFormLoading(false); setReceiptFormError(''); setOpen(true);
  };
  const openEdit = async (item: Expense) => {
    const requestId = ++receiptRequest.current;
    setEditing(item); setName(item.name); setAmount(item.amount);
    setDate(/^\d{4}-\d\d-\d\d$/.test(item.date) ? item.date : today());
    setNotes(item.notes || ''); setReceiptImage(''); setReceiptFormError(''); setOpen(true);
    setReceiptFormLoading(true);
    try {
      const snap = await getDoc(doc(db, 'expenses', item.id, 'attachments', RECEIPT_DOC_ID));
      const image = snap.exists() ? String(snap.data().imageData || '') : '';
      if (requestId === receiptRequest.current) {
        setReceiptImage(image);
        setReceiptCache(current => ({...current,[item.id]:image}));
      }
    } catch (e) {
      if (requestId === receiptRequest.current) setReceiptFormError(e instanceof Error ? e.message : 'Não foi possível carregar a nota fiscal.');
    } finally {
      if (requestId === receiptRequest.current) setReceiptFormLoading(false);
    }
  };

  const readReceipt = async (expenseId:string) => {
    const snap = await getDoc(doc(db, 'expenses', expenseId, 'attachments', RECEIPT_DOC_ID));
    const image = snap.exists() ? String(snap.data().imageData || '') : '';
    setReceiptCache(current => ({...current,[expenseId]:image}));
    return image;
  };
  const toggleDetails = async (item:Expense) => {
    if (expandedExpenseId === item.id) { setExpandedExpenseId(null); return; }
    setExpandedExpenseId(item.id);
    setReceiptLoadingId(item.id);
    try { await readReceipt(item.id); }
    catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível carregar a nota fiscal.', true); }
    finally { setReceiptLoadingId(current => current === item.id ? null : current); }
  };

  const processReceipt = async (file?:File) => {
    if (!file) return;
    setBusy(true); setReceiptFormError('');
    try { setReceiptImage(await optimizePhoto(file, 160000)); }
    catch (e) { setReceiptFormError(e instanceof Error ? e.message : 'Não foi possível preparar a foto.'); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!canEdit || busy || receiptFormLoading || receiptFormError) return;
    if (!name.trim()) return notify('Informe o nome do gasto.', true);
    if (!amount.trim() || !Number.isFinite(num(amount))) return notify('Informe um valor válido.', true);
    setBusy(true);
    try {
      const payload = { name: name.trim(), amount: amount.trim(), date, notes: notes.trim(), updatedAt: serverTimestamp(), updatedBy: user.uid };
      const expenseRef = editing ? doc(db, 'expenses', editing.id) : doc(collection(db, 'expenses'));
      const receiptRef = doc(db, 'expenses', expenseRef.id, 'attachments', RECEIPT_DOC_ID);
      const batch = writeBatch(db);
      if (editing) batch.update(expenseRef, payload);
      else batch.set(expenseRef, { ...payload, createdAt: serverTimestamp(), createdBy: user.uid });
      if (receiptImage) batch.set(receiptRef, { imageData: receiptImage, updatedAt: serverTimestamp(), updatedBy: user.uid });
      else batch.delete(receiptRef);
      await batch.commit();
      setReceiptCache(current => ({...current,[expenseRef.id]:receiptImage}));
      notify(editing ? 'Gasto atualizado.' : 'Gasto cadastrado.');
      reset();
    } catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível salvar o gasto.', true); }
    finally { setBusy(false); }
  };

  const remove = async (item: Expense) => {
    if (!canEdit || busy || !window.confirm(`Excluir o gasto "${item.name}"?`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'expenses', item.id));
      batch.delete(doc(db, 'expenses', item.id, 'attachments', RECEIPT_DOC_ID));
      await batch.commit();
      setReceiptCache(current => { const next={...current}; delete next[item.id]; return next; });
      if (expandedExpenseId === item.id) setExpandedExpenseId(null);
      notify('Gasto excluído.');
    } catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível excluir.', true); }
    finally { setBusy(false); }
  };

  return <div className="page-wrap extra-page finance-page">
    <div className="page-heading">
      <div className="page-heading-copy">
        <div className="page-brand-row"><img className="page-brand-logo" src={brandLogo} alt="MB DryFit"/><div><span className="eyebrow">FINANCEIRO</span><h1>Gastos</h1></div></div>
        <p>Consulte e organize as despesas da MB em uma lista clara, com valores em destaque.</p>
      </div>
      {canEdit && <div className="heading-actions"><button className="primary-button" onClick={openNew} disabled={busy}><Plus size={16}/> Novo gasto</button></div>}
    </div>
    {error && <div className="production-alert" role="alert">{error}</div>}
    {message && <div className="production-ok"><CheckCircle2 size={16}/>{message}</div>}
    <section className="stats-grid extra-stats">
      <div className="stat-card"><div className="stat-icon amber"><Wallet/></div><div><span>Total filtrado</span><strong className="money-stat">{total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong><small>{filtered.length} lançamento(s)</small></div></div>
      <div className="stat-card"><div className="stat-icon green"><CalendarDays/></div><div><span>Última data</span><strong>{latestDate ? toBR(latestDate) : '—'}</strong><small>Data mais recente dos resultados</small></div></div>
    </section>
    <section className="catalog-panel extra-panel">
      <div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Pesquisar gasto, observação, valor ou data..."/></label></div>
      {loading ? <div className="empty-state">Carregando gastos...</div> : !filtered.length ? <div className="empty-state"><Receipt size={28}/><strong>Nenhum gasto encontrado</strong></div> : <div className="simple-list">{filtered.map(item => {
        const expanded = expandedExpenseId === item.id;
        const receipt = receiptCache[item.id] || '';
        return <article key={item.id} className="simple-card expense-card">
          <button type="button" className="expense-card-toggle" aria-expanded={expanded} onClick={()=>void toggleDetails(item)}>
            <span className="expense-card-identity"><strong>{item.name}</strong><span><CalendarDays size={14}/>{toBR(item.date)}</span></span>
            <span className="expense-amount-wrap"><small>Valor</small><b className="expense-amount">{money(item.amount)}</b></span>
            <ChevronDown className={`expense-toggle-icon ${expanded?'expanded':''}`} size={19}/>
          </button>
          {expanded && <div className="expense-expanded-details">
            {item.notes && <p className="expense-notes">{item.notes}</p>}
            <div className="expense-receipt-section"><strong><Receipt size={15}/> Nota fiscal</strong>
              {receiptLoadingId === item.id ? <span className="expense-receipt-empty">Carregando nota fiscal...</span> : receipt ? <button type="button" className="expense-receipt-preview" onClick={()=>setReceiptLightbox({src:receipt,title:`Nota fiscal — ${item.name}`,detail:toBR(item.date)})}><img src={receipt} alt={`Nota fiscal de ${item.name}`} loading="lazy" decoding="async"/><span>Ampliar nota fiscal</span></button> : <span className="expense-receipt-empty">Nenhuma nota fiscal anexada.</span>}
            </div>
            {canEdit && <div className="simple-card-actions"><button className="outline-button" onClick={()=>void openEdit(item)}><Pencil size={14}/> Editar</button><button className="danger-button" onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}
          </div>}
        </article>;
      })}</div>}
    </section>
    {open && <div className="modal-backdrop" onMouseDown={e=>{ if (e.target === e.currentTarget) reset(); }}><section className="modal extra-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">GASTOS</span><h2>{editing ? 'Editar gasto' : 'Novo gasto'}</h2></div><button className="icon-button" onClick={reset} aria-label="Fechar"><X/></button></div><form className="modal-form" onSubmit={e=>{e.preventDefault(); void save();}}>
      <div className="production-form-grid"><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Valor *<input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ex.: 250,00"/></label></div>
      <label>Nome do gasto *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Compra de tecido"/></label>
      <label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional" rows={3}/></label>
      <div className="expense-receipt-form"><strong><Receipt size={16}/> Nota fiscal (opcional)</strong>
        {receiptFormLoading ? <span className="expense-receipt-empty">Carregando nota fiscal salva...</span> : receiptImage ? <div className="expense-receipt-form-preview"><img src={receiptImage} alt="Prévia da nota fiscal"/><button type="button" className="outline-button" disabled={busy} onClick={()=>setReceiptImage('')}><Trash2 size={14}/> Remover foto</button></div> : <span className="expense-receipt-empty">Nenhuma foto selecionada.</span>}
        <div className="sample-photo-choices"><button type="button" className="outline-button" disabled={busy||receiptFormLoading} onClick={()=>receiptCameraInput.current?.click()}><Camera size={16}/> Câmera</button><button type="button" className="outline-button" disabled={busy||receiptFormLoading} onClick={()=>receiptGalleryInput.current?.click()}><ImagePlus size={16}/> Galeria</button></div>
        <input ref={receiptCameraInput} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void processReceipt(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/>
        <input ref={receiptGalleryInput} type="file" accept="image/*" hidden onChange={e=>{void processReceipt(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/>
        {receiptFormError&&<div className="production-alert" role="alert">{receiptFormError} Feche e abra o gasto novamente antes de salvar, para não perder uma nota fiscal já existente.</div>}
        <small>A imagem só aparece na lista quando alguém abrir os detalhes desse gasto.</small>
      </div>
      <div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy||receiptFormLoading||!!receiptFormError}>{busy ? 'Salvando...' : 'Salvar gasto'}</button></div>
    </form></section></div>}
    {receiptLightbox&&<PhotoLightbox src={receiptLightbox.src} title={receiptLightbox.title} detail={receiptLightbox.detail} onClose={()=>setReceiptLightbox(null)}/>}
  </div>;
}
