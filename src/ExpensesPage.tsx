import { createPortal } from 'react-dom';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData } from 'firebase/firestore';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { CalendarDays, Camera, CheckCircle2, ChevronDown, ImagePlus, Pencil, Plus, Receipt, Search, Trash2, Wallet, X } from 'lucide-react';
import brandLogo from './assets/mb-dryfit-logo.webp';
import { optimizePhoto } from './lib/photos';
import PhotoLightbox from './PhotoLightbox';
import { PageActiveContext, readPageMemory, usePageMemory } from './lib/pageMemory';
import { safeProviderMessage } from './lib/safeMessage';
import { accountingMonthLabel as monthLabel, currentAccountingMonth as currentMonth, expenseMonth as monthOf } from './lib/monthlyAccounting';
import { parseFinanceNumber as num } from './lib/financeNumbers';

type Props = { db: Firestore; user: User; canEdit: boolean };
type Expense = { id: string; name: string; amount: string; date: string; notes: string; createdBy?: string };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const toBR = (iso:string) => /^\d{4}-\d\d-\d\d$/.test(iso) ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '—';
const money = (raw:string) => { const n=num(raw); return Number.isFinite(n) ? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—'; };
const normalize = (s:string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const mapDoc = (id:string, d:DocumentData): Expense => ({ id, name: String(d.name || ''), amount: String(d.amount ?? ''), date: String(d.date || ''), notes: String(d.notes || ''), createdBy: String(d.createdBy || '') });
const RECEIPT_DOC_ID = 'receipt';
const expenseError = (error: unknown) => {
  const e = error as { code?: string; message?: string };
  if (String(e?.code || '').includes('permission-denied') || String(e?.message || '').includes('Missing or insufficient permissions')) {
    return 'Acesso negado. Confira se seu perfil tem permissão para a área Gastos.';
  }
  return safeProviderMessage(e?.message, 'Não foi possível concluir a operação.');
};

export default function ExpensesPage({ db, user, canEdit }: Props) {
  const pageActive = useContext(PageActiveContext);
  const pageMemoryKey = `mb-referencias:${user.uid}:expenses`;
  const [initialPageState] = useState(() => readPageMemory(pageMemoryKey, { queryText: '' }));
  const [items, setItems] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState(String(initialPageState.queryText || ''));
  const [activeMonth, setActiveMonth] = useState(currentMonth());
  // O mês atual abre automaticamente, mesmo que o navegador fique aberto na virada.
  useEffect(() => {
    let last = currentMonth();
    const check = () => { const next = currentMonth(); if(next !== last){ setActiveMonth(previous => previous === last ? next : previous); last = next; } };
    document.addEventListener('visibilitychange',check);
    window.addEventListener('focus',check);
    const interval = window.setInterval(check,60000);
    return () => { document.removeEventListener('visibilitychange',check); window.removeEventListener('focus',check); window.clearInterval(interval); };
  },[]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Expense | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState('');
  const [receiptImage, setReceiptImage] = useState('');
  const [receiptChanged, setReceiptChanged] = useState(false);
  const [receiptCache, setReceiptCache] = useState<Record<string,string>>({});
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);
  const [receiptLightbox, setReceiptLightbox] = useState<{src:string;title:string;detail:string}|null>(null);
  const [busy, setBusy] = useState(false);
  const receiptCameraInput = useRef<HTMLInputElement>(null);
  const receiptGalleryInput = useRef<HTMLInputElement>(null);
  usePageMemory(pageMemoryKey, { queryText }, !loading);

  useEffect(() => { if (!pageActive) return; return onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), snap => {
    setItems(snap.docs.map(d => mapDoc(d.id, d.data())));
    setLoading(false);
  }, e => { setError('Não foi possível carregar os gastos: ' + safeProviderMessage(e)); setLoading(false); }); }, [db,pageActive]);

  // O histórico é derivado dos registros existentes: nenhum fechamento mensal apaga ou altera gastos.
  const months = useMemo(() => [...new Set([currentMonth(),...items.map(item=>monthOf(item.date))])].sort((a,b)=>b.localeCompare(a)),[items]);
  const monthlyItems = useMemo(() => items.filter(item => monthOf(item.date) === activeMonth),[items,activeMonth]);
  const filtered = useMemo(() => monthlyItems.filter(item => !queryText.trim() || normalize([item.name, item.notes, item.date, item.amount].join(' ')).includes(normalize(queryText))), [monthlyItems, queryText]);
  const total = useMemo(() => monthlyItems.reduce((sum, item) => sum + (Number.isFinite(num(item.amount)) ? num(item.amount) : 0), 0), [monthlyItems]);
  const latestDate = useMemo(() => filtered.reduce((latest,item)=>item.date>latest?item.date:latest,'') || '', [filtered]);
  const notify = (msg:string, isError=false) => { setError(isError ? msg : ''); setMessage(isError ? '' : msg); };

  const reset = () => {
    setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setReceiptImage(''); setReceiptChanged(false); setOpen(false);
  };
  const openNew = () => {
    setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setReceiptImage(''); setReceiptChanged(false); setOpen(true);
  };
  const openEdit = (item: Expense) => {
    // Não buscamos a nota fiscal ao abrir o formulário de edição. Se já existir,
    // ela permanece salva; a leitura acontece somente ao abrir os detalhes do gasto.
    setEditing(item); setName(item.name); setAmount(item.amount);
    setDate(/^\d{4}-\d\d-\d\d$/.test(item.date) ? item.date : today());
    setNotes(item.notes || ''); setReceiptImage(''); setReceiptChanged(false); setOpen(true);
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
    if (Object.prototype.hasOwnProperty.call(receiptCache, item.id)) return;
    setReceiptLoadingId(item.id);
    try { await readReceipt(item.id); }
    catch (e) { notify(expenseError(e), true); }
    finally { setReceiptLoadingId(current => current === item.id ? null : current); }
  };

  const processReceipt = async (file?:File) => {
    if (!file) return;
    setBusy(true);
    try { setReceiptImage(await optimizePhoto(file, 160000)); setReceiptChanged(true); }
    catch (e) { notify(safeProviderMessage(e, 'Não foi possível preparar a foto.'), true); }
    finally { setBusy(false); }
  };

  const save = async () => {
    if (!canEdit || busy) return;
    if (!name.trim()) return notify('Informe o nome do gasto.', true);
    if (!amount.trim() || !Number.isFinite(num(amount))) return notify('Informe um valor válido.', true);
    setBusy(true);
    try {
      const payload = { name: name.trim(), amount: amount.trim(), date, notes: notes.trim(), updatedAt: serverTimestamp(), updatedBy: user.uid };
      const expenseRef = editing ? doc(db, 'expenses', editing.id) : doc(collection(db, 'expenses'));
      const receiptRef = doc(db, 'expenses', expenseRef.id, 'attachments', RECEIPT_DOC_ID);
      if (editing) await updateDoc(expenseRef, payload);
      else await setDoc(expenseRef, { ...payload, createdAt: serverTimestamp(), createdBy: user.uid });
      // Se a nota fiscal falhar, o gasto já fica salvo e o formulário permanece
      // aberto para tentar novamente sem criar um segundo lançamento.
      setEditing({ id: expenseRef.id, name: name.trim(), amount: amount.trim(), date, notes: notes.trim(), createdBy: editing?.createdBy || user.uid });

      // Só grava/remove o anexo quando a pessoa escolheu alterar a nota fiscal.
      // Assim, editar nome/valor não exige ler nem regravar fotos existentes.
      if (receiptChanged) {
        try {
          if (receiptImage) {
            await setDoc(receiptRef, { imageData: receiptImage, updatedAt: serverTimestamp(), updatedBy: user.uid });
            setReceiptCache(current => ({...current,[expenseRef.id]:receiptImage}));
          } else {
            await deleteDoc(receiptRef);
            setReceiptCache(current => ({...current,[expenseRef.id]:''}));
          }
        } catch (receiptError) {
          const detail = expenseError(receiptError);
          notify(`O gasto foi salvo, mas a nota fiscal não foi salva. Confira as regras publicadas de expenses/attachments: ${detail}`, true);
          return;
        }
      }
      setActiveMonth(monthOf(date));
      notify(receiptChanged ? 'Gasto e nota fiscal salvos.' : (editing ? 'Gasto atualizado. A nota fiscal existente foi preservada.' : 'Gasto cadastrado.'));
      reset();
    } catch (e) { notify(expenseError(e), true); }
    finally { setBusy(false); }
  };

  const remove = async (item: Expense) => {
    if (!canEdit || busy || !window.confirm(`Deseja realmente EXCLUIR o gasto "${item.name}" de ${toBR(item.date)} (${money(item.amount)})?\nEsta exclusão é permanente e também apaga a nota fiscal vinculada.`)) return;
    setBusy(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'expenses', item.id));
      batch.delete(doc(db, 'expenses', item.id, 'attachments', RECEIPT_DOC_ID));
      await batch.commit();
      setReceiptCache(current => { const next={...current}; delete next[item.id]; return next; });
      if (expandedExpenseId === item.id) setExpandedExpenseId(null);
      notify('Gasto excluído.');
    } catch (e) { notify(expenseError(e), true); }
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
      <div className="stat-card"><div className="stat-icon amber"><Wallet/></div><div><span>Total de {monthLabel(activeMonth)}</span><strong className="money-stat">{total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong><small>{monthlyItems.length} lançamento(s) no mês</small></div></div>
      <div className="stat-card"><div className="stat-icon green"><CalendarDays/></div><div><span>Última data</span><strong>{latestDate ? toBR(latestDate) : '—'}</strong><small>Data mais recente dos resultados</small></div></div>
    </section>
    <section className="catalog-panel extra-panel">
      <div className="production-toolbar expense-month-toolbar">
        <label className="expense-month-selector"><CalendarDays size={16}/> Período <select value={activeMonth} onChange={e=>setActiveMonth(e.target.value)} aria-label="Selecionar mês dos gastos">{months.map(month=><option key={month} value={month}>{monthLabel(month)}{month===currentMonth()?' · atual':''}</option>)}</select></label>
        <label className="search-box"><Search size={18}/><input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Pesquisar gastos deste mês..."/></label>
        <span className="expense-month-note">Meses anteriores disponíveis para consulta. O histórico permanece salvo no Firebase.</span>
      </div>
      {loading ? <div className="empty-state">Carregando gastos...</div> : !filtered.length ? <div className="empty-state"><Receipt size={28}/><strong>Nenhum gasto em {monthLabel(activeMonth)}</strong><span>Escolha outro mês para consultar o histórico ou cadastre um novo gasto.</span></div> : <div className="simple-list">{filtered.map(item => {
        const expanded = expandedExpenseId === item.id;
        const receipt = receiptCache[item.id] || '';
        return <article key={item.id} className="simple-card expense-card">
          <button type="button" className="expense-card-toggle" aria-expanded={expanded} onClick={()=>void toggleDetails(item)}>
            <span className="expense-card-identity"><strong>{item.name}</strong><span><CalendarDays size={14}/>{toBR(item.date)}</span></span>
            <span className="expense-amount-wrap"><small>Valor</small><b className="expense-amount">{money(item.amount)}</b></span>
            <ChevronDown className={`expense-toggle-icon ${expanded?'expanded':''}`} size={19}/>
          </button>
          {canEdit && <div className="expense-row-actions"><button type="button" className="outline-button" disabled={busy} onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button type="button" className="danger-button" disabled={busy} onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}
          {expanded && <div className="expense-expanded-details">
            {item.notes && <p className="expense-notes">{item.notes}</p>}
            <div className="expense-receipt-section"><strong><Receipt size={15}/> Nota fiscal</strong>
              {receiptLoadingId === item.id ? <span className="expense-receipt-empty">Carregando nota fiscal...</span> : receipt ? <button type="button" className="expense-receipt-preview" onClick={()=>setReceiptLightbox({src:receipt,title:`Nota fiscal — ${item.name}`,detail:toBR(item.date)})}><img src={receipt} alt={`Nota fiscal de ${item.name}`} loading="lazy" decoding="async"/><span>Ampliar nota fiscal</span></button> : <span className="expense-receipt-empty">Nenhuma nota fiscal anexada.</span>}
            </div>

          </div>}
        </article>;
      })}</div>}
    </section>
    {open && pageActive && createPortal(<div className="modal-backdrop" onMouseDown={e=>{ if (e.target === e.currentTarget) reset(); }}><section className="modal extra-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">GASTOS</span><h2>{editing ? 'Editar gasto' : 'Novo gasto'}</h2></div><button className="icon-button" onClick={reset} aria-label="Fechar"><X/></button></div><form className="modal-form" onSubmit={e=>{e.preventDefault(); void save();}}>
      <div className="production-form-grid"><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Valor *<input required value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ex.: 250,00"/></label></div>
      <label>Nome do gasto *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Compra de tecido"/></label>
      <label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional" rows={3}/></label>
      <div className="expense-receipt-form"><strong><Receipt size={16}/> Nota fiscal (opcional)</strong>
        {receiptImage ? <div className="expense-receipt-form-preview"><img src={receiptImage} alt="Prévia da nota fiscal"/><button type="button" className="outline-button" disabled={busy} onClick={()=>{setReceiptImage('');setReceiptChanged(false)}}><Trash2 size={14}/> Cancelar nova foto</button></div> : <span className="expense-receipt-empty">{editing ? 'Se já houver uma nota fiscal, ela será preservada. Selecione uma nova foto para substituir.' : 'Nenhuma foto selecionada.'}</span>}
        <div className="sample-photo-choices"><button type="button" className="outline-button" disabled={busy} onClick={()=>receiptCameraInput.current?.click()}><Camera size={16}/> Câmera</button><button type="button" className="outline-button" disabled={busy} onClick={()=>receiptGalleryInput.current?.click()}><ImagePlus size={16}/> Galeria</button></div>
        <input ref={receiptCameraInput} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void processReceipt(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/>
        <input ref={receiptGalleryInput} type="file" accept="image/*" hidden onChange={e=>{void processReceipt(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/>
        <small>A imagem só aparece na lista quando alguém abrir os detalhes desse gasto.</small>
      </div>
      <div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar gasto'}</button></div>
    </form></section></div>,document.body)}
    {receiptLightbox&&<PhotoLightbox src={receiptLightbox.src} title={receiptLightbox.title} detail={receiptLightbox.detail} onClose={()=>setReceiptLightbox(null)}/>}
  </div>;
}
