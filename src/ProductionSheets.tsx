import { useContext, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, CheckCircle2, ChevronDown, Clock3, FileText, PackageCheck, Printer, Search, Send } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import { collection, doc, getDocs, onSnapshot, query as firestoreQuery, serverTimestamp, setDoc, updateDoc, where, writeBatch, type Firestore } from 'firebase/firestore';
import {KEY,TYPES,TAILORS,canSewType,normalizedGarmentType,parsePrice,currency,priceWithMauroMinimum} from './lib/referencePrices';
import { safeProviderMessage } from './lib/safeMessage';
import SheetPrint from './SheetPrint';
import ProductionCleanup from './ProductionCleanup';
import {garmentTypeFromCatalog,lookupReference,normalizeColorName,normalizeReferenceNumber,upperField,type RefCatalogModel} from './lib/sheetCatalogAutofill';
import { PageActiveContext } from './lib/pageMemory';
import {nextProductionOc} from './lib/sheetOcSequence';
import { workshopKey, canonicalWorkshopName } from './lib/workshopNames';

type ColorRow = {cor:string;p:string;m:string;g:string;gg:string;xg:string;detalhes:string};
type Sheet = {id:string;createdBy:string;model:string;reference:string;client?:string;pieceType?:string;fabric?:string;composition:string;trims:string;officeInstructions:string;oc:string;withdrawalDate:string;volumes?:string;tailorInstructions:string;finishingInstructions:string;colors:ColorRow[];status:'draft'|'enfesto'|'pending'|'assigned';assignedTailor:string};
type FormData = Omit<Sheet,'id'|'status'|'assignedTailor'|'createdBy'>;
const blankRow=():ColorRow=>({cor:'',p:'',m:'',g:'',gg:'',xg:'',detalhes:''});
const validQuantities=(rows:ColorRow[])=>rows.every(r=>(['p','m','g','gg','xg'] as const).every(k=>!r[k].trim()||(/^\d+$/.test(r[k].trim())&&Number.isSafeInteger(Number(r[k])))));
const todayInputFromDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayInput=()=>todayInputFromDate(new Date());
const displayDate=(raw:string)=>/^\d{4}-\d{2}-\d{2}$/.test(raw)?`${raw.slice(8,10)}/${raw.slice(5,7)}/${raw.slice(0,4)}`:raw;
const compareOcDesc=(a:{oc:string},b:{oc:string})=>{
 const digits=(oc:string)=>(String(oc||'').match(/\d+/)?.[0]||'').replace(/^0+/,'')||'0';
 const aHas=/\d/.test(a.oc||''),bHas=/\d/.test(b.oc||'');
 if(aHas&&bHas){
   const left=digits(a.oc),right=digits(b.oc);
   if(left.length!==right.length)return right.length-left.length;
   if(left!==right)return right.localeCompare(left);
 }else if(aHas!==bHas)return aHas?-1:1;
 return String(b.oc||'').localeCompare(String(a.oc||''),'pt-BR',{numeric:true,sensitivity:'base'});
};
const storedColorsKey=(uid:string)=>'mb-referencias-colors-'+uid;
const readStoredColors=(uid:string):string[]=>{
 try{const saved=JSON.parse(localStorage.getItem(storedColorsKey(uid))||'[]');return Array.isArray(saved)?saved.filter((v):v is string=>typeof v==='string').slice(0,200):[];}catch{return [];}
};
const uppercaseSheetForm=(sheet:FormData):FormData=>({...sheet,model:upperField(sheet.model),reference:normalizeReferenceNumber(sheet.reference),client:upperField(sheet.client||'MB'),pieceType:upperField(sheet.pieceType||''),fabric:upperField(sheet.fabric||''),composition:upperField(sheet.composition),trims:upperField(sheet.trims),officeInstructions:upperField(sheet.officeInstructions),oc:upperField(sheet.oc),tailorInstructions:upperField(sheet.tailorInstructions),finishingInstructions:upperField(sheet.finishingInstructions),colors:sheet.colors.map(row=>({...row,cor:normalizeColorName(row.cor),detalhes:upperField(row.detalhes)}))});
const blank=():FormData=>({client:'MB',model:'',reference:'',pieceType:'',fabric:'',composition:'',trims:'',officeInstructions:'',oc:'',withdrawalDate:'',volumes:'',tailorInstructions:'',finishingInstructions:'',colors:[blankRow(),blankRow(),blankRow(),blankRow(),blankRow(),blankRow(),blankRow(),blankRow()]});
export default function ProductionSheets({db,user,catalogModels,canEdit,canDistribute,canViewOrders,isAdmin,initialTab}:{db:Firestore;user:User;catalogModels:RefCatalogModel[];canEdit:boolean;canDistribute:boolean;canViewOrders:boolean;isAdmin:boolean;initialTab:'create'|'distribution'}) {
 const active=useContext(PageActiveContext);
 const [tab,setTab]=useState<'create'|'drafts'|'all'|'distribution'|'sent'>(initialTab);
 const [form,setForm]=useState<FormData>(blank);
 const [ocAuto,setOcAuto]=useState(true);
 const [lastCreatedOc,setLastCreatedOc]=useState('754');
 const [orderOcs,setOrderOcs]=useState<string[]>([]);
 const [orderStatuses,setOrderStatuses]=useState<Record<string,string>>({});
 const [phaseFilter,setPhaseFilter]=useState<'all'|'enfesto'|'office'|'done'>('all');
 const referenceOptions=useMemo(()=>[...new Set(catalogModels.map(m=>normalizeReferenceNumber(m.reference)).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})),[catalogModels]);
 const referenceMatch=lookupReference(catalogModels,form.reference);
 // O catálogo carrega assincronamente: preencher uma REF digitada antes da leitura.
 useEffect(()=>{
  const match=lookupReference(catalogModels,form.reference);
  if(!match.suggestedName)return;
  setForm(old=>old.model?old:{...old,model:match.suggestedName,pieceType:old.pieceType||match.suggestedType});
 },[catalogModels,form.reference]);
 const changeReference=(raw:string)=>{
   const reference=normalizeReferenceNumber(raw);
   const matched=lookupReference(catalogModels,reference);
   setForm(old=>({...old,reference,model:matched.suggestedName,pieceType:matched.suggestedType}));
 };
 const chooseCatalogModel=(name:string)=>{
   const model=upperField(name);
   setForm(old=>({...old,model,pieceType:garmentTypeFromCatalog(model)}));
 };
 const [sheets,setSheets]=useState<Sheet[]>([]);
 const nextOc=useMemo(()=>nextProductionOc(sheets,orderOcs.map(oc=>({oc})),[{oc:lastCreatedOc}]),[sheets,orderOcs,lastCreatedOc]);

 const [pieceType,setPieceType]=useState<Record<string,string>>({});
 const [tailor,setTailor]=useState<Record<string,string>>({});
 const [priceOverride,setPriceOverride]=useState<Record<string,string>>({});
 const [savedColors,setSavedColors]=useState<string[]>(()=>readStoredColors(user.uid));
 const [prices,setPrices]=useState<{reference:string;type:string;price:string}[]>([]);const [workshops,setWorkshops]=useState<{name:string;types:string[];specialPrices:{reference:string;type:string;price:string}[]}[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [lastAssigned,setLastAssigned]=useState<(FormData & {assignedTailor:string;sentLabel:string})|null>(null);
 const [editingId,setEditingId]=useState<string|null>(null);
 useEffect(()=>{
  if(!canEdit||editingId||!ocAuto)return;
  setForm(current=>current.oc===nextOc?current:{...current,oc:nextOc});
 },[nextOc,ocAuto,canEdit,editingId]);

 const [historySearch,setHistorySearch]=useState('');
 const [historyOffice,setHistoryOffice]=useState('all');
 const [historyLimit,setHistoryLimit]=useState(50);
 const [distributionSearch,setDistributionSearch]=useState('');
 const [sentSearch,setSentSearch]=useState('');
 const [sendDates,setSendDates]=useState<Record<string,string>>({});
 const [printSheet,setPrintSheet]=useState<FormData & {assignedTailor:string}|null>(null);
 const print=(sheet:FormData & {assignedTailor:string})=>{setPrintSheet(sheet);};
 useEffect(()=>{if(!printSheet||!active)return;const previousTitle=document.title;document.title=`Ficha_OC_${(printSheet.oc||'sem_numero').replace(/[^a-zA-Z0-9_-]/g,'_')}`;const timeout=window.setTimeout(()=>window.print(),350);return()=>{window.clearTimeout(timeout);document.title=previousTitle};},[printSheet,active]);
 useEffect(()=>{const clear=()=>setPrintSheet(null);window.addEventListener('afterprint',clear);return()=>window.removeEventListener('afterprint',clear);},[]);
 useEffect(()=>{if(!active||(!canEdit && !canDistribute))return;return onSnapshot(collection(db,'production_sheets'),snap=>setSheets(snap.docs.map(d=>({...(d.data() as Omit<Sheet,'id'>),id:d.id,assignedTailor:canonicalWorkshopName(d.data().assignedTailor)}))),e=>setError(safeProviderMessage(e)));},[db,active,canEdit,canDistribute]);
 useEffect(()=>{
  if(!active||!canViewOrders)return;
  return onSnapshot(collection(db,'cut_orders'),snapshot=>{
   setOrderOcs(snapshot.docs.map(item=>String(item.data().oc||'')));
   setOrderStatuses(Object.fromEntries(snapshot.docs.map(item=>[item.id,String(item.data().status||'').trim().toUpperCase()])));
  },e=>setError('Não foi possível conferir o andamento das OCs: '+safeProviderMessage(e)));
 },[db,active,canViewOrders]);
 useEffect(()=>{if(!active||!canDistribute)return;return onSnapshot(collection(db,'reference_prices'),snap=>setPrices(snap.docs.map(x=>x.data() as {reference:string;type:string;price:string})),e=>setError(safeProviderMessage(e)));},[db,active,canDistribute]);
 useEffect(()=>{if(!active||!canDistribute)return;return onSnapshot(collection(db,'workshops'),snap=>setWorkshops(snap.docs.map(x=>x.data() as {name:string;types:string[];specialPrices:{reference:string;type:string;price:string}[]})),e=>setError(safeProviderMessage(e)));},[db,active,canDistribute]);
 useEffect(()=>setTab(initialTab),[initialTab]);
 useEffect(()=>setSavedColors(readStoredColors(user.uid)),[user.uid]);
 const getPrice=(sheet:Sheet,name:string,type:string)=>{
   const special=workshops
     .filter(w=>workshopKey(w.name)===workshopKey(name))
     .flatMap(w=>w.specialPrices||[])
     .find(p=>p.reference.toUpperCase()===sheet.reference.trim().toUpperCase()&&normalizedGarmentType(p.type)===type);
   // Uma exceção cadastrada pelo usuário prevalece mesmo quando for menor que R$ 6.
   if(special)return special.price;
   const standard=prices.find(p=>p.reference.toUpperCase()===sheet.reference.trim().toUpperCase()&&normalizedGarmentType(p.type)===type);
   return priceWithMauroMinimum(name,standard?.price??'');
 };
 const colorOptions=useMemo(()=>{
   const normalized=new Map<string,string>();
   for(const value of [...sheets.flatMap(sheet=>(sheet.colors||[]).map(row=>row.cor)),...savedColors]){
     const color=normalizeColorName(String(value||''));
     if(color&&color.length<=90){
       const key=color.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
       if(!normalized.has(key))normalized.set(key,color);
     }
   }
   return [...normalized.values()].sort((a,b)=>a.localeCompare(b,'pt-BR')).slice(0,250);
 },[sheets,savedColors]);
 const rememberColor=(input:string)=>{
   const color=normalizeColorName(input);
   if(!color||color.length>90)return;
   const key=color.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
   if(savedColors.some(item=>item.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR')===key))return;
   const next=[...savedColors,color].slice(-200);
   setSavedColors(next);
   try{localStorage.setItem(storedColorsKey(user.uid),JSON.stringify(next));}catch{ /* armazenamento local pode estar indisponível */ }
 };
 const field=(key:Exclude<keyof FormData,'colors'>,label:string,large=false)=> <label className="sheet-field"><strong>{label}</strong>{large?<textarea value={form[key] as string} maxLength={4000} onChange={e=>setForm(v=>({...v,[key]:upperField(e.target.value)}))}/>:<input value={form[key] as string} maxLength={key==='reference'?12:250} inputMode={key==='reference'?'numeric':undefined} pattern={key==='reference'?'[0-9]*':undefined} list={key==='reference'?'sheet-reference-options':undefined} onChange={e=>{if(key==='reference')changeReference(e.target.value);else{if(key==='oc')setOcAuto(false);setForm(v=>({...v,[key]:upperField(e.target.value)}));}}}/>}</label>;
 const save=async(status:'draft'|'enfesto')=>{if(!canEdit)return;if(status==='enfesto'&&(!form.model.trim()||!form.oc.trim()||!form.reference.trim()||!form.pieceType?.trim())){setError('Preencha o modelo, a REF, a OC e selecione o tipo de roupa antes de enviar.');return;}if(!validQuantities(form.colors)){setError('Confira as quantidades: use apenas números inteiros, sem valores negativos.');return;}if(form.volumes?.trim()&&!/^\d{1,6}$/.test(form.volumes.trim())){setError('Em VOL, digite somente a quantidade (até 6 dígitos).');return;}setBusy(true);setError('');setMessage('');try{
 if(!editingId){
  const [existingSheets,existingOrders]=await Promise.all([
    getDocs(firestoreQuery(collection(db,'production_sheets'),where('oc','==',form.oc.trim()))),
    canViewOrders?getDocs(firestoreQuery(collection(db,'cut_orders'),where('oc','==',form.oc.trim()))):Promise.resolve(null)
  ]);
  if(!existingSheets.empty||(existingOrders&&!existingOrders.empty)){
   setError('A OC '+form.oc+' já existe. Use a próxima OC disponível antes de criar outra ficha.');
   setBusy(false);return;
  }
 }
 const normalized=uppercaseSheetForm(form);const payload={...normalized,model:normalized.model.trim(),reference:normalized.reference.trim(),pieceType:normalized.pieceType||'',fabric:normalized.fabric?.trim()||'',volumes:normalized.volumes?.trim()||'',oc:normalized.oc.trim(),colors:normalized.colors.filter(r=>Object.values(r).some(v=>v.trim())).slice(0,50),status,updatedAt:serverTimestamp(),updatedBy:user.uid};if(editingId){await updateDoc(doc(db,'production_sheets',editingId),payload);}else{const generated=doc(collection(db,'production_sheets'));const newSheet=doc(db,'production_sheets',`ficha_${generated.id}`);await setDoc(newSheet,{...payload,assignedTailor:'',assignedAt:null,assignedBy:null,createdAt:serverTimestamp(),createdBy:user.uid});}setLastCreatedOc(previous=>String(Math.max(Number(previous),Number(normalized.oc)||0)));setForm({...blank(),oc:nextProductionOc(sheets,orderOcs.map(oc=>({oc})),[{oc:normalized.oc}])});setOcAuto(true);setEditingId(null);setMessage(status==='draft'?'Rascunho salvo.':'Ficha enviada ao Enfesto e Corte. Após a conferência, ela ficará disponível para Distribuição.');if(status==='draft')setTab('drafts');}catch(e){setError(safeProviderMessage(e));}finally{setBusy(false);}};
 const editDraft=(s:Sheet)=>{setForm(uppercaseSheetForm({model:s.model,reference:s.reference,pieceType:s.pieceType||'',fabric:s.fabric||'',composition:s.composition,trims:s.trims,officeInstructions:s.officeInstructions,oc:s.oc,withdrawalDate:s.withdrawalDate||'',volumes:s.volumes||'',tailorInstructions:s.tailorInstructions,finishingInstructions:s.finishingInstructions,colors:s.colors.length?s.colors:[blankRow()],client:s.client||'MB'}));setOcAuto(false);setEditingId(s.id);setTab('create');setError('');};
 const quantity=(v:string)=>{const n=Number(v.trim());return Number.isSafeInteger(n)&&n>=0?n:0;};
 const tableRows=(rows:ColorRow[],editable:boolean)=> <div className="sheet-table-wrap"><table className="sheet-table"><thead><tr>{['CORES','P','M','G','GG','XG','DETALHES'].map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{(['cor','p','m','g','gg','xg','detalhes'] as const).map(k=><td key={k}>{editable?(k==='detalhes'?<textarea className="sheet-detail-input" aria-label={`Detalhes linha ${i+1}`} rows={2} maxLength={240} value={row[k]} onChange={e=>setForm(v=>({...v,colors:v.colors.map((r,j)=>j===i?{...r,[k]:upperField(e.target.value)}:r)}))}/>:<input aria-label={`${k} linha ${i+1}`} type={k==='p'||k==='m'||k==='g'||k==='gg'||k==='xg'?'number':'text'} min={k==='p'||k==='m'||k==='g'||k==='gg'||k==='xg'?0:undefined} step="1" list={k==='cor'?'sheet-color-suggestions':undefined} value={row[k]} onChange={e=>setForm(v=>({...v,colors:v.colors.map((r,j)=>j===i?{...r,[k]:upperField(e.target.value)}:r)}))} onBlur={k==='cor'?e=>rememberColor(e.currentTarget.value):undefined}/>):row[k]}</td>)}</tr>)}<tr className="sheet-total-row"><th>TOTAL</th>{(['p','m','g','gg','xg'] as const).map(k=><td key={k}>{rows.reduce((sum,r)=>sum+quantity(r[k]),0)}</td>)}<td>GERAL: {rows.reduce((sum,r)=>sum+(['p','m','g','gg','xg'] as const).reduce((v,k)=>v+quantity(r[k]),0),0)}</td></tr></tbody></table></div>;
 const assign=async(s:Sheet)=>{if(!canDistribute||busy||s.status!=='pending')return;const name=canonicalWorkshopName(tailor[s.id]||''),type=normalizedGarmentType(pieceType[s.id]??s.pieceType??'');if(!name){setError('Selecione o costureiro.');return;}const matches=workshops.filter(w=>workshopKey(w.name)===workshopKey(name));const options=matches.flatMap(w=>w.types||[]);if(!type||!canSewType(name,type,options)){setError('Este costureiro não produz o tipo de roupa selecionado. Confira o cadastro em Configurações → Oficinas.');return;}const suggested=getPrice(s,name,type),value=priceOverride[`${s.id}:${workshopKey(name)}`]??suggested,amount=parsePrice(value);if(!Number.isFinite(amount)){setError('VERIFIQUE SE A REFERÊNCIA ESTÁ CORRETA. SE FOR UMA REF NOVA, INFORME O VALOR POR PEÇA ANTES DE DISTRIBUIR.');return;}if(!validQuantities(s.colors)){setError('Esta ficha tem quantidades inválidas. Corrija os tamanhos antes de distribuir.');return;}const qty=s.colors.reduce((n,r)=>n+(['p','m','g','gg','xg'] as const).reduce((sum,k)=>sum+quantity(r[k]),0),0);if(!Number.isSafeInteger(qty)||qty<=0){setError('Informe quantidades válidas antes de distribuir.');return;}
 const sentISO=sendDates[s.id]??todayInput();
 const sentDate=new Date(`${sentISO}T12:00:00`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(sentISO)||Number.isNaN(sentDate.getTime())||todayInputFromDate(sentDate)!==sentISO){setError('Escolha uma data de envio válida para a ficha.');return;}
 setBusy(true);setError('');try{const orderRef=doc(db,'cut_orders',s.id);/* A gravação em lote usa ID fixo da ficha: uma segunda tentativa é negada pelas regras de criação. */const br=(d:Date)=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,due=new Date(sentDate.getFullYear(),sentDate.getMonth(),sentDate.getDate()+10),money=(n:number)=>currency(n);const fields=['oc','ref','model','office','qty','piecePrice','entry','sent','due','status','deliveredFlag','deliveredAt','defects','discountPiece','discountTotal','total','paidAt','paymentDone'];const order={...Object.fromEntries(fields.map(k=>[k,''])),oc:s.oc,ref:s.reference,model:s.model,office:name,qty:String(qty),piecePrice:money(amount),sent:br(sentDate),due:br(due),status:'EM ANDAMENTO',total:money(qty*amount),source:'manual',manualTotal:false,createdBy:user.uid,createdAt:serverTimestamp(),updatedBy:user.uid,updatedAt:serverTimestamp()};const batch=writeBatch(db);batch.update(doc(db,'production_sheets',s.id),{status:'assigned',assignedTailor:name,assignedAt:serverTimestamp(),assignedBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid});batch.set(orderRef,order);await batch.commit();setMessage(`Ficha OC ${s.oc} enviada para ${name} em ${displayDate(sentISO)}. A OC foi criada em OCs e pagamentos.`);setLastAssigned({...s,pieceType:type,assignedTailor:name,sentLabel:displayDate(sentISO)});}catch(e){const code=String((e as {code?:string})?.code||'');setError((code?`Firebase (${code}): `:'')+safeProviderMessage(e)+(code==='permission-denied'?' — Confirme a permissão sheet_distribution, as regras publicadas e a configuração do projeto Firebase.':''));}finally{setBusy(false);}};
 const drafts=sheets.filter(s=>s.status==='draft'&&s.createdBy===user.uid).sort(compareOcDesc);
 const pending=sheets.filter(s=>s.status==='pending').sort(compareOcDesc);
 const assigned=sheets.filter(s=>s.status==='assigned').sort(compareOcDesc);
 const submitted=sheets.filter(s=>s.status==='pending'||s.status==='assigned').sort(compareOcDesc);
 const inEnfesto=sheets.filter(s=>s.status==='enfesto').sort(compareOcDesc);
 const atOffice=assigned.filter(s=>orderStatuses[s.id]!=='ENTREGUE');
 const completedSheets=assigned.filter(s=>orderStatuses[s.id]==='ENTREGUE');
 const phaseSheets=phaseFilter==='enfesto'?inEnfesto:phaseFilter==='office'?atOffice:phaseFilter==='done'?completedSheets:submitted;
 const officeNames=[...new Map([...TAILORS,...workshops.map(w=>w.name)].map(name=>[workshopKey(name),canonicalWorkshopName(name)] as [string,string])).values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const sheetQuantity=(s:Sheet)=>s.colors.reduce((sum,row)=>sum+(['p','m','g','gg','xg'] as const).reduce((v,k)=>v+quantity(row[k]),0),0);
 const compatibleOffices=(s:Sheet)=>{
   const type=normalizedGarmentType(pieceType[s.id]??s.pieceType??'');
   return officeNames.filter(name=>canSewType(name,type,workshops.filter(w=>workshopKey(w.name)===workshopKey(name)).flatMap(w=>w.types||[])));
 };
 const normSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
 const filteredPending=pending.filter(s=>!distributionSearch.trim()||normSearch([s.oc,s.reference,s.model,s.pieceType||''].join(' ')).includes(normSearch(distributionSearch)));
 const historical=phaseSheets.filter(s=>
   (!historySearch.trim()||normSearch([s.oc,s.reference,s.model,s.assignedTailor||'',s.pieceType||''].join(' ')).includes(normSearch(historySearch)))&&
   (historyOffice==='all'||(historyOffice==='pending'?s.status==='pending':s.status==='assigned'&&workshopKey(s.assignedTailor)===historyOffice))
 );
 const historyOffices=[...new Map(assigned.map(s=>[workshopKey(s.assignedTailor),canonicalWorkshopName(s.assignedTailor)] as [string,string]).filter(([key])=>!!key)).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
 const sentFiltered=assigned.filter(s=>!sentSearch.trim()||normSearch([s.oc,s.reference,s.model,s.assignedTailor||''].join(' ')).includes(normSearch(sentSearch)));
 const sentGroups=[...new Map(sentFiltered.map(s=>[workshopKey(s.assignedTailor),canonicalWorkshopName(s.assignedTailor)] as [string,string]).filter(([key])=>!!key)).entries()]
   .sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'))
   .map(([key,name])=>({name,items:sentFiltered.filter(s=>workshopKey(s.assignedTailor)===key)}));
 return <section className="sheets-page">
 <div className="sheet-page-heading"><div><span className="sheet-eyebrow">MB REFERÊNCIAS · PRODUÇÃO</span><h1>Fichas de Produção</h1><p>Criação, distribuição por oficina e consulta das fichas enviadas.</p></div></div>
 {initialTab==='create'&&<div className="sheet-phase-cards" role="group" aria-label="Acompanhar fichas de produção">
  <button type="button" className={phaseFilter==='enfesto'&&tab==='all'?'selected phase-enfesto':'phase-enfesto'} onClick={()=>{setTab('all');setPhaseFilter('enfesto');setHistoryOffice('all');setHistoryLimit(50)}}><Clock3 size={20}/><span>FICHAS EM ENFESTO</span><strong>{inEnfesto.length}</strong><small>Ver e baixar fichas aguardando corte</small></button>
  <button type="button" className={phaseFilter==='office'&&tab==='all'?'selected phase-office':'phase-office'} onClick={()=>{setTab('all');setPhaseFilter('office');setHistoryOffice('all');setHistoryLimit(50)}}><Building2 size={20}/><span>FICHAS NA OFICINA</span><strong>{atOffice.length}</strong><small>Ver e baixar fichas enviadas</small></button>
  <button type="button" className={phaseFilter==='done'&&tab==='all'?'selected phase-done':'phase-done'} onClick={()=>{setTab('all');setPhaseFilter('done');setHistoryOffice('all');setHistoryLimit(50)}}><CheckCircle2 size={20}/><span>FICHAS FINALIZADAS</span><strong>{completedSheets.length}</strong><small>OCs marcadas como entregues</small></button>
 </div>}
 <div className="sheet-tabs">
  {canEdit&&initialTab==='create'&&<button type="button" className={tab==='create'?'active':''} onClick={()=>setTab('create')}>Nova ficha</button>}
  {canEdit&&initialTab==='create'&&<button type="button" className={tab==='drafts'?'active':''} onClick={()=>setTab('drafts')}>Rascunhos ({drafts.length})</button>}
  {canDistribute&&initialTab==='distribution'&&<button type="button" className={tab==='distribution'?'active':''} onClick={()=>setTab('distribution')}>Distribuição ({pending.length})</button>}
  {canDistribute&&initialTab==='distribution'&&<button type="button" className={tab==='sent'?'active':''} onClick={()=>setTab('sent')}>Costureiros ({assigned.length})</button>}
  <button type="button" className={tab==='all'?'active':''} onClick={()=>{setPhaseFilter('all');setTab('all');setHistoryOffice('all')}}>Todas as fichas ({submitted.length})</button>
 </div>
 {error&&<div className="production-alert" role="alert">{error}{error.toLowerCase().includes('permission')&&<p>Verifique se as regras publicadas do Firestore autorizam a distribuição de fichas.</p>}</div>}
 {message&&<div className="production-ok" role="status"><CheckCircle2 size={17}/>{message}</div>}
 {tab==='create'&&canEdit&&<div className="sheet-paper"><div className="sheet-top"><div>{field('client','CLIENTE:')}{field('model','Nome da peça:')}{field('reference','REF:')}
 <datalist id="sheet-reference-options">{referenceOptions.map(ref=><option key={ref} value={ref}/>)}</datalist>
 {!!form.reference.trim()&&!!referenceMatch.suggestedName&&<p className="sheet-ref-match">REF encontrada no catálogo: <strong>{referenceMatch.suggestedName}</strong> · {referenceMatch.suggestedType||'TIPO NÃO INFORMADO'}</p>}
 {referenceMatch.names.length>1&&!referenceMatch.suggestedName&&<label className="sheet-ref-select"><strong>Não há um nome técnico único para esta REF. Escolha a peça correta:</strong><select value={form.model} onChange={e=>chooseCatalogModel(e.target.value)}><option value="">SELECIONE O MODELO</option>{referenceMatch.names.map(name=><option key={name} value={name}>{name}</option>)}</select></label>}<label className="sheet-field"><strong>Tipo de roupa (escolha ou escreva):</strong><input list="sheet-types-creator" maxLength={80} placeholder="Ex.: Camiseta, Bermuda ou outro" value={form.pieceType||''} onChange={e=>setForm(v=>({...v,pieceType:upperField(e.target.value)}))}/><datalist id="sheet-types-creator">{TYPES.map(type=><option key={type} value={type} />)}</datalist></label></div><div>{field('composition','Composição',true)}{field('fabric','Tecido:')}</div></div><div className="sheet-middle">{field('trims','Aviamentos',true)}<div className="sheet-right"><div className="sheet-field"><strong>Oficina - Costureiro</strong><p>Definido exclusivamente na distribuição</p></div>{field('officeInstructions','Inf. p/ oficina',true)}{field('oc','O.C:')}{field('tailorInstructions','Informações dos costureiros:',true)}</div></div>{tableRows(form.colors,true)}
 <datalist id="sheet-color-suggestions">{colorOptions.map(color=><option value={color} key={color}/>)}</datalist>
 <p className="sheet-colors-hint">Cores já usadas ficam salvas como sugestões para a próxima ficha. Toque no campo CORES para selecionar ou digitar uma nova.</p>
 <button className="outline-button" disabled={form.colors.length>=50} onClick={()=>setForm(v=>({...v,colors:[...v.colors,blankRow()]}))}>+ Adicionar cor</button>{field('finishingInstructions','Informações acabamento:',true)}<label className="sheet-field sheet-volumes"><strong>VOL</strong><input type="number" min={0} step={1} max={999999} value={form.volumes||''} onChange={e=>setForm(v=>({...v,volumes:e.target.value}))}/></label><div className="sheet-actions"><button className="outline-button" type="button" onClick={()=>print({...uppercaseSheetForm(form),assignedTailor:''})}><Printer size={16}/> BAIXAR / IMPRIMIR PDF</button><button className="outline-button" disabled={busy} onClick={()=>void save('draft')}>Salvar rascunho</button><button className="primary-button" disabled={busy} onClick={()=>void save('enfesto')}>{busy?'Salvando...':'Enviar para Enfesto'}</button></div></div>}
 {tab==='drafts'&&canEdit&&<div className="sheet-list"><h2>Meus rascunhos</h2>{!drafts.length&&<p>Nenhum rascunho salvo.</p>}{drafts.map(s=><details className="sheet-compact-item" key={s.id}><summary><span className="sheet-oc-label">OC {s.oc||'—'}</span><ChevronDown size={18}/></summary><div className="sheet-compact-detail"><strong>{s.model||'SEM MODELO'}</strong><div className="sheet-card-actions"><button className="outline-button" onClick={()=>editDraft(s)}>CONTINUAR PREENCHIMENTO</button><button className="outline-button" onClick={()=>print({...s,assignedTailor:''})}><Printer size={16}/> BAIXAR PDF / IMPRIMIR</button></div></div></details>)}</div>}
 {tab==='all'&&(canEdit||canDistribute)&&<section className="sheet-list sheet-all-view">
  <div className="sheet-view-head"><div><h2>{phaseFilter==='enfesto'?'Fichas em Enfesto':phaseFilter==='office'?'Fichas na Oficina':phaseFilter==='done'?'Fichas Finalizadas':'Todas as fichas'}</h2><p>{phaseFilter==='all'?'Somente fichas prontas para distribuição ou enviadas. Clique na OC para ver detalhes e PDF.':'Clique na OC para consultar, imprimir ou baixar a ficha em PDF.'}</p>{phaseFilter==='done'&&!canViewOrders&&<small>É necessária permissão de visualização de OCs para consultar as entregas.</small>}</div><span className="sheet-view-count">{historical.length} ficha(s)</span></div>
  <div className="sheet-filters">
   <label className="sheet-quick-search"><Search size={18}/><input aria-label="Pesquisar ficha por OC, REF ou modelo" type="search" value={historySearch} onChange={e=>{setHistorySearch(e.target.value);setHistoryLimit(50)}} placeholder="Pesquisar OC, REF ou modelo..."/></label>
   <label className="sheet-office-filter"><Building2 size={18}/><select aria-label="Filtrar fichas por oficina" value={historyOffice} onChange={e=>{setHistoryOffice(e.target.value);setHistoryLimit(50)}}>
    <option value="all">Todas as oficinas</option>
    <option value="pending">Prontas para distribuição</option>
    {historyOffices.map(([key,name])=><option key={key} value={key}>{name}</option>)}
   </select></label>
  </div>
  {!historical.length&&<div className="sheet-no-results"><FileText size={27}/><strong>Nenhuma ficha encontrada</strong><span>Experimente outra OC ou selecione outra oficina.</span></div>}
  <div className="sheet-compact-list">{historical.slice(0,historyLimit).map(s=><details className="sheet-compact-item" key={s.id}>
   <summary><span className="sheet-oc-label">OC {s.oc||'—'}</span><ChevronDown size={18}/></summary>
   <div className="sheet-compact-detail">
    <div className="sheet-card-top"><strong className="sheet-detail-name">{s.model||'MODELO NÃO INFORMADO'}</strong><span className={`sheet-status-pill ${s.status==='assigned'?'is-assigned':'is-pending'}`}>{s.status==='assigned'?'ENVIADA':s.status==='enfesto'?'EM ENFESTO':'PRONTA PARA DISTRIBUIÇÃO'}</span></div>
    <p className="sheet-card-meta"><b>CLIENTE: {(s.client||'MB').toLocaleUpperCase('pt-BR')}</b> · <b>REF {s.reference||'—'}</b> · {s.pieceType||'TIPO NÃO INFORMADO'} · {sheetQuantity(s).toLocaleString('pt-BR')} PEÇAS</p>
    <div className="sheet-card-office"><Building2 size={16}/><span>{s.status==='assigned'?s.assignedTailor||'OFICINA NÃO INFORMADA':s.status==='enfesto'?'AGUARDANDO CORTE':'AINDA SEM OFICINA DEFINIDA'}</span></div>
    <div className="sheet-card-actions"><button type="button" className="outline-button" onClick={()=>print({...s,assignedTailor:s.assignedTailor||''})}><Printer size={16}/> BAIXAR / IMPRIMIR FICHA PDF</button></div>
   </div>
  </details>)}</div>
  {historical.length>historyLimit&&<button type="button" className="outline-button sheet-show-more" onClick={()=>setHistoryLimit(n=>n+50)}>Mostrar mais 50 fichas ({historical.length-historyLimit} restantes)</button>}
 </section>}
 {tab==='distribution'&&canDistribute&&<section className="sheet-list sheet-distribution-view">
  <div className="sheet-view-head"><div><h2>Fichas disponíveis para distribuição</h2><p>Escolha uma ficha, selecione o costureiro e a data. Depois do envio a OC aparece em OCs e pagamentos.</p></div><span className="sheet-view-count">{pending.length} ficha(s) disponíveis</span></div>
  {lastAssigned&&<div className="sheet-dispatched-banner"><div><span className="sheet-dispatched-icon"><CheckCircle2 size={23}/></span><div><strong>Ficha enviada! OC {lastAssigned.oc} — {lastAssigned.assignedTailor}</strong><p>Envio em {lastAssigned.sentLabel}. Ficha em Costureiros e OC em OCs e pagamentos.</p></div></div><button type="button" className="primary-button" onClick={()=>print(lastAssigned)}><Printer size={17}/> BAIXAR / IMPRIMIR FICHA ENVIADA</button></div>}
  <div className="sheet-distribution-stats">
   <div><Clock3 size={18}/><span>Fichas disponíveis</span><strong>{pending.length}</strong></div>
   <div><FileText size={18}/><span>Peças disponíveis</span><strong>{pending.reduce((total,s)=>total+sheetQuantity(s),0).toLocaleString('pt-BR')}</strong></div>
   <div><PackageCheck size={18}/><span>Fichas enviadas</span><strong>{assigned.length}</strong></div>
  </div>
  <label className="sheet-quick-search sheet-distribution-search"><Search size={18}/><input aria-label="Pesquisar OC para distribuir" type="search" value={distributionSearch} onChange={e=>setDistributionSearch(e.target.value)} placeholder="Buscar ficha disponível por OC, REF ou modelo..."/></label>
  {!pending.length&&<div className="sheet-no-results"><CheckCircle2 size={30}/><strong>Nenhuma ficha aguardando distribuição.</strong><span>Fichas enviadas estão na aba Costureiros.</span></div>}
  {!!pending.length&&!filteredPending.length&&<div className="sheet-no-results"><Search size={27}/><strong>Nenhuma ficha corresponde à pesquisa.</strong></div>}
  <div className="sheet-distribution-grid sheet-pending-grid sheet-pending-compact">
   {filteredPending.map(s=>{
    const type=normalizedGarmentType(pieceType[s.id]??s.pieceType??'');
    const candidates=compatibleOffices(s);
    const selectedOffice=candidates.find(name=>workshopKey(name)===workshopKey(tailor[s.id]||''))||'';
    const suggested=selectedOffice?getPrice(s,selectedOffice,type):'';
    const priceId=`${s.id}:${workshopKey(selectedOffice)}`;
    const value=selectedOffice?(priceOverride[priceId]??suggested):'';
    const known=prices.some(p=>p.reference.toUpperCase()===s.reference.trim().toUpperCase()&&normalizedGarmentType(p.type)===type);
    return <details className="sheet-distribution-item" key={s.id}>
     <summary className="sheet-distribution-summary"><span className="sheet-oc-label">OC {s.oc}</span><span className="sheet-status-pill is-pending">AGUARDANDO ENVIO</span><ChevronDown size={19}/></summary>
     <div className="sheet-distribution-body">
     <h3>{s.model||'Modelo não informado'}</h3>
     <p className="sheet-card-meta"><b>CLIENTE: {(s.client||'MB').toLocaleUpperCase('pt-BR')}</b> · <b>REF {s.reference||'—'}</b> · {s.colors.filter(row=>row.cor.trim()).length} cores · <b>{sheetQuantity(s).toLocaleString('pt-BR')} peças</b></p>
     <div className="sheet-send-fields">
      <label>Tipo da peça<input list={`sheet-types-${s.id}`} maxLength={80} value={pieceType[s.id]??s.pieceType??''} onChange={e=>{setPieceType(v=>({...v,[s.id]:e.target.value}));setTailor(v=>({...v,[s.id]:''}));setPriceOverride(v=>Object.fromEntries(Object.entries(v).filter(([key])=>!key.startsWith(s.id+':'))))}} placeholder="Ex.: Camiseta ou Bermuda"/><datalist id={`sheet-types-${s.id}`}>{TYPES.map(t=><option key={t} value={t}/>)}</datalist></label>
      <label>Costureiro / oficina<select aria-label={`Costureiro para a OC ${s.oc}`} value={selectedOffice} disabled={!type} onChange={e=>setTailor(v=>({...v,[s.id]:e.target.value}))}>
       <option value="">{type?'Selecione o costureiro':'Informe o tipo da peça primeiro'}</option>
       {candidates.map(name=><option key={workshopKey(name)} value={name}>{name}</option>)}
      </select></label>
      <label>Data de envio<span className="sheet-input-icon"><CalendarDays size={15}/><input type="date" aria-label={`Data de envio da OC ${s.oc}`} value={sendDates[s.id]??todayInput()} onChange={e=>setSendDates(v=>({...v,[s.id]:e.target.value}))}/></span></label>
      <label>Valor por peça (R$)<input inputMode="decimal" value={value} disabled={!selectedOffice} onChange={e=>setPriceOverride(v=>({...v,[priceId]:e.target.value}))} placeholder={selectedOffice?'Informe o valor':'Selecione o costureiro'}/></label>
     </div>
     {type&&!candidates.length&&<div className="sheet-price-warning">Nenhuma oficina compatível com {type}. Confira as categorias em Configurações → Oficinas e costureiros.</div>}
     {selectedOffice&&!known&&<div className="sheet-price-warning">Verifique a REF {s.reference}. Para REF nova, informe o valor por peça antes de enviar.</div>}
     {selectedOffice&&known&&<small className="sheet-price-note">Valor sugerido para {selectedOffice}: {Number.isFinite(parsePrice(suggested))?currency(parsePrice(suggested)):'A informar'}</small>}
     <div className="sheet-card-actions">
      <button type="button" className="primary-button" disabled={busy||!selectedOffice||!Number.isFinite(parsePrice(value))} onClick={()=>void assign(s)}><Send size={16}/>{busy?'Enviando...':'Confirmar envio e criar OC'}</button>
      <button type="button" className="outline-button" onClick={()=>print({...s,pieceType:type,assignedTailor:selectedOffice})}><Printer size={16}/> BAIXAR / IMPRIMIR PDF</button>
     </div>
     </div>
    </details>;
   })}
  </div>
 </section>}
 {tab==='sent'&&canDistribute&&<section className="sheet-list sheet-sent-view">
  <div className="sheet-view-head"><div><h2>Fichas enviadas por costureiro</h2><p>Clique no costureiro para consultar e imprimir as fichas enviadas, da maior OC para a menor.</p></div><span className="sheet-view-count">{assigned.length} ficha(s) enviadas</span></div>
  <label className="sheet-quick-search sheet-distribution-search"><Search size={18}/><input aria-label="Pesquisar fichas enviadas por OC ou costureiro" type="search" value={sentSearch} onChange={e=>setSentSearch(e.target.value)} placeholder="Pesquisar OC, REF, modelo ou costureiro..."/></label>
  {!sentFiltered.length&&<div className="sheet-no-results"><FileText size={29}/><strong>Nenhuma ficha enviada encontrada.</strong><span>As fichas aparecerão aqui após a confirmação do envio.</span></div>}
  <div className="sheet-office-list">
   {sentGroups.map(group=><details className="sheet-office-group" key={workshopKey(group.name)}>
    <summary><span className="sheet-office-avatar"><Building2 size={22}/></span><span className="sheet-office-summary-title"><strong>{group.name}</strong><small>{group.items.length} ficha(s) enviadas</small></span><span className="sheet-office-number">{group.items.length}</span><ChevronDown className="sheet-office-arrow" size={19}/></summary>
    <div className="sheet-office-inner"><div className="sheet-distribution-grid">
     {group.items.map(s=><article className="sheet-card sheet-send-card sheet-assigned-card" key={s.id}>
      <div className="sheet-card-top"><span className="sheet-oc-label">OC {s.oc}</span><span className="sheet-status-pill is-assigned">Enviada</span></div>
      <h3>{s.model||'Modelo não informado'}</h3>
      <p className="sheet-card-meta"><b>CLIENTE: {(s.client||'MB').toLocaleUpperCase('pt-BR')}</b> · <b>REF {s.reference||'—'}</b> · {s.pieceType||'Tipo não informado'} · <b>{sheetQuantity(s).toLocaleString('pt-BR')} peças</b></p>
      <div className="sheet-card-office"><Building2 size={16}/><span>{s.assignedTailor}</span></div>
      <div className="sheet-card-actions"><button type="button" className="outline-button" onClick={()=>print({...s,assignedTailor:s.assignedTailor||''})}><Printer size={16}/> BAIXAR / IMPRIMIR PDF</button></div>
     </article>)}
    </div></div>
   </details>)}
  </div>
 </section>}
 {isAdmin&&initialTab==='create'&&<ProductionCleanup db={db} isAdmin={isAdmin}/>}
 {printSheet&&createPortal(<SheetPrint sheet={printSheet}/>,document.body)}
 </section>;
}
