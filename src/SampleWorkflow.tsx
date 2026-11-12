
import { createPortal } from 'react-dom';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { collection, doc, getDoc, getDocs, query as fsQuery, where, onSnapshot, runTransaction, serverTimestamp, updateDoc, setDoc, writeBatch, deleteField } from 'firebase/firestore';
import { Camera, Check, CheckCircle2, Clock3, Filter, ImagePlus, Plus, RefreshCw, RotateCcw, Search, Scissors, Trash2, X } from 'lucide-react';
import { normalizeReference, normalizeText, type Model } from './lib/catalog';
import { MODEL_TYPE_OPTIONS, matchesModelSearch, matchesModelType, modelType, type ModelType } from './lib/modelTypes';
import PhotoLightbox from './PhotoLightbox';
import InitialCutCsvImport from './InitialCutCsvImport';
import { optimizePhoto } from './lib/photos';
import { PageActiveContext, readPageMemory, usePageMemory } from './lib/pageMemory';
import { buildOrderLookup, missingDataFromOrder, missingModel, missingReference, missingTailor, missingQuantity, normalizeSampleOC, orderForSample, quantityFromOrder, sampleOrderSearchValues, sampleHasMissingData, type OrderInfo } from './lib/sampleOrderSync';
import { canonicalWorkshopName } from './lib/workshopNames';
import { safeProviderMessage } from './lib/safeMessage';

// 'store' é conservado apenas para leitura de registros legados.
// Novas alterações e a interface usam somente Em andamento e Pronto.
type Stage = 'in_progress' | 'done' | 'store';
type VisibleStage = 'in_progress' | 'done';
type Production = {
  id: string; oc: string; name: string; reference: string; tailor: string; quantity?: string; orderId?: string;
  imageData: string; status: Stage; createdAt?: unknown; updatedAt?: unknown; completedAt?: unknown; completedBy?: string|null;
};
type View = 'samples' | 'cuts';
type Props = { view: View; db: Firestore; user: User; canEdit: boolean; isAdmin:boolean; canReadOrders:boolean; models: Model[] };
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

  // CORREÇÃO: abre a foto imediatamente.
  // O carregamento das fotos adicionais acontece em segundo plano.
  const openAt = async (index: number) => {
    let extras = extraPhotos;
    if (loadGallery && extras.length === 0) {
      extras = await loadExtraPhotos();
    }

    const allPhotos = [sample.imageData, ...extras]
      .filter(Boolean)
      .slice(0, MAX_SAMPLE_PHOTOS);

    if (allPhotos.length) {
      onOpen(allPhotos, Math.min(index, allPhotos.length - 1));
    }
  };

  const photos = [sample.imageData, ...extraPhotos].filter(Boolean).slice(0, MAX_SAMPLE_PHOTOS);
  const hasMultiple = photos.length > 1;

  return <div ref={rootRef} className={`production-photo-stack${hasMultiple ? ` has-${photos.length}-photos` : ''}`}>
    {photos.length > 2 && <button type="button" className="sample-stack-back sample-stack-back-2" onClick={() => openAt(2)} aria-label={`Abrir terceira foto da OC ${sample.oc}`}><img src={photos[2]} alt="Terceira foto da amostra" loading="lazy" decoding="async"/></button>}
    {photos.length > 1 && <button type="button" className="sample-stack-back sample-stack-back-1" onClick={() => openAt(1)} aria-label={`Abrir segunda foto da OC ${sample.oc}`}><img src={photos[1]} alt="Segunda foto da amostra" loading="lazy" decoding="async"/></button>}
    {photos.length > 0 && <button type="button" className="image-zoom-trigger sample-stack-front" onClick={() => openAt(0)} aria-label={`Ampliar foto principal da OC ${sample.oc}`}><img src={photos[0]} alt={`Foto principal de ${sample.name}`} loading="lazy" decoding="async"/><span className="image-zoom-hint">Ampliar foto principal</span></button>}
    {hasMultiple && <span className="sample-stack-count">{photos.length} fotos</span>}
  </div>;
}

export default function SampleWorkflow({ view, db, user, canEdit, isAdmin, canReadOrders, models }: Props) {
  const pageActive=useContext(PageActiveContext);
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
  const [quantity, setQuantity] = useState('');
  // Busca da OC somente enquanto o formulário estiver aberto e após digitar.
  const [ocLookupStatus,setOcLookupStatus]=useState<'idle'|'loading'|'found'|'missing'|'multiple'|'permission'|'error'>('idle');
  const [ocLookupMessage,setOcLookupMessage]=useState('');
  const [ocLookupRevision,setOcLookupRevision]=useState(0);
  const ocLookupRequested=useRef(false);
  const ocLookupForce=useRef(false);
  const manuallyEdited=useRef<Set<string>>(new Set());
  const autoFilledValues=useRef<Record<string,string>>({});

  // Completa visualmente campos ausentes com dados da OC, sem sobrescrever informações da amostra.
  const [linkedOrders, setLinkedOrders] = useState<Record<string, OrderInfo|null>>({});
  const requestedOrderOcs = useRef<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);
  const [syncProgress, setSyncProgress] = useState('');
  const [imageGallery, setImageGallery] = useState<string[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [galleryLoaded, setGalleryLoaded] = useState(true);
  const [galleryFetching,setGalleryFetching]=useState(false);
  const galleryRequestRef=useRef(0);
  const [busy, setBusy] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const galleryInput = useRef<HTMLInputElement>(null);
  const [lightbox,setLightbox]=useState<{images:string[];index:number;name:string;reference:string;oc:string}|null>(null);
  const [selectionMode,setSelectionMode]=useState(false);
  const [selectedCutIds,setSelectedCutIds]=useState<string[]>([]);
  // Limita cartões/fotos simultâneas: reduz travamentos ao abrir a edição.
  const [visibleCount,setVisibleCount]=useState(48);

  usePageMemory(pageMemoryKey, { search, typeFilter, filter }, !loading);

  useEffect(() => {
    setSelectionMode(false);
    setSelectedCutIds([]);
  }, [view]);

  useEffect(() => {
    if(!pageActive)return;
    setLoading(true);
    return onSnapshot(collection(db, 'production_samples'), snapshot => {
      const next = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Production));
      setItems(next.sort((a, b) => ((b.createdAt as { seconds?: number } | undefined)?.seconds ?? 0) - ((a.createdAt as { seconds?: number } | undefined)?.seconds ?? 0)));
      setLoading(false);
      setError('');
    }, e => { setError('Não foi possível consultar as amostras: ' + safeProviderMessage(e)); setLoading(false); });
  }, [db,pageActive]);

  const progress = useMemo(() => items.filter(x => x.status === 'in_progress').length, [items]);
  // OCs antigas no estado 'store' continuam acessíveis em Prontos, sem migração destrutiva.
  const finished = useMemo(() => items.filter(x => x.status === 'done' || x.status === 'store').length, [items]);
  // O indicador de Amostras exibe PEÇAS informadas, não quantidade de cadastros/OCs.
  // Campos vazios ou inválidos não são inventados: ficam sinalizados para correção.
  const samplePieces=useMemo(()=>{
    let total=0,missing=0;
    for(const item of items){
      const cleaned=String(item.quantity??'').trim().replace(/[.\s]/g,'');
      if(!/^\d{1,12}$/.test(cleaned)){missing++;continue;}
      total+=Number(cleaned);
    }
    return {total,missing};
  },[items]);
  const incorrectTailorNames=useMemo(()=>items.filter(p=>p.tailor?.trim()&&canonicalWorkshopName(p.tailor)!==p.tailor),[items]);

  const filtered = useMemo(() => items.filter(x => view === 'samples'
    ? true
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

  useEffect(()=>setVisibleCount(48),[search,typeFilter,filter,view]);
  const displayed=useMemo(()=>filtered.slice(0,visibleCount),[filtered,visibleCount]);
  // Consulta pontual: somente OCs dos cartões visíveis com REF, costureiro,
  // modelo ou quantidade ausentes. Não carrega todas as OCs ao abrir a página.
  // Sem permissão para Ordem de Corte, lê os dados já salvos na Amostra normalmente.
  useEffect(() => {
    if (!pageActive || view !== 'samples' || !canReadOrders) return;
    const missing = displayed.filter(sampleHasMissingData);
    const wanted = [...new Set(missing.map(item => normalizeSampleOC(item.oc))
      .filter(key => key && !requestedOrderOcs.current.has(key)))];
    if (!wanted.length) return;
    wanted.forEach(key => requestedOrderOcs.current.add(key));
    // Também consulta o texto original se a OC antiga tiver maiúsculas/espaços diferentes.
    const searchValues = [...new Set(missing.filter(item => wanted.includes(normalizeSampleOC(item.oc)))
      .flatMap(item => [item.oc, normalizeSampleOC(item.oc)]))].filter(Boolean);
    const batches: string[][] = [];
    for (let i = 0; i < searchValues.length; i += 30) batches.push(searchValues.slice(i, i + 30));
    let cancelled = false;
    Promise.all(batches.map(values => getDocs(fsQuery(collection(db,'cut_orders'), where('oc','in',values)))))
      .then(results => {
        if (cancelled) return;
        const orders: OrderInfo[] = results.flatMap(result => result.docs.map(order => ({
          id: order.id, oc: String(order.data().oc || ''), model: String(order.data().model || ''),
          ref: String(order.data().ref || ''), office: String(order.data().office || ''), qty: String(order.data().qty || '')
        })));
        const lookup = buildOrderLookup(orders);
        const resolved: Record<string,OrderInfo|null> = {};
        for (const key of wanted) resolved[key] = lookup.byOc.get(key) || null;
        setLinkedOrders(current => ({...current,...resolved}));
      }).catch(() => {
        // Não bloquear Amostras por falha da leitura de OCs.
        // A sincronização manual informa o motivo, se necessário.
        wanted.forEach(key => requestedOrderOcs.current.delete(key));
      });
    return () => { cancelled = true; wanted.forEach(key => requestedOrderOcs.current.delete(key)); };
  }, [db, pageActive, view, canReadOrders, displayed]);

  // Não carrega a coleção inteira: procura até 9 grafias da OC em uma única
  // consulta indexada, com debounce, e descarta respostas de buscas antigas.
  // Nunca escolhe automaticamente entre duas OCs com o mesmo número.
  useEffect(()=>{
    if(!modal||!pageActive||!ocLookupRequested.current)return;
    const key=normalizeSampleOC(oc);
    if(!key){setOcLookupStatus('idle');setOcLookupMessage('');return}
    if(!canReadOrders){
      setOcLookupStatus('permission');
      setOcLookupMessage('Seu perfil não tem acesso à Ordem de Corte. Solicite permissão para usar o preenchimento automático ou preencha manualmente.');
      return;
    }
    let cancelled=false;
    setOcLookupStatus('loading');
    setOcLookupMessage('Buscando OC na Ordem de Corte...');
    const timer=window.setTimeout(async()=>{
      try{
        const variants=sampleOrderSearchValues(oc);
        const result=await getDocs(fsQuery(collection(db,'cut_orders'),where('oc','in',variants)));
        if(cancelled)return;
        const found=new Map<string,OrderInfo>();
        for(const snapshot of result.docs){
          const d=snapshot.data();
          const order:OrderInfo={id:snapshot.id,oc:String(d.oc||''),model:String(d.model||''),
            ref:String(d.ref||''),office:String(d.office||''),qty:String(d.qty||'')};
          if(normalizeSampleOC(order.oc)===key)found.set(order.id,order);
        }
        const matches=[...found.values()];
        if(matches.length>1){
          setOcLookupStatus('multiple');
          setOcLookupMessage('Há mais de uma Ordem de Corte com esse número. Não completei os campos para evitar dados trocados; confira na área Ordem de Corte.');
          return;
        }
        if(!matches.length){
          setOcLookupStatus('missing');
          setOcLookupMessage('OC não encontrada na Ordem de Corte. Você ainda pode preencher os dados manualmente.');
          return;
        }
        const order=matches[0];
        const fromOC={
          name:String(order.model||'').trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR'),
          reference:String(order.ref||'').trim().toLocaleUpperCase('pt-BR'),
          tailor:canonicalWorkshopName(order.office),
          quantity:quantityFromOrder(order.qty),
        };
        // Em edição da mesma OC, completa somente campos ausentes.
        // Ao digitar outra OC ou solicitar a substituição, usa os valores dela,
        // exceto os que o usuário acabou de modificar manualmente.
        const overwrite=!editing||normalizeSampleOC(editing.oc)!==key||ocLookupForce.current;
        const apply=(field:string,value:string,current:string,missing:(v:string)=>boolean)=>{
          if(!value)return current;
          if(overwrite){
            if(manuallyEdited.current.has(field)&&!ocLookupForce.current)return current;
            if(!editing)autoFilledValues.current[field]=value;
            return value;
          }
          return missing(current)?value:current;
        };
        setName(v=>apply('name',fromOC.name,v,missingModel));
        setReference(v=>apply('reference',fromOC.reference,v,missingReference));
        setTailor(v=>apply('tailor',fromOC.tailor,v,missingTailor));
        setQuantity(v=>apply('quantity',fromOC.quantity,v,missingQuantity));
        ocLookupForce.current=false;
        setOcLookupStatus('found');
        const missingFields=[
          !fromOC.name?'nome da peça':'',
          !fromOC.reference?'REF':'',
          !fromOC.tailor?'costureiro':'',
          !fromOC.quantity?'quantidade':'',
        ].filter(Boolean);
        const already=items.some(sample=>sample.id!==editing?.id&&normalizeSampleOC(sample.oc)===key);
        setOcLookupMessage(`OC ${order.oc} encontrada. Dados disponíveis preenchidos automaticamente.`
          +(missingFields.length?` Faltam na OC: ${missingFields.join(', ')}.`:'')
          +(already?' Atenção: essa OC já possui uma amostra cadastrada; abra o registro existente em vez de criar outra.':''));
      }catch(e){
        if(cancelled)return;
        setOcLookupStatus('error');
        const code=String((e as {code?:string})?.code||'');
        setOcLookupMessage(code.includes('permission-denied')
          ?'O Firebase negou a consulta das Ordens de Corte. Verifique a permissão desta área.'
          :'Não foi possível buscar essa OC agora. Confira sua conexão ou preencha os dados manualmente.');
      }
    },420);
    return()=>{cancelled=true;window.clearTimeout(timer)};
  },[db,modal,pageActive,oc,editing?.id,canReadOrders,ocLookupRevision]);

  const currentInfo = (sample: Production): Production => {
    const fromOrder = linkedOrders[normalizeSampleOC(sample.oc)];
    const patch = missingDataFromOrder(sample, fromOrder);
    if (patch.tailor) patch.tailor = canonicalWorkshopName(patch.tailor);
    return {...sample, ...patch};
  };

  // Atualização histórica explícita: sincroniza TODAS as amostras antigas, não
  // apenas as 48 visíveis. Transações relêem cada amostra antes de completar
  // somente os campos faltantes. Fotos, status e observações são preservados.
  const synchronizeSamples = async () => {
    if (syncing || busy || !canEdit || !canReadOrders || view !== 'cuts') return;
    const candidates = items.filter(sampleHasMissingData).filter(item => normalizeSampleOC(item.oc));
    if (!candidates.length) return showMessage('Todas as amostras já têm os dados disponíveis preenchidos.');
    if (!window.confirm(`Conferir ${candidates.length} amostra(s) com dados incompletos pela OC? O sistema só preencherá campos vazios e manterá fotos e informações já cadastradas.`)) return;
    setSyncing(true);
    setBusy(true);
    setSyncProgress('Buscando as Ordens de Corte...');
    let completed = 0;
    try {
      // Esta consulta completa só acontece quando o usuário pede sincronização.
      const orderSnapshot = await getDocs(collection(db,'cut_orders'));
      const orders = orderSnapshot.docs.map(order => ({id: order.id,
        oc: String(order.data().oc || ''), model: String(order.data().model || ''),
        ref: String(order.data().ref || ''), office: String(order.data().office || ''),
        qty: String(order.data().qty || '')} satisfies OrderInfo));
      const lookup = buildOrderLookup(orders);
      const matches = candidates.map(sample => ({sample,order:orderForSample(sample,lookup)}))
        .filter((entry): entry is {sample:Production;order:OrderInfo} => !!entry.order)
        .filter(entry => Object.keys(missingDataFromOrder(entry.sample,entry.order)).length > 0);
      const unmatched = candidates.length - matches.length;
      for (let index = 0; index < matches.length; index += 20) {
        const group = matches.slice(index,index+20);
        const changed = await runTransaction(db,async transaction => {
          const snapshots = await Promise.all(group.map(entry => transaction.get(doc(db,'production_samples',entry.sample.id))));
          let updates = 0;
          snapshots.forEach((snapshot,position) => {
            if (!snapshot.exists()) return;
            const current = snapshot.data() as Production;
            const values = missingDataFromOrder(current,group[position].order);
            if (values.tailor) values.tailor = canonicalWorkshopName(values.tailor);
            if (!Object.keys(values).length) return;
            transaction.update(snapshot.ref,{...values,updatedAt:serverTimestamp(),updatedBy:user.uid});
            updates++;
          });
          return updates;
        });
        completed += changed;
        setSyncProgress(`Atualizadas ${completed} de até ${matches.length} amostras...`);
      }
      showMessage(`${completed} amostra(s) completadas pela Ordem de Corte. ${unmatched ? `${unmatched} sem correspondência única ou sem dados disponíveis; confira a OC.` : ''} As fotos e os campos já preenchidos foram preservados.`);
    } catch(e) {
      showMessage(`Sincronização interrompida após ${completed} amostra(s). ${productionError(e)} Confira as permissões da área Ordem de Corte.`,true);
    } finally {setSyncing(false);setBusy(false);setSyncProgress('');}
  };

  const selectedCuts=useMemo(()=>items.filter(x=>selectedCutIds.includes(x.id)),[items,selectedCutIds]);
  const visibleCutIds=useMemo(()=>displayed.map(x=>x.id),[displayed]);
  const allVisibleCutsSelected=useMemo(()=>visibleCutIds.length>0&&visibleCutIds.every(id=>selectedCutIds.includes(id)),[visibleCutIds,selectedCutIds]);
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
          batch.delete(doc(db,'production_samples',p.id,'gallery','photo_2'));
          batch.delete(doc(db,'production_samples',p.id,'gallery','photo_3'));
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
  const updateOCInput=(value:string)=>{
    ocLookupRequested.current=true;
    ocLookupForce.current=false;
    const prior={...autoFilledValues.current};
    autoFilledValues.current={};
    if(!editing){
      setName(v=>v===prior.name?'':v);
      setReference(v=>v===prior.reference?'':v);
      setTailor(v=>v===prior.tailor?'':v);
      setQuantity(v=>v===prior.quantity?'':v);
    }
    setOcLookupStatus('idle');setOcLookupMessage('');setOc(value);
  };
  const reloadOCDetails=()=>{
    if(!oc.trim())return;
    if(editing&&!window.confirm('Substituir os dados preenchidos pelos dados da Ordem de Corte? Fotos e status serão preservados.'))return;
    manuallyEdited.current.clear();
    ocLookupRequested.current=true;
    ocLookupForce.current=true;
    setOcLookupRevision(v=>v+1);
  };
  const editSampleField=(field:string)=>{
    manuallyEdited.current.add(field);
    delete autoFilledValues.current[field];
  };

  const closeModal = () => { galleryRequestRef.current++;ocLookupRequested.current=false;setOcLookupStatus('idle');setOcLookupMessage('');setGalleryFetching(false);setModal(false); setPhotoError(''); setGalleryLoaded(true); };

  const openNew = () => {
    galleryRequestRef.current++;setGalleryFetching(false);
    ocLookupRequested.current=false;ocLookupForce.current=false;manuallyEdited.current.clear();autoFilledValues.current={};
    setOcLookupStatus('idle');setOcLookupMessage('');
    setEditing(null); setOc(''); setName(''); setReference(''); setTailor(''); setQuantity('');
    setImageGallery([]); setPhotoError(''); setGalleryLoaded(true); setModal(true);
  };

  const openEdit = async (p: Production) => {
    if (busy) return;

    // Mostra o formulário imediatamente com os dados já disponíveis no cartão.
    // A leitura da galeria extra é feita depois e nunca bloqueia a edição dos dados.
    const requestId=++galleryRequestRef.current;
    ocLookupRequested.current=false;ocLookupForce.current=false;manuallyEdited.current.clear();autoFilledValues.current={};
    setOcLookupStatus('idle');setOcLookupMessage('');
    const completed = currentInfo(p);
    setEditing(p);
    setOc(p.oc);
    setName(completed.name);
    setReference(completed.reference);
    setTailor(canonicalWorkshopName(completed.tailor));
    setQuantity(String(completed.quantity || ''));
    setImageGallery(p.imageData ? [p.imageData] : []);
    setPhotoError('');
    setGalleryLoaded(false);
    setModal(true);
    setGalleryFetching(true);

    try {
      const [photo2, photo3] = await Promise.all([
        getDoc(doc(db, 'production_samples', p.id, 'gallery', 'photo_2')),
        getDoc(doc(db, 'production_samples', p.id, 'gallery', 'photo_3'))
      ]);
      const extras = [photo2, photo3]
        .map(snap => snap.exists() ? String(snap.data().imageData || '') : '')
        .filter(Boolean);
      if(requestId!==galleryRequestRef.current)return;
      setImageGallery([...(p.imageData ? [p.imageData] : []), ...extras].slice(0, MAX_SAMPLE_PHOTOS));
      setGalleryLoaded(true);
    } catch (e) {
      if(requestId!==galleryRequestRef.current)return;
      // Sem a galeria completa, os controles de foto ficam bloqueados e o salvamento
      // preserva a foto principal e as fotos adicionais existentes no Firestore.
      setPhotoError(
        'Não foi possível carregar a galeria completa desta OC. Você ainda pode editar OC, nome, REF e costureiro. As fotos existentes serão preservadas. Para adicionar, remover ou trocar fotos, verifique as regras de leitura da coleção gallery. ' +
        productionError(e)
      );
      setGalleryLoaded(false);
    } finally {
      if(requestId===galleryRequestRef.current)setGalleryFetching(false);
    }
  };

  const fillModel = (text: string) => {
    editSampleField('name');setName(text);
    const existing = models.find(m => normalizeText(m.name) === normalizeText(text));
    if (existing) {editSampleField('reference');setReference(existing.reference);}
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
    if (!galleryLoaded && !editing) return showMessage('A galeria ainda não foi carregada. Tente novamente antes de cadastrar uma nova amostra.', true);
    if (!oc.trim() || !name.trim() || !tailor.trim()) return showMessage('Informe OC, nome da peça e costureiro.', true);
    if (quantity.trim() && !/^\d{1,12}$/.test(quantity.trim())) return showMessage('Quantidade total deve ser um número inteiro de até 12 dígitos.', true);
    if (imageGallery.some(image => image.length > MAX_DATA_LENGTH)) return showMessage('Uma das fotos ficou acima do limite. Selecione outra imagem.', true);
    const cleanedOC=normalizedOC(oc);
    if(cleanedOC.length>80)return showMessage('OC acima do limite de 80 caracteres.',true);
    const changingOC=!!editing && normalizedOC(editing.oc)!==cleanedOC;
    if(changingOC && !window.confirm(`Alterar a OC de ${editing!.oc} para ${cleanedOC}? Esta mudança atualiza somente esta Amostra/Corte, preservando as fotos. A Ordem de Corte, os pagamentos e as fichas NÃO serão modificados. Revise também a OC correspondente nessas áreas.`))return;
    setBusy(true);
    try {
      const data = {
        oc: cleanedOC,
        name: name.trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR'),
        reference: normalizeReference(reference),
        tailor: canonicalWorkshopName(tailor),
        quantity: quantity.trim(),
        // Se a galeria não foi lida, não sobrescreve nem remove a foto principal.
        imageData: galleryLoaded ? (imageGallery[0] || '') : (editing?.imageData || ''),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      };
      // Evita uma OC duplicada mesmo quando outro usuário a cadastrou após a abertura da tela.
      if(changingOC){
        const sameOC=await getDocs(fsQuery(collection(db,'production_samples'),where('oc','==',cleanedOC)));
        if(sameOC.docs.some(d=>d.id!==editing?.id))throw Error(`A OC ${cleanedOC} já está cadastrada em outra amostra.`);
      }
      const duplicate=items.find(p=>p.id!==editing?.id && normalizedOC(p.oc)===cleanedOC);
      if(duplicate)throw Error(`A OC ${cleanedOC} já está cadastrada. Abra o registro existente em Cortes.`);
      let auditAction: string;
      let auditRecord: Production;
      let auditBefore: unknown = null;
      let auditAfter: unknown;

      if (editing){
        // Mantém o ID e as subcoleções de fotos. Remove vínculo com a OC antiga
        // apenas quando o número muda; as Ordens de Corte permanecem intactas.
        await runTransaction(db,async transaction=>{
          const ref=doc(db,'production_samples',editing.id);
          const current=await transaction.get(ref);
          if(!current.exists())throw Error('Esta amostra não existe mais. Atualize a página.');
          if(normalizedOC(String(current.data().oc||''))!==normalizedOC(editing.oc))
            throw Error('Esta OC foi alterada por outro usuário. Atualize antes de salvar.');
          if(changingOC){
            const nextId=ocDocId(cleanedOC);
            if(nextId!==editing.id){
              const canonical=await transaction.get(doc(db,'production_samples',nextId));
              if(canonical.exists())throw Error(`A OC ${cleanedOC} já está cadastrada. Não salvei duplicado.`);
            }
          }
          transaction.update(ref,changingOC?{...data,orderId:deleteField()}:data);
        });
        auditAction = 'editou_oc';
        auditRecord = {...editing,...data};
        auditBefore = { oc: editing.oc, name: editing.name, reference: editing.reference, tailor: editing.tailor, status: editing.status, imageCount: galleryLoaded ? imageGallery.length : 'galeria preservada sem alteração' };
        auditAfter = { oc: cleanedOC, name: data.name, reference: data.reference, tailor: data.tailor, status: editing.status, imageCount: galleryLoaded ? imageGallery.length : 'galeria preservada sem alteração' };
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
        setEditing(auditRecord);
      }

      const sampleId = editing?.id || auditRecord.id;
      if (galleryLoaded) {
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
            await updateDoc(doc(db, 'production_samples', sampleId), {
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            });
          }
        } catch (galleryError) {
          setEditing(auditRecord);
          setPhotoError('Os dados e a foto principal foram salvos, mas não foi possível salvar as fotos adicionais. Suas fotos continuam preservadas. Verifique as regras da coleção gallery. ' + productionError(galleryError));
          setGalleryLoaded(true);
          return;
        }
      }

      setModal(false); setPhotoError(''); setGalleryLoaded(true);
      showMessage(editing
        ? (galleryLoaded ? 'Dados e galeria de fotos salvos.' : 'Dados da amostra salvos. Todas as fotos existentes foram preservadas sem alteração.')
        : 'Amostra cadastrada com as fotos escolhidas.');
      try { await setDoc(doc(collection(db,'audit_log')),auditEntry(user,auditAction,auditRecord,auditBefore,auditAfter)); }
      catch (auditError) { showMessage('A amostra foi salva, mas o histórico não pôde ser atualizado: ' + productionError(auditError), true); }
    } catch (e) { showMessage('Erro ao salvar: ' + safeProviderMessage(e), true); }
    finally { setBusy(false); }
  };

  const mark = async (p: Production, status: VisibleStage) => {
    if (!canEdit || busy || p.status === status) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'production_samples', p.id), {
        status,
        completedAt: status === 'done' ? serverTimestamp() : null,
        completedBy: status === 'done' ? user.uid : null,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      showMessage(status === 'done'
        ? `OC ${p.oc} marcada como pronta.`
        : `OC ${p.oc} reaberta e devolvida ao andamento.`);
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
      batch.delete(doc(db,'production_samples',p.id,'gallery','photo_2'));
      batch.delete(doc(db,'production_samples',p.id,'gallery','photo_3'));
      batch.delete(doc(db,'production_samples',p.id,'photos','photo_1'));
      batch.delete(doc(db,'production_samples',p.id,'photos','photo_2'));
      batch.delete(doc(db,'production_samples',p.id));
      batch.set(doc(collection(db,'audit_log')),auditEntry(user,'excluiu_oc',p,{oc:p.oc,name:p.name,reference:p.reference,tailor:p.tailor,status:p.status},null));
      await batch.commit();
      showMessage('Registro excluído e operação registrada no histórico.');
    } catch (e) { showMessage('Falha ao excluir: ' + productionError(e), true); }
    finally { setBusy(false); }
  };

  // Corrige exclusivamente o nome do costureiro em amostras existentes.
  // Fotos, REF, quantidade, vínculo, datas originais e status ficam intactos.
  const standardizeExistingTailors=async()=>{
    if(!canEdit||view!=='cuts'||busy)return;
    const candidates=items.filter(p=>p.tailor?.trim()&&canonicalWorkshopName(p.tailor)!==p.tailor);
    if(!candidates.length)return showMessage('Todos os nomes de costureiros já estão padronizados.');
    if(!window.confirm(`Padronizar os nomes de costureiros em ${candidates.length} amostra(s)? A alteração ajusta grafia, acentos e MAIÚSCULAS. Nenhuma foto, OC, REF ou quantidade será alterada.`))return;
    setBusy(true);
    let updated=0;
    try{
      for(let i=0;i<candidates.length;i+=80){
        const group=candidates.slice(i,i+80);
        const batch=writeBatch(db);
        for(const p of group){
          batch.update(doc(db,'production_samples',p.id),{
            tailor:canonicalWorkshopName(p.tailor),
            updatedAt:serverTimestamp(),
            updatedBy:user.uid
          });
        }
        batch.set(doc(collection(db,'audit_log')),{
          actorUid:user.uid,actorEmail:user.email||'',
          action:'padronizou_costureiros_amostras',
          modelName:`Padronização de ${group.length} amostras`,
          before:null,after:{count:group.length},
          at:serverTimestamp()
        });
        await batch.commit();
        updated+=group.length;
      }
      showMessage(`${updated} nome(s) de costureiros corrigido(s) nas Amostras. Fotos, OCs e outros dados preservados.`);
    }catch(e){
      showMessage(`Foram corrigidos ${updated} de ${candidates.length} registro(s). Falha nos restantes: ${productionError(e)}`,true);
    }finally{setBusy(false)}
  };

  return <div className="page-wrap production-page">
    <div className="page-heading"><div><span className="eyebrow">PRODUÇÃO COMPARTILHADA</span><h1>{view === 'samples' ? 'Amostras' : 'Cortes'}</h1><p>{view === 'samples' ? 'Consulte fotos e informações das amostras. Para adicionar ou editar fotos, utilize a aba Cortes.' : 'Gerencie os dados, fotos e exclusões das OCs; acompanhe o andamento e marque os cortes como prontos.'}</p></div>
      <div className="heading-actions">
        {view==='cuts'&&<>
          {canEdit&&canReadOrders&&<button type="button" className="outline-button" disabled={busy||syncing||loading} onClick={()=>void synchronizeSamples()} title="Completar REF, costureiro, quantidade e nome usando a OC correspondente, sem alterar fotos ou dados preenchidos"><RefreshCw size={16}/>{syncing?'Sincronizando...':'Completar dados pelas OCs'}</button>}
          {canEdit&&incorrectTailorNames.length>0&&<button type="button" className="outline-button" disabled={busy||loading} onClick={()=>void standardizeExistingTailors()} title="Corrigir grafia, acentos e caixa alta dos costureiros nas amostras existentes"><Check size={16}/>Corrigir nomes ({incorrectTailorNames.length})</button>}
          {canEdit&&<InitialCutCsvImport db={db} user={user} isAdmin={isAdmin} models={models} alreadyOcs={items.map(p=>p.oc)}/>}
          {canEdit&&<button type="button" className="primary-button" disabled={busy} onClick={openNew}><Plus size={17}/> Adicionar corte / foto</button>}
          {canEdit&&<button type="button" className="outline-button" disabled={busy} onClick={()=>selectionMode?cancelCutSelection():setSelectionMode(true)}><Trash2 size={16}/>{selectionMode?'Cancelar seleção':'Selecionar cartões'}</button>}
        </>}
      </div></div>

    {view === 'samples' && <section className="samples-count-strip" aria-label="Quantidade total de peças nas amostras"><div className="stat-card samples-count-card"><div className="stat-icon amber"><Camera/></div><div><span>Total de peças nas amostras</span><strong>{loading ? '—' : samplePieces.total.toLocaleString('pt-BR')}</strong><small>{samplePieces.missing>0?`${samplePieces.missing} amostra(s) sem quantidade informada`:'Soma das quantidades informadas nas OCs'}</small></div></div></section>}

    {view === 'cuts' && <section className="stats-grid"><div className="stat-card"><div className="stat-icon amber"><Clock3/></div><div><span>Em andamento</span><strong>{progress}</strong><small>Aguardando finalização</small></div></div><div className="stat-card"><div className="stat-icon green"><CheckCircle2/></div><div><span>Prontos</span><strong>{finished}</strong><small>Cortes finalizados</small></div></div></section>}

    <section className="catalog-panel production-panel">
      <div className="production-toolbar">
        <label className="search-box"><Search size={18}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar OC, peça, REF ou costureiro..."/></label>
        <label className="filter-select model-type-filter"><Filter size={16}/><select aria-label={view==='samples'?'Filtrar amostras por tipo de peça':'Filtrar cortes por tipo de peça'} value={typeFilter} onChange={e=>setTypeFilter(e.target.value as ModelType)}>{MODEL_TYPE_OPTIONS.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
        {view === 'cuts'&&<div className="production-tabs"><button className={filter==='in_progress'?'chosen':''} onClick={()=>setFilter('in_progress')}><Clock3 size={15}/> Em andamento ({progress})</button><button className={filter==='done'?'chosen':''} onClick={()=>setFilter('done')}><Check size={15}/> Prontos ({finished})</button></div>}
      </div>

      {view==='cuts'&&selectionMode&&<div className="bulk-select-toolbar" role="region" aria-label="Exclusão de OCs selecionadas">
        <strong>{selectedCuts.length} OC(s) selecionada(s)</strong>
        <button className="outline-button" disabled={busy||!visibleCutIds.length} onClick={()=>setSelectedCutIds(ids=>allVisibleCutsSelected?ids.filter(id=>!visibleCutIds.includes(id)):[...new Set([...ids,...visibleCutIds])])}>{allVisibleCutsSelected?'Desmarcar visíveis':'Selecionar todos visíveis'} ({visibleCutIds.length})</button>
        <button className="outline-button" disabled={busy||!selectedCutIds.length} onClick={()=>setSelectedCutIds([])}>Limpar</button>
        <button className="danger-button" disabled={busy||!selectedCuts.length} onClick={()=>void bulkRemoveCuts()}><Trash2 size={16}/> {busy?'Excluindo...':`Excluir ${selectedCuts.length} selecionada(s)`}</button>
      </div>}

      {error&&<div className="production-alert" role="alert">{error}</div>}
      {syncProgress&&view==='cuts'&&<div className="production-ok" role="status">{syncProgress}</div>}
      {message&&<div className="production-ok">{message}</div>}

      {loading?<div className="empty-state"><RefreshCw className="spin"/> Carregando produção...</div>:
      !filtered.length?<div className="empty-state"><Scissors size={28}/><strong>Nenhum registro encontrado</strong><span>{view === 'samples' ? 'Nenhuma amostra pendente. Use Adicionar amostra ou importe a planilha de 21 OCs acima.' : 'Não há cortes nesta situação.'}</span></div>:
      <div className="production-grid">{displayed.map(original=>{const p=currentInfo(original);const cardImage=p.imageData||'';return <article className={`production-card ${selectedCutIds.includes(p.id)?'bulk-card-selected':''}`} key={p.id}>
        {view==='cuts'&&selectionMode&&<label className="bulk-card-checkbox"><input type="checkbox" disabled={busy} aria-label={`Selecionar OC ${p.oc}`} checked={selectedCutIds.includes(p.id)} onChange={e=>setSelectedCutIds(ids=>e.target.checked?[...new Set([...ids,p.id])]:ids.filter(id=>id!==p.id))}/><span>Selecionar</span></label>}

        <div className="production-photo">{cardImage?<SamplePhotoStack db={db} sample={p} loadGallery={true} onOpen={(images,index)=>setLightbox({images:[...images],index,name:p.name,reference:p.reference,oc:p.oc})}/>:<div className="model-photo-placeholder"><ImagePlus size={28}/><span>Foto pendente</span></div>}{view === 'cuts' && <span className={`production-status ${p.status==='store'?'done':p.status}`}>{p.status==='in_progress'?'EM ANDAMENTO':'PRONTO'}</span>}</div>

        <div className="production-details">
          <div className="production-oc">OC {p.oc}</div>
          <h3>{p.name}</h3>
          <dl>
            <div><dt>REF</dt><dd>{p.reference||'SEM CÓDIGO'}</dd></div>
            <div><dt>Costureiro</dt><dd>{canonicalWorkshopName(p.tailor)}</dd></div>
            <div><dt>Quantidade total</dt><dd>{p.quantity || 'A informar'}</dd></div>
            <div><dt>Cadastrado</dt><dd>{humanDate(p.createdAt)}</dd></div>
            {view === 'cuts' && p.status !== 'in_progress' && <div><dt>Pronto em</dt><dd>{humanDate(p.completedAt)}</dd></div>}
          </dl>

          {canEdit&&view==='cuts'&&<div className="production-actions">
            {p.status==='in_progress'
              ? <button disabled={busy} className="primary-button" onClick={()=>void mark(p,'done')}><Check size={16}/> Pronto</button>
              : <button disabled={busy} className="outline-button" onClick={()=>void mark(p,'in_progress')} title={`Devolver OC ${p.oc} para Em andamento`}><RotateCcw size={16}/> Voltar para andamento</button>}
            <button className="outline-button" disabled={busy} onClick={()=>void openEdit(p)} title="Editar dados e fotos desta OC"><Camera size={15}/> Editar / fotos</button>
            <button className="icon-button" disabled={busy} onClick={()=>void remove(p)} title="Excluir OC" aria-label={`Excluir OC ${p.oc}`}><Trash2 size={17}/></button>
          </div>}
        </div>
      </article>})}</div>}
      {!loading&&visibleCount<filtered.length&&<div className="production-pagination"><span>Exibindo {Math.min(visibleCount,filtered.length)} de {filtered.length} registros</span><button type="button" className="outline-button" onClick={()=>setVisibleCount(n=>n+48)}>Mostrar mais 48</button></div>}
    </section>

    {lightbox&&<PhotoLightbox images={lightbox.images} initialIndex={lightbox.index} src={lightbox.images[lightbox.index]||lightbox.images[0]} title={lightbox.name} detail={`OC ${lightbox.oc} · ${lightbox.reference||'SEM CÓDIGO'}`} onClose={()=>setLightbox(null)}/>}

    {modal&&pageActive&&createPortal(<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)closeModal()}}>
      <section className="modal production-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div><span className="eyebrow">{editing?'CORTES / EDIÇÃO':'CORTES / NOVO'}</span><h2>{editing?'Editar dados e fotos da OC':'Adicionar corte e fotos'}</h2><p>{editing?'Altere as informações e gerencie as fotos desta OC.':'Cadastre a OC e suas fotos em Cortes. A visualização aparecerá automaticamente em Amostras.'}</p></div>
          <button className="icon-button" onClick={closeModal}><X/></button>
        </div>

        <form className="modal-form" onSubmit={e=>{e.preventDefault();void save()}}>
          {error&&<div className="production-alert" role="alert">{error}</div>}
          <div className="production-image-field">
            <span>Fotos da peça (até {MAX_SAMPLE_PHOTOS})</span>
            {galleryFetching&&<small role="status">Carregando as fotos adicionais... Você já pode preencher os outros campos.</small>}
            <div className="sample-gallery-grid">
              {imageGallery.map((image,index)=><div className={`sample-gallery-item ${index===0?'is-primary':'is-extra'}`} key={`${index}-${image.slice(-24)}`}>
                <button type="button" className="sample-gallery-thumb" onClick={()=>setLightbox({images:[...imageGallery],index,name:name||'Amostra',reference,oc})} aria-label={`Visualizar foto ${index+1}`}>
                  <img src={image} alt={`Foto ${index+1} da peça`} loading="lazy" decoding="async"/>
                  <span>{index===0?'PRINCIPAL':`FOTO ${index+1} · GALERIA`}</span>
                </button>
                <button type="button" className="sample-gallery-remove" disabled={busy||(!galleryLoaded&&!!editing)} onClick={()=>setImageGallery(current=>current.filter((_,photoIndex)=>photoIndex!==index))} aria-label={`Remover foto ${index+1}`}><X size={14}/></button>
              </div>)}
              {!imageGallery.length&&<div className="sample-gallery-empty"><ImagePlus size={27}/><span>Nenhuma foto adicionada</span></div>}
            </div>

            {photoError&&<div className="production-alert" role="alert">{photoError}</div>}

            <div className="sample-photo-choices">
              <button type="button" className="outline-button" disabled={busy||(!galleryLoaded&&!!editing)||imageGallery.length>=MAX_SAMPLE_PHOTOS} onClick={()=>cameraInput.current?.click()}><Camera size={16}/> Câmera</button>
              <button type="button" className="outline-button" disabled={busy||(!galleryLoaded&&!!editing)||imageGallery.length>=MAX_SAMPLE_PHOTOS} onClick={()=>galleryInput.current?.click()}><ImagePlus size={16}/> Galeria</button>
            </div>

            <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void processFiles(e.currentTarget.files);e.currentTarget.value=''}}/>
            <input ref={galleryInput} type="file" accept="image/*" multiple hidden onChange={e=>{void processFiles(e.currentTarget.files);e.currentTarget.value=''}}/>

            <small>A primeira foto fica como principal. As próximas ficam na galeria, atrás dela e na ordem em que forem adicionadas. Se remover a principal, a próxima assume esse lugar. Não buscamos fotos do catálogo nem de outras OCs.</small>
          </div>

          <div className="production-form-grid">
            <label>OC *<input required maxLength={80} value={oc} onChange={e=>updateOCInput(e.target.value)} placeholder="Ex.: 729" autoComplete="off"/>
              {canReadOrders&&<button type="button" className="outline-button sample-oc-refill" disabled={busy||!oc.trim()||ocLookupStatus==='loading'} onClick={reloadOCDetails}>Preencher pela OC</button>}
              {ocLookupMessage&&<small className={`sample-oc-lookup ${ocLookupStatus}`} role="status">{ocLookupMessage}</small>}
              {editing&&<small>Ao corrigir o número, confira também a Ordem de Corte e a ficha correspondente.</small>}
            </label>
            <label>Costureiro *<input required maxLength={120} value={tailor} onChange={e=>{editSampleField('tailor');setTailor(e.target.value)}} onBlur={()=>setTailor(current=>canonicalWorkshopName(current))} placeholder="Nome do responsável"/></label>
          </div>

          <label>Nome da peça *<input required maxLength={250} list="production-models" value={name} onChange={e=>fillModel(e.target.value)} placeholder="Pesquise ou digite o modelo"/>
            <datalist id="production-models">{models.map(m=><option value={m.name} key={m.id}/>)}</datalist>
            <small>Se escolher um modelo existente, a REF será preenchida automaticamente.</small>
          </label>

          <div className="production-form-grid"><label>Código Extra (REF) — opcional<input maxLength={200} value={reference} onChange={e=>{editSampleField('reference');setReference(e.target.value)}} placeholder="SEM REF quando não existir"/></label>
          <label>Quantidade total de peças<input type="number" min="0" step="1" value={quantity} onChange={e=>{editSampleField('quantity');setQuantity(e.target.value)}} placeholder="Ex.: 420"/></label></div>

          <div className="modal-actions">
            <button type="button" className="outline-button" onClick={closeModal}>Cancelar</button>
            <button type="submit" className="primary-button" disabled={busy||(!galleryLoaded&&!editing)}>{busy?'Salvando...':editing?'Salvar amostra':'Adicionar amostra'}</button>
          </div>
        </form>
      </section>
    </div>,document.body)}
  </div>;
}
