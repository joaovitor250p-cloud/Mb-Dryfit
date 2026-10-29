import { useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData } from 'firebase/firestore';
import { collection, deleteDoc, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { CheckCircle2, FileText, FileUp, Pencil, Plus, Search, Trash2, UserSquare2, X } from 'lucide-react';
import { normalizeCsvHeader, readSemicolonCsv } from './csvImport';

type Props = { db: Firestore; user: User; canEdit: boolean };
type InfoRecord = { id: string; name: string; value: string; pix: string; pixName: string; notes: string };
const normalize = (s:string) => s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();
const mapDoc = (id:string, d:DocumentData): InfoRecord => ({ id, name: String(d.name || ''), value: String(d.value || ''), pix: String(d.pix || ''), pixName: String(d.pixName || ''), notes: String(d.notes || '') });

export default function InfoPage({ db, user, canEdit }: Props) {
  const [items, setItems] = useState<InfoRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
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
  const csvInput = useRef<HTMLInputElement>(null);

  useEffect(() => onSnapshot(query(collection(db, 'mb_info'), orderBy('name')), snap => {
    setItems(snap.docs.map(d => mapDoc(d.id, d.data())));
    setLoading(false);
  }, e => { setError('Não foi possível carregar as informações: ' + e.message); setLoading(false); }), [db]);

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
      if (editing) {
        await updateDoc(doc(db, 'mb_info', editing.id), payload);
      } else {
        const ref = doc(collection(db, 'mb_info'));
        await setDoc(ref, { ...payload, createdAt: serverTimestamp(), createdBy: user.uid });
      }
      notify(editing ? 'Registro atualizado.' : 'Registro adicionado.');
      reset();
    } catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível salvar.', true); }
    finally { setBusy(false); }
  };

  const remove = async (item: InfoRecord) => {
    if (!canEdit || busy || !window.confirm(`Excluir o registro de ${item.name}?`)) return;
    setBusy(true);
    try { await deleteDoc(doc(db, 'mb_info', item.id)); notify('Registro excluído.'); }
    catch (e) { notify(e instanceof Error ? e.message : 'Não foi possível excluir.', true); }
    finally { setBusy(false); }
  };


  const importCsv = async (file: File) => {
    if (!canEdit || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const rows = await readSemicolonCsv(file);
      const headerIndex = rows.findIndex(row => normalizeCsvHeader(row[0] || '') === 'nome'
        && normalizeCsvHeader(row[1] || '') === 'valor'
        && normalizeCsvHeader(row[2] || '') === 'pix'
        && normalizeCsvHeader(row[3] || '') === 'nome do pix');
      if (headerIndex < 0) throw new Error('Não encontrei as colunas NOME;VALOR;PIX;NOME DO PIX. Selecione a planilha de informações dos funcionários.');

      const records: Array<{ line: number; name: string; value: string; pix: string; pixName: string }> = [];
      let invalidCount = 0;
      rows.forEach((row, rowIndex) => {
        if (rowIndex <= headerIndex) return;
        const name = (row[0] || '').trim();
        const value = (row[1] || '').trim();
        const pix = (row[2] || '').trim();
        const pixName = (row[3] || '').trim();
        if (!name && !value && !pix && !pixName) return;
        if (!name) { invalidCount += 1; return; }
        records.push({ line: rowIndex + 1, name, value, pix, pixName });
      });
      if (!records.length) throw new Error('O arquivo não contém funcionários válidos para importar.');
      if (!window.confirm(`Importar ${records.length} registros da planilha de Informações MB? Registros já importados serão ignorados; nada existente será substituído.`)) return;

      const refs = records.map(record => ({ id: `info_funcionarios_planilha_${String(record.line).padStart(3, '0')}`, record }));
      const existing = await Promise.all(refs.map(async item => (await getDoc(doc(db, 'mb_info', item.id))).exists()));
      const fresh = refs.filter((_, index) => !existing[index]);
      for (let offset = 0; offset < fresh.length; offset += 400) {
        const batch = writeBatch(db);
        fresh.slice(offset, offset + 400).forEach(({ id, record }) => {
          batch.set(doc(db, 'mb_info', id), {
            name: record.name, value: record.value, pix: record.pix, pixName: record.pixName, notes: '',
            createdAt: serverTimestamp(), createdBy: user.uid,
            updatedAt: serverTimestamp(), updatedBy: user.uid,
          });
        });
        await batch.commit();
      }
      notify(`Importação concluída: ${fresh.length} registros adicionados, ${records.length - fresh.length} já existentes ignorados${invalidCount ? ` e ${invalidCount} linhas incompletas ignoradas` : ''}.`);
    } catch (e) {
      notify(e instanceof Error ? `Não foi possível importar a planilha: ${e.message}` : 'Não foi possível importar a planilha.', true);
    } finally { setBusy(false); if (csvInput.current) csvInput.current.value = ''; }
  };

  return <div className="page-wrap extra-page">
    <div className="page-heading"><div><span className="eyebrow">CADASTRO INTERNO</span><h1>Informações MB</h1><p>Área para guardar valores, PIX e outras informações da MB. Tudo pode ser editado e você pode incluir novos registros.</p></div>{canEdit && <div className="heading-actions"><button className="outline-button" onClick={()=>csvInput.current?.click()} disabled={busy}><FileUp size={16}/> {busy ? 'Importando...' : 'Importar CSV da planilha'}</button><input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={e=>{const file=e.target.files?.[0]; if(file) void importCsv(file);}} /><button className="primary-button" onClick={openNew} disabled={busy}><Plus size={16}/> Novo registro</button></div>}</div>
    {error && <div className="production-alert" role="alert">{error}</div>}
    {message && <div className="production-ok"><CheckCircle2 size={16}/>{message}</div>}
    <section className="stats-grid extra-stats"><div className="stat-card"><div className="stat-icon teal"><UserSquare2/></div><div><span>Registros</span><strong>{filtered.length}</strong><small>Informações filtradas</small></div></div><div className="stat-card"><div className="stat-icon amber"><FileText/></div><div><span>Busca rápida</span><strong>{queryText ? 'Ativa' : 'Livre'}</strong><small>Pesquise por nome, PIX ou valor</small></div></div></section>
    <section className="catalog-panel extra-panel">
      <div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={queryText} onChange={e=>setQueryText(e.target.value)} placeholder="Pesquisar nome, PIX, valor ou observação..."/></label></div>
      {loading ? <div className="empty-state">Carregando informações...</div> : !filtered.length ? <div className="empty-state"><FileText size={28}/><strong>Nenhum registro encontrado</strong></div> : <div className="simple-list">{filtered.map(item => <article key={item.id} className="simple-card fade-in-up"><div className="simple-card-head"><div><strong>{item.name}</strong><span>{item.value || 'Sem valor informado'}</span></div><b>{item.pixName || 'Sem nome PIX'}</b></div><div className="info-grid"><div><small>PIX</small><span>{item.pix || '—'}</span></div><div><small>Nome do PIX</small><span>{item.pixName || '—'}</span></div></div>{item.notes && <p>{item.notes}</p>}{canEdit && <div className="simple-card-actions"><button className="outline-button" onClick={()=>openEdit(item)}><Pencil size={14}/> Editar</button><button className="danger-button" onClick={()=>void remove(item)}><Trash2 size={14}/> Excluir</button></div>}</article>)}</div>}
    </section>
    {open && <div className="modal-backdrop" onMouseDown={e=>{ if (e.target === e.currentTarget) reset(); }}><section className="modal extra-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">INFORMAÇÕES MB</span><h2>{editing ? 'Editar registro' : 'Novo registro'}</h2></div><button className="icon-button" onClick={reset}><X/></button></div><form className="modal-form" onSubmit={e=>{e.preventDefault(); void save();}}><label>Nome *<input required value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: José"/></label><div className="production-form-grid"><label>Valor<input value={value} onChange={e=>setValue(e.target.value)} placeholder="Ex.: R$ 2.500,00"/></label><label>PIX<input value={pix} onChange={e=>setPix(e.target.value)} placeholder="Chave PIX"/></label></div><label>Nome do PIX<input value={pixName} onChange={e=>setPixName(e.target.value)} placeholder="Titular da chave"/></label><label>Observações<textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional" rows={3}/></label><div className="modal-actions"><button type="button" className="outline-button" onClick={reset}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy ? 'Salvando...' : 'Salvar registro'}</button></div></form></section></div>}
  </div>;
}
