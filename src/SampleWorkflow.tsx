import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Camera, Check, CheckCircle2, Clock3, FileSpreadsheet, ImagePlus, Pencil, Plus, RefreshCw, RotateCcw, Search, Scissors, Trash2, X } from 'lucide-react';
import { normalizeReference, normalizeText, type Model } from './lib/catalog';

type Stage = 'in_progress' | 'done';
type Production = {
  id: string; oc: string; name: string; reference: string; tailor: string;
  imageData: string; status: Stage; createdAt?: unknown; completedAt?: unknown;
};
type View = 'samples' | 'cuts';
type Props = { view: View; db: Firestore; user: User; canEdit: boolean; models: Model[] };
const MAX_DATA_LENGTH = 200000;

async function makePhoto(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw Error('Selecione um arquivo de imagem.');
  if (file.size > 12 * 1024 * 1024) throw Error('A imagem original deve ter até 12 MB.');
  const source = await createImageBitmap(file);
  try {
    let maxDimension = 900;
    for (let pass = 0; pass < 5; pass++) {
      const factor = Math.min(1, maxDimension / Math.max(source.width, source.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(source.width * factor));
      canvas.height = Math.max(1, Math.round(source.height * factor));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Não foi possível processar a foto.');
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.77, 0.62, 0.48, 0.36]) {
        const webp = canvas.toDataURL('image/webp', quality);
        const encoded = webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', quality);
        if (encoded.length < MAX_DATA_LENGTH) return encoded;
      }
      maxDimension = Math.floor(maxDimension * 0.75);
    }
    throw Error('A foto ficou grande demais mesmo após otimização. Escolha outra imagem.');
  } finally { source.close(); }
}
const humanDate = (raw: unknown) => {
  const d = (raw as { toDate?: () => Date } | undefined)?.toDate?.();
  return d ? d.toLocaleDateString('pt-BR') : '—';
};

export default function SampleWorkflow({ view, db, user, canEdit, models }: Props) {
  const [items, setItems] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'in_progress' | 'done'>(view === 'samples' ? 'in_progress' : 'in_progress');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Production | null>(null);
  const [oc, setOc] = useState('');
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [tailor, setTailor] = useState('');
  const [imageData, setImageData] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setLoading(true);
    return onSnapshot(collection(db, 'production_samples'), snapshot => {
      const next = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Production));
      setItems(next.sort((a, b) => ((b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0) - ((a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0)));
      setLoading(false);
      setError('');
    }, e => { setError('Não foi possível consultar as amostras: ' + e.message); setLoading(false); });
  }, [db]);
  useEffect(() => { if (view === 'samples') setFilter('in_progress'); }, [view]);
  const progress = items.filter(x => x.status === 'in_progress').length;
  const finished = items.filter(x => x.status === 'done').length;
  const filtered = useMemo(() => items.filter(x => x.status === (view === 'samples' ? 'in_progress' : filter))
    .filter(x => !search.trim() || normalizeText([x.oc, x.name, x.reference, x.tailor].join(' ')).includes(normalizeText(search))), [items, view, filter, search]);
  const showMessage = (s: string, bad = false) => { setError(bad ? s : ''); setMessage(bad ? '' : s); };
  const openNew = () => { setEditing(null); setOc(''); setName(''); setReference(''); setTailor(''); setImageData(''); setModal(true); };
  const openEdit = (p: Production) => { setEditing(p); setOc(p.oc); setName(p.name); setReference(p.reference); setTailor(p.tailor); setImageData(p.imageData || ''); setModal(true); };
  const fillModel = (text: string) => {
    setName(text);
    const existing = models.find(m => normalizeText(m.name) === normalizeText(text));
    if (existing) setReference(existing.reference);
  };
  const processFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try { setImageData(await makePhoto(file)); showMessage('Foto otimizada e preparada.'); }
    catch (e) { showMessage(e instanceof Error ? e.message : 'Não foi possível carregar a imagem.', true); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!canEdit) return;
    if (!oc.trim() || !name.trim() || !tailor.trim()) return showMessage('Informe OC, nome da peça e costureiro.', true);
    if (!imageData) return showMessage('Adicione a foto da peça.', true);
    if (imageData.length > MAX_DATA_LENGTH) return showMessage('Imagem acima do limite. Selecione outra foto.', true);
    setBusy(true);
    try {
      const data = { oc: oc.trim(), name: name.trim(), reference: normalizeReference(reference), tailor: tailor.trim(), imageData, updatedAt: serverTimestamp(), updatedBy: user.uid };
      if (editing) await updateDoc(doc(db, 'production_samples', editing.id), data);
      else await addDoc(collection(db, 'production_samples'), { ...data, status: 'in_progress', createdAt: serverTimestamp(), createdBy: user.uid, completedAt: null, completedBy: null });
      setModal(false);
      showMessage(editing ? 'Amostra atualizada em todos os aparelhos.' : 'Amostra cadastrada e enviada para Cortes em andamento.');
    } catch (e) { showMessage('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)), true); }
    finally { setBusy(false); }
  };
  const mark = async (p: Production, status: Stage) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'production_samples', p.id), {status, completedAt: status === 'done' ? serverTimestamp() : null, completedBy: status === 'done' ? user.uid : null, updatedAt: serverTimestamp(), updatedBy: user.uid});
      showMessage(status === 'done' ? 'Corte finalizado! Removido de Amostras e adicionado a Cortes prontos.' : 'Corte reaberto e devolvido a Amostras.');
    } catch (e) { showMessage('Não foi possível atualizar o corte: ' + (e instanceof Error ? e.message : String(e)), true); }
    finally { setBusy(false); }
  };
  const remove = async (p: Production) => {
    if (!canEdit || !window.confirm(`Excluir a OC ${p.oc} (${p.name})? Essa exclusão será definitiva em todos os aparelhos.`)) return;
    setBusy(true);
    try { await deleteDoc(doc(db, 'production_samples', p.id)); showMessage('Registro excluído.'); }
    catch (e) { showMessage('Falha ao excluir: ' + (e instanceof Error ? e.message : String(e)), true); }
    finally { setBusy(false); }
  };
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const addSheet = (tab: string, list: Production[]) => {
      const rows = list.map(x => ({OC: x.oc, 'NOME DA PEÇA': x.name, 'REFERÊNCIA': x.reference || 'SEM CÓDIGO', COSTUREIRO: x.tailor, STATUS: x.status === 'done' ? 'PRONTO' : 'EM ANDAMENTO', 'CADASTRADO EM': humanDate(x.createdAt), 'FINALIZADO EM': humanDate(x.completedAt)}));
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ OC: '', 'NOME DA PEÇA': '', REFERÊNCIA: '', COSTUREIRO: '', STATUS: '' }]);
      ws['!cols'] = [{wch:18},{wch:52},{wch:24},{wch:30},{wch:18},{wch:20},{wch:20}];
      XLSX.utils.book_append_sheet(wb,ws,tab);
    };
    addSheet('CORTES EM ANDAMENTO', items.filter(x => x.status === 'in_progress'));
    addSheet('CORTES PRONTOS', items.filter(x => x.status === 'done'));
    XLSX.writeFile(wb, `MB_REFERENCIAS_CORTES_${new Date().toISOString().slice(0,10)}.xlsx`);
  };
  return <div className="page-wrap production-page">
    <div className="page-heading"><div><span className="eyebrow">PRODUÇÃO COMPARTILHADA</span><h1>{view === 'samples' ? 'Amostras' : 'Cortes'}</h1><p>{view === 'samples' ? 'Cadastre peças e acompanhe as amostras pendentes.' : 'Acompanhe os cortes em andamento e os que já estão prontos.'}</p></div>
      <div className="heading-actions"><button className="outline-button" onClick={exportExcel}><FileSpreadsheet size={17}/> Exportar cortes</button>{canEdit&&<button className="primary-button" onClick={openNew}><Plus size={17}/> Nova amostra</button>}</div></div>
    <section className="stats-grid"><div className="stat-card"><div className="stat-icon blue"><Camera/></div><div><span>Total de registros</span><strong>{items.length}</strong><small>Amostras cadastradas</small></div></div><div className="stat-card"><div className="stat-icon amber"><Clock3/></div><div><span>Em andamento</span><strong>{progress}</strong><small>Aguardando finalização</small></div></div><div className="stat-card"><div className="stat-icon green"><CheckCircle2/></div><div><span>Cortes prontos</span><strong>{finished}</strong><small>Produção concluída</small></div></div></section>
    <section className="catalog-panel production-panel"><div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar por OC, peça, REF ou costureiro..."/></label>
      {view === 'cuts'&&<div className="production-tabs"><button className={filter==='in_progress'?'chosen':''} onClick={()=>setFilter('in_progress')}><Clock3 size={15}/> Em andamento ({progress})</button><button className={filter==='done'?'chosen':''} onClick={()=>setFilter('done')}><Check size={15}/> Prontos ({finished})</button></div>}
    </div>
    {error&&<div className="production-alert">{error}</div>}{message&&<div className="production-ok">{message}</div>}
    {loading?<div className="empty-state"><RefreshCw className="spin"/> Carregando produção...</div>:
    !filtered.length?<div className="empty-state"><Scissors size={28}/><strong>Nenhum registro encontrado</strong><span>{view === 'samples' ? 'Cadastre uma nova amostra para começar.' : 'Não há cortes nesta situação.'}</span></div>:
    <div className="production-grid">{filtered.map(p=><article className="production-card" key={p.id}>
      <div className="production-photo"><img src={p.imageData} alt={`Foto de ${p.name}`}/><span className={`production-status ${p.status}`}>{p.status==='done'?'PRONTO':'EM ANDAMENTO'}</span></div>
      <div className="production-details"><div className="production-oc">OC {p.oc}</div><h3>{p.name}</h3><dl><div><dt>REF</dt><dd>{p.reference||'SEM CÓDIGO'}</dd></div><div><dt>Costureiro</dt><dd>{p.tailor}</dd></div><div><dt>Cadastrado</dt><dd>{humanDate(p.createdAt)}</dd></div>{p.status==='done'&&<div><dt>Finalizado</dt><dd>{humanDate(p.completedAt)}</dd></div>}</dl>
      <div className="production-actions">{canEdit&&<><button className="outline-button" onClick={()=>openEdit(p)} title="Editar"><Pencil size={15}/> Editar</button>{p.status==='in_progress'?<button disabled={busy} className="primary-button" onClick={()=>void mark(p,'done')}><Check size={16}/> Pronto</button>:<button disabled={busy} className="outline-button" onClick={()=>void mark(p,'in_progress')}><RotateCcw size={15}/> Reabrir</button>}<button className="icon-button" onClick={()=>void remove(p)} title="Excluir registro"><Trash2 size={17}/></button></>}</div></div>
    </article>)}</div>}</section>
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">PRODUÇÃO · AMOSTRAS</span><h2>{editing?'Editar amostra':'Nova amostra'}</h2><p>Ela também aparecerá automaticamente em Cortes em andamento.</p></div><button className="icon-button" onClick={()=>setModal(false)}><X/></button></div>
    <form className="modal-form" onSubmit={e=>{e.preventDefault();void save()}}><label className="production-image-field"><span>Foto da peça *</span><div className="production-image-preview">{imageData?<img alt="Prévia da peça" src={imageData}/>:<><ImagePlus size={28}/><span>Selecionar foto</span></>}<input type="file" accept="image/*" onChange={e=>void processFile(e.target.files?.[0])}/></div><small>Foto otimizada para consulta, não substitui o original em alta resolução.</small></label>
      <div className="production-form-grid"><label>OC *<input required maxLength={80} value={oc} onChange={e=>setOc(e.target.value)} placeholder="Ex.: OC-125"/></label><label>Costureiro *<input required maxLength={120} value={tailor} onChange={e=>setTailor(e.target.value)} placeholder="Nome do responsável"/></label></div>
      <label>Nome da peça *<input required maxLength={250} list="production-models" value={name} onChange={e=>fillModel(e.target.value)} placeholder="Pesquise ou digite o modelo"/><datalist id="production-models">{models.map(m=><option value={m.name} key={m.id}/>)}</datalist><small>Se escolher um modelo existente, a REF será preenchida automaticamente.</small></label>
      <label>Código Extra (REF)<input maxLength={200} value={reference} onChange={e=>setReference(e.target.value)} placeholder="REF.10359"/></label>
      <div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setModal(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Salvando...':editing?'Salvar alterações':'Cadastrar amostra'}</button></div></form></section></div>}
  </div>;
}
