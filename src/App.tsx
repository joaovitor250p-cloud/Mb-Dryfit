import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';

import type { User } from 'firebase/auth';
import { onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { collection, doc, getDoc, getDocFromServer, getDocs, onSnapshot, query as fsQuery, orderBy, setDoc, updateDoc, writeBatch, runTransaction, serverTimestamp, type DocumentData } from 'firebase/firestore';
import { Activity, AlertCircle, CheckCircle2, Cloud, Copy, Download, FileSpreadsheet, Filter, History, LogOut, Moon, Pencil, Plus, Search, ShieldCheck, Sun, Trash2, Upload, Users, X, Camera, Scissors, ImagePlus, ClipboardList, Wallet, FileText, Building2, ShoppingCart, Menu, type LucideIcon } from 'lucide-react';
import { normalizeReference, normalizeText, sameModel, sortModels, type Model } from './lib/catalog';
import { publicCatalogPhoto } from './lib/photoCatalog';
import { optimizePhoto } from './lib/photos';
import { safeProviderMessage } from './lib/safeMessage';
import { auth, db, serviceConfigured } from './lib/dataClient';
import brandLogo from './assets/mb-dryfit-logo.webp';
import { PageActiveContext } from './lib/pageMemory';

// Carrega cada área somente quando ela é aberta. Isso reduz o pacote inicial
// e evita baixar telas administrativas/financeiras para quem está no catálogo.
const ModelPhotos = lazy(() => import('./ModelPhotos'));
const SamplesAndCuts = lazy(() => import('./SamplesAndCuts'));
const BackupExport = lazy(() => import('./BackupExport'));
const AccountsAdmin = lazy(() => import('./AccountsAdmin'));
const CutOrders = lazy(() => import('./CutOrders'));
const ExpensesPage = lazy(() => import('./ExpensesPage'));
const InfoPage = lazy(() => import('./InfoPage'));
const WorkshopsPage = lazy(() => import('./WorkshopsPage'));
const ReferencePrices = lazy(() => import('./ReferencePrices'));
const ProductionSheets = lazy(() => import('./ProductionSheets'));
const EnfestoPage = lazy(() => import('./EnfestoPage'));
const PurchasesStock = lazy(() => import('./PurchasesStock'));

type Role='admin'|'editor'|'viewer';
type Mode='add'|'edit'|'delete'|'import'|'users'|'history'|null;
type View = 'catalog' | 'samples' | 'cuts' | 'orders' | 'expenses' | 'info' | 'workshops' | 'prices' | 'sheets' | 'sheet_distribution' | 'enfesto' | 'purchases';
type ImportRow={name:string;reference:string;pendingReview:boolean;exists:boolean;action:'add'|'update'|'skip'};
type Audit={id:string;actorEmail:string;action:string;modelName:string;before:any;after:any;at?:any};
const roleLabel:Record<Role,string>={admin:'Administrador',editor:'Editor',viewer:'Consulta'};
const modelKey=(name:string)=>{
 const normalized=normalizeText(name).replace(/[.,;:()\-_\/]+/g,' ').replace(/\s+/g,' ').trim();
 if(!normalized)return '';
 const encoded=encodeURIComponent(normalized);
 // IDs do Firestore têm limite de 1.500 bytes. Para nomes muito longos ou
 // com muitos caracteres acentuados, usa um prefixo estável + hash, sem
 // alterar os IDs históricos dos nomes comuns.
 if(encoded.length<=1400)return encoded;
 let hash=2166136261;
 for(const character of normalized){hash^=character.codePointAt(0)||0;hash=Math.imul(hash,16777619);}
 return `${encoded.slice(0,1200)}-${(hash>>>0).toString(16)}`;
};
const mapModel=(id:string,r:DocumentData):Model=>({id,name:String(r.name||''),reference:String(r.reference||''),pendingReview:!!r.pendingReview,imageData:typeof r.imageData==='string'?r.imageData:'',fallbackImageData:publicCatalogPhoto(String(r.name||''),String(r.reference||'')),updatedAt:r.updatedAt?.toDate?.()?.toISOString?.()||'',updatedBy:r.updatedBy||''});
const parseRole=(role:unknown):Role=>role==='admin'||role==='editor'?role:'viewer';
const safeError=(e:unknown)=>safeProviderMessage(e);
const makeAudit=(actor:User,action:string,modelName:string,before:any,after:any)=>({actorUid:actor.uid,actorEmail:actor.email||'',action,modelName,before:before||null,after:after||null,at:serverTimestamp()});
const asPlain=(m:Model)=>({name:m.name,reference:m.reference||'',pendingReview:!!m.pendingReview});

function BrandLoading({ label = 'Preparando seu espaço...' }: { label?: string }) {
  return <div className="loading-screen" role="status" aria-live="polite">
    <div className="loading-brand">
      <div className="loading-logo-wrap"><img src={brandLogo} alt="MB DryFit" /></div>
      <strong>MB REFERENCIAS</strong>
      <span>{label}</span>
      <div className="loading-progress" aria-hidden="true"><i /></div>
    </div>
  </div>;
}

/** Recuperação do carregamento mobile sem apagar login ou dados do Firebase. */
function StartupRecovery({reason}:{reason:string}){
 const [refreshing,setRefreshing]=useState(false);
 const update=async()=>{
  if(refreshing)return;
  setRefreshing(true);
  try{
   if('caches' in window){
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith('mb-referencias-shell-')).map(name=>caches.delete(name)));
   }
  }catch{/* Alguns navegadores bloqueiam CacheStorage; ainda tentamos atualizar. */}
  const url=new URL(window.location.href);
  url.searchParams.set('mb_atualizar',String(Date.now()));
  window.location.replace(url.toString());
 };
 return <div className="auth-shell"><section className="auth-card" role="alert">
  <img className="brand-logo auth-logo" src={brandLogo} alt="MB DryFit"/>
  <h1>Não foi possível concluir o carregamento</h1>
  <p>{reason}</p>
  <p>Se estiver no celular, confira a internet e toque em <strong>Atualizar aplicativo</strong>. Isso limpa somente o cache de arquivos do site: não apaga OCs, fichas, fotos ou sua conta.</p>
  <button type="button" className="primary-button full" disabled={refreshing} onClick={()=>void update()}>{refreshing?'Atualizando…':'Atualizar aplicativo'}</button>
  <button type="button" className="outline-button full" onClick={()=>window.location.reload()}>Tentar novamente</button>
 </section></div>;
}

export default function App(){
 const [user,setUser]=useState<User|null>(null),[authReady,setAuthReady]=useState(false),[role,setRole]=useState<Role|null>(null),[roleChecked,setRoleChecked]=useState(false);
 const [bootTimedOut,setBootTimedOut]=useState(false),[bootError,setBootError]=useState('');
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmPassword,setConfirmPassword]=useState(''),[recover,setRecover]=useState(false),[signup,setSignup]=useState(false),[showPassword,setShowPassword]=useState(false);
 const [accessRequest,setAccessRequest]=useState<'loading'|'none'|'pending'|'approved'|'denied'>('loading'),[roleDisabled,setRoleDisabled]=useState(false),[verified,setVerified]=useState(false);
 const [companyId,setCompanyId]=useState('mb-principal');
 const [models,setModels]=useState<Model[]>([]),[loaded,setLoaded]=useState(false),[sync,setSync]=useState<'online'|'offline'|'error'>('offline');
 const [view,setView] = useState<View>('catalog');
 // Mantém cada área visitada montada. Formulários, modais e filtros ficam como estavam ao voltar.
 // Esta regra é central: funciona também nas próximas áreas adicionadas ao menu.
 const [visitedViews,setVisitedViews] = useState<View[]>(['catalog']);
 const viewScroll=useRef<Partial<Record<View,number>>>({});
 const previousView=useRef<View>('catalog');
 const [transitionDirection,setTransitionDirection]=useState<'next'|'previous'>('next');
 const [backupOpen,setBackupOpen]=useState(false),[mobileMoreOpen,setMobileMoreOpen]=useState(false);
 const [dark,setDark]=useState(false),[search,setSearch]=useState(''),[filter,setFilter]=useState<'all'|'with'|'without'|'pending'>('all'),[sort,setSort]=useState<'reference'|'name'>('reference');
 const [modal,setModal]=useState<Mode>(null),[editing,setEditing]=useState<Model|null>(null),[name,setName]=useState(''),[reference,setReference]=useState(''),[pending,setPending]=useState(false),[busy,setBusy]=useState(false);
 const [modelPhoto,setModelPhoto]=useState(''),[modelPhotoChanged,setModelPhotoChanged]=useState(false),[modelPhotoBusy,setModelPhotoBusy]=useState(false),[modelPhotoError,setModelPhotoError]=useState('');
 const modelCameraInput=useRef<HTMLInputElement>(null),modelGalleryInput=useRef<HTMLInputElement>(null);
 const modelSaveInFlight=useRef(false);
 const [modelSaveMessage,setModelSaveMessage]=useState('');
 const [error,setError]=useState(''),[info,setInfo]=useState(''),[preview,setPreview]=useState<ImportRow[]>([]),[importMode,setImportMode]=useState<'add'|'update'>('add');
 const [audit,setAudit]=useState<Audit[]>([]),[access,setAccess]=useState<('catalog'|'samples'|'cuts'|'orders'|'expenses'|'info'|'workshops'|'sheets'|'enfesto'|'sheet_distribution'|'purchases')[]>(['catalog','samples','cuts']);
 // Bloqueia o zoom involuntário da página; as fotos mantêm seu zoom próprio.
 const admin=role==='admin',editor=admin||role==='editor';
 const permitted=(section:View)=>admin||(section==='samples'?access.includes('samples')||access.includes('cuts'):section==='prices'?access.includes('workshops'):access.includes(section));
 const viewOrder:View[]=['catalog','samples','orders','sheets','enfesto','sheet_distribution','purchases','expenses','info','workshops','prices'];
 const availableViews=viewOrder.filter(permitted);
 const navMeta:Record<View,{label:string;short:string;Icon:LucideIcon}>={
   catalog:{label:'Catálogo de modelos',short:'Modelos',Icon:Search},
   samples:{label:'Amostras',short:'Amostras',Icon:Camera},
   cuts:{label:'Cortes e fotos',short:'Cortes',Icon:Scissors},
   orders:{label:'OCs e pagamentos',short:'OCs',Icon:ClipboardList},
   purchases:{label:'Compras e estoque',short:'Estoque',Icon:ShoppingCart},
   expenses:{label:'Controle de gastos',short:'Gastos',Icon:Wallet},
   info:{label:'Informações e PIX',short:'Dados e PIX',Icon:FileText},
   workshops:{label:'Oficinas e costureiros',short:'Oficinas',Icon:Building2},
   prices:{label:'Preços padrão por REF',short:'Preços REF',Icon:Wallet},
   sheets:{label:'Fichas de produção',short:'Fichas',Icon:FileText},
   sheet_distribution:{label:'Distribuir fichas',short:'Distribuição',Icon:ClipboardList},
   enfesto:{label:'Enfesto e corte',short:'Enfesto',Icon:Scissors}
 };
 const navGroups:{label:string;items:View[]}[]=[
 {label:'PRODUÇÃO',items:['catalog','samples','orders','sheets','enfesto','sheet_distribution']},
 {label:'FINANCEIRO E ESTOQUE',items:['purchases','expenses']},
 {label:'CONFIGURAÇÕES',items:['info','workshops','prices']}
];
 useEffect(()=>{if(role&&!permitted(view)){const first=(viewOrder as View[]).find(x=>permitted(x));if(first){setVisitedViews(old=>old.includes(first)?old:[...old,first]);setView(first)}}},[role,access,view]);
 const notify=(message:string,isError=false)=>{setError(isError?message:'');setInfo(isError?'':message)};
 useEffect(()=>{setDark(localStorage.getItem('mb-theme')==='dark')},[]);
 useEffect(()=>{document.documentElement.classList.toggle('dark',dark);localStorage.setItem('mb-theme',dark?'dark':'light')},[dark]);
 useEffect(()=>{if(!auth){setAuthReady(true);return}return onAuthStateChanged(auth,u=>{setBootError('');setUser(u);setRole(null);setRoleChecked(false);setRoleDisabled(false);setVerified(!!u?.emailVerified);setAccessRequest('loading');setAuthReady(true)},e=>{setBootError('Não foi possível confirmar a sessão: '+safeProviderMessage(e));setAuthReady(true)})},[]);
 useEffect(()=>{if(!user||!db){setRoleChecked(true);return}return onSnapshot(doc(db,'user_roles',user.uid),s=>{setBootError('');setRoleDisabled(s.exists()&&s.data().disabled===true);setCompanyId(s.exists()&&typeof s.data().companyId==='string'&&s.data().companyId.trim()?s.data().companyId.trim():'mb-principal');setRole(s.exists()&&s.data().disabled!==true?parseRole(s.data().role):null);setAccess(s.exists()&&Array.isArray(s.data().permissions)?s.data().permissions.filter((x:unknown)=>x==='catalog'||x==='samples'||x==='cuts'||x==='orders'||x==='expenses'||x==='info'||x==='workshops'||x==='sheets'||x==='sheet_distribution'||x==='enfesto'||x==='purchases'):['catalog','samples','cuts']);setRoleChecked(true)},e=>{setBootError('Não foi possível verificar seu acesso: '+safeProviderMessage(e));setRoleChecked(true)})},[user]);
 useEffect(()=>{if(!db||!user){setAccessRequest('none');return}return onSnapshot(doc(db,'access_requests',user.uid),s=>{setAccessRequest(s.exists()?(s.data().status==='approved'?'approved':s.data().status==='denied'?'denied':'pending'):'none')},e=>{setAccessRequest('none');notify('Falha ao consultar sua solicitação: '+safeProviderMessage(e),true)})},[user]);
 useEffect(()=>{
  if(authReady&&(!user||roleChecked)){setBootTimedOut(false);return}
  setBootTimedOut(false);
  const timer=window.setTimeout(()=>setBootTimedOut(true),20000);
  return()=>window.clearTimeout(timer);
 },[authReady,user?.uid,roleChecked]);
 const needsModels = view==='catalog' || view==='samples' || view==='cuts' || view==='sheets' || view==='sheet_distribution';
 const navigateView=(next:View)=>{
   if(next===view||!permitted(next))return;
   const currentIndex=availableViews.indexOf(view),nextIndex=availableViews.indexOf(next);
   if(currentIndex>=0&&nextIndex>=0)setTransitionDirection(nextIndex>currentIndex?'next':'previous');
   if(!needsModels&&(next==='catalog'||next==='samples'||next==='cuts'))setLoaded(false);
   viewScroll.current[view]=window.scrollY;
   setVisitedViews(old=>old.includes(next)?old:[...old,next]);
   setMobileMoreOpen(false);
   setView(next);
 };
 // Restaura também a posição de leitura sem perder o estado dos componentes ocultos.
 useEffect(()=>{
   if(previousView.current===view)return;
   previousView.current=view;
   const first=window.requestAnimationFrame(()=>{
     window.scrollTo(0,viewScroll.current[view]??0);
   });
   return()=>window.cancelAnimationFrame(first);
 },[view]);
 // Impede zoom por pinça sobre a página, sem bloquear gestos do visualizador de fotos.
 useEffect(()=>{
  const inViewer=(target:EventTarget|null)=>target instanceof Element&&!!target.closest('.photo-lightbox');
  const preventMultiTouch=(event:TouchEvent)=>{if(event.touches.length>1&&!inViewer(event.target)&&event.cancelable)event.preventDefault();};
  const preventGesture=(event:Event)=>{if(!inViewer(event.target)&&event.cancelable)event.preventDefault();};
  document.addEventListener('touchmove',preventMultiTouch,{passive:false});
  document.addEventListener('gesturestart',preventGesture,{passive:false});
  document.addEventListener('gesturechange',preventGesture,{passive:false});
  return()=>{document.removeEventListener('touchmove',preventMultiTouch);document.removeEventListener('gesturestart',preventGesture);document.removeEventListener('gesturechange',preventGesture);};
 },[]);
 useEffect(()=>{
  if(!mobileMoreOpen)return;
  const onKeyDown=(event:KeyboardEvent)=>{if(event.key==='Escape')setMobileMoreOpen(false);};
  const previousOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  window.addEventListener('keydown',onKeyDown);
  return()=>{document.body.style.overflow=previousOverflow;window.removeEventListener('keydown',onKeyDown);};
 },[mobileMoreOpen]);
 useEffect(()=>{
  if(!db||!user||!role||!needsModels||(!admin&&!access.some(x=>x==='catalog'||x==='samples'||x==='cuts'))){setModels([]);setLoaded(true);return}
  setLoaded(false);
  const unsub=onSnapshot(collection(db,'models'),s=>{setModels(s.docs.map(d=>mapModel(d.id,d.data())));setLoaded(true);setSync('online')},e=>{notify(`Falha de sincronização: ${safeProviderMessage(e)}`,true);setSync('error');setLoaded(true)});
  return unsub;
 },[db,user,role,admin,access,needsModels]);
 useEffect(()=>{const listener=()=>{if(!navigator.onLine)setSync('offline');else if(db&&user&&role)setSync('online')};window.addEventListener('online',listener);window.addEventListener('offline',listener);return()=>{window.removeEventListener('online',listener);window.removeEventListener('offline',listener)}},[user,role]);
 const filtered=useMemo(()=>{const q=normalizeText(search).replace(/ref\./g,'').trim();let list=models.filter(m=>!q||normalizeText(m.name).includes(q)||normalizeText(m.reference).replace(/ref\./g,'').includes(q)||((q==='sem codigo'||q==='sem código')&&!m.reference));if(filter==='with')list=list.filter(m=>!!m.reference);if(filter==='without')list=list.filter(m=>!m.reference);if(filter==='pending')list=list.filter(m=>m.pendingReview);return sortModels(list,sort)},[models,search,filter,sort]);
 const withRef=models.filter(m=>m.reference).length;
 const submitAuth=async(e:React.FormEvent)=>{e.preventDefault();if(!auth||!db)return;setBusy(true);try{
   if(recover){await sendPasswordResetEmail(auth,email);notify('Confira seu e-mail para redefinir a senha.');setRecover(false)}
   else if(signup){
     if(password.length<8)throw Error('A senha precisa ter pelo menos 8 caracteres.');
     if(password!==confirmPassword)throw Error('As senhas não coincidem.');
     // Sessão local por aparelho: não revoga sessões de outros dispositivos.
     await setPersistence(auth,browserLocalPersistence);
     const credential=await createUserWithEmailAndPassword(auth,email.trim(),password);
     setPassword('');setConfirmPassword('');
     try{await sendEmailVerification(credential.user);notify('Conta criada. Verifique o e-mail e depois clique em Já confirmei meu e-mail.')}
     catch(err){notify('Conta criada. Não foi possível enviar a confirmação: '+safeError(err)+'. Use Reenviar confirmação.',true)}
     setSignup(false);
   }else{await setPersistence(auth,browserLocalPersistence);await signInWithEmailAndPassword(auth,email,password);setPassword('')}
  }catch(e){notify('Não foi possível concluir: '+safeError(e),true)}finally{setBusy(false)}};
 const requestApproval=async()=>{if(!db||!user||roleDisabled)return;setBusy(true);notify('');try{
   await user.reload();await user.getIdToken(true);setVerified(user.emailVerified);
   if(!user.emailVerified){notify('Você ainda precisa confirmar seu e-mail. Confira também a pasta de spam.',true);return;}
   const path=doc(db,'access_requests',user.uid);
   const previous=await getDoc(path);
   if(!previous.exists())await setDoc(path,{email:user.email||'',status:'pending',requestedAt:serverTimestamp()});
   else if(previous.data().status==='denied')await updateDoc(path,{status:'pending',requestedAt:serverTimestamp()});
   else return notify('Seu pedido já foi enviado. Aguarde o administrador.');
   notify('Solicitação de acesso enviada. Aguarde o administrador.');
 }catch(e){notify('Não foi possível solicitar acesso: '+safeError(e),true)}finally{setBusy(false)}};
 const resendVerification=async()=>{if(!auth?.currentUser)return;setBusy(true);notify('');try{await sendEmailVerification(auth.currentUser);notify('Enviamos outro e-mail de confirmação. Confira a caixa de entrada e spam.')}catch(e){notify('Falha ao enviar confirmação: '+safeError(e),true)}finally{setBusy(false)}};
 const resetModal=()=>{setModal(null);setEditing(null);setPreview([]);setModelPhoto('');setModelPhotoChanged(false);setModelPhotoError('');setModelSaveMessage('');if(modelCameraInput.current)modelCameraInput.current.value='';if(modelGalleryInput.current)modelGalleryInput.current.value=''};
 const add=()=>{setEditing(null);setName('');setReference('');setPending(false);setModelPhoto('');setModelPhotoChanged(false);setModelPhotoError('');setModelSaveMessage('');setModal('add')};
 const edit=(m:Model)=>{setEditing(m);setName(m.name);setReference(m.reference);setPending(!!m.pendingReview);setModelPhoto(m.imageData||'');setModelPhotoChanged(false);setModelPhotoError('');setModelSaveMessage('');setModal('edit')};
 const chooseModelPhoto=async(file?:File)=>{if(!file)return;setModelPhotoBusy(true);setModelPhotoError('');try{const result=await optimizePhoto(file);setModelPhoto(result);setModelPhotoChanged(true)}catch(e){setModelPhotoError(safeError(e))}finally{setModelPhotoBusy(false)}};
 const modelSaveError=(value:unknown)=>{
  const code=String((value as {code?:unknown})?.code||'');
  if(code.includes('permission-denied'))return 'O Firebase recusou a gravação. Confira se seu perfil é Administrador/Editor e se tem permissão para o Catálogo. Código: permission-denied.';
  if(code.includes('unauthenticated'))return 'Sua sessão expirou. Entre novamente no sistema e tente salvar.';
  if(code.includes('unavailable')||code.includes('deadline-exceeded'))return 'Não foi possível alcançar o Firebase. Verifique a conexão e tente novamente.';
  if(code.includes('resource-exhausted'))return 'O limite de gravação do Firebase foi atingido. Tente novamente mais tarde.';
  if(code.includes('already-exists'))return 'Já existe um modelo com esse nome. Atualize o catálogo para conferir.';
  const message=safeError(value);
  return code?`${message} (código: ${code})`:message;
 };
 const save=async()=>{
  if(modelSaveInFlight.current)return;
  if(!db){const message='O Firebase não está configurado neste site. Confira as variáveis VITE_FIREBASE_* da publicação.';setModelSaveMessage(message);notify(message,true);return;}
  if(!user){const message='Sua sessão não está ativa. Entre novamente no sistema.';setModelSaveMessage(message);notify(message,true);return;}
  if(!editor||!permitted('catalog')){const message='Seu perfil não tem permissão de edição no Catálogo de modelos. Peça ao administrador para liberar esse acesso.';setModelSaveMessage(message);notify(message,true);return;}
  if(modelPhotoBusy){const message='A foto ainda está sendo preparada. Aguarde terminar antes de salvar.';setModelSaveMessage(message);notify(message,true);return;}
  const clean=name.trim();
  if(!clean){const message='Informe o nome do modelo.';setModelSaveMessage(message);notify(message,true);return;}
  if(clean.length>250){const message='O nome do modelo deve ter no máximo 250 caracteres.';setModelSaveMessage(message);notify(message,true);return;}
  if(models.some(m=>m.id!==editing?.id&&sameModel(m.name,clean))){const message='Já existe um modelo com esse nome.';setModelSaveMessage(message);notify(message,true);return;}
  const newKey=modelKey(clean);
  if(!newKey){const message='Nome inválido. Informe letras ou números no nome do modelo.';setModelSaveMessage(message);notify(message,true);return;}
  const newRef=normalizeReference(reference);
  if(newRef.length>200){const message='A referência ultrapassa o limite de 200 caracteres.';setModelSaveMessage(message);notify(message,true);return;}
  if(modelPhotoChanged&&modelPhoto.length>90000){const message='A foto compactada ultrapassou o limite aceito pelo Firebase. Escolha uma imagem menor.';setModelSaveMessage(message);notify(message,true);return;}
  const fields={name:clean,reference:newRef,pendingReview:pending,updatedBy:user.uid,updatedAt:serverTimestamp(),...(modelPhotoChanged?{imageData:modelPhoto}:{})};
  modelSaveInFlight.current=true;setModelSaveMessage('');setBusy(true);
  try{
   if(editing){const oldSnap=await getDoc(doc(db,'models',editing.id));if(!oldSnap.exists())throw Error('Este modelo foi removido. Atualize a página.');const oldUpdated=oldSnap.data().updatedAt?.toDate?.()?.toISOString?.();if(oldUpdated!==editing.updatedAt)throw Error('Alguém modificou esse modelo. Atualize a listagem e tente novamente.');const batch=writeBatch(db);if(editing.id!==newKey){const duplicate=await getDoc(doc(db,'models',newKey));if(duplicate.exists())throw Error('Já existe um cadastro com esse nome.');batch.set(doc(db,'models',newKey),{...fields,imageData:modelPhotoChanged?modelPhoto:(oldSnap.data().imageData||''),createdAt:oldSnap.data().createdAt||serverTimestamp(),createdBy:oldSnap.data().createdBy||user.uid});batch.delete(doc(db,'models',editing.id))}else batch.update(doc(db,'models',editing.id),fields);batch.set(doc(collection(db,'audit_log')),makeAudit(user,'editou',clean,asPlain(editing),{name:clean,reference:newRef,pendingReview:pending}));await batch.commit();notify('Modelo atualizado.')}else{
    // A criação do modelo não depende do histórico. Em versões anteriores,
    // o batch incluía models + audit_log; se a regra do histórico estivesse
    // desatualizada, o Firestore cancelava as duas gravações e o modelo não entrava.
    const modelRef=doc(db,'models',newKey);
    await runTransaction(db,async transaction=>{
      const found=await transaction.get(modelRef);
      if(found.exists())throw Object.assign(new Error('Esse modelo já existe.'),{code:'already-exists'});
      transaction.set(modelRef,{...fields,createdAt:serverTimestamp(),createdBy:user.uid});
    });
    let auditWarning='';
    try{
      await setDoc(doc(collection(db,'audit_log')),makeAudit(user,'adicionou',clean,null,{name:clean,reference:newRef,pendingReview:pending}));
    }catch(auditError){
      auditWarning=` O modelo foi salvo, mas o histórico não foi atualizado: ${modelSaveError(auditError)}`;
    }
    resetModal();
    notify(auditWarning?`Modelo adicionado com sucesso.${auditWarning}`:'Modelo adicionado com sucesso.');
    return;
   }
   resetModal();
  }catch(e){
   const message=modelSaveError(e);
   setModelSaveMessage(message);
   notify(message,true);
  }finally{
   modelSaveInFlight.current=false;
   setBusy(false);
  }
 };
 const bulkDeleteModels=async(chosen:Model[]):Promise<number>=>{
  if(!db||!user||!editor)throw Error('Sem permissão para excluir modelos.');
  if(!chosen.length)return 0;
  let deleted=0;
  for(let start=0;start<chosen.length;start+=4){
    const chunk=chosen.slice(start,start+4);
    // Não excluir modelos alterados por outro usuário desde a seleção.
    for(const m of chunk){
      const latest=await getDocFromServer(doc(db,'models',m.id));
      if(!latest.exists())throw Error(`${deleted} excluído(s). O modelo ${m.name} não existe mais; atualize a página.`);
      const last=latest.data().updatedAt?.toDate?.()?.toISOString?.()||'';
      if(last!==m.updatedAt)throw Error(`${deleted} excluído(s). ${m.name} foi alterado por outra pessoa. Atualize o catálogo antes de continuar.`);
    }
    const batch=writeBatch(db);
    for(const m of chunk){
      batch.delete(doc(db,'models',m.id));
      batch.set(doc(collection(db,'audit_log')),makeAudit(user,'excluiu_em_lote',m.name,asPlain(m),null));
    }
    try{await batch.commit();deleted+=chunk.length;}
    catch(e){throw Error(`${deleted} excluído(s) antes da falha. ${safeError(e)}. Atualize a página para conferir.`);}
  }
  notify(`${deleted} modelo(s) excluído(s). As OCs permanecem intactas.`);
  return deleted;
 };
 const remove=async()=>{if(!db||!user||!editor||!editing)return;setBusy(true);try{const snap=await getDoc(doc(db,'models',editing.id));if(!snap.exists())throw Error('Modelo não encontrado.');if(snap.data().updatedAt?.toDate?.()?.toISOString?.()!==editing.updatedAt)throw Error('Modelo atualizado por outra pessoa. Atualize a lista.');const batch=writeBatch(db);batch.delete(doc(db,'models',editing.id));batch.set(doc(collection(db,'audit_log')),makeAudit(user,'excluiu',editing.name,asPlain(editing),null));await batch.commit();notify('Modelo excluído.');resetModal()}catch(e){notify(safeError(e),true)}finally{setBusy(false)}};
 const readImport=async(file:File)=>{try{let raw:any[]=[];if(file.name.toLowerCase().endsWith('.json')){const arr=JSON.parse(await file.text());if(!Array.isArray(arr))throw Error('O JSON deve conter uma lista.');raw=arr}else{const XLSX=await import('xlsx');const wb=XLSX.read(await file.arrayBuffer(),{type:'array'});const s=wb.SheetNames.find(x=>/TODOS OS MODELOS|POR REF|MODELOS UNICOS/i.test(x))||wb.SheetNames[0];raw=XLSX.utils.sheet_to_json(wb.Sheets[s],{defval:''})}const seen=new Set<string>();const items:ImportRow[]=[];for(const item of raw){const keys=Object.keys(item);const nk=keys.find(k=>/^(MODELO|NOME|NAME|nome do modelo)/i.test(k.trim()))||keys.find(k=>/modelo/i.test(k));const rk=keys.find(k=>/REFER[EÊ]NCIA|C[OÓ]DIGO EXTRA|^ref$/i.test(k));const name=String(item[nk||'name']||item.name||'').trim();if(!name||/^modelo\s*\(/i.test(name)||seen.has(modelKey(name)))continue;seen.add(modelKey(name));const reference=normalizeReference(String(item[rk||'reference']||item.reference||''));const existing=models.find(m=>sameModel(m.name,name));const pendingReview=Boolean(item.pendingReview||item['PENDÊNCIA']||item.pendente);items.push({name,reference,pendingReview,exists:!!existing,action:existing?'skip':'add'})}setPreview(items);setImportMode('add');notify(`${items.length} modelos encontrados; ${items.filter(x=>x.exists).length} já cadastrados.`)}catch(e){notify(`Erro ao ler arquivo: ${safeError(e)}`,true)}};
 const applyImport=async()=>{if(!db||!user||!editor)return;const chosen=preview.filter(x=>x.action!=='skip');if(!chosen.length)return notify('Nenhum registro selecionado.',true);setBusy(true);try{let count=0;for(let i=0;i<chosen.length;i+=180){const batch=writeBatch(db);for(const row of chosen.slice(i,i+180)){const old=models.find(m=>sameModel(m.name,row.name));const key=old?.id||modelKey(row.name);const content={name:old?.name||row.name,reference:row.reference,pendingReview:row.pendingReview,updatedBy:user.uid,updatedAt:serverTimestamp()};if(old&&row.action==='update'){batch.update(doc(db,'models',old.id),content);batch.set(doc(collection(db,'audit_log')),makeAudit(user,'importou_atualizacao',old.name,asPlain(old),{name:content.name,reference:content.reference,pendingReview:content.pendingReview}))}else if(!old){batch.set(doc(db,'models',key),{...content,createdAt:serverTimestamp(),createdBy:user.uid});batch.set(doc(collection(db,'audit_log')),makeAudit(user,'importou',row.name,null,{name:content.name,reference:content.reference,pendingReview:content.pendingReview}))}count++}await batch.commit()}notify(`${count} registros processados.`);resetModal()}catch(e){notify(`Falha na importação: ${safeError(e)}`,true)}finally{setBusy(false)}};
 const loadAudit=async()=>{if(!db||!admin)return;setModal('history');try{const s=await getDocs(fsQuery(collection(db,'audit_log'),orderBy('at','desc')));setAudit(s.docs.slice(0,150).map(d=>({id:d.id,...d.data()} as Audit)))}catch(e){notify(safeError(e),true)}};
 const loadUsers=()=>{if(admin)setModal('users')};
 if(!serviceConfigured)return <div className="auth-shell"><div className="auth-card"><img className="brand-logo auth-logo" src={brandLogo} alt="MB DryFit" /><h1>MB REFERENCIAS</h1><p>O serviço de dados ainda não está configurado. Confira as configurações de publicação do site.</p><div className="notice warning"><AlertCircle size={18}/> O site não aceita cadastro sem uma conexão segura.</div></div></div>;
 if(bootError)return <StartupRecovery reason={bootError} />;
 if(!authReady||(user&&!roleChecked))return bootTimedOut?<StartupRecovery reason="O navegador não concluiu a entrada ou a leitura das permissões. A conexão pode estar instável ou o aplicativo pode estar usando arquivos antigos." />:<BrandLoading label="Carregando MB REFERENCIAS..." />;
 if(!user)return <div className="auth-shell"><section className="auth-card"><img className="brand-logo auth-logo" src={brandLogo} alt="MB DryFit" /><span className="eyebrow">CONTAS COM APROVAÇÃO</span><h1>MB REFERENCIAS</h1><p>{recover?'Recuperar senha':signup?'Crie sua conta. O administrador precisa aprová-la antes do acesso.':'Entre com e-mail e senha. Novas contas precisam de aprovação.'}</p><form onSubmit={submitAuth}>
  <label>E-mail<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="seu@email.com"/></label>
  {!recover&&<label>Senha<div className="password-wrap"><input required minLength={signup?8:undefined} autoComplete={signup?'new-password':'current-password'} type={showPassword?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={signup?'Mínimo 8 caracteres':'Sua senha'}/><button type="button" className="password-toggle" onClick={()=>setShowPassword(!showPassword)}>{showPassword?'Ocultar':'Mostrar'}</button></div></label>}
  {signup&&<label>Repita a senha<input required type={showPassword?'text':'password'} autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)}/></label>}
  <button className="primary-button full" disabled={busy}>{busy?'Aguarde…':recover?'Enviar recuperação':signup?'Criar conta e solicitar acesso':'Entrar no sistema'}</button></form>
  <div className="auth-switch"><button type="button" className="text-button" onClick={()=>{setRecover(false);setSignup(!signup);notify('')}}>{signup?'Já tenho conta':'Criar minha conta'}</button><button type="button" className="text-button" onClick={()=>{setRecover(!recover);setSignup(false);notify('')}}>{recover?'Voltar ao login':'Esqueceu sua senha?'}</button></div>
  {error&&<div className="notice warning"><AlertCircle size={18}/>{error}</div>}{info&&<div className="notice"><CheckCircle2 size={18}/>{info}</div>}
  <div className="auth-foot"><ShieldCheck size={15}/> Cadastro gratuito. Acesso liberado somente por administrador.</div></section></div>;
 if(!role)return <div className="auth-shell"><section className="auth-card"><div className="brand-mark">MB</div><h1>{roleDisabled?'Acesso bloqueado':accessRequest==='denied'?'Solicitação recusada':accessRequest==='pending'?'Aguardando aprovação':'Sua conta ainda não tem acesso'}</h1>
  <p>{roleDisabled?'O administrador desativou o acesso desta conta. Entre em contato com ele.':!verified?'Confira seu e-mail e clique no link de confirmação para solicitar acesso.':accessRequest==='denied'?'Sua solicitação não foi aprovada. Você pode solicitar novamente.':accessRequest==='pending'?'Sua solicitação foi enviada. Quando o administrador aprovar, o sistema abrirá automaticamente.':'Sua conta está verificada. Envie seu pedido para o administrador liberar as áreas.'}</p>
  <p><strong>{user.email}</strong></p>
  {!roleDisabled&&(!verified||accessRequest!=='pending')&&<button className="primary-button full" disabled={busy} onClick={()=>void requestApproval()}>{busy?'Conferindo…':verified?'Solicitar aprovação':'Já confirmei meu e-mail'}</button>}
  {!roleDisabled&&!verified&&<button className="outline-button full" disabled={busy} onClick={()=>void resendVerification()}>Reenviar confirmação</button>}
  {error&&<div className="notice warning"><AlertCircle size={18}/>{error}</div>}{info&&<div className="notice"><CheckCircle2 size={18}/>{info}</div>}
  <button className="outline-button full" onClick={()=>auth&&signOut(auth)}>Sair da conta</button>
  </section></div>;
 if(!admin&&!access.length)return <div className="auth-shell"><section className="auth-card"><h1>Sem telas autorizadas</h1><p>Peça ao administrador para liberar seu acesso.</p><button onClick={()=>auth&&signOut(auth)} className="primary-button">Sair</button></section></div>;
 if(!permitted(view))return <div className="auth-shell"><section className="auth-card">
   <img className="brand-logo auth-logo" src={brandLogo} alt="MB DryFit"/>
   <h1>Área não disponível</h1>
   <p>Seu acesso não inclui esta tela. Se acabou de receber uma nova permissão, atualize o aplicativo.</p>
   {availableViews.length>0?<button type="button" className="primary-button full" onClick={()=>navigateView(availableViews[0])}>Abrir minha área</button>:<button type="button" className="primary-button full" onClick={()=>window.location.reload()}>Atualizar aplicativo</button>}
   <button type="button" className="outline-button full" onClick={()=>auth&&signOut(auth)}>Sair da conta</button>
 </section></div>;
 return <div className="app-shell">
 {mobileMoreOpen&&<button type="button" className="sidebar-scrim" aria-label="Fechar menu lateral" onClick={()=>setMobileMoreOpen(false)}/>}
 <aside id="app-navigation" className={`sidebar ${mobileMoreOpen?'mobile-open':''}`} aria-label="Menu principal">
  <div className="sidebar-brand"><img className="brand-logo sidebar-logo" src={brandLogo} alt="MB DryFit"/><div><strong>MB REFERENCIAS</strong><span>GESTÃO DE MODELOS E PRODUÇÃO</span></div><button type="button" className="sidebar-close" aria-label="Fechar menu" onClick={()=>setMobileMoreOpen(false)}><X size={20}/></button></div>
  <nav className="sidebar-links" aria-label="Áreas do sistema">
   {navGroups.map(group=>{
    const items=group.items.filter(item=>availableViews.includes(item));
    if(!items.length)return null;
    return <div key={group.label} className="sidebar-nav-group">
     <span className="nav-label">{group.label}</span>
     {items.map(item=>{const Icon=navMeta[item].Icon;return <button type="button" key={item} className={`nav-item ${view===item?'active':''}`} aria-current={view===item?'page':undefined} onClick={()=>navigateView(item)}><Icon size={19}/><span>{navMeta[item].label}</span>{view===item&&<i className="nav-active-indicator"/>}</button>})}
    </div>;
   })}
   {admin&&<div className="sidebar-nav-group">
    <span className="nav-label nav-admin-label">ADMINISTRAÇÃO</span>
    <button type="button" className="nav-item" onClick={()=>{setMobileMoreOpen(false);void loadUsers();}}><Users size={19}/><span>Usuários e acessos</span></button>
    <button type="button" className="nav-item" onClick={()=>{setMobileMoreOpen(false);void loadAudit();}}><History size={19}/><span>Histórico de alterações</span></button>
   </div>}
  </nav>
  <div className="sidebar-bottom"><div className="sidebar-sync"><span className={`status-dot ${sync==='online'?'green':'red'}`}/><span>{sync==='online'?'Sincronizado':'Conexão indisponível'}</span></div><div className="user-mini"><div className="avatar">{user.email?.slice(0,1).toUpperCase()}</div><div className="user-meta"><strong>{user.email}</strong><span>{roleLabel[role]}</span></div><button onClick={()=>auth&&signOut(auth)} title="Sair da conta" aria-label="Sair da conta"><LogOut size={17}/></button></div></div>
 </aside>
 <main className="main-content">
     <header className="topbar">
       <div className="mobile-brand"><button type="button" className="mobile-menu-toggle" aria-label="Abrir menu lateral" aria-controls="app-navigation" aria-expanded={mobileMoreOpen} onClick={()=>setMobileMoreOpen(true)}><Menu size={22}/></button><img className="brand-logo mobile-logo" src={brandLogo} alt="MB DryFit"/><strong>MB REFERENCIAS</strong></div>
       <div className="breadcrumb"><span>Área de trabalho</span><i>/</i><strong>{navMeta[view].label}</strong></div>
       <div className="top-actions"><span className={`connection-pill ${sync==='online'?'ok':''}`}><Cloud size={15}/><span>{sync==='online'?'Tudo sincronizado':'Verificar conexão'}</span></span><button className="icon-button" onClick={()=>setDark(!dark)} title={dark?'Ativar tema claro':'Ativar tema escuro'} aria-label="Alternar tema">{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button className="icon-button top-logout" title="Sair" aria-label="Sair" onClick={()=>auth&&signOut(auth)}><LogOut size={18}/></button></div>
     </header>
     {visitedViews.filter(permitted).map(item=><div key={item} className={`view-transition ${view===item?`view-transition-${transitionDirection}`:'view-parked'}`} hidden={view!==item} aria-hidden={view!==item}>
       <PageActiveContext.Provider value={view===item}>
         <Suspense fallback={view===item?<BrandLoading label="Preparando esta área..." />:null}>
           {item==='sheets'||item==='sheet_distribution' ? <ProductionSheets db={db!} user={user} catalogModels={models} canEdit={editor&&permitted('sheets')} canDistribute={editor&&permitted('sheet_distribution')} canViewOrders={permitted('orders')} isAdmin={admin} initialTab={item==='sheet_distribution'?'distribution':'create'}/> : item==='enfesto' ? <EnfestoPage db={db!} user={user} companyId={companyId} canEdit={editor&&permitted('enfesto')} isAdmin={admin}/> : item==='orders' ? <CutOrders db={db!} user={user} canEdit={editor&&permitted('orders')} isAdmin={admin}/> : item==='purchases' ? <PurchasesStock db={db!} user={user} canEdit={editor&&permitted('purchases')} canConsume={editor&&(permitted('purchases')||permitted('cuts'))} companyId={companyId}/> : item==='expenses' ? <ExpensesPage db={db!} user={user} canEdit={editor&&permitted('expenses')}/> : item==='info' ? <InfoPage db={db!} user={user} canEdit={editor&&permitted('info')}/> : item==='workshops' ? <WorkshopsPage db={db!} user={user} canEdit={editor&&permitted('workshops')}/> : item==='prices' ? <ReferencePrices db={db!} user={user} canEdit={editor&&permitted('prices')}/> : item==='samples' ? <SamplesAndCuts db={db!} user={user} models={models} isAdmin={admin} canViewSamples={admin||access.includes('samples')} canViewCuts={admin||access.includes('cuts')} canEditSamples={editor&&(admin||access.includes('samples'))} canEditCuts={editor&&(admin||access.includes('cuts'))} canReadOrders={permitted('orders')}/> : item==='catalog' ?
             <ModelPhotos db={db!} user={user} canEdit={editor&&permitted('catalog')} models={models} loaded={loaded} onAddModel={add} onEditModel={edit} onDeleteModel={m=>{setEditing(m);setModal('delete')}} onBackup={()=>setBackupOpen(true)} onBulkDeleteModels={bulkDeleteModels}/>
             : null}
         </Suspense>
       </PageActiveContext.Provider>
     </div>)}
   </main>
   {backupOpen&&<Suspense fallback={<div className="empty-state">Preparando backup...</div>}><BackupExport db={db!} models={models} admin={admin} onClose={()=>setBackupOpen(false)}/></Suspense>}
 {(error||info)&&<div className={`toast ${error?'error':'success'}`}><span>{error?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>}</span>{error||info}<button onClick={()=>notify('')}><X size={16}/></button></div>}
 {modal&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)resetModal()}}><section className={`modal ${modal==='import'||modal==='users'||modal==='history'?'modal-wide':''}`} role="dialog" aria-modal="true">
 {(modal==='add'||modal==='edit')&&<><div className="modal-head"><div><span className="eyebrow">CADASTRO ONLINE</span><h2>{modal==='add'?'Novo modelo':'Editar modelo'}</h2><p>Nome, REF e foto no mesmo cadastro. A foto é opcional e pode ser adicionada depois.</p></div><button className="icon-button" onClick={resetModal}><X/></button></div><form className="modal-form" onSubmit={e=>{e.preventDefault();void save()}}>
      <label>Nome do modelo *<input autoFocus required value={name} onChange={e=>{setName(e.target.value);setModelSaveMessage('')}} placeholder="Ex.: BERM DRY NIKE SIMB BAS R.L"/></label>
      <label>Código Extra (REF)<input value={reference} onChange={e=>{setReference(e.target.value);setModelSaveMessage('')}} placeholder="REF.10359 ou 10359"/><small>Modelos diferentes podem ter a mesma referência.</small></label>
      <div className="new-model-photo-section">
        <span className="new-model-photo-title"><ImagePlus size={17}/> Foto do modelo (opcional)</span>
        <div className="new-model-photo-preview">{(modelPhoto||(!modelPhotoChanged&&editing?.fallbackImageData))?<img src={modelPhoto||editing?.fallbackImageData} alt="Prévia da foto do modelo"/>:<div className="new-model-photo-empty"><ImagePlus size={30}/><span>Escolha uma foto da peça</span></div>}</div>
        <div className="sample-photo-choices model-photo-choices">
          <button type="button" className="outline-button" disabled={modelPhotoBusy||busy} onClick={()=>modelCameraInput.current?.click()}><Camera size={16}/> Câmera</button>
          <button type="button" className="outline-button" disabled={modelPhotoBusy||busy} onClick={()=>modelGalleryInput.current?.click()}><ImagePlus size={16}/> Galeria</button>
        </div>
        <input ref={modelCameraInput} type="file" accept="image/*" capture="environment" hidden disabled={modelPhotoBusy||busy} onChange={e=>{void chooseModelPhoto(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/>
        <input ref={modelGalleryInput} type="file" accept="image/*" hidden disabled={modelPhotoBusy||busy} onChange={e=>{void chooseModelPhoto(e.currentTarget.files?.[0]);e.currentTarget.value=''}}/>
        {modelPhotoBusy&&<small>Otimizando a imagem para salvar...</small>}
        {modelPhotoError&&<div className="production-alert" role="alert">{modelPhotoError}</div>}
        {modelPhoto&&<button type="button" className="outline-button" disabled={modelPhotoBusy||busy} onClick={()=>{setModelPhoto('');setModelPhotoChanged(true)}}><Trash2 size={15}/> Remover foto selecionada</button>}
        <small>Use a câmera para fotografar a peça ou a galeria para escolher uma imagem. Uma foto principal por modelo; a imagem é compactada antes de salvar.</small>
      </div>
      <label className="check-row"><input type="checkbox" checked={pending} onChange={e=>setPending(e.target.checked)}/> Pendente de conferência</label>
      {modelSaveMessage&&<div className="production-alert" role="alert" aria-live="assertive">{modelSaveMessage}</div>}
      <div className="modal-actions"><button type="button" className="outline-button" onClick={resetModal}>Cancelar</button><button type="submit" className="primary-button" disabled={busy||modelPhotoBusy}>{modelPhotoBusy?'Preparando foto...':busy?'Salvando…':'Salvar modelo'}</button></div></form></>}
 {modal==='delete'&&<><div className="modal-head"><div><h2>Excluir modelo?</h2><p>Esta ação será sincronizada entre todos os usuários.</p></div><button className="icon-button" onClick={resetModal}><X/></button></div><div className="delete-preview"><strong>{editing?.name}</strong><span>{editing?.reference||'SEM CÓDIGO'}</span></div><div className="modal-actions"><button className="outline-button" onClick={resetModal}>Cancelar</button><button className="danger-button" disabled={busy} onClick={()=>void remove()}><Trash2 size={16}/> {busy?'Excluindo…':'Confirmar exclusão'}</button></div></>}
 {modal==='import'&&<><div className="modal-head"><div><h2>Importar modelos</h2><p>Escolha o Excel ou CSV atualizado; não é preciso colocar o catálogo no GitHub.</p></div><button className="icon-button" onClick={resetModal}><X/></button></div><div className="import-body"><label className="file-drop"><Upload size={24}/><strong>Selecione XLSX, XLS, CSV ou JSON</strong><span>Os dados serão enviados ao sistema após sua confirmação.</span><input type="file" accept=".xlsx,.xls,.csv,.json" onChange={e=>{const f=e.target.files?.[0];if(f)void readImport(f);e.currentTarget.value=''}}/></label><label>Para modelos existentes<select value={importMode} onChange={e=>{const mode=e.target.value as 'add'|'update';setImportMode(mode);setPreview(p=>p.map(r=>({...r,action:r.exists?(mode==='update'?'update':'skip'):'add'})))}}><option value="add">Não substituir os existentes</option><option value="update">Atualizar nomes existentes</option></select></label><div className="notice"><CheckCircle2 size={18}/> {preview.length} modelos identificados; {preview.filter(p=>p.action==='add').length} novos; {preview.filter(p=>p.action==='update').length} para atualizar.</div>{preview.length>0&&<><div className="preview-list"><table><thead><tr><th>MODELO</th><th>REF</th><th>AÇÃO</th></tr></thead><tbody>{preview.slice(0,120).map((p,i)=><tr key={i}><td>{p.name}</td><td>{p.reference||'SEM CÓDIGO'}</td><td>{p.action}</td></tr>)}</tbody></table></div><button className="primary-button full" disabled={busy||!editor} onClick={()=>void applyImport()}>{busy?'Importando…':'Confirmar importação'}</button></>}</div><div className="modal-actions"><button className="outline-button" onClick={resetModal}>Fechar</button></div></>}
 {modal==='users'&&<><div className="modal-head"><div><h2>Contas e permissões</h2><p>Aprove novos cadastros, defina acessos e bloqueie usuários no plano gratuito.</p></div><button className="icon-button" onClick={resetModal}><X/></button></div><Suspense fallback={<div className="empty-state">Carregando usuários...</div>}><AccountsAdmin selfUid={user.uid} companyId={companyId}/></Suspense><div className="modal-actions"><button className="outline-button" onClick={resetModal}>Fechar</button></div></>}
 {modal==='history'&&<><div className="modal-head"><div><h2>Histórico</h2><p>Eventos registrados no sistema (acesso de administrador).</p></div><button className="icon-button" onClick={resetModal}><X/></button></div><div className="history-list">{audit.length?audit.map(a=><article className="history-item" key={a.id}><div className="history-icon"><History size={18}/></div><div><strong>{a.action} — {a.modelName}</strong><p>{a.actorEmail} · {a.at?.toDate?.()?.toLocaleString('pt-BR')||'Data pendente'}</p><details><summary>Detalhes</summary><pre>{JSON.stringify({antes:a.before,depois:a.after},null,2)}</pre></details></div></article>):<div className="empty-state"><History/><strong>Nenhum evento encontrado</strong></div>}</div><div className="modal-actions"><button className="outline-button" onClick={resetModal}>Fechar</button></div></>}
 </section></div>}
 </div>;
}
