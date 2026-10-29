import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData } from 'firebase/firestore';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { CalendarDays, CheckCircle2, FileUp, Pencil, Plus, Receipt, Search, Trash2, Wallet, X } from 'lucide-react';
import { normalizeCsvHeader, parseBrazilianDate, readSemicolonCsv } from './csvImport';

type Props = { db: Firestore; user: User; canEdit: boolean };
type Expense = { id: string; name: string; amount: string; date: string; notes: string; createdBy?: string };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const toBR = (iso:string) => /^\d{4}-\d\d-\d\d$/.test(iso) ? `${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}` : '—';
const money = (raw:string) => { const n = Number(String(raw).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',', '.')); return Number.isFinite(n) ? n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) : '—'; };
const num = (raw:string) => { const n = Number(String(raw).replace(/[^\d,.-]/g,'').replace(/\./g,'').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const normalize = (s:string) => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const mapDoc = (id:string, d:DocumentData): Expense => ({ id, name: String(d.name || ''), amount: String(d.amount || ''), date: String(d.date || ''), notes: String(d.notes || ''), createdBy: String(d.createdBy || '') });

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
  const [busy, setBusy] = useState(false);
  const csvInput = useRef<HTMLInputElement>(null);

  useEffect(() => onSnapshot(query(collection(db, 'expenses'), orderBy('date', 'desc')), snap => {
    setItems(snap.docs.map(d => mapDoc(d.id, d.data())));
    setLoading(false);
  }, e => { setError('Não foi possível carregar os gastos: ' + e.message); setLoading(false); }), [db]);

  const filtered = useMemo(() => items.filter(item => !queryText.trim() || normalize([item.name, item.notes, item.date].join(' ')).includes(normalize(queryText))), [items, queryText]);
  const monthTotal = useMemo(() => filtered.reduce((sum, item) => sum + (Number.isFinite(num(item.amount)) ? num(item.amount) : 0), 0), [filtered]);

  const reset = () => { setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setOpen(false); };
  const openNew = () => { setEditing(null); setName(''); setAmount(''); setDate(today()); setNotes(''); setOpen(true); };
  const openEdit = (item: Expense) => { setEditing(item); setName(item.name); setAmount(item.amount); setDate(/^\d{4}-\d\d-\d\d$/.test(item.date) ? item.date : today()); setNotes(item.notes || ''); setOpen(true); };
  const notify = (msg:string, isError=false) => { setError(isError ? msg : ''); setMessage(isError ? '' : msg); };

  const save = async () => {
    if (!canEdit || busy) return;
    if (!name.trim()) return notify('Informe o nome do gasto.', true);
    if (!amount.trim() || !Number.isFinite(num(amount))) return notify('Informe um valor válido.', true);
    setBusy(true);
    try {
      const payload = { name: name.trim(), amount: amount.trim(), date, notes: notes.trim(), updatedAt: serverTimestamp(), updatedBy: user.uid };
      if (editing) {
        await updateDoc(doc(db, 'expenses', editing.id), payload);
      } else {
        const ref = doc(collection(db, 'expenses'));
        const batch = writeBatch(db);
        batch.set(ref, { ...payload, createdAt: serverTimestamp(), createdBy: user.uid });
        await batch.commit();
      }
      notify(editing ? 'Gasto atualizado.' : 'Gasto cadastrado.');
      reset();
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Não foi possível salvar o gasto.', true);
    } finally { setBusy(false); }
  };

  const remove = async (item: Expense) => {
    if (!canEdit || busy || !window.confirm(`Excluir o gasto "${item.name}"?`)) return;
    setBusy(true);
    try { await deleteDoc(doc(db, 'expenses', item.id)); notify('Gasto excluído.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível excluir.', true); }
    finally { setBusy(false); }
  };


  const importCsv = async (file: File) => {
    if (!canEdit || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const rows = await readSemicolonCsv(file);
      const headerIndex = rows.findIndex(row => normalizeCsvHeader(row[0] || '') === 'data'
        && normalizeCsvHeader(row[1] || '') === 'gasto'
        && normalizeCsvHeader(row[2] || '') === 'valor');
      if (headerIndex < 0) throw new Error('Não encontrei as colunas DATA;GASTO;VALOR. Selecione a planilha de gastos original.');

      const records: Array<{ line: number; date: string; name: string; amount: string }> = [];
      let invalidCount = 0;
      rows.forEach((row, rowIndex) => {
        if (rowIndex <= headerIndex) return;
        const date = parseBrazilianDate(row[0] || '');
        const name = (row[1] || '').trim();
        const amount = (row[2] || '').trim();
        if (!name && !date && !amount) return;
        if (!name || !date || !amount) { invalidCount += 1; return; }
        records.push({ line: rowIndex + 1, date, name, amount });
      });
      if (!records.length) throw new Error('O arquivo não contém lançamentos válidos para importar.');
      if (!window.confirm(`Importar ${records.length} gastos da planilha? Registros já importados serão ignorados; os lançamentos manuais não serão substituídos.`)) return;

      const refs = records.map(record => ({ id: `gastos_outubro_2026_linha_${String(record.line).padStart(3, '0')}`, record }));
      const existing = await Promise.all(refs.map(async item => (await getDoc(doc(db, 'expenses', item.id))).exists()));
      const fresh = refs.filter((_, index) => !existing[index]);
      for (let offset = 0; offset < fresh.length; offset += 400) {
        const batch = writeBatch(db);
        fresh.slice(offset, offset + 400).forEach(({ id, record }) => {
          batch.set(doc(db, 'expenses', id), {
            name: record.name, amount: record.amount, date: record.date, notes: '',
            createdAt: serverTimestamp(), createdBy: user.uid,
            updatedAt: serverTimestamp(), updatedBy: user.uid,
          });
        });
        await batch.commit();
      }
      notify(`Importação concluída: ${fresh.length} gastos adicionados, ${records.length - fresh.length} já existentes ignorados${invalidCount ? ` e ${invalidCount} linhas incompletas ignoradas` : ''}.`);
    } catch (e) {
      notify(e instanceof Error ? `Não foi possível importar a planilha: ${e.message}` : 'Não foi possível importar a planilha.', true);
    } finally { setBusy(false); if (csvInput.current) csvInput.current.value = ''; }
  };

  return <div className="page-wrap extra-page">
    <div className="page-heading"><div><span className="eyebrow">FINANCEIRO</span><h1>Gastos</h1><p>Cadastre o nome e o valor. A data já vem preenchida automaticamente, mas você pode alterar se quiser.</p></div>{canEdit && <div className="heading-actions"><button className="outline-button" onClick={()=>csvInput.current?.click()} disabled={busy}><FileUp size={16}/> {busy ? 'Importando...' : 'Importar CSV da planilha'}</button><input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={e=>{const file=e.target.files?.[0]; if(file) void importCsv(file);}} /><button className="primary-button" onClick={openNew} disabled={busy}><Plus size={16}/> Novo gasto</button></div>}</div>
    {error && <div className="production-alert" role="alert">{error}</div>}
    {message && <div className="production-ok"><CheckCircle2 size={16}/>{message}</div>}
    <section className="stats-grid extra-stats"><div className="stat-card"><div className="stat-icon amber"><Wallet/></div><div><span>Total filtrado</span><strong>{monthTotal.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</strong><small>{filtered.length} lançamento(s)</small></div></div><div className="stat-card"><div className="stat-icon green"><CalendarDays/></div><div><span>Última data</span><strong>{filtered[0]?.date ? toBR(filtered[0].date) : '—'}</strong><small>Cadastro mais recente da lista</small></div></div></section>
    <section className="catalog-panel extra-panel">
      <div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Pesquisar gasto, observação ou data..."/></label></div>
      {loading ? <div className="empty-state">Carregando gastos...</div> : !filtered.length ? <div className="empty-state"><Receipt size={28}/><strong>Nenhum gasto encontrado</strong></div> : <div className="simple-list">{filtered.map(item => <article key={item.id} className="simple-card fade-in-up"><div className="simple-card-head"><div><strong>{item.name}</strong><span>{toBR(item.date)}</span></div><b>{money(item.amount)}</b></div>{item.notes && <p>{item.notes}</p>}{canEdit && <div className="simple-card-actions"><button className="outline-button" onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button className="danger-button" onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}</article>)}</div>}
    </section>
    {open && <div className="modal-backdrop" onMouseDown={e=>{ if (e.target === e.currentTarget) reset(); }}><section className="modal extra-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">GASTOS</span><h2>{editing ? 'Editar gasto' : 'Novo gasto'}</h2></div><button className="icon-button" onClick={reset}><X/></button></div><form className="modal-form" onSubmit={e=>{e.preventDefault(); void save();}}><div className="production-form-grid"><label>Data<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>Valor *<input value={amount} onChange={e=>setAmount(e.target.value)} placeholder="Ex.: 250,00"/></label></div><label>Nome do gasto *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Compra de tecido"/></label><label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional" rows={3}/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar gasto'}</button></div></form></section></div>}
  </div>;
}
