import { useContext, useEffect, useMemo, useState } from 'react';
import { Building2, CalendarDays, CheckCircle2, ChevronDown, Clock3, FileText, PackageCheck, Printer, Search, Send } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, onSnapshot, query as firestoreQuery, serverTimestamp, setDoc, updateDoc, runTransaction, where, writeBatch, type Firestore } from 'firebase/firestore';
import {KEY,TYPES,TAILORS,canSewType,normalizedGarmentType,parsePrice,currency,priceWithMauroMinimum} from './lib/referencePrices';
import { safeProviderMessage } from './lib/safeMessage';
import SheetPrint from './SheetPrint';
import {makeEnfestoRows,type EnfestoColor} from './lib/enfestoWorkflow';
import ProductionCleanup from './ProductionCleanup';
import {isProtectedProductionOc,normalizeOcNumber} from './lib/sheetOcSequence';
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
export default function ProductionSheets({db,user,catalogModels,canEdit,canDistribute,canReassignTailor,canViewOrders,canAddTailor,onAddTailor,isAdmin,initialTab}:{db:Firestore;user:User;catalogModels:RefCatalogModel[];canEdit:boolean;canDistribute:boolean;canReassignTailor:boolean;canViewOrders:boolean;canAddTailor:boolean;onAddTailor:()=>void;isAdmin:boolean;initialTab:'create'|'distribution'}) {
 const active=useContext(PageActiveContext);
 const [tab,setTab]=useState<'create'|'drafts'|'all'|'distribution'|'sent'>(initialTab);
 const [form,setForm]=useState<FormData>(blank);
 const [ocAuto,setOcAuto]=useState(true);
 const [lastCreatedOc,setLastCreatedOc]=useState('754');
 const [orderOcs,setOrderOcs]=useState<string[]>([]);
 const [orderStatuses,setOrderStatuses]=useState<Record<string,string>>({});
 const [orderStatusByOc,setOrderStatusByOc]=useState<Record<string,string>>({});
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
 const [editingSent,setEditingSent]=useState(false);
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
 const [reassignId,setReassignId]=useState<string|null>(null);
 const [replacementOffice,setReplacementOffice]=useState('');
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
   setOrderStatusByOc(Object.fromEntries(snapshot.docs.map(item=>[normalizeOcNumber(String(item.data().oc||'')),String(item.data().status||'').trim().toUpperCase()])));
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
 const field=(key:Exclude<keyof FormData,'colors'>,label:string,large=false)=> <label className="sheet-field"><strong>{label}</strong>{large?<textarea value={form[key] as string} maxLength={4000} onChange={e=>setForm(v=>({...v,[key]:upperField(e.target.value)}))}/>:<input value={form[key] as string} maxLength={key==='reference'?12:key==='client'?120:250} inputMode={key==='reference'?'numeric':undefined} pattern={key==='reference'?'[0-9]*':undefined} list={key==='reference'?'sheet-reference-options':undefined} onChange={e=>{if(key==='reference')changeReference(e.target.value);else{if(key==='oc')setOcAuto(false);setForm(v=>({...v,[key]:upperField(e.target.value)}));}}}/>}</label>;
 const save=async(status:'draft'|'enfesto')=>{if(editingSent)return;if(!canEdit)return;if(status==='enfesto'&&(!form.model.trim()||!form.oc.trim()||!form.reference.trim()||!form.pieceType?.trim())){setError('Preencha o modelo, a REF, a OC e selecione o tipo de roupa antes de enviar.');return;}if(!validQuantities(form.colors)){setError('Confira as quantidades: use apenas números inteiros, sem valores negativos.');return;}if(form.volumes?.trim()&&!/^\d{1,6}$/.test(form.volumes.trim())){setError('Em VOL, digite somente a quantidade (até 6 dígitos).');return;}setBusy(true);setError('');setMessage('');try{
 if(status==='enfesto'&&!/^\d{1,12}$/.test(form.oc.trim()))throw Error('A OC deve conter somente números.');
 {
  const [existingSheets,existingOrders]=await Promise.all([
    getDocs(firestoreQuery(collection(db,'production_sheets'),where('oc','==',form.oc.trim()))),
    canViewOrders?getDocs(firestoreQuery(collection(db,'cut_orders'),where('oc','==',form.oc.trim()))):Promise.resolve(null)
  ]);
  if(existingSheets.docs.some(document=>document.id!==editingId)||(existingOrders&&!existingOrders.empty)){
   setError('A OC '+form.oc+' já existe. Use a próxima OC disponível antes de criar outra ficha.');
   setBusy(false);return;
  }
 }
 const normalized=uppercaseSheetForm(form);const {client:clientName,...sheetFields}=normalized;const savedHasClient=!!editingId&&sheets.some(item=>item.id===editingId&&item.client!==undefined);const payload={...sheetFields,...(clientName!=='MB'||savedHasClient?{client:clientName}:{ }),model:normalized.model.trim(),reference:normalized.reference.trim(),pieceType:normalized.pieceType||'',fabric:normalized.fabric?.trim()||'',volumes:normalized.volumes?.trim()||'',oc:normalized.oc.trim(),colors:normalized.colors.filter(r=>Object.values(r).some(v=>v.trim())).slice(0,50),status,updatedAt:serverTimestamp(),updatedBy:user.uid};if(editingId){await updateDoc(doc(db,'production_sheets',editingId),payload);}else{const generated=doc(collection(db,'production_sheets'));const newSheet=doc(db,'production_sheets',/^\d{1,12}$/.test(normalized.oc)?`ficha_oc_${Number(normalized.oc)}`:`ficha_${generated.id}`);await setDoc(newSheet,{...payload,assignedTailor:'',assignedAt:null,assignedBy:null,createdAt:serverTimestamp(),createdBy:user.uid});}setLastCreatedOc(previous=>String(Math.max(Number(previous),Number(normalized.oc)||0)));setForm({...blank(),oc:nextProductionOc(sheets,orderOcs.map(oc=>({oc})),[{oc:normalized.oc}])});setOcAuto(true);setEditingId(null);setEditingSent(false);setMessage(status==='draft'?'Rascunho salvo.':'Ficha enviada ao Enfesto e Corte. Após a conferência, ela ficará disponível para Distribuição.');if(status==='draft')setTab('drafts');}catch(e){setError((String((e as {code?:string}).code||'').includes('permission-denied')&&form.client?.trim().toUpperCase()!=='MB'?'Para salvar um CLIENTE diferente de MB, é necessário publicar as novas regras do Firebase. ':'')+safeProviderMessage(e));}finally{setBusy(false);}};
 const editDraft=(s:Sheet)=>{setEditingSent(false);setForm(uppercaseSheetForm({model:s.model,reference:s.reference,pieceType:s.pieceType||'',fabric:s.fabric||'',composition:s.composition,trims:s.trims,officeInstructions:s.officeInstructions,oc:s.oc,withdrawalDate:s.withdrawalDate||'',volumes:s.volumes||'',tailorInstructions:s.tailorInstructions,finishingInstructions:s.finishingInstructions,colors:s.colors.length?s.colors:[blankRow()],client:s.client||'MB'}));setOcAuto(false);setEditingId(s.id);setTab('create');setError('');};
 const editEnfestoSheet=(s:Sheet)=>{
  if(!canEdit||s.status!=='enfesto'||(!isAdmin&&s.createdBy!==user.uid))return;
  editDraft(s);setEditingSent(true);setTab('create');
  setMessage('Editando ficha enviada ao Enfesto — OC '+s.oc+'. Corrija as cores e quantidades, depois salve sem recriar a ficha.');
 };
 const saveEditedEnfesto=async()=>{
  if(!canEdit||!editingSent||!editingId||busy)return;
  const original=sheets.find(s=>s.id===editingId);
  if(!original||original.status!=='enfesto'||(!isAdmin&&original.createdBy!==user.uid)){setError('Esta ficha não pode mais ser corrigida neste fluxo.');return;}
  if(!validQuantities(form.colors)){setError('Quantidades inválidas. Use números inteiros não negativos.');return;}
  if(form.oc.trim()!==original.oc){setError('O número da OC não pode ser modificado após o envio.');return;}
  const normalized=uppercaseSheetForm(form);
  const colors=normalized.colors.filter(r=>Object.values(r).some(v=>v.trim())).slice(0,50);
  if(!colors.length||!colors.some(r=>['p','m','g','gg','xg'].some(k=>Number(r[k as keyof ColorRow])>0))){setError('Informe ao menos uma cor com quantidade positiva.');return;}
  if(colors.some(r=>!r.cor.trim()||r.cor.length>90)||new Set(colors.map(r=>normalizeColorName(r.cor))).size!==colors.length){setError('Informe cores válidas, sem nomes repetidos.');return;}
  if(!normalized.model.trim()||!normalized.reference.trim()||!normalized.pieceType?.trim()){setError('Nome, REF e tipo da peça são obrigatórios.');return;}
  if(normalized.volumes?.trim()&&!/^\d{1,6}$/.test(normalized.volumes.trim())){setError('VOL deve ter somente números.');return;}
  if(!window.confirm('Salvar as correções da ficha OC '+original.oc+'?\\nA ficha original, o PDF e os dados do Enfesto serão atualizados. Cores ou quantidades alteradas precisarão de nova conferência. Nenhum estoque nem pagamento será alterado.'))return;
  setBusy(true);setError('');setMessage('');
  try{
   const sheetRef=doc(db,'production_sheets',original.id),jobRef=doc(db,'enfesto_jobs',original.id);
   await runTransaction(db,async transaction=>{
    const [current,job]=await Promise.all([transaction.get(sheetRef),transaction.get(jobRef)]);
    if(!current.exists()||current.data().status!=='enfesto'||current.data().oc!==original.oc)
      throw Error('A ficha mudou de etapa. Atualize a tela.');
    if(!isAdmin&&current.data().createdBy!==user.uid)throw Error('Somente o criador ou o dono pode editar esta ficha.');
    if(job.exists()&&job.data().status==='completed')throw Error('O Enfesto já foi concluído. Alteração bloqueada para preservar o estoque.');
    // Evita gravar sobre alterações realizadas em outro aparelho.
    if(JSON.stringify(current.data().colors||[])!==JSON.stringify(original.colors||[]))
      throw Error('Cores ou quantidades foram modificadas em outro aparelho. Atualize a ficha antes de salvar.');
    const updates={
     model:normalized.model,reference:normalized.reference,client:normalized.client||'MB',
     pieceType:normalized.pieceType||'',fabric:normalized.fabric||'',
     composition:normalized.composition,trims:normalized.trims,
     officeInstructions:normalized.officeInstructions,withdrawalDate:normalized.withdrawalDate,
     tailorInstructions:normalized.tailorInstructions,finishingInstructions:normalized.finishingInstructions,
     volumes:normalized.volumes||'',colors,updatedAt:serverTimestamp(),updatedBy:user.uid
    };
    transaction.update(sheetRef,updates);
    if(job.exists()){
     const oldRows=Array.isArray(job.data().rows)?job.data().rows as EnfestoColor[]:[];
     const nextRows=makeEnfestoRows(colors,oldRows);
     transaction.update(jobRef,{rows:nextRows,updatedAt:serverTimestamp(),updatedBy:user.uid});
    }
    transaction.set(doc(collection(db,'audit_log')),{actorUid:user.uid,actorEmail:user.email||'',action:'production_sheet_revision',modelName:'OC '+original.oc,before:{colors:current.data().colors,model:current.data().model,reference:current.data().reference},after:{colors,model:normalized.model,reference:normalized.reference},at:serverTimestamp()});
   });
   setEditingId(null);setEditingSent(false);setForm({...blank(),oc:nextOc});setOcAuto(true);setTab('drafts');
   setMessage('Ficha OC '+original.oc+' corrigida e sincronizada com o Enfesto e PDF. Confira as linhas modificadas antes de finalizar.');
  }catch(e){setError('Não foi possível atualizar a ficha OC '+original.oc+': '+safeProviderMessage(e)+'. Nenhuma alteração parcial foi gravada.');}
  finally{setBusy(false)}
 };
 const quantity=(v:string)=>{const n=Number(v.trim());return Number.isSafeInteger(n)&&n>=0?n:0;};
 const tableRows=(rows:ColorRow[],editable:boolean)=> <div className="sheet-table-wrap"><table className="sheet-table"><thead><tr>{['CORES','P','M','G','GG','XG','DETALHES'].map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{(['cor','p','m','g','gg','xg','detalhes'] as const).map(k=><td key={k}>{editable?(k==='detalhes'?<textarea className="sheet-detail-input" aria-label={`Detalhes linha ${i+1}`} rows={2} maxLength={240} value={row[k]} onChange={e=>setForm(v=>({...v,colors:v.colors.map((r,j)=>j===i?{...r,[k]:upperField(e.target.value)}:r)}))}/>:<input aria-label={`${k} linha ${i+1}`} type={k==='p'||k==='m'||k==='g'||k==='gg'||k==='xg'?'number':'text'} min={k==='p'||k==='m'||k==='g'||k==='gg'||k==='xg'?0:undefined} step="1" list={k==='cor'?'sheet-color-suggestions':undefined} value={row[k]} onChange={e=>setForm(v=>({...v,colors:v.colors.map((r,j)=>j===i?{...r,[k]:upperField(e.target.value)}:r)}))} onBlur={k==='cor'?e=>rememberColor(e.currentTarget.value):undefined}/>):row[k]}</td>)}</tr>)}<tr className="sheet-total-row"><th>TOTAL</th>{(['p','m','g','gg','xg'] as const).map(k=><td key={k}>{rows.reduce((sum,r)=>sum+quantity(r[k]),0)}</td>)}<td>GERAL: {rows.reduce((sum,r)=>sum+(['p','m','g','gg','xg'] as const).reduce((v,k)=>v+quantity(r[k]),0),0)}</td></tr></tbody></table></div>;
 const assign=async(s:Sheet)=>{if(!canDistribute||busy||s.status!=='pending')return;const name=canonicalWorkshopName(tailor[s.id]||''),type=normalizedGarmentType(pieceType[s.id]??s.pieceType??'');if(!name){setError('Selecione o costureiro.');return;}const matches=workshops.filter(w=>workshopKey(w.name)===workshopKey(name));const options=matches.flatMap(w=>w.types||[]);if(!type||!canSewType(name,type,options)){setError('Este costureiro não produz o tipo de roupa selecionado. Confira o cadastro em Configurações → Oficinas.');return;}const suggested=getPrice(s,name,type),value=priceOverride[`${s.id}:${workshopKey(name)}`]??suggested,amount=parsePrice(value);if(!Number.isFinite(amount)){setError('VERIFIQUE SE A REFERÊNCIA ESTÁ CORRETA. SE FOR UMA REF NOVA, INFORME O VALOR POR PEÇA ANTES DE DISTRIBUIR.');return;}if(!validQuantities(s.colors)){setError('Esta ficha tem quantidades inválidas. Corrija os tamanhos antes de distribuir.');return;}const qty=s.colors.reduce((n,r)=>n+(['p','m','g','gg','xg'] as const).reduce((sum,k)=>sum+quantity(r[k]),0),0);if(!Number.isSafeInteger(qty)||qty<=0){setError('Informe quantidades válidas antes de distribuir.');return;}
 const sentISO=sendDates[s.id]??todayInput();
 const sentDate=new Date(`${sentISO}T12:00:00`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(sentISO)||Number.isNaN(sentDate.getTime())||todayInputFromDate(sentDate)!==sentISO){setError('Escolha uma data de envio válida para a ficha.');return;}
 setBusy(true);setError('');try{
 // Fichas antigas 752/753/754 podem ter uma OC financeira já existente:
 // nunca sobrescrever nem criar outra OC de mesmo número.
 const legacyOrders=isProtectedProductionOc(s.oc)
   ?(await getDocs(collection(db,'cut_orders'))).docs.filter(item=>normalizeOcNumber(item.data().oc)===normalizeOcNumber(s.oc))
   :[];
 if(legacyOrders.length>1)throw Error('Existem várias OCs financeiras com número '+s.oc+'. Confira os documentos antes de distribuir.');
 const legacy=legacyOrders[0];
 if(legacy){
  const oldStatus=String(legacy.data().status||'').trim().toUpperCase();
  const oldOffice=canonicalWorkshopName(String(legacy.data().office||''));
  if(oldStatus==='ENTREGUE')throw Error('A OC '+s.oc+' já está ENTREGUE. Não é seguro redistribuir uma OC concluída.');
  if(!oldOffice||workshopKey(oldOffice)!==workshopKey(name))throw Error('A OC '+s.oc+' já está cadastrada para '+(oldOffice||'oficina não informada')+'. Para preservar a OC e os pagamentos, escolha a mesma oficina ou ajuste a OC existente.');
 }
 const orderRef=doc(db,'cut_orders',s.id);/* A gravação em lote usa ID fixo da ficha: uma segunda tentativa é negada pelas regras de criação. */const br=(d:Date)=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,due=new Date(sentDate.getFullYear(),sentDate.getMonth(),sentDate.getDate()+10),money=(n:number)=>currency(n);const fields=['oc','ref','model','office','qty','piecePrice','entry','sent','due','status','deliveredFlag','deliveredAt','defects','discountPiece','discountTotal','total','paidAt','paymentDone'];const order={...Object.fromEntries(fields.map(k=>[k,''])),oc:s.oc,ref:s.reference,model:s.model,office:name,qty:String(qty),piecePrice:money(amount),sent:br(sentDate),due:br(due),status:'EM ANDAMENTO',total:money(qty*amount),source:'manual',manualTotal:false,createdBy:user.uid,createdAt:serverTimestamp(),updatedBy:user.uid,updatedAt:serverTimestamp()};const batch=writeBatch(db);batch.update(doc(db,'production_sheets',s.id),{status:'assigned',assignedTailor:name,assignedAt:serverTimestamp(),assignedBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid});if(!legacy)batch.set(orderRef,order);await batch.commit();setMessage(legacy?`Ficha OC ${s.oc} enviada para ${name}. A OC financeira já existente foi preservada sem duplicação nem alteração de pagamentos.`:`Ficha OC ${s.oc} enviada para ${name} em ${displayDate(sentISO)}. A OC foi criada em OCs e pagamentos.`);setLastAssigned({...s,pieceType:type,assignedTailor:name,sentLabel:displayDate(sentISO)});}catch(e){const code=String((e as {code?:string})?.code||'');setError((code?`Firebase (${code}): `:'')+safeProviderMessage(e)+(code==='permission-denied'?' — Confirme a permissão sheet_distribution, as regras publicadas e a configuração do projeto Firebase.':''));}finally{setBusy(false);}};
 const drafts=sheets.filter(s=>s.status==='draft'&&s.createdBy===user.uid).sort(compareOcDesc);
 const sentToEnfesto=sheets.filter(s=>s.status==='enfesto'&&(isAdmin||s.createdBy===user.uid)).sort(compareOcDesc);
 const pending=sheets.filter(s=>s.status==='pending').sort(compareOcDesc);
 const assigned=sheets.filter(s=>s.status==='assigned').sort(compareOcDesc);
 const submitted=sheets.filter(s=>s.status==='pending'||s.status==='assigned').sort(compareOcDesc);
 const inEnfesto=sheets.filter(s=>s.status==='enfesto').sort(compareOcDesc);
 const statusForSheet=(s:Sheet)=>orderStatuses[s.id]||orderStatusByOc[normalizeOcNumber(s.oc)]||'';
 const atOffice=assigned.filter(s=>statusForSheet(s)!=='ENTREGUE');
 const completedSheets=assigned.filter(s=>statusForSheet(s)==='ENTREGUE');
 // Todas as fichas: apenas OCs finalizadas, inclusive legado com ID financeiro diferente.
 const phaseSheets=phaseFilter==='enfesto'?inEnfesto:phaseFilter==='office'?atOffice:completedSheets;
 const officeNames=[...new Map([...TAILORS,...workshops.map(w=>w.name)].map(name=>[workshopKey(name),canonicalWorkshopName(name)] as [string,string])).values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const sheetQuantity=(s:Sheet)=>s.colors.reduce((sum,row)=>sum+(['p','m','g','gg','xg'] as const).reduce((v,k)=>v+quantity(row[k]),0),0);
 const compatibleOffices=(s:Sheet)=>{
   const model=String(s.model||'');
   const inferred=/BERMUDA/i.test(model)?'Bermuda':/CAL[ÇC]A/i.test(model)?'Calça':/REGATA/i.test(model)?'Regata':/MANGA LONGA|M\.L\./i.test(model)?'M.L.':/CAMISA|CAMISETA/i.test(model)?'Camiseta':'';
   const type=normalizedGarmentType(pieceType[s.id]||s.pieceType||inferred);
   return !type?officeNames:officeNames.filter(name=>canSewType(name,type,workshops.filter(w=>workshopKey(w.name)===workshopKey(name)).flatMap(w=>w.types||[])));
 };

 const reassignSentSheet=async(s:Sheet)=>{
  if(!canDistribute||!canReassignTailor||busy||s.status!=='assigned')return;
  const target=canonicalWorkshopName(replacementOffice),current=canonicalWorkshopName(s.assignedTailor||'');
  if(!target){setError('Escolha um costureiro para a OC.');return;}
  if(!compatibleOffices(s).some(name=>workshopKey(name)===workshopKey(target))){setError('A oficina escolhida não produz este tipo de peça.');return;}
  setBusy(true);setError('');setMessage('');
  let stage='consultar OC por ID';
  try{
   const sheetRef=doc(db,'production_sheets',s.id);
   const directOrder=await getDoc(doc(db,'cut_orders',s.id));
   // OCs antigas podem usar um ID diferente da ficha (ex.: OC 753).
   stage='localizar OC financeira antiga';
   const legacyMatches=!directOrder.exists()&&canViewOrders
     ?(await getDocs(firestoreQuery(collection(db,'cut_orders'),where('oc','==',s.oc)))).docs
     :[];
   if(legacyMatches.length>1)throw Error('Existem várias OCs financeiras com este número. Troca bloqueada para revisão.');
   const orderSnap=directOrder.exists()?directOrder:legacyMatches[0];
   const orderRef=orderSnap?orderSnap.ref:doc(db,'cut_orders',s.id);
   stage='consultar ficha enviada';
   const sheetSnap=await getDoc(sheetRef);
   if(!sheetSnap.exists()||sheetSnap.data().status!=='assigned'||sheetSnap.data().oc!==s.oc)throw Error('Ficha alterada por outro usuário. Atualize.');
   if(!orderSnap?.exists())throw Error('OC financeira não localizada. Para fichas antigas, é necessário acesso de leitura a OCs e Pagamentos.');
   const orderData=orderSnap.data();
   if(String(orderData.oc||'')!==s.oc)throw Error('A OC financeira não corresponde à ficha.');
   // Mesmo uma OC entregue pode ter o responsável corrigido pelo dono; não alteramos status nem pagamentos.
   if(workshopKey(canonicalWorkshopName(String(sheetSnap.data().assignedTailor||'')))!==workshopKey(current))
    throw Error('A ficha mudou em outro aparelho. Reabra a OC.');
   const financialOffice=canonicalWorkshopName(String(orderData.office||''));
   if(workshopKey(target)===workshopKey(current)&&workshopKey(target)===workshopKey(financialOffice))
    throw Error('A ficha e a OC financeira já estão com este costureiro.');
   const paid=String(orderData.paymentDone||'').trim().toUpperCase()==='OK';
   const divergence=workshopKey(financialOffice)!==workshopKey(current);
   if(!window.confirm((divergence?'ATENÇÃO: nomes diferentes.\nFicha: '+current+'\nOCs/Pagamentos: '+financialOffice+'\n\n':'')+'Confirmar novo costureiro da OC '+s.oc+': '+target+'?\nA ficha e a OC ficarão iguais. Pagamentos, datas e valores serão mantidos.'+(paid?'\nATENÇÃO: OC já consta como paga.':'')))return;
   const batch=writeBatch(db);
   batch.update(sheetRef,{assignedTailor:target,reassignmentOrderId:orderRef.id,updatedAt:serverTimestamp(),updatedBy:user.uid});
   batch.update(orderRef,{office:target,reassignmentSheetId:s.id,updatedAt:serverTimestamp(),updatedBy:user.uid});
   batch.set(doc(collection(db,'audit_log')),{actorUid:user.uid,actorEmail:user.email||'',action:'tailor_reassignment',modelName:'OC '+s.oc,before:{oc:s.oc,office:current},after:{oc:s.oc,office:target},at:serverTimestamp()});
   stage='gravação atômica de ficha, OC e auditoria';
   await batch.commit();
   setReassignId(null);setReplacementOffice('');
   setMessage('OC '+s.oc+' transferida para '+target+'. A ficha e OCs e Pagamentos foram sincronizados sem alterar valores ou pagamentos.');
  }catch(e){const code=String((e as {code?:string})?.code||'');const project=String(db.app.options.projectId||'não identificado');setError('Falha ao transferir OC '+s.oc+' na etapa: '+stage+'. '+(code?'Firebase '+code+': ':'')+safeProviderMessage(e)+'. Projeto Firebase: '+project+'. '+(code.includes('permission-denied')?'A gravação foi bloqueada pelas regras do Firestore ou pela permissão do usuário; confirme o projeto e a versão publicada das regras.':'')+' Nenhum pagamento foi alterado.');}
  finally{setBusy(false);}
 };
 const reassignControl=(s:Sheet)=>(
  canReassignTailor?<div className="sheet-reassign-area">
       {reassignId===s.id?<div className="sheet-reassign-form">
        <strong>Trocar costureiro — OC {s.oc}</strong>
        <small>Corrige também fichas com nome diferente do financeiro. Não altera pagamentos, preços ou datas.</small>
        <label>Novo costureiro * (obrigatório)<select required aria-label={`Novo costureiro da OC ${s.oc}`} disabled={busy} value={replacementOffice} onChange={e=>setReplacementOffice(e.target.value)}>
         <option value="">Selecione um costureiro</option>
         {compatibleOffices(s).map(name=><option value={name} key={workshopKey(name)}>{name}</option>)}
        </select></label>
        <div className="sheet-reassign-actions"><button type="button" className="primary-button" disabled={busy||!replacementOffice} onClick={()=>void reassignSentSheet(s)}>{busy?'Salvando...':'Confirmar troca'}</button><button type="button" className="outline-button" disabled={busy} onClick={()=>{setReassignId(null);setReplacementOffice('')}}>Cancelar</button></div>
       </div>:<button type="button" className="outline-button sheet-reassign-toggle" disabled={busy} onClick={()=>{setReassignId(s.id);setReplacementOffice('');setError('')}}>Trocar costureiro</button>}
      </div>:null
 );
 const normSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
 const filteredPending=pending.filter(s=>!distributionSearch.trim()||normSearch([s.oc,s.reference,s.model,s.pieceType||''].join(' ')).includes(normSearch(distributionSearch)));
 const historical=phaseSheets.filter(s=>
   (!historySearch.trim()||normSearch([s.oc,s.reference,s.model,s.assignedTailor||'',s.pieceType||''].join(' ')).includes(normSearch(historySearch)))&&
   (historyOffice==='all'||(historyOffice==='pending'?s.status==='pending':s.status==='assigned'&&workshopKey(s.assignedTailor)===historyOffice))
 );
 const historyOffices=[...new Map(phaseSheets.filter(s=>s.status==='assigned').map(s=>[workshopKey(s.assignedTailor),canonicalWorkshopName(s.assignedTailor)] as [string,string]).filter(([key])=>!!key)).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
 const sentFiltered=atOffice.filter(s=>!sentSearch.trim()||normSearch([s.oc,s.reference,s.model,s.assignedTailor||''].join(' ')).includes(normSearch(sentSearch)));
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
  {canEdit&&initialTab==='create'&&<button type="button" className={tab==='create'?'active':''} onClick={()=>{setEditingId(null);setEditingSent(false);setForm({...blank(),oc:nextOc});setOcAuto(true);setTab('create')}}>Nova ficha</button>}
  {canEdit&&initialTab==='create'&&<button type="button" className={tab==='drafts'?'active':''} onClick={()=>setTab('drafts')}>Minhas fichas ({drafts.length+sentToEnfesto.length})</button>}
  {canDistribute&&initialTab==='distribution'&&<button type="button" className={tab==='distribution'?'active':''} onClick={()=>setTab('distribution')}>Distribuição ({pending.length})</button>}
  {canDistribute&&initialTab==='distribution'&&<button type="button" className={tab==='sent'?'active':''} onClick={()=>setTab('sent')}>Costureiros ({atOffice.length})</button>}
  <button type="button" className={tab==='all'?'active':''} onClick={()=>{setPhaseFilter('all');setTab('all');setHistoryOffice('all')}}>Todas as fichas ({completedSheets.length})</button>
 </div>
 {error&&<div className="production-alert" role="alert">{error}{error.toLowerCase().includes('permission')&&<p>Verifique se as regras publicadas do Firestore autorizam a distribuição de fichas.</p>}</div>}
 {message&&<div className="production-ok" role="status"><CheckCircle2 size={17}/>{message}</div>}
 {tab==='create'&&canEdit&&<><div className="sheet-edit-heading"><strong>{editingSent?'CORRIGIR FICHA ENVIADA — OC '+form.oc:editingId?'EDITAR RASCUNHO':'NOVA FICHA'}</strong>{editingSent&&<p>As alterações serão sincronizadas com o Enfesto sem duplicar a OC. Cores ou quantidades alteradas exigem nova conferência.</p>}</div><div className="sheet-paper"><div className="sheet-top"><div>{field('client','CLIENTE:')}{field('model','Nome da peça:')}{field('reference','REF:')}
 <datalist id="sheet-reference-options">{referenceOptions.map(ref=><option key={ref} value={ref}/>)}</datalist>
 {!!form.reference.trim()&&!!referenceMatch.suggestedName&&<p className="sheet-ref-match">REF encontrada no catálogo: <strong>{referenceMatch.suggestedName}</strong> · {referenceMatch.suggestedType||'TIPO NÃO INFORMADO'}</p>}
 {referenceMatch.names.length>1&&!referenceMatch.suggestedName&&<label className="sheet-ref-select"><strong>Não há um nome técnico único para esta REF. Escolha a peça correta:</strong><select value={form.model} onChange={e=>chooseCatalogModel(e.target.value)}><option value="">SELECIONE O MODELO</option>{referenceMatch.names.map(name=><option key={name} value={name}>{name}</option>)}</select></label>}<label className="sheet-field"><strong>Tipo de roupa (escolha ou escreva):</strong><input list="sheet-types-creator" maxLength={80} placeholder="Ex.: Camiseta, Bermuda ou outro" value={form.pieceType||''} onChange={e=>setForm(v=>({...v,pieceType:upperField(e.target.value)}))}/><datalist id="sheet-types-creator">{TYPES.map(type=><option key={type} value={type} />)}</datalist></label></div><div>{field('composition','Composição',true)}{field('fabric','Tecido:')}</div></div><div className="sheet-middle">{field('trims','Aviamentos',true)}<div className="sheet-right"><div className="sheet-field"><strong>Oficina - Costureiro</strong><p>Definido exclusivamente na distribuição</p></div>{field('officeInstructions','Inf. p/ oficina',true)}{field('oc','O.C:')}{field('tailorInstructions','Informações dos costureiros:',true)}</div></div>{tableRows(form.colors,true)}
 <datalist id="sheet-color-suggestions">{colorOptions.map(color=><option value={color} key={color}/>)}</datalist>
 <p className="sheet-colors-hint">Cores já usadas ficam salvas como sugestões para a próxima ficha. Toque no campo CORES para selecionar ou digitar uma nova.</p>
 <button className="outline-button" disabled={form.colors.length>=50} onClick={()=>setForm(v=>({...v,colors:[...v.colors,blankRow()]}))}>+ Adicionar cor</button>{field('finishingInstructions','Informações acabamento:',true)}<label className="sheet-field sheet-volumes"><strong>VOL</strong><input type="number" min={0} step={1} max={999999} value={form.volumes||''} onChange={e=>setForm(v=>({...v,volumes:e.target.value}))}/></label><div className="sheet-actions"><button className="outline-button" type="button" onClick={()=>print({...uppercaseSheetForm(form),assignedTailor:''})}><Printer size={16}/> BAIXAR / IMPRIMIR PDF</button>{editingSent?<><button className="outline-button" disabled={busy} onClick={()=>{setEditingId(null);setEditingSent(false);setForm({...blank(),oc:nextOc});setOcAuto(true);setTab('drafts')}}>Cancelar edição</button><button className="primary-button" disabled={busy} onClick={()=>void saveEditedEnfesto()}>{busy?'Salvando...':'Salvar alterações na ficha e no Enfesto'}</button></>:<><button className="outline-button" disabled={busy} onClick={()=>void save('draft')}>Salvar rascunho</button><button className="primary-button" disabled={busy} onClick={()=>void save('enfesto')}>{busy?'Salvando...':'Enviar para Enfesto'}</button></>}</div></div></>}
 {tab==='drafts'&&canEdit&&<div className="sheet-list"><h2>Meus rascunhos</h2>{!drafts.length&&<p>Nenhum rascunho salvo.</p>}{drafts.map(s=><details className="sheet-compact-item" key={s.id}><summary><span className="sheet-oc-label">OC {s.oc||'—'}</span><ChevronDown size={18}/></summary><div className="sheet-compact-detail"><strong>{s.model||'SEM MODELO'}</strong><div className="sheet-card-actions"><button className="outline-button" onClick={()=>editDraft(s)}>CONTINUAR PREENCHIMENTO</button><button className="outline-button" onClick={()=>print({...s,assignedTailor:''})}><Printer size={16}/> BAIXAR PDF / IMPRIMIR</button></div></div></details>)}<h2>Fichas enviadas ao Enfesto — corrigíveis ({sentToEnfesto.length})</h2>{!sentToEnfesto.length&&<p>Nenhuma ficha sua aguardando correção no Enfesto.</p>}{sentToEnfesto.map(s=><details className="sheet-compact-item" key={s.id}><summary><span className="sheet-oc-label">OC {s.oc}</span><ChevronDown size={18}/></summary><div className="sheet-compact-detail"><strong>{s.model}</strong><p>REF {s.reference} · {sheetQuantity(s).toLocaleString('pt-BR')} peças · EM ENFESTO</p><div className="sheet-card-actions"><button className="primary-button" type="button" onClick={()=>editEnfestoSheet(s)}>EDITAR FICHA ENVIADA</button><button className="outline-button" type="button" onClick={()=>print({...s,assignedTailor:s.assignedTailor||''})}><Printer size={16}/> PDF</button></div></div></details>)}</div>}
 {tab==='all'&&(canEdit||canDistribute)&&<section className="sheet-list sheet-all-view">
  {canAddTailor&&<button type="button" className="outline-button" onClick={onAddTailor}>+ Adicionar costureiro</button>}
  <div className="sheet-view-head"><div><h2>{phaseFilter==='enfesto'?'Fichas em Enfesto':phaseFilter==='office'?'Fichas na Oficina':'Todas as fichas finalizadas'}</h2><p>{phaseFilter==='all'?'Somente fichas finalizadas (OCs entregues). As fichas em andamento ficam em Costureiros e as que aguardam envio ficam em Distribuição.':'Clique na OC para consultar, imprimir ou baixar a ficha em PDF.'}</p>{phaseFilter==='done'&&!canViewOrders&&<small>É necessária permissão de visualização de OCs para consultar as entregas.</small>}</div><span className="sheet-view-count">{historical.length} ficha(s)</span></div>
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
    {s.status==='assigned'&&canReassignTailor&&<p className="sheet-reassign-guidance">Esta ficha já foi enviada. Se o costureiro não fizer este tipo de peça, escolha outro responsável abaixo.</p>}
    {s.status==='assigned'&&canDistribute&&!canReassignTailor&&<p className="sheet-reassign-guidance" role="status">Para trocar o costureiro desta ficha, o dono precisa autorizar a permissão especial <strong>Trocar costureiro de fichas já enviadas</strong> em Contas e permissões. Seu acesso atual permite consultar a ficha, mas não transferi-la.</p>}
    {s.status==='assigned'&&reassignControl(s)}
    {s.status==='pending'&&canDistribute&&(()=>{
      const type=normalizedGarmentType(pieceType[s.id]??s.pieceType??'');
      const candidates=compatibleOffices(s);
      const selected=candidates.find(name=>workshopKey(name)===workshopKey(tailor[s.id]||''))||'';
      const priceId=`${s.id}:${workshopKey(selected)}`;
      const value=selected?(priceOverride[priceId]??getPrice(s,selected,type)):'';
      return <div className="sheet-pending-assign">
       <strong>Distribuir esta ficha — escolha a oficina</strong>
       <div className="sheet-send-fields">
        <label>Tipo da peça *<input list={`all-sheet-types-${s.id}`} maxLength={80} value={pieceType[s.id]??s.pieceType??''} onChange={e=>{setPieceType(v=>({...v,[s.id]:e.target.value}));setTailor(v=>({...v,[s.id]:''}))}}/><datalist id={`all-sheet-types-${s.id}`}>{TYPES.map(t=><option key={t} value={t}/>)}</datalist></label>
        <label className="sheet-tailor-picker">Costureiro / oficina * (obrigatório)<select required aria-label={`Costureiro para a OC ${s.oc}`} disabled={!type||busy} value={selected} onChange={e=>setTailor(v=>({...v,[s.id]:e.target.value}))}><option value="">Selecione o costureiro</option>{candidates.map(name=><option key={workshopKey(name)} value={name}>{name}</option>)}</select></label>
        <label>Data de envio<input type="date" aria-label={`Data de envio da OC ${s.oc}`} value={sendDates[s.id]??todayInput()} onChange={e=>setSendDates(v=>({...v,[s.id]:e.target.value}))}/></label>
        <label>Valor por peça (R$) *<input inputMode="decimal" disabled={!selected} value={value} onChange={e=>setPriceOverride(v=>({...v,[priceId]:e.target.value}))} placeholder="Informe o valor"/></label>
       </div>
       {type&&!candidates.length&&<p className="sheet-price-warning">Nenhum costureiro cadastrado faz {type}. Confira as categorias em Oficinas e costureiros.</p>}
       <div className="sheet-card-actions"><button type="button" className="primary-button" disabled={busy||!selected||!Number.isFinite(parsePrice(value))} onClick={()=>void assign(s)}><Send size={16}/>{busy?'Enviando...':'Confirmar distribuição'}</button>{canAddTailor&&<button type="button" className="outline-button" onClick={onAddTailor}>+ Adicionar costureiro</button>}</div>
      </div>;
    })()}
    <div className="sheet-card-actions">{s.status==='enfesto'&&canEdit&&(isAdmin||s.createdBy===user.uid)&&<button type="button" className="primary-button" onClick={()=>editEnfestoSheet(s)}>EDITAR FICHA ENVIADA</button>}<button type="button" className="outline-button" onClick={()=>print({...s,assignedTailor:s.assignedTailor||''})}><Printer size={16}/> BAIXAR / IMPRIMIR FICHA PDF</button></div>
   </div>
  </details>)}</div>
  {historical.length>historyLimit&&<button type="button" className="outline-button sheet-show-more" onClick={()=>setHistoryLimit(n=>n+50)}>Mostrar mais 50 fichas ({historical.length-historyLimit} restantes)</button>}
 </section>}
 {tab==='distribution'&&canDistribute&&<section className="sheet-list sheet-distribution-view">
  {canAddTailor&&<button type="button" className="outline-button" onClick={onAddTailor}>+ Adicionar costureiro</button>}
  <div className="sheet-view-head"><div><h2>Centro de Distribuição</h2><p>As fichas chegam automaticamente aqui após a confirmação do Enfesto. Abra a OC, escolha o costureiro e a data de envio: o sistema cria a OC em OCs e pagamentos ao confirmar, sem duplicar OCs já existentes.</p></div><span className="sheet-view-count">{pending.length} ficha(s) disponíveis</span></div>
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
     <summary className="sheet-distribution-summary"><span className="sheet-oc-label">OC {s.oc}</span><span className="sheet-distribution-identifiers"><span className="sheet-distribution-ref">REF {s.reference||'—'}</span><span className="sheet-distribution-type">{(pieceType[s.id]??s.pieceType)||'TIPO NÃO INFORMADO'}</span></span><span className="sheet-status-pill is-pending">AGUARDANDO ENVIO</span><ChevronDown size={19}/></summary>
     <div className="sheet-distribution-body">
     <h3>{s.model||'Modelo não informado'}</h3>
     <p className="sheet-card-meta"><b>CLIENTE: {(s.client||'MB').toLocaleUpperCase('pt-BR')}</b> · <b>REF {s.reference||'—'}</b> · {s.colors.filter(row=>row.cor.trim()).length} cores · <b>{sheetQuantity(s).toLocaleString('pt-BR')} peças</b></p>
     <div className="sheet-send-fields">
      <label>Tipo da peça<input list={`sheet-types-${s.id}`} maxLength={80} value={pieceType[s.id]??s.pieceType??''} onChange={e=>{setPieceType(v=>({...v,[s.id]:e.target.value}));setTailor(v=>({...v,[s.id]:''}));setPriceOverride(v=>Object.fromEntries(Object.entries(v).filter(([key])=>!key.startsWith(s.id+':'))))}} placeholder="Ex.: Camiseta ou Bermuda"/><datalist id={`sheet-types-${s.id}`}>{TYPES.map(t=><option key={t} value={t}/>)}</datalist></label>
      <label className="sheet-tailor-picker">Costureiro / oficina * (obrigatório)<select required aria-label={`Costureiro para a OC ${s.oc}`} value={selectedOffice} disabled={!type} onChange={e=>setTailor(v=>({...v,[s.id]:e.target.value}))}>
       <option value="">{type?'Selecione o costureiro':'Informe o tipo da peça primeiro'}</option>
       {candidates.map(name=><option key={workshopKey(name)} value={name}>{name}</option>)}
      </select></label>
      <label>Data de envio<span className="sheet-input-icon"><CalendarDays size={15}/><input type="date" aria-label={`Data de envio da OC ${s.oc}`} value={sendDates[s.id]??todayInput()} onChange={e=>setSendDates(v=>({...v,[s.id]:e.target.value}))}/></span></label>
      <label>Valor por peça (R$)<input inputMode="decimal" value={value} disabled={!selectedOffice} onChange={e=>setPriceOverride(v=>({...v,[priceId]:e.target.value}))} placeholder={selectedOffice?'Informe o valor':'Selecione o costureiro'}/></label>
     </div>
     {type&&!candidates.length&&<div className="sheet-price-warning">Nenhuma oficina compatível com {type}. Confira as categorias em Configurações → Oficinas e costureiros.</div>}
     {canAddTailor&&<button className="outline-button" type="button" onClick={onAddTailor}>+ Cadastrar novo costureiro</button>}
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
  <div className="sheet-view-head"><div><h2>Costureiros — fichas em andamento</h2><p>Somente fichas enviadas com OC ainda não entregue. Consulte, imprima e, se autorizado, troque o costureiro aqui.</p></div><span className="sheet-view-count">{atOffice.length} ficha(s) em andamento</span></div>
  <label className="sheet-quick-search sheet-distribution-search"><Search size={18}/><input aria-label="Pesquisar fichas enviadas por OC ou costureiro" type="search" value={sentSearch} onChange={e=>setSentSearch(e.target.value)} placeholder="Pesquisar OC, REF, modelo ou costureiro..."/></label>
  {!sentFiltered.length&&<div className="sheet-no-results"><FileText size={29}/><strong>Nenhuma ficha enviada encontrada.</strong><span>As fichas aparecerão aqui após a distribuição e sairão quando a OC for marcada como ENTREGUE.</span></div>}
  <div className="sheet-office-list">
   {sentGroups.map(group=><details className="sheet-office-group" key={workshopKey(group.name)}>
    <summary><span className="sheet-office-avatar"><Building2 size={22}/></span><span className="sheet-office-summary-title"><strong>{group.name}</strong><small>{group.items.length} ficha(s) enviadas</small></span><span className="sheet-office-number">{group.items.length}</span><ChevronDown className="sheet-office-arrow" size={19}/></summary>
    <div className="sheet-office-inner"><div className="sheet-distribution-grid">
     {group.items.map(s=><article className="sheet-card sheet-send-card sheet-assigned-card" key={s.id}>
      <div className="sheet-card-top"><span className="sheet-oc-label">OC {s.oc}</span><span className="sheet-status-pill is-assigned">Enviada</span></div>
      <h3>{s.model||'Modelo não informado'}</h3>
      <p className="sheet-card-meta"><b>CLIENTE: {(s.client||'MB').toLocaleUpperCase('pt-BR')}</b> · <b>REF {s.reference||'—'}</b> · {s.pieceType||'Tipo não informado'} · <b>{sheetQuantity(s).toLocaleString('pt-BR')} peças</b></p>
      <div className="sheet-card-office"><Building2 size={16}/><span>{s.assignedTailor}</span></div>
      {reassignControl(s)}
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
