import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, updateDoc, setDoc, writeBatch } from 'firebase/firestore';
import { Camera, Check, CheckCircle2, Clock3, Filter, ImagePlus, Plus, RefreshCw, RotateCcw, Search, Scissors, Trash2, X } from 'lucide-react';
import { normalizeReference, normalizeText, type Model } from './lib/catalog';
import { MODEL_TYPE_OPTIONS, matchesModelSearch, matchesModelType, modelType, type ModelType } from './lib/modelTypes';
import PhotoLightbox from './PhotoLightbox';
import InitialCutCsvImport from './InitialCutCsvImport';
import { optimizePhoto } from './lib/photos';
import { readPageMemory, usePageMemory } from './lib/pageMemory';
import { safeProviderMessage } from './lib/safeMessage';

// 'store' é conservado apenas para leitura de registros legados.
// Novas alterações e a interface usam somente Em andamento e Pronto.
type Stage = 'in_progress' | 'done' | 'store';
type VisibleStage = 'in_progress' | 'done';
type Production = {
  id: string; oc: string; name: string; reference: string; tailor: string;
  imageData: string; status: Stage; createdAt?: unknown; updatedAt?: unknown; completedAt?: unknown; completedBy?: string|null;
};
type View = 'samples' | 'cuts';
type Props = { view: View; db: Firestore; user: User; canEdit: boolean; isAdmin:boolean; models: Model[] };
const MAX_DATA_LENGTH = 200000;
const MAX_SAMPLE_PHOTOS = 3;
// Novo cadastro sempre usa o mesmo documento para a mesma OC, inclusive entre aparelhos.
const normalizedOC=(oc:string)=>oc.trim().normalize('NFKC').toLocaleUpperCase('pt-BR').replace(/\s+/g,' ');
const ocDocId=(oc:string)=>`oc_${encodeURIComponent(normalizedOC(oc))}`;
const auditEntry=(user:User,action:string,p:Pick<Production,'oc'|'name'|'reference'|'status'>,before:unknown,after:unknown)=>({
  actorUid:user.uid,actorEmail:user.email||'',action,modelName:`OC ${p.oc} — ${p.name}`,
  before:before||null,after:after||null,at:serverTimestamp()
});

function productionError(error:unknown):string {
  const e=error as {code?:string;message?:string};
  const code=String(e?.code||'');
  if(code.includes('permission-denied'))return 'O sistema recusou a gravação. Confira se seu perfil tem permissão para a área Amostras.';
  if(code.includes('unavailable')||code.includes('deadline-exceeded'))return 'Conexão indisponível. O corte não foi confirmado; tente novamente.';
  if(code.includes('unauthenticated'))return 'Sua sessão expirou. Saia e entre novamente.';
  return `${code?code+': ':''}${safeProviderMessage(e?.message||error)}`;
}
const humanDate = (raw: unknown) => {
  const d = (raw as { toDate?: () => Date } | undefined)?.toDate?.();
  return d ? d.toLocaleDateString('pt-BR') : '—';
};

/**
 * Pré-visualização em pilha das fotos da própria OC.
 * A foto principal continua na frente; as fotos 2 e 3 são buscadas sob demanda
 * somente quando o cartão entra na área visível da tela.
 */
function SamplePhotoStack({
  db,
  sample,
  loadGallery,
  onOpen,
}: {
  db: Firestore;
  sample: Production;
  loadGallery: boolean;
  onOpen: (photos: string[], index: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const galleryPromiseRef = useRef<Promise<string[]> | null>(null);
  const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
  const updatedAt = sample.updatedAt as { seconds?: number; nanoseconds?: number } | undefined;
  const sampleVersion = `${updatedAt?.seconds ?? ''}:${updatedAt?.nanoseconds ?? ''}`;

  const loadExtraPhotos = useCallback(async () => {
    if (!loadGallery || !sample.imageData) return [];
    if (!galleryPromiseRef.current) {
      const pending: Promise<string[]> = Promise.all([
        getDoc(doc(db, 'production_samples', sample.id, 'gallery', 'photo_2')),
        getDoc(doc(db, 'production_samples', sample.id, 'gallery', 'photo_3')),
      ]).then(snapshots => snapshots
        .map(snapshot => snapshot.exists() ? String(snapshot.data().imageData || '') : '')
        .filter(Boolean)
        .slice(0, MAX_SAMPLE_PHOTOS - 1)
      ).catch(() => {
        galleryPromiseRef.current = null;
        return [];
      });
      galleryPromiseRef.current = pending;
    }
    const pending = galleryPromiseRef.current;
    if (!pending) return [];
    const extras = await pending;
    setExtraPhotos(extras);
    return extras;
  }, [db, loadGallery, sample.id, sample.imageData]);

  useEffect(() => {
    let cancelled = false;
    let observer: IntersectionObserver | undefined;
    setExtraPhotos([]);
    galleryPromiseRef.current = null;

    if (!loadGallery || !sample.imageData) return;

    const load = async () => {
      const extras = await loadExtraPhotos();
      if (!cancelled) setExtraPhotos(extras);
    };

    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') {
      void load();
      return () => { cancelled = true; };
    }

    observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        void load();
        observer?.disconnect();
      }
    }, { rootMargin: '240px 0px' });
    observer.observe(node);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [loadExtraPhotos, sampleVersion]);

  const openAt = async (index: number) => {
    const extras = extraPhotos.length ? extraPhotos : await loadExtraPhotos();
    const allPhotos = [sample.imageData, ...extras].filter(Boolean).slice(0, MAX_SAMPLE_PHOTOS);
    if (allPhotos.length) onOpen(allPhotos, Math.min(index, allPhotos.length - 1));
  };

  const photos = [sample.imageData, ...extraPhotos].filter(Boolean).slice(0, MAX_SAMPLE_PHOTOS);
  const hasMultiple = photos.length > 1;

  return <div ref={rootRef} className={`production-photo-stack${hasMultiple ? ` has-${photos.length}-photos` : ''}`}>
    {photos.length > 2 && <button type="button" className="sample-stack-back sample-stack-back-2" onClick={() => void openAt(2)} aria-label={`Abrir terceira foto da OC ${sample.oc}`}><img src={photos[2]} alt="Terceira foto da amostra" loading="lazy" decoding="async"/></button>}
    {photos.length > 1 && <button type="button" className="sample-stack-back sample-stack-back-1" onClick={() => void openAt(1)} aria-label={`Abrir segunda foto da OC ${sample.oc}`}><img src={photos[1]} alt="Segunda foto da amostra" loading="lazy" decoding="async"/></button>}
    {photos.length > 0 && <button type="button" className="image-zoom-trigger sample-stack-front" onClick={() => void openAt(0)} aria-label={`Ampliar foto principal da OC ${sample.oc}`}><img src={photos[0]} alt={`Foto principal de ${sample.name}`} loading="lazy" decoding="async"/><span className="image-zoom-hint">Ampliar foto principal</span></button>}
    {hasMultiple && <span className="sample-stack-count">{photos.length} fotos</span>}
  </div>;
}

export default function SampleWorkflow({ view, db, user, canEdit, isAdmin, models }: Props) {
  const [items, setItems] = useState<Production[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const pageMemoryKey = `mb-referencias:${user.uid}:${view}`;
  const [initialPageState] = useState(() => readPageMemory(pageMemoryKey, { search: '', typeFilter: 'all' as ModelType, filter: 'in_progress' as VisibleStage }));
  const [search, setSearch] = useState(String(initialPageState.search || ''));
  const [typeFilter, setTypeFilter] = useState<ModelType>((initialPageState.typeFilter as ModelType) || 'all');
  const [filter, setFilter] = useState<VisibleStage>((initialPageState.filter as VisibleStage) || 'in_progress');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Production | null>(null);
  const [oc, setOc] = useState('');
  const [name, setName] = useState('');
  const [reference, setReference] = useState('');
  const [tailor, setTailor] = useState('');
  const [imageGallery, setImageGallery] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [galleryLoaded, setGalleryLoaded] = useState(true);
  const [busy, setBusy] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [lightbox,setLightbox]=useState<{images:string[];index:number;name:string;reference:string;oc:string}|null>(null);
  const [selectionMode,setSelectionMode]=useState(false);
  const [selectedCutIds,setSelectedCutIds]=useState<string[]>([]);

  usePageMemory(pageMemoryKey, { search, typeFilter, filter }, !loading);

  useEffect(() => {
    setLoading(true);
    return onSnapshot(collection(db, 'production_samples'), snapshot => {
      const next = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Production));
      setItems(next.sort((a, b) => ((b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0) - ((a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0)));
      setLoading(false);
      setError('');
    }, e => { setError('Não foi possível consultar as amostras: ' + safeProviderMessage(e)); setLoading(false); });
  }, [db]);
  const progress = useMemo(() => items.filter(x => x.status === 'in_progress').length, [items]);
  // OCs antigas no estado 'store' continuam acessíveis em Prontos, sem migração destrutiva.
  const finished = useMemo(() => items.filter(x => x.status === 'done' || x.status === 'store').length, [items]);
  const filtered = useMemo(() => items.filter(x => view === 'samples'
    ? x.status === 'in_progress'
    : filter === 'done' ? (x.status === 'done' || x.status === 'store') : x.status === 'in_progress')
    .filter(x => matchesModelType(x.name,typeFilter))
    .filter(x => !search.trim() || normalizeText([x.oc, x.name, x.reference, x.tailor].join(' ')).includes(normalizeText(search)) || matchesModelSearch(x.name, search))
    .sort((a,b)=> {
      const group = (name:string) => { const t = modelType(name); return t === 'camisas' || t === 'camisetas' ? 'camisas' : t; };
      const typeCmp = group(a.name).localeCompare(group(b.name),'pt-BR');
      if (typeCmp) return typeCmp;
      const nameCmp = normalizeText(a.name).localeCompare(normalizeText(b.name),'pt-BR');
      if (nameCmp) return nameCmp;
      return normalizeText(a.oc).localeCompare(normalizeText(b.oc),'pt-BR');
    }), [items, view, filter, search, typeFilter]);
  const selectedCuts=useMemo(()=>items.filter(x=>selectedCutIds.includes(x.id)),[items,selectedCutIds]);
  const visibleCutIds=useMemo(()=>filtered.map(x=>x.id),[filtered]);
  const allVisibleCutsSelected=useMemo(()=>visibleCutIds.length>0&&visibleCutIds.every(id=>selectedCutIds.includes(id)),[visibleCutIds,selectedCutIds]);
  const cancelCutSelection=()=>{setSelectionMode(false);setSelectedCutIds([]);};
  const bulkRemoveCuts=async()=>{
    if(view!=='samples'||!canEdit||busy||!selectedCuts.length)return;
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
          // Remove somente os IDs conhecidos da galeria desta OC, sem consultar outras OCs.
          batch.delete(doc(db,'production_samples',p.id,'gallery','photo_2'));
          batch.delete(doc(db,'production_samples',p.id,'gallery','photo_3'));
          // Limpa IDs da galeria antiga sem fazer leitura de fotos.
          batch.delete(doc(db,'production_samples',p.id,'photos','photo_1'));
          batch.delete(doc(db,'production_samples',p.id,'photos','photo_2'));
          batch.delete(doc(db,'production_samples',p.id));
          batch.set(doc(collection(db,'audit_log')),auditEntry(user,'excluiu_oc_em_lote',p,{oc:p.oc,name:p.name,reference:p.reference,tailor:p.tailor,status:p.status},null));
        }
        await batch.commit();removed+=Math.min(4,selectedCuts.length-i);
      }
      cancelCutSelection();
      showMessage(`${removed} amostra(s) excluída(s); as mesmas OCs também desaparecem de Cortes. Os modelos não foram alterados.`);
    }catch(e){showMessage(`Excluídas ${removed} OC(s) antes da falha. ${productionError(e)}. Atualize a lista antes de tentar novamente.`,true);}
    finally{setBusy(false);}
  };
  const showMessage = (s: string, bad = false) => { setError(bad ? s : ''); setMessage(bad ? '' : s); };
  const closeModal = () => { setModal(false); setPhotoError(''); setGalleryLoaded(true); };
  const openNew = () => {
    setEditing(null); setOc(''); setName(''); setReference(''); setTailor('');
    setImageGallery([]); setPhotoError(''); setGalleryLoaded(true); setModal(true);
  };
  // A lista carrega somente a foto principal. As fotos 2 e 3 ficam isoladas
  // na galeria desta OC e só são consultadas quando esta amostra é aberta.
  // A subcoleção antiga /photos nunca é lida; assim não aparecem imagens de
  // outras origens ou de versões anteriores do sistema.
  const openEdit = async (p: Production) => {
    if (busy) return;
    setBusy(true); setGalleryLoaded(false); setPhotoError('');
    try {
      const [photo2, photo3] = await Promise.all([
        getDoc(doc(db, 'production_samples', p.id, 'gallery', 'photo_2')),
        getDoc(doc(db, 'production_samples', p.id, 'gallery', 'photo_3'))
      ]);
      const extras = [photo2, photo3].map(snap => snap.exists() ? String(snap.data().imageData || '') : '').filter(Boolean);
      setEditing(p); setOc(p.oc); setName(p.name); setReference(p.reference); setTailor(p.tailor);
      setImageGallery([...(p.imageData ? [p.imageData] : []), ...extras].slice(0, MAX_SAMPLE_PHOTOS));
      setGalleryLoaded(true); setModal(true);
    } catch (e) {
      setPhotoError('Não foi possível carregar as fotos desta OC. Nenhuma imagem foi alterada. Publique as regras atualizadas e tente abrir novamente. ' + productionError(e));
      setGalleryLoaded(false);
      showMessage('A amostra não foi aberta para evitar substituir ou perder fotos existentes.', true);
    } finally { setBusy(false); }
  };
  const fillModel = (text: string) => {
    setName(text);
    const existing = models.find(m => normalizeText(m.name) === normalizeText(text));
    if (existing) setReference(existing.reference);
  };
  const processFiles = async (files?: FileList | null) => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    const remaining = MAX_SAMPLE_PHOTOS - imageGallery.length;
    if (remaining <= 0) { setPhotoError(`Cada amostra pode ter até ${MAX_SAMPLE_PHOTOS} fotos.`); return; }
    setPhotoError(selectedFiles.length > remaining ? `Você selecionou mais fotos do que o limite permite. Serão adicionadas somente ${remaining}.` : '');
    setBusy(true);
    try {
      const prepared: string[] = [];
      for (const file of selectedFiles.slice(0, remaining)) prepared.push(await optimizePhoto(file, MAX_DATA_LENGTH, 900));
      setImageGallery(current => [...current, ...prepared].slice(0, MAX_SAMPLE_PHOTOS));
      showMessage(prepared.length === 1 ? 'Foto otimizada e adicionada.' : `${prepared.length} fotos otimizadas e adicionadas.`);
    } catch (e) { setPhotoError(safeProviderMessage(e, 'Não foi possível carregar a imagem.')); }
    finally { setBusy(false); }
  };
  const save = async () => {
    if (!canEdit || busy) return;
    if (!galleryLoaded) return showMessage('A galeria desta OC ainda não foi carregada. Feche e abra novamente após atualizar as regras.', true);
    if (!oc.trim() || !name.trim() || !tailor.trim()) return showMessage('Informe OC, nome da peça e costureiro.', true);
    if (imageGallery.some(image => image.length > MAX_DATA_LENGTH)) return showMessage('Uma das fotos ficou acima do limite. Selecione outra imagem.', true);
    const cleanedOC=normalizedOC(oc);
    if(cleanedOC.length>80)return showMessage('OC acima do limite de 80 caracteres.',true);
    if(editing && normalizedOC(editing.oc)!==cleanedOC)return showMessage('Não altere a OC de um registro existente. O identificador deve ser preservado.',true);
    setBusy(true);
    try {
      // A foto principal fica no documento da OC para aparecer como miniatura.
      // As fotos 2 e 3 são salvas em uma subcoleção exclusiva desta mesma OC.
      // Não gravamos nem buscamos imagens de outras OCs.
      const data = { oc: cleanedOC, name: name.trim(), reference: normalizeReference(reference), tailor: tailor.trim(), imageData: imageGallery[0] || '', updatedAt: serverTimestamp(), updatedBy: user.uid };
      const duplicate=items.find(p=>p.id!==editing?.id && normalizedOC(p.oc)===cleanedOC);
      if(duplicate)throw Error(`A OC ${cleanedOC} já está cadastrada. Abra o registro existente em Cortes.`);
      let auditAction: string;
      let auditRecord: Production;
      let auditBefore: unknown = null;
      let auditAfter: unknown;
      if (editing){
        await updateDoc(doc(db,'production_samples',editing.id),data);
        auditAction = 'editou_oc';
        auditRecord = {...editing,...data};
        auditBefore = { oc: editing.oc, name: editing.name, reference: editing.reference, tailor: editing.tailor, status: editing.status, imageCount: imageGallery.length };
        auditAfter = { oc: cleanedOC, name: data.name, reference: data.reference, tailor: data.tailor, status: editing.status, imageCount: imageGallery.length };
      } else {
        const recordRef=doc(db,'production_samples',ocDocId(cleanedOC));
        const newRecord={...data,status:'in_progress' as Stage,createdAt:serverTimestamp(),createdBy:user.uid,completedAt:null,completedBy:null};
        await runTransaction(db,async transaction=>{
          const current=await transaction.get(recordRef);
          if(current.exists())throw Error(`A OC ${cleanedOC} já foi cadastrada por outro usuário.`);
          transaction.set(recordRef,newRecord);
        });
        auditAction = 'criou_oc';
        auditRecord = {...newRecord,id:recordRef.id};
        auditAfter = { oc:cleanedOC,name:data.name,reference:data.reference,status:'in_progress',imageCount:imageGallery.length };
        // Se a gravação das fotos adicionais falhar, o formulário passa a editar
        // a OC recém-criada. Assim, uma nova tentativa não cria duplicidade.
        setEditing(auditRecord);
      }

      const sampleId = editing?.id || auditRecord.id;
      try {
        const galleryBatch = writeBatch(db);
        let galleryWrites = 0;
        for (let index = 1; index < MAX_SAMPLE_PHOTOS; index++) {
          const photoRef = doc(db, 'production_samples', sampleId, 'gallery', `photo_${index + 1}`);
          const image = imageGallery[index] || '';
          if (image) {
            galleryBatch.set(photoRef, { imageData: image, updatedAt: serverTimestamp(), updatedBy: user.uid });
            galleryWrites++;
          } else if (editing) {
            galleryBatch.delete(photoRef);
            galleryWrites++;
          }
        }
        if (galleryWrites) {
          await galleryBatch.commit();
          // Atualiza a versão do documento somente depois da galeria estar salva.
          // Os cartões usam esse marcador para recarregar as fotos extras sem abrir a OC.
          await updateDoc(doc(db, 'production_samples', sampleId), {
            updatedAt: serverTimestamp(),
            updatedBy: user.uid,
          });
        }
      } catch (galleryError) {
        setEditing(auditRecord);
        setPhotoError('A amostra e a foto principal foram salvas, mas não foi possível salvar a galeria. Suas fotos continuam no formulário; publique as regras de gallery e tente salvar novamente. ' + productionError(galleryError));
        setGalleryLoaded(true);
        return;
      }

      setModal(false); setPhotoError(''); setGalleryLoaded(true);
      showMessage(editing ? 'Amostra e galeria de fotos salvas.' : 'Amostra cadastrada com as fotos escolhidas.');
      // O histórico é secundário: uma falha nele não desfaz a gravação da amostra.
      try { await setDoc(doc(collection(db,'audit_log')),auditEntry(user,auditAction,auditRecord,auditBefore,auditAfter)); }
      catch (auditError) { showMessage('A amostra foi salva, mas o histórico não pôde ser atualizado: ' + productionError(auditError), true); }
    } catch (e) { showMessage('Erro ao salvar: ' + safeProviderMessage(e), true); }
    finally { setBusy(false); }
  };
  const mark = async (p: Production, status: VisibleStage) => {
    if (!canEdit || busy || p.status === status) return;
    setBusy(true);
    try {
      // Apenas duas etapas: Em andamento e Pronto.
      // Nenhum documento antigo é migrado ou excluído automaticamente.
      await updateDoc(doc(db, 'production_samples', p.id), {
        status,
        completedAt: status === 'done' ? serverTimestamp() : null,
        completedBy: status === 'done' ? user.uid : null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      // Mantém a aba e o filtro de tipo atuais; não pula automaticamente para 'Prontos'.
      showMessage(status === 'done'
        ? `OC ${p.oc} marcada como pronta.`
        : `OC ${p.oc} reaberta e devolvida ao andamento.`);
      // Uma falha de auditoria não desfaz o status que o serviço já confirmou.
      try {
        await setDoc(doc(collection(db, 'audit_log')), auditEntry(
          user, status === 'done' ? 'corte_pronto' : 'reabriu_corte',
          p, { status:p.status }, { status }
        ));
      } catch (auditError) {
        showMessage(`OC ${p.oc}: status salvo, mas o histórico falhou: ` + productionError(auditError), true);
      }
    } catch (statusError) {
      showMessage(`OC ${p.oc}: falha ao salvar ${status === 'done' ? 'Pronto' : 'Em andamento'}. ` + productionError(statusError), true);
    } finally { setBusy(false); }
  };
  const remove = async (p: Production) => {
    if (!canEdit || busy || !window.confirm(`Excluir a OC ${p.oc} (${p.name})? Essa exclusão será definitiva em todos os aparelhos.`)) return;
    setBusy(true);
    try {
      const batch=writeBatch(db);
      // Remove somente os IDs conhecidos da galeria desta OC, sem consultar outras OCs.
      batch.delete(doc(db,'production_samples',p.id,'gallery','photo_2'));
      batch.delete(doc(db,'production_samples',p.id,'gallery','photo_3'));
      // Limpa IDs usados pela galeria antiga sem fazer leitura de fotos.
      batch.delete(doc(db,'production_samples',p.id,'photos','photo_1'));
      batch.delete(doc(db,'production_samples',p.id,'photos','photo_2'));
      batch.delete(doc(db,'production_samples',p.id));
      batch.set(doc(collection(db,'audit_log')),auditEntry(user,'excluiu_oc',p,{oc:p.oc,name:p.name,reference:p.reference,tailor:p.tailor,status:p.status},null));
      await batch.commit();
      showMessage('Registro excluído e operação registrada no histórico.');
    } catch (e) { showMessage('Falha ao excluir: ' + productionError(e), true); }
    finally { setBusy(false); }
  };
  return <div className="page-wrap production-page">
    <div className="page-heading"><div><span className="eyebrow">PRODUÇÃO COMPARTILHADA</span><h1>{view === 'samples' ? 'Amostras' : 'Cortes'}</h1><p>{view === 'samples' ? 'Cadastre amostras, importe OCs do CSV e adicione as fotos depois.' : 'Veja imagens dos cortes em andamento ou prontos e finalize com o botão Pronto.'}</p></div>
      <div className="heading-actions">{view==='samples'&&<><InitialCutCsvImport db={db} user={user} isAdmin={isAdmin} models={models} alreadyOcs={items.map(p=>p.oc)}/>{canEdit&&<><button className="outline-button" disabled={busy} onClick={()=>selectionMode?cancelCutSelection():setSelectionMode(true)}><Trash2 size={16}/>{selectionMode?'Cancelar seleção':'Selecionar cartões'}</button><button className="primary-button"  onClick={openNew}><Plus size={17}/> Adicionar amostra</button></>}</>}</div></div>
    {view === 'samples' && <section className="samples-count-strip" aria-label="Quantidade de amostras"><div className="stat-card samples-count-card"><div className="stat-icon amber"><Camera/></div><div><span>Amostras</span><strong>{loading ? '—' : progress}</strong><small>Em andamento</small></div></div></section>}
    {view === 'cuts' && <section className="stats-grid"><div className="stat-card"><div className="stat-icon amber"><Clock3/></div><div><span>Em andamento</span><strong>{progress}</strong><small>Aguardando finalização</small></div></div><div className="stat-card"><div className="stat-icon green"><CheckCircle2/></div><div><span>Prontos</span><strong>{finished}</strong><small>Cortes finalizados</small></div></div></section>}
    <section className="catalog-panel production-panel"><div className="production-toolbar"><label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar OC, peça, REF ou costureiro..."/></label>
      <label className="filter-select model-type-filter"><Filter size={16}/><select aria-label={view==='samples'?'Filtrar amostras por tipo de peça':'Filtrar cortes por tipo de peça'} value={typeFilter} onChange={e=>setTypeFilter(e.target.value as ModelType)}>{MODEL_TYPE_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
      {view === 'cuts'&&<div className="production-tabs"><button className={filter==='in_progress'?'chosen':''} onClick={()=>setFilter('in_progress')}><Clock3 size={15}/> Em andamento ({progress})</button><button className={filter==='done'?'chosen':''} onClick={()=>setFilter('done')}><Check size={15}/> Prontos ({finished})</button></div>}
    </div>
    {view==='samples'&&selectionMode&&<div className="bulk-select-toolbar" role="region" aria-label="Exclusão de OCs selecionadas">
      <strong>{selectedCuts.length} OC(s) selecionada(s)</strong>
      <button className="outline-button" disabled={busy||!visibleCutIds.length} onClick={()=>setSelectedCutIds(ids=>allVisibleCutsSelected?ids.filter(id=>!visibleCutIds.includes(id)):[...new Set([...ids,...visibleCutIds])])}>{allVisibleCutsSelected?'Desmarcar visíveis':'Selecionar todos visíveis'} ({visibleCutIds.length})</button>
      <button className="outline-button" disabled={busy||!selectedCutIds.length} onClick={()=>setSelectedCutIds([])}>Limpar</button>
      <button className="danger-button" disabled={busy||!selectedCuts.length} onClick={()=>void bulkRemoveCuts()}><Trash2 size={16}/> {busy?'Excluindo...':`Excluir ${selectedCuts.length} selecionada(s)`}</button>
    </div>}
    {error&&<div className="production-alert" role="alert">{error}</div>}{message&&<div className="production-ok">{message}</div>}
    {loading?<div className="empty-state"><RefreshCw className="spin"/> Carregando produção...</div>:
    !filtered.length?<div className="empty-state"><Scissors size={28}/><strong>Nenhum registro encontrado</strong><span>{view === 'samples' ? 'Nenhuma amostra pendente. Use Adicionar amostra ou importe a planilha de 21 OCs acima.' : 'Não há cortes nesta situação.'}</span></div>:
    <div className="production-grid">{filtered.map(p=>{const cardImage=p.imageData||'';return <article className={`production-card ${selectedCutIds.includes(p.id)?'bulk-card-selected':''}`} key={p.id}>{view==='samples'&&selectionMode&&<label className="bulk-card-checkbox"><input type="checkbox" disabled={busy} aria-label={`Selecionar OC ${p.oc}`} checked={selectedCutIds.includes(p.id)} onChange={e=>setSelectedCutIds(ids=>e.target.checked?[...new Set([...ids,p.id])]:ids.filter(id=>id!==p.id))}/><span>Selecionar</span></label>}
      <div className="production-photo">{cardImage?<SamplePhotoStack db={db} sample={p} loadGallery={view==='samples'} onOpen={(images,index)=>setLightbox({images:[...images],index,name:p.name,reference:p.reference,oc:p.oc})}/>:<div className="model-photo-placeholder"><ImagePlus size={28}/><span>Foto pendente</span></div>}{view === 'cuts' && <span className={`production-status ${p.status==='store'?'done':p.status}`}>{p.status==='in_progress'?'EM ANDAMENTO':'PRONTO'}</span>}</div>
      <div className="production-details"><div className="production-oc">OC {p.oc}</div><h3>{p.name}</h3><dl><div><dt>REF</dt><dd>{p.reference||'SEM CÓDIGO'}</dd></div><div><dt>Costureiro</dt><dd>{p.tailor}</dd></div><div><dt>Cadastrado</dt><dd>{humanDate(p.createdAt)}</dd></div>{view === 'cuts' && p.status !== 'in_progress' && <div><dt>{'Pronto em'}</dt><dd>{humanDate(p.completedAt)}</dd></div>}</dl>
      {canEdit&&<div className="production-actions">{view==='cuts'? (p.status==='in_progress'?<button disabled={busy} className="primary-button" onClick={()=>void mark(p,'done')}><Check size={16}/> Pronto</button>:<button disabled={busy} className="outline-button" onClick={()=>void mark(p,'in_progress')} title={`Devolver OC ${p.oc} para Em andamento`}><RotateCcw size={16}/> Voltar para andamento</button>):<><button className="outline-button" disabled={busy} onClick={()=>void openEdit(p)} title="Editar amostra e incluir fotos"><Camera size={15}/> {p.imageData ? 'Editar / fotos' : 'Adicionar fotos / editar'}</button><button className="icon-button" onClick={()=>void remove(p)} title="Excluir amostra"><Trash2 size={17}/></button></>}</div>}</div>
    </article>})}</div>}</section>
    {lightbox&&<PhotoLightbox images={lightbox.images} initialIndex={lightbox.index} src={lightbox.images[lightbox.index]||lightbox.images[0]} title={lightbox.name} detail={`OC ${lightbox.oc} · ${lightbox.reference||'SEM CÓDIGO'}`} onClose={()=>setLightbox(null)}/>}
    {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}><section className="modal production-modal" role="dialog" aria-modal="true"><div className="modal-head"><div><span className="eyebrow">AMOSTRAS</span><h2>{editing?'Editar amostra / adicionar foto':'Adicionar amostra'}</h2><p>A mesma OC será exibida em Amostras e em Cortes, sem duplicação.</p></div><button className="icon-button" onClick={closeModal}><X/></button></div>
    <form className="modal-form" onSubmit={e=>{e.preventDefault();void save()}}><div className="production-image-field"><span>Fotos da peça (até {MAX_SAMPLE_PHOTOS})</span>
      <div className="sample-gallery-grid">{imageGallery.map((image,index)=><div className={`sample-gallery-item ${index===0?'is-primary':'is-extra'}`} key={`${index}-${image.slice(-24)}`}><button type="button" className="sample-gallery-thumb" onClick={()=>setLightbox({images:[...imageGallery],index,name:name||'Amostra',reference,oc})} aria-label={`Visualizar foto ${index+1}`}><img src={image} alt={`Foto ${index+1} da peça`} loading="lazy" decoding="async"/><span>{index===0?'PRINCIPAL':`FOTO ${index+1} · GALERIA`}</span></button><button type="button" className="sample-gallery-remove" disabled={busy} onClick={()=>setImageGallery(current=>current.filter((_,photoIndex)=>photoIndex!==index))} aria-label={`Remover foto ${index+1}`}><X size={14}/></button></div>)}{!imageGallery.length&&<div className="sample-gallery-empty"><ImagePlus size={27}/><span>Nenhuma foto adicionada</span></div>}</div>
      {photoError&&<div className="production-alert" role="alert">{photoError}</div>}
      <div className="sample-photo-choices"><button type="button" className="outline-button" disabled={busy||imageGallery.length>=MAX_SAMPLE_PHOTOS} onClick={()=>cameraInput.current?.click()}><Camera size={16}/> Câmera</button><button type="button" className="outline-button" disabled={busy||imageGallery.length>=MAX_SAMPLE_PHOTOS} onClick={()=>galleryInput.current?.click()}><ImagePlus size={16}/> Galeria</button></div>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void processFiles(e.currentTarget.files);e.currentTarget.value=''}}/><input ref={galleryInput} type="file" accept="image/*" multiple hidden onChange={e=>{void processFiles(e.currentTarget.files);e.currentTarget.value=''}}/>
      <small>A primeira foto fica como principal. As próximas ficam na galeria, atrás dela e na ordem em que forem adicionadas. Se remover a principal, a próxima assume esse lugar. Não buscamos fotos do catálogo nem de outras OCs.</small></div>
      <div className="production-form-grid"><label>OC *<input required maxLength={80} readOnly={!!editing} value={oc} onChange={e=>setOc(e.target.value)} placeholder="Ex.: OC-125"/></label><label>Costureiro *<input required maxLength={120} value={tailor} onChange={e=>setTailor(e.target.value)} placeholder="Nome do responsável"/></label></div>
      <label>Nome da peça *<input required maxLength={250} list="production-models" value={name} onChange={e=>fillModel(e.target.value)} placeholder="Pesquise ou digite o modelo"/><datalist id="production-models">{models.map(m=><option value={m.name} key={m.id}/>)}</datalist><small>Se escolher um modelo existente, a REF será preenchida automaticamente.</small></label>
      <label>Código Extra (REF)<input maxLength={200} value={reference} onChange={e=>setReference(e.target.value)} placeholder="REF.10359"/></label>
      <div className="modal-actions"><button type="button" className="outline-button" onClick={closeModal}>Cancelar</button><button type="submit" className="primary-button" disabled={busy||!galleryLoaded}>{busy?'Salvando...':editing?'Salvar amostra':'Adicionar amostra'}</button></div></form></section></div>}
  </div>;
}
