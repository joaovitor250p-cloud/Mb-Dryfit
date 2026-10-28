import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { collection, doc, getDocs, onSnapshot, query, runTransaction, serverTimestamp, updateDoc, setDoc, where, writeBatch } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { Camera, Check, CheckCircle2, Clock3, FileSpreadsheet, ImagePlus, Pencil, Plus, RefreshCw, RotateCcw, Search, Scissors, Trash2, X } from 'lucide-react';
import { normalizeReference, normalizeText, type Model } from './lib/catalog';

type Stage = 'in_progress' | 'done' | 'store';
type Production = {
  id: string; oc: string; name: string; reference: string; tailor: string;
  imageData: string; status: Stage; createdAt?: unknown; completedAt?: unknown; completedBy?: string|null;
};
type View = 'samples' | 'cuts';
type Props = { view: View; db: Firestore; user: User; canEdit: boolean; models: Model[] };
const MAX_DATA_LENGTH = 200000;
// Novo cadastro sempre usa o mesmo documento para a mesma OC, inclusive entre aparelhos.
const normalizedOC=(oc:string)=>oc.trim().normalize('NFKC').toLocaleUpperCase('pt-BR').replace(/\s+/g,' ');
const ocDocId=(oc:string)=>`oc_${encodeURIComponent(normalizedOC(oc))}`;
const auditEntry=(user:User,action:string,p:Pick<Production,'oc'|'name'|'reference'|'status'>,before:unknown,after:unknown)=>({
  actorUid:user.uid,actorEmail:user.email||'',action,modelName:`OC ${p.oc} — ${p.name}`,
  before:before||null,after:after||null,at:serverTimestamp()
});

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
function productionError(error:unknown):string {
  const e=error as {code?:string;message?:string};
  const code=String(e?.code||'');
  if(code.includes('permission-denied'))return 'Acesso negado pelo Firestore para alterar production_samples. O codigo do GitHub nao publica as regras: confira se as regras ATIVAS permitem a transicao done → store (Chegou na loja) para admin/editor.';
  if(code.includes('unavailable')||code.includes('deadline-exceeded'))return 'Conexão indisponível. O corte não foi confirmado; tente novamente.';
  if(code.includes('unauthenticated'))return 'Sua sessão expirou. Saia e entre novamente.';
  return `${code?code+': ':''}${e?.message||String(error)}`;
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
  const [filter, setFilter] = useState<Stage>('in_progress');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Production | null>(null);
  const [oc, setOc] = useState('');
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [tailor, setTailor] = useState('');
  const [imageData, setImageData] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectionMode,setSelectionMode]=useState(false);
  const [selectedCutIds,setSelectedCutIds]=useState<string[]>([]);

  useEffect(() => {
    setLoading(true);
    return onSnapshot(collection(db, 'production_samples'), snapshot => {
      const next = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Production));
      setItems(next.sort((a, b) => ((b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0) - ((a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0)));
      setLoading(false);
      setError('');
    }, e => { setError('Não foi possível consultar as amostras: ' + e.message); setLoading(false); });
  }, [db]);
  const progress = items.filter(x => x.status === 'in_progress').length;
  const finished = items.filter(x => x.status === 'done').length;
  const wentToStore = items.filter(x => x.status === 'store').length;
  const filtered = useMemo(() => items.filter(x => view === 'samples' || x.status === filter)
    .filter(x => !search.trim() || normalizeText([x.oc, x.name, x.reference, x.tailor].join(' ')).includes(normalizeText(search))), [items, view, filter, search]);
  const selectedCuts=items.filter(x=>selectedCutIds.includes(x.id));
  const visibleCutIds=filtered.map(x=>x.id);
  const allVisibleCutsSelected=visibleCutIds.length>0&&visibleCutIds.every(id=>selectedCutIds.includes(id));
  const cancelCutSelection=()=>{setSelectionMode(false);setSelectedCutIds([]);};
  const bulkRemoveCuts=async()=>{
    if(view!=='cuts'||!canEdit||busy||!selectedCuts.length)return;
    const count=selectedCuts.length;
    if(!window.confirm(`Excluir ${count} OC(s) selecionada(s)? Elas sairão de Cortes e de Amostras. Não afeta o Catálogo de Modelos.`))return;
    if(window.prompt(`Digite EXCLUIR para confirmar a remoção definitiva de ${count} OC(s):`)!=='EXCLUIR'){
      showMessage('Exclusão cancelada; nenhuma OC foi removida.');return;
    }
    setBusy(true);
    let removed=0;
    try{
      for(let i=0;i<selectedCuts.length;i+=4){
        const batch=writeBatch(db);
        for(const p of selectedCuts.slice(i,i+4)){
          batch.delete(doc(db,'production_samples',p.id));
          batch.set(doc(collection(db,'audit_log')),auditEntry(user,'excluiu_oc_em_lote',p,p,null));
        }
        await batch.commit();removed+=Math.min(4,selectedCuts.length-i);
      }
      cancelCutSelection();
      showMessage(`${removed} OC(s) excluída(s) de Cortes e Amostras. Os modelos não foram alterados.`);
    }catch(e){showMessage(`Excluídas ${removed} OC(s) antes da falha. ${productionError(e)}. Atualize a lista antes de tentar novamente.`,true);}
    finally{setBusy(false);}
  };
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
    if (!canEdit || busy) return;
    if (!oc.trim() || !name.trim() || !tailor.trim()) return showMessage('Informe OC, nome da peça e costureiro.', true);
    if (imageData.length > MAX_DATA_LENGTH) return showMessage('Imagem acima do limite. Selecione outra foto.', true);
    const cleanedOC=normalizedOC(oc);
    if(cleanedOC.length>80)return showMessage('OC acima do limite de 80 caracteres.',true);
    if(editing && normalizedOC(editing.oc)!==cleanedOC)return showMessage('Não altere a OC de um registro existente. O identificador deve ser preservado.',true);
    setBusy(true);
    try {
      const data = { oc: cleanedOC, name: name.trim(), reference: normalizeReference(reference), tailor: tailor.trim(), imageData, updatedAt: serverTimestamp(), updatedBy: user.uid };
      const duplicate=items.find(p=>p.id!==editing?.id && normalizedOC(p.oc)===cleanedOC);
      if(duplicate)throw Error(`A OC ${cleanedOC} já está cadastrada. Abra o registro existente em Cortes.`);
      // Busca outros documentos legados, que podem ter sido criados com IDs automáticos.
      const oldDocs=await getDocs(query(collection(db,'production_samples'),where('oc','==',cleanedOC)));
      if(oldDocs.docs.some(d=>d.id!==editing?.id))throw Error(`A OC ${cleanedOC} já existe no Firebase.`);
      if (editing){
        const batch=writeBatch(db);
        batch.update(doc(db,'production_samples',editing.id),data);
        batch.set(doc(collection(db,'audit_log')),auditEntry(user,'editou_oc',{...editing,...data},editing,{...editing,...data}));
        await batch.commit();
      } else {
        const recordRef=doc(db,'production_samples',ocDocId(cleanedOC));
        await runTransaction(db,async transaction=>{
          const current=await transaction.get(recordRef);
          if(current.exists())throw Error(`A OC ${cleanedOC} já foi cadastrada por outro usuário.`);
          const newRecord={...data,status:'in_progress' as Stage,createdAt:serverTimestamp(),createdBy:user.uid,completedAt:null,completedBy:null};
          transaction.set(recordRef,newRecord);
          transaction.set(doc(collection(db,'audit_log')),auditEntry(user,'criou_oc',newRecord,null,{oc:cleanedOC,name:data.name,reference:data.reference,status:'in_progress'}));
        });
      }
      setModal(false);
      showMessage(editing ? 'Registro atualizado em todos os aparelhos.' : 'OC cadastrada uma única vez, disponível em Amostras e Cortes.');
    } catch (e) { showMessage('Erro ao salvar: ' + (e instanceof Error ? e.message : String(e)), true); }
    finally { setBusy(false); }
  };
  const mark = async (p: Production, status: Stage) => {
    if (!canEdit || busy || p.status === status) return;
    if (status === 'store' && !window.confirm(`Confirmar que a OC ${p.oc} CHEGOU NA LOJA?`)) return;
    setBusy(true);
    try {
      // "Pronto" e "Chegou na loja" utilizam EXATAMENTE os mesmos campos
      // e a mesma operacao de gravacao. A unica diferenca e o status.
      // Em OCs antigas, normaliza a data/autor da conclusao antes da troca.
      const originalCompletion = p.completedAt as { toDate?: () => Date } | null | undefined;
      const hasValidCompletion = typeof originalCompletion?.toDate === 'function';
      const patch = {
        status,
        completedAt: status === 'in_progress'
          ? null
          : status === 'store' && hasValidCompletion
            ? p.completedAt
            : serverTimestamp(),
        completedBy: status === 'in_progress'
          ? null
          : status === 'store' && typeof p.completedBy === 'string' && p.completedBy
            ? p.completedBy
            : user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      };
      // updateDoc so confirma a operacao quando o Firestore aceita a escrita.
      // onSnapshot atualiza a categoria automaticamente em todos os aparelhos.
      await updateDoc(doc(db, 'production_samples', p.id), patch);
      if (view === 'cuts') setFilter(status);
      showMessage(status === 'store'
        ? `OC ${p.oc} chegou na loja e foi salva no Firebase.`
        : status === 'done'
          ? `OC ${p.oc} marcada como pronta.`
          : `OC ${p.oc} reaberta e devolvida ao andamento.`);

      // O historico nao deve desfazer um status ja confirmado.
      try {
        await setDoc(doc(collection(db, 'audit_log')), auditEntry(
          user, status === 'done' ? 'corte_pronto' : status === 'store' ? 'chegou_loja' : 'reabriu_corte',
          p, { status: p.status }, { status }
        ));
      } catch (auditError) {
        showMessage(`OC ${p.oc}: status SALVO, mas o historico nao foi registrado. ` + productionError(auditError), true);
      }
    } catch (statusError) {
      showMessage(`OC ${p.oc}: nao foi possivel salvar o status ${status === 'store' ? 'Chegou na loja' : status === 'done' ? 'Pronto' : 'Em andamento'}. ` + productionError(statusError), true);
    } finally { setBusy(false); }
  };
  const remove = async (p: Production) => {
    if (!canEdit || busy || !window.confirm(`Excluir a OC ${p.oc} (${p.name})? Essa exclusão será definitiva em todos os aparelhos.`)) return;
    setBusy(true);
    try {
      const batch=writeBatch(db);
      batch.delete(doc(db,'production_samples',p.id));
      batch.set(doc(collection(db,'audit_log')),auditEntry(user,'excluiu_oc',p,p,null));
      await batch.commit();
      showMessage('Registro excluído e operação registrada no histórico.');
    } catch (e) { showMessage('Falha ao excluir: ' + (e instanceof Error ? e.message : String(e)), true); }
    finally { setBusy(false); }
  };
  const backupCuts=()=>{
    // Inclui foto específica da OC e dados completos para arquivo de segurança.
    // O CSV/Excel não preserva imagens.
    const content=items.map(({id,...fields})=>({id,...fields,
      createdAt:(fields.createdAt as {toDate?:()=>Date}|undefined)?.toDate?.()?.toISOString()||null,
      completedAt:(fields.completedAt as {toDate?:()=>Date}|undefined)?.toDate?.()?.toISOString()||null
    }));
    const url=URL.createObjectURL(new Blob([JSON.stringify(content,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;
    a.download=`MB_REFERENCIAS_BACKUP_OCS_${new Date().toISOString().slice(0,10)}.json`;
    a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
    showMessage('Backup JSON das OCs gerado, incluindo fotos específicas das peças.');
  };
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const addSheet = (tab: string, list: Production[]) => {
      const rows = list.map(x => ({OC: x.oc, 'NOME DA PEÇA': x.name, 'REFERÊNCIA': x.reference || 'SEM CÓDIGO', COSTUREIRO: x.tailor, STATUS: x.status === 'store' ? 'CHEGOU NA LOJA' : x.status === 'done' ? 'PRONTO' : 'EM ANDAMENTO', 'CADASTRADO EM': humanDate(x.createdAt), 'FINALIZADO EM': humanDate(x.completedAt)}));
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ OC: '', 'NOME DA PEÇA': '', REFERÊNCIA: '', COSTUREIRO: '', STATUS: '' }]);
      ws['!cols'] = [{wch:18},{wch:52},{wch:24},{wch:30},{wch:18},{wch:20},{wch:20}];
      XLSX.utils.book_append_sheet(wb,ws,tab);
    };
    addSheet('EM ANDAMENTO', items.filter(x => x.status === 'in_progress'));
    addSheet('PRONTOS', items.filter(x => x.status === 'done'));
    addSheet('CHEGOU NA LOJA', items.filter(x => x.status === 'store'));
    XLSX.writeFile(wb, `MB_REFERENCIAS_CORTES_${new Date().toISOString().slice(0,10)}.xlsx`);
  };
  return <div className="page-wrap production-page">
    <div className="page-heading"><div><span className="eyebrow">PRODUÇÃO COMPARTILHADA</span><h1>{view === 'samples' ? 'Amostras' : 'Cortes'}</h1><p>{view === 'samples' ? 'Consulte a imagem, OC, modelo, REF e costureiro de cada amostra.' : 'Pesquise por OC e acompanhe o andamento, os cortes prontos e os que chegaram à loja.'}</p></div>
      <div className="heading-actions">{view==='cuts'&&<><button className="outline-button" onClick={exportExcel}><FileSpreadsheet size={17}/> Exportar cortes</button><button className="outline-button" onClick={backupCuts}><FileSpreadsheet size={17}/> Backup das OCs</button>{canEdit&&<><button className="outline-button" disabled={busy} onClick={()=>selectionMode?cancelCutSelection():setSelectionMode(true)}><Trash2 size={16}/>{selectionMode?'Cancelar seleção':'Selecionar cartões'}</button><button className="primary-button" onClick={openNew}><Plus size={17}/> Nova OC / amostra</button></>}</>}</div></div>
    {view === 'cuts' && <section className="stats-grid"><div className="stat-card"><div className="stat-icon amber"><Clock3/></div><div><span>Em andamento</span><strong>{progress}</strong><small>Aguardando finalização</small></div></div><div className="stat-card"><div className="stat-icon green"><CheckCircle2/></div><div><span>Prontos</span><strong>{finished}</strong><small>Cortes finalizados</small></div></div><div className="stat-card"><div className="stat-icon blue"><CheckCircle2/></div><div><span>Chegaram à loja</span><strong>{wentToStore}</strong><small>Etapa concluída</small></div></div></section>}
    <section className="catalog-panel production-panel"><div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar OC, peça, REF ou costureiro..."/></label>
      {view === 'cuts'&&<div className="production-tabs"><button className={filter==='in_progress'?'chosen':''} onClick={()=>setFilter('in_progress')}><Clock3 size={15}/> Em andamento ({progress})</button><button className={filter==='done'?'chosen':''} onClick={()=>setFilter('done')}><Check size={15}/> Prontos ({finished})</button><button className={filter==='store'?'chosen':''} onClick={()=>setFilter('store')}><CheckCircle2 size={15}/> Chegou na loja ({wentToStore})</button></div>}
    </div>
    {view==='cuts'&&selectionMode&&<div className="bulk-select-toolbar" role="region" aria-label="Exclusão de OCs selecionadas">
      <strong>{selectedCuts.length} OC(s) selecionada(s)</strong>
      <button className="outline-button" disabled={busy||!visibleCutIds.length} onClick={()=>setSelectedCutIds(ids=>allVisibleCutsSelected?ids.filter(id=>!visibleCutIds.includes(id)):[...new Set([...ids,...visibleCutIds])])}>{allVisibleCutsSelected?'Desmarcar visíveis':'Selecionar todos visíveis'} ({visibleCutIds.length})</button>
      <button className="outline-button" disabled={busy||!selectedCutIds.length} onClick={()=>setSelectedCutIds([])}>Limpar</button>
      <button className="danger-button" disabled={busy||!selectedCuts.length} onClick={()=>void bulkRemoveCuts()}><Trash2 size={16}/> {busy?'Excluindo...':`Excluir ${selectedCuts.length} selecionada(s)`}</button>
    </div>}
    {error&&<div className="production-alert" role="alert">{error}</div>}{message&&<div className="production-ok">{message}</div>}
    {loading?<div className="empty-state"><RefreshCw className="spin"/> Carregando produção...</div>:
    !filtered.length?<div className="empty-state"><Scissors size={28}/><strong>Nenhum registro encontrado</strong><span>{view === 'samples' ? 'As novas OCs são cadastradas na página Cortes.' : 'Não há cortes nesta situação.'}</span></div>:
    <div className="production-grid">{filtered.map(p=><article className={`production-card ${selectedCutIds.includes(p.id)?'bulk-card-selected':''}`} key={p.id}>{view==='cuts'&&selectionMode&&<label className="bulk-card-checkbox"><input type="checkbox" disabled={busy} aria-label={`Selecionar OC ${p.oc}`} checked={selectedCutIds.includes(p.id)} onChange={e=>setSelectedCutIds(ids=>e.target.checked?[...new Set([...ids,p.id])]:ids.filter(id=>id!==p.id))}/><span>Selecionar</span></label>}
      <div className="production-photo">{(p.imageData || models.find(m=>normalizeText(m.name)===normalizeText(p.name))?.imageData || models.find(m=>normalizeText(m.name)===normalizeText(p.name))?.fallbackImageData)?<img src={p.imageData || models.find(m=>normalizeText(m.name)===normalizeText(p.name))?.imageData || models.find(m=>normalizeText(m.name)===normalizeText(p.name))?.fallbackImageData} alt={`Foto de ${p.name}`}/>:<div className="model-photo-placeholder"><ImagePlus size={28}/><span>Foto pendente</span></div>}{view === 'cuts' && <span className={`production-status ${p.status}`}>{p.status==='store'?'CHEGOU NA LOJA':p.status==='done'?'PRONTO':'EM ANDAMENTO'}</span>}</div>
      <div className="production-details"><div className="production-oc">OC {p.oc}</div><h3>{p.name}</h3><dl><div><dt>REF</dt><dd>{p.reference||'SEM CÓDIGO'}</dd></div><div><dt>Costureiro</dt><dd>{p.tailor}</dd></div><div><dt>Cadastrado</dt><dd>{humanDate(p.createdAt)}</dd></div>{view === 'cuts' && p.status !== 'in_progress' && <div><dt>{'Pronto em'}</dt><dd>{humanDate(p.completedAt)}</dd></div>}</dl>
      {view==='cuts'&&<div className="production-actions">{canEdit&&<><button className="outline-button" onClick={()=>openEdit(p)} title="Editar"><Pencil size={15}/> Editar</button>{p.status==='in_progress' && <button disabled={busy} className="primary-button" onClick={()=>void mark(p,'done')}><Check size={16}/> Pronto</button>}{p.status==='done' && <button disabled={busy} className="primary-button" onClick={()=>void mark(p,'store')}><CheckCircle2 size={16}/> Chegou na loja</button>}{p.status!=='in_progress' && <button disabled={busy} className="outline-button" onClick={()=>void mark(p,'in_progress')}><RotateCcw size={15}/> Reabrir</button>}<button className="icon-button" onClick={()=>void remove(p)} title="Excluir registro"><Trash2 size={17}/></button></>}</div>}</div>
    </article>)}</div>}</section>
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setModal(false)}}><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">CADASTRO DE OC</span><h2>{editing?'Editar registro':'Nova OC'}</h2><p>A mesma OC será exibida em Amostras e em Cortes, sem duplicação.</p></div><button className="icon-button" onClick={()=>setModal(false)}><X/></button></div>
    <form className="modal-form" onSubmit={e=>{e.preventDefault();void save()}}><label className="production-image-field"><span>Foto da peça (opcional)</span><div className="production-image-preview">{imageData?<img alt="Prévia da peça" src={imageData}/>:<><ImagePlus size={28}/><span>Selecionar foto</span></>}<input type="file" accept="image/*" onChange={e=>void processFile(e.target.files?.[0])}/></div><small>Se não enviar uma foto, o sistema usará a imagem cadastrada para esse modelo. Você poderá adicionar a foto depois.</small></label>
      <div className="production-form-grid"><label>OC *<input required maxLength={80} readOnly={!!editing} value={oc} onChange={e=>setOc(e.target.value)} placeholder="Ex.: OC-125"/></label><label>Costureiro *<input required maxLength={120} value={tailor} onChange={e=>setTailor(e.target.value)} placeholder="Nome do responsável"/></label></div>
      <label>Nome da peça *<input required maxLength={250} list="production-models" value={name} onChange={e=>fillModel(e.target.value)} placeholder="Pesquise ou digite o modelo"/><datalist id="production-models">{models.map(m=><option value={m.name} key={m.id}/>)}</datalist><small>Se escolher um modelo existente, a REF será preenchida automaticamente.</small></label>
      <label>Código Extra (REF)<input maxLength={200} value={reference} onChange={e=>setReference(e.target.value)} placeholder="REF.10359"/></label>
      <div className="modal-actions"><button type="button" className="outline-button" onClick={()=>setModal(false)}>Cancelar</button><button type="submit" className="primary-button" disabled={busy}>{busy?'Salvando...':editing?'Salvar alterações':'Cadastrar OC'}</button></div></form></section></div>}
  </div>;
}
