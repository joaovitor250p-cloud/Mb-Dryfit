import { useContext, useEffect, useState } from 'react';
import { Building2, CalendarDays, CheckCircle2, ChevronDown, Clock3, FileText, PackageCheck, Printer, Search, Send } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, type Firestore } from 'firebase/firestore';
import {KEY,TYPES,TAILORS,canSewType,normalizedGarmentType,parsePrice,currency,priceWithMauroMinimum} from './lib/referencePrices';
import { safeProviderMessage } from './lib/safeMessage';
import SheetPrint from './SheetPrint';
import { PageActiveContext } from './lib/pageMemory';
import { workshopKey, canonicalWorkshopName } from './lib/workshopNames';

type ColorRow = {cor:string;p:string;m:string;g:string;gg:string;xg:string;detalhes:string};
type Sheet = {id:string;createdBy:string;model:string;reference:string;pieceType?:string;fabric?:string;composition:string;trims:string;officeInstructions:string;oc:string;withdrawalDate:string;volumes?:string;tailorInstructions:string;finishingInstructions:string;colors:ColorRow[];status:'draft'|'pending'|'assigned';assignedTailor:string};
type FormData = Omit<Sheet,'id'|'status'|'assignedTailor'|'createdBy'>;
const blankRow=():ColorRow=>({cor:'',p:'',m:'',g:'',gg:'',xg:'',detalhes:''});
const validQuantities=(rows:ColorRow[])=>rows.every(r=>(['p','m','g','gg','xg'] as const).every(k=>!r[k].trim()||(/^\d+$/.test(r[k].trim())&&Number.isSafeInteger(Number(r[k])))));
const todayInputFromDate=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayInput=()=>todayInputFromDate(new Date());
const displayDate=(raw:string)=>/^\d{4}-\d{2}-\d{2}$/.test(raw)?`${raw.slice(8,10)}/${raw.slice(5,7)}/${raw.slice(0,4)}`:raw;
const blank=():FormData=>({model:'',reference:'',pieceType:'',fabric:'',composition:'',trims:'',officeInstructions:'',oc:'',withdrawalDate:'',volumes:'',tailorInstructions:'',finishingInstructions:'',colors:[blankRow(),blankRow(),blankRow(),blankRow(),blankRow(),blankRow(),blankRow(),blankRow()]});
export default function ProductionSheets({db,user,canEdit,canDistribute,initialTab}:{db:Firestore;user:User;canEdit:boolean;canDistribute:boolean;initialTab:'create'|'distribution'}) {
 const active=useContext(PageActiveContext);
 const [tab,setTab]=useState<'create'|'drafts'|'all'|'distribution'>(initialTab);
 const [form,setForm]=useState<FormData>(blank);
 const [sheets,setSheets]=useState<Sheet[]>([]);
 const [pieceType,setPieceType]=useState<Record<string,string>>({});const [priceOverride,setPriceOverride]=useState<Record<string,string>>({});
 const [prices,setPrices]=useState<{reference:string;type:string;price:string}[]>([]);const [workshops,setWorkshops]=useState<{name:string;types:string[];specialPrices:{reference:string;type:string;price:string}[]}[]>([]);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [lastAssigned,setLastAssigned]=useState<(FormData & {assignedTailor:string;sentLabel:string})|null>(null);
 const [editingId,setEditingId]=useState<string|null>(null);
 const [historySearch,setHistorySearch]=useState('');
 const [historyOffice,setHistoryOffice]=useState('all');
 const [historyLimit,setHistoryLimit]=useState(50);
 const [distributionSearch,setDistributionSearch]=useState('');
 const [sendDates,setSendDates]=useState<Record<string,string>>({});
 const [printSheet,setPrintSheet]=useState<FormData & {assignedTailor:string}|null>(null);
 const print=(sheet:FormData & {assignedTailor:string})=>{
   const used=sheet.colors.filter(r=>Object.values(r).some(v=>String(v).trim()));
   if(used.length>14){setError('Esta ficha tem mais de 14 linhas preenchidas. Para manter a impressão legível em uma página A4, divida as cores em outra ficha.');return;}
   setPrintSheet(sheet);
 };
 useEffect(()=>{if(!printSheet||!active)return;const previousTitle=document.title;document.title=`Ficha_OC_${(printSheet.oc||'sem_numero').replace(/[^a-zA-Z0-9_-]/g,'_')}`;const timeout=window.setTimeout(()=>window.print(),350);return()=>{window.clearTimeout(timeout);document.title=previousTitle};},[printSheet,active]);
 useEffect(()=>{const clear=()=>setPrintSheet(null);window.addEventListener('afterprint',clear);return()=>window.removeEventListener('afterprint',clear);},[]);
 useEffect(()=>{if(!active||(!canEdit && !canDistribute))return;return onSnapshot(collection(db,'production_sheets'),snap=>setSheets(snap.docs.map(d=>({...(d.data() as Omit<Sheet,'id'>),id:d.id,assignedTailor:canonicalWorkshopName(d.data().assignedTailor)}))),e=>setError(safeProviderMessage(e)));},[db,active,canEdit,canDistribute]);
 useEffect(()=>{if(!active||!canDistribute)return;return onSnapshot(collection(db,'reference_prices'),snap=>setPrices(snap.docs.map(x=>x.data() as {reference:string;type:string;price:string})),e=>setError(safeProviderMessage(e)));},[db,active,canDistribute]);
 useEffect(()=>{if(!active||!canDistribute)return;return onSnapshot(collection(db,'workshops'),snap=>setWorkshops(snap.docs.map(x=>x.data() as {name:string;types:string[];specialPrices:{reference:string;type:string;price:string}[]})),e=>setError(safeProviderMessage(e)));},[db,active,canDistribute]);
 useEffect(()=>setTab(initialTab),[initialTab]);
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
 const field=(key:Exclude<keyof FormData,'colors'>,label:string,large=false)=> <label className="sheet-field"><strong>{label}</strong>{large?<textarea value={form[key] as string} maxLength={4000} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}/>:<input value={form[key] as string} maxLength={250} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}/>}</label>;
 const save=async(status:'draft'|'pending')=>{if(!canEdit)return;if(status==='pending'&&(!form.model.trim()||!form.oc.trim()||!form.reference.trim()||!form.pieceType?.trim())){setError('Preencha o modelo, a REF, a OC e selecione o tipo de roupa antes de enviar.');return;}if(!validQuantities(form.colors)){setError('Confira as quantidades: use apenas números inteiros, sem valores negativos.');return;}if(form.volumes?.trim()&&!/^\d{1,6}$/.test(form.volumes.trim())){setError('Em VOL, digite somente a quantidade (até 6 dígitos).');return;}setBusy(true);setError('');setMessage('');try{const payload={...form,model:form.model.trim(),reference:form.reference.trim().toUpperCase(),pieceType:form.pieceType||'',fabric:form.fabric?.trim()||'',volumes:form.volumes?.trim()||'',oc:form.oc.trim(),colors:form.colors.filter(r=>Object.values(r).some(v=>v.trim())).slice(0,50),status,updatedAt:serverTimestamp(),updatedBy:user.uid};if(editingId){await updateDoc(doc(db,'production_sheets',editingId),payload);}else{const generated=doc(collection(db,'production_sheets'));const newSheet=doc(db,'production_sheets',`ficha_${generated.id}`);await setDoc(newSheet,{...payload,assignedTailor:'',assignedAt:null,assignedBy:null,createdAt:serverTimestamp(),createdBy:user.uid});}setForm(blank());setEditingId(null);setMessage(status==='draft'?'Rascunho salvo.':'Ficha enviada para distribuição.');if(status==='draft')setTab('drafts');}catch(e){setError(safeProviderMessage(e));}finally{setBusy(false);}};
 const editDraft=(s:Sheet)=>{setForm({model:s.model,reference:s.reference,pieceType:s.pieceType||'',fabric:s.fabric||'',composition:s.composition,trims:s.trims,officeInstructions:s.officeInstructions,oc:s.oc,withdrawalDate:s.withdrawalDate||'',volumes:s.volumes||'',tailorInstructions:s.tailorInstructions,finishingInstructions:s.finishingInstructions,colors:s.colors.length?s.colors:[blankRow()]});setEditingId(s.id);setTab('create');setError('');};
 const quantity=(v:string)=>{const n=Number(v.trim());return Number.isSafeInteger(n)&&n>=0?n:0;};
 const tableRows=(rows:ColorRow[],editable:boolean)=> <div className="sheet-table-wrap"><table className="sheet-table"><thead><tr>{['CORES','P','M','G','GG','XG','DETALHES'].map(k=><th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map((row,i)=><tr key={i}>{(['cor','p','m','g','gg','xg','detalhes'] as const).map(k=><td key={k}>{editable?(k==='detalhes'?<textarea className="sheet-detail-input" aria-label={`Detalhes linha ${i+1}`} rows={2} maxLength={240} value={row[k]} onChange={e=>setForm(v=>({...v,colors:v.colors.map((r,j)=>j===i?{...r,[k]:e.target.value}:r)}))}/>:<input aria-label={`${k} linha ${i+1}`} type={k==='p'||k==='m'||k==='g'||k==='gg'||k==='xg'?'number':'text'} min={k==='p'||k==='m'||k==='g'||k==='gg'||k==='xg'?0:undefined} step="1" value={row[k]} onChange={e=>setForm(v=>({...v,colors:v.colors.map((r,j)=>j===i?{...r,[k]:e.target.value}:r)}))}/>):row[k]}</td>)}</tr>)}<tr className="sheet-total-row"><th>TOTAL</th>{(['p','m','g','gg','xg'] as const).map(k=><td key={k}>{rows.reduce((sum,r)=>sum+quantity(r[k]),0)}</td>)}<td>GERAL: {rows.reduce((sum,r)=>sum+(['p','m','g','gg','xg'] as const).reduce((v,k)=>v+quantity(r[k]),0),0)}</td></tr></tbody></table></div>;
 const assign=async(s:Sheet,officeName:string)=>{if(!canDistribute||busy)return;const name=canonicalWorkshopName(officeName),type=normalizedGarmentType(pieceType[s.id]||s.pieceType||'');if(!name){setError('Selecione o costureiro.');return;}const matches=workshops.filter(w=>workshopKey(w.name)===workshopKey(name));const options=matches.flatMap(w=>w.types||[]);if(!type||!canSewType(name,type,options)){setError('Este costureiro não produz o tipo de roupa selecionado. Confira o cadastro em Configurações → Oficinas.');return;}const suggested=getPrice(s,name,type),value=priceOverride[`${s.id}:${workshopKey(name)}`]??suggested,amount=parsePrice(value);if(!Number.isFinite(amount)){setError('VERIFIQUE SE A REFERÊNCIA ESTÁ CORRETA. SE FOR UMA REF NOVA, INFORME O VALOR POR PEÇA ANTES DE DISTRIBUIR.');return;}if(!validQuantities(s.colors)){setError('Esta ficha tem quantidades inválidas. Corrija os tamanhos antes de distribuir.');return;}const qty=s.colors.reduce((n,r)=>n+(['p','m','g','gg','xg'] as const).reduce((sum,k)=>sum+quantity(r[k]),0),0);if(!Number.isSafeInteger(qty)||qty<=0){setError('Informe quantidades válidas antes de distribuir.');return;}
 const sentISO=sendDates[s.id]||todayInput();
 const sentDate=new Date(`${sentISO}T12:00:00`);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(sentISO)||Number.isNaN(sentDate.getTime())||todayInputFromDate(sentDate)!==sentISO){setError('Escolha uma data de envio válida para a ficha.');return;}
 setBusy(true);setError('');try{const orderRef=doc(db,'cut_orders',s.id);/* A gravação em lote usa ID fixo da ficha: uma segunda tentativa é negada pelas regras de criação. */const br=(d:Date)=>`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`,due=new Date(sentDate.getFullYear(),sentDate.getMonth(),sentDate.getDate()+10),money=(n:number)=>currency(n);const fields=['oc','ref','model','office','qty','piecePrice','entry','sent','due','status','deliveredFlag','deliveredAt','defects','discountPiece','discountTotal','total','paidAt','paymentDone'];const order={...Object.fromEntries(fields.map(k=>[k,''])),oc:s.oc,ref:s.reference,model:s.model,office:name,qty:String(qty),piecePrice:money(amount),sent:br(sentDate),due:br(due),status:'EM ANDAMENTO',total:money(qty*amount),source:'manual',manualTotal:false,createdBy:user.uid,createdAt:serverTimestamp(),updatedBy:user.uid,updatedAt:serverTimestamp()};const batch=writeBatch(db);batch.update(doc(db,'production_sheets',s.id),{status:'assigned',assignedTailor:name,assignedAt:serverTimestamp(),assignedBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid});batch.set(orderRef,order);await batch.commit();setMessage(`Ficha OC ${s.oc} enviada para ${name} em ${displayDate(sentISO)}. A OC foi criada em OCs e pagamentos.`);setLastAssigned({...s,pieceType:type,assignedTailor:name,sentLabel:displayDate(sentISO)});}catch(e){const code=String((e as {code?:string})?.code||'');setError((code?`Firebase (${code}): `:'')+safeProviderMessage(e)+(code==='permission-denied'?' — Confirme a permissão sheet_distribution, as regras publicadas e a configuração do projeto Firebase.':''));}finally{setBusy(false);}};
 const drafts=sheets.filter(s=>s.status==='draft'&&s.createdBy===user.uid);
 const pending=sheets.filter(s=>s.status==='pending');
 const assigned=sheets.filter(s=>s.status==='assigned');
 const submitted=sheets.filter(s=>s.status!=='draft');
 const officeNames=[...new Map([...TAILORS,...workshops.map(w=>w.name)].map(name=>[workshopKey(name),canonicalWorkshopName(name)] as [string,string])).values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const sheetQuantity=(s:Sheet)=>s.colors.reduce((sum,row)=>sum+(['p','m','g','gg','xg'] as const).reduce((v,k)=>v+quantity(row[k]),0),0);
 const compatibleOffices=(s:Sheet)=>{
   const type=normalizedGarmentType(pieceType[s.id]??s.pieceType??'');
   return officeNames.filter(name=>canSewType(name,type,workshops.filter(w=>workshopKey(w.name)===workshopKey(name)).flatMap(w=>w.types||[])));
 };
 const normSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
 const filteredPending=pending.filter(s=>!distributionSearch.trim()||normSearch([s.oc,s.reference,s.model,s.pieceType||''].join(' ')).includes(normSearch(distributionSearch)));
 const groups=officeNames.map(name=>({name,items:filteredPending.filter(s=>compatibleOffices(s).some(office=>workshopKey(office)===workshopKey(name)))})).filter(g=>g.items.length);
 const unclassified=filteredPending.filter(s=>compatibleOffices(s).length===0);
 const historical=submitted.filter(s=>
   (!historySearch.trim()||normSearch([s.oc,s.reference,s.model,s.assignedTailor||'',s.pieceType||''].join(' ')).includes(normSearch(historySearch)))&&
   (historyOffice==='all'||(historyOffice==='pending'?s.status==='pending':s.status==='assigned'&&workshopKey(s.assignedTailor)===historyOffice))
 ).sort((a,b)=>Number(b.oc)-Number(a.oc));
 const historyOffices=[...new Map(assigned.map(s=>[workshopKey(s.assignedTailor),canonicalWorkshopName(s.assignedTailor)] as [string,string]).filter(([key])=>!!key)).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
 return <section className="sheets-page">
 <div className="sheet-page-heading"><div><span className="sheet-eyebrow">MB REFERÊNCIAS · PRODUÇÃO</span><h1>Fichas de Produção</h1><p>Criação, distribuição por oficina e consulta das fichas enviadas.</p></div></div>
 <div className="sheet-tabs">
  {canEdit&&initialTab==='create'&&<button type="button" className={tab==='create'?'active':''} onClick={()=>setTab('create')}>Nova ficha</button>}
  {canEdit&&initialTab==='create'&&<button type="button" className={tab==='drafts'?'active':''} onClick={()=>setTab('drafts')}>Rascunhos ({drafts.length})</button>}
  {canDistribute&&initialTab==='distribution'&&<button type="button" className={tab==='distribution'?'active':''} onClick={()=>setTab('distribution')}>Distribuição ({pending.length})</button>}
  <button type="button" className={tab==='all'?'active':''} onClick={()=>setTab('all')}>Todas as fichas ({submitted.length})</button>
 </div>
 {error&&<div className="production-alert" role="alert">{error}{error.toLowerCase().includes('permission')&&<p>Verifique se as regras publicadas do Firestore autorizam a distribuição de fichas.</p>}</div>}
 {message&&<div className="production-ok" role="status"><CheckCircle2 size={17}/>{message}</div>}
 {tab==='create'&&canEdit&&<div className="sheet-paper"><div className="sheet-top"><div>{field('model','Modelo:')}{field('reference','REF:')}<label className="sheet-field"><strong>Tipo de roupa (escolha ou escreva):</strong><input list="sheet-types-creator" maxLength={80} placeholder="Ex.: Camiseta, Bermuda ou outro" value={form.pieceType||''} onChange={e=>setForm(v=>({...v,pieceType:e.target.value}))}/><datalist id="sheet-types-creator">{TYPES.map(type=><option key={type} value={type} />)}</datalist></label></div><div>{field('composition','Composição',true)}{field('fabric','Tecido:')}</div></div><div className="sheet-middle">{field('trims','Aviamentos',true)}<div className="sheet-right"><div className="sheet-field"><strong>Oficina - Costureiro</strong><p>Definido exclusivamente na distribuição</p></div>{field('officeInstructions','Inf. p/ oficina',true)}{field('oc','O.C:')}{field('tailorInstructions','Informações dos costureiros:',true)}</div></div>{tableRows(form.colors,true)}<button className="outline-button" disabled={form.colors.length>=50} onClick={()=>setForm(v=>({...v,colors:[...v.colors,blankRow()]}))}>+ Adicionar cor</button>{field('finishingInstructions','Informações acabamento:',true)}<label className="sheet-field sheet-volumes"><strong>VOL</strong><input type="number" min={0} step={1} max={999999} value={form.volumes||''} onChange={e=>setForm(v=>({...v,volumes:e.target.value}))}/></label><div className="sheet-actions"><button className="outline-button" type="button" onClick={()=>print({...form,assignedTailor:''})}>Baixar PDF / Imprimir</button><button className="outline-button" disabled={busy} onClick={()=>void save('draft')}>Salvar rascunho</button><button className="primary-button" disabled={busy} onClick={()=>void save('pending')}>{busy?'Salvando...':'Enviar ficha'}</button></div></div>}
 {tab==='drafts'&&canEdit&&<div className="sheet-list"><h2>Meus rascunhos</h2>{!drafts.length&&<p>Nenhum rascunho salvo.</p>}{drafts.map(s=><article className="sheet-card" key={s.id}><h3>{s.oc?'OC '+s.oc:'Sem OC'} — {s.model||'Sem modelo'}</h3><button className="outline-button" onClick={()=>editDraft(s)}>Continuar preenchimento</button></article>)}</div>}
 {tab==='all'&&(canEdit||canDistribute)&&<section className="sheet-list sheet-all-view">
  <div className="sheet-view-head"><div><h2>Todas as fichas</h2><p>Fichas aguardando envio e fichas distribuídas, sempre disponíveis para consulta e impressão.</p></div><span className="sheet-view-count">{historical.length} ficha(s)</span></div>
  <div className="sheet-filters">
   <label className="sheet-quick-search"><Search size={18}/><input aria-label="Pesquisar ficha por OC, REF ou modelo" type="search" value={historySearch} onChange={e=>{setHistorySearch(e.target.value);setHistoryLimit(50)}} placeholder="Pesquisar OC, REF ou modelo..."/></label>
   <label className="sheet-office-filter"><Building2 size={18}/><select aria-label="Filtrar fichas por oficina" value={historyOffice} onChange={e=>{setHistoryOffice(e.target.value);setHistoryLimit(50)}}>
    <option value="all">Todas as oficinas</option>
    <option value="pending">Aguardando distribuição</option>
    {historyOffices.map(([key,name])=><option key={key} value={key}>{name}</option>)}
   </select></label>
  </div>
  {!historical.length&&<div className="sheet-no-results"><FileText size={27}/><strong>Nenhuma ficha encontrada</strong><span>Experimente outra OC ou selecione outra oficina.</span></div>}
  <div className="sheet-list-grid">{historical.slice(0,historyLimit).map(s=><article className="sheet-card sheet-history-card sheet-overview-card" key={s.id}>
   <div className="sheet-card-top"><span className="sheet-oc-label">OC {s.oc||'—'}</span><span className={`sheet-status-pill ${s.status==='assigned'?'is-assigned':'is-pending'}`}>{s.status==='assigned'?'Enviada':'Aguardando distribuição'}</span></div>
   <h3>{s.model||'Modelo não informado'}</h3>
   <p className="sheet-card-meta"><b>REF {s.reference||'—'}</b> · {s.pieceType||'Tipo não informado'} · {sheetQuantity(s).toLocaleString('pt-BR')} peças</p>
   <div className="sheet-card-office"><Building2 size={16}/><span>{s.status==='assigned'?s.assignedTailor||'Oficina não informada':'Ainda sem oficina definida'}</span></div>
   <div className="sheet-card-actions"><button type="button" className="outline-button" onClick={()=>print({...s,assignedTailor:s.assignedTailor||''})}><Printer size={16}/>{s.status==='assigned'?'Imprimir ficha enviada':'Prévia / imprimir PDF'}</button></div>
  </article>)}</div>
  {historical.length>historyLimit&&<button type="button" className="outline-button sheet-show-more" onClick={()=>setHistoryLimit(n=>n+50)}>Mostrar mais 50 fichas ({historical.length-historyLimit} restantes)</button>}
 </section>}
 {tab==='distribution'&&canDistribute&&<section className="sheet-list sheet-distribution-view">
  <div className="sheet-view-head"><div><h2>Distribuir fichas por oficina</h2><p>Clique no nome do costureiro para ver as fichas disponíveis, escolher a data de envio e criar a OC.</p></div><span className="sheet-view-count">{pending.length} ficha(s) para enviar</span></div>
  {lastAssigned&&<div className="sheet-dispatched-banner"><div><span className="sheet-dispatched-icon"><CheckCircle2 size={23}/></span><div><strong>Ficha enviada! OC {lastAssigned.oc} — {lastAssigned.assignedTailor}</strong><p>Enviada em {lastAssigned.sentLabel}. OC criada em OCs e pagamentos.</p></div></div><button type="button" className="primary-button" onClick={()=>print(lastAssigned)}><Printer size={17}/> Imprimir ficha enviada</button></div>}
  <div className="sheet-distribution-stats">
   <div><Clock3 size={18}/><span>Fichas disponíveis</span><strong>{pending.length}</strong></div>
   <div><Building2 size={18}/><span>Oficinas com fichas</span><strong>{groups.length}</strong></div>
   <div><PackageCheck size={18}/><span>Fichas enviadas</span><strong>{assigned.length}</strong></div>
  </div>
  <label className="sheet-quick-search sheet-distribution-search"><Search size={18}/><input aria-label="Pesquisar OC para distribuir" type="search" value={distributionSearch} onChange={e=>setDistributionSearch(e.target.value)} placeholder="Buscar ficha disponível por OC, REF ou modelo..."/></label>
  {!!pending.length&&<p className="sheet-list-explanation">Uma ficha pode aparecer em mais de uma oficina que produz esse tipo de peça. Ao confirmar o envio, ela sai de todas as listas de disponíveis.</p>}
  {!pending.length&&<div className="sheet-no-results"><CheckCircle2 size={30}/><strong>Nenhuma ficha aguardando distribuição.</strong><span>As fichas enviadas podem ser impressas em Todas as fichas.</span></div>}
  {!!pending.length&&!filteredPending.length&&<div className="sheet-no-results"><Search size={27}/><strong>Nenhuma ficha corresponde à pesquisa.</strong></div>}
  <div className="sheet-office-list">
   {groups.map(group=><details className="sheet-office-group" key={workshopKey(group.name)}>
    <summary><span className="sheet-office-avatar"><Building2 size={22}/></span><span className="sheet-office-summary-title"><strong>{group.name}</strong><small>{group.items.length} {group.items.length===1?'ficha disponível':'fichas disponíveis'}</small></span><span className="sheet-office-number">{group.items.length}</span><ChevronDown className="sheet-office-arrow" size={19}/></summary>
    <div className="sheet-office-inner"><div className="sheet-distribution-grid">
     {group.items.map(s=>{
      const type=normalizedGarmentType(pieceType[s.id]??s.pieceType??'');
      const suggested=getPrice(s,group.name,type);
      const priceId=`${s.id}:${workshopKey(group.name)}`;
      const value=priceOverride[priceId]??suggested;
      const known=prices.some(p=>p.reference.toUpperCase()===s.reference.trim().toUpperCase()&&normalizedGarmentType(p.type)===type);
      return <article className="sheet-card sheet-send-card" key={s.id}>
       <div className="sheet-card-top"><span className="sheet-oc-label">OC {s.oc}</span><span className="sheet-status-pill is-pending">Disponível</span></div>
       <h3>{s.model||'Modelo não informado'}</h3>
       <p className="sheet-card-meta"><b>REF {s.reference||'—'}</b> · {s.colors.length} cores · <b>{sheetQuantity(s).toLocaleString('pt-BR')} peças</b></p>
       <div className="sheet-send-fields">
        <label>Tipo da peça<input list={`sheet-types-${s.id}-${workshopKey(group.name)}`} maxLength={80} value={pieceType[s.id]??s.pieceType??''} onChange={e=>{setPieceType(v=>({...v,[s.id]:e.target.value}));setPriceOverride(v=>Object.fromEntries(Object.entries(v).filter(([key])=>!key.startsWith(s.id+':'))))}} placeholder="Ex.: Camiseta"/><datalist id={`sheet-types-${s.id}-${workshopKey(group.name)}`}>{TYPES.map(t=><option key={t} value={t}/>)}</datalist></label>
        <label>Data de envio<span className="sheet-input-icon"><CalendarDays size={15}/><input type="date" aria-label={`Data de envio da OC ${s.oc}`} value={sendDates[s.id]||todayInput()} onChange={e=>setSendDates(v=>({...v,[s.id]:e.target.value}))}/></span></label>
        <label>Valor por peça (R$)<input inputMode="decimal" value={value} onChange={e=>setPriceOverride(v=>({...v,[priceId]:e.target.value}))} placeholder="Informe o preço"/></label>
       </div>
       {!known&&<div className="sheet-price-warning">Verifique a REF {s.reference}. Para uma referência nova, informe o valor por peça antes de distribuir.</div>}
       {known&&<small className="sheet-price-note">Valor sugerido para {group.name}: {Number.isFinite(parsePrice(suggested))?currency(parsePrice(suggested)):'A informar'}</small>}
       <div className="sheet-card-actions"><button type="button" className="primary-button" disabled={busy||!Number.isFinite(parsePrice(value))} onClick={()=>void assign(s,group.name)}><Send size={16}/>{busy?'Enviando...':'Confirmar envio e criar OC'}</button><button type="button" className="outline-button" onClick={()=>print({...s,pieceType:type,assignedTailor:group.name})}><Printer size={16}/> Prévia da ficha</button></div>
      </article>;
     })}
    </div></div>
   </details>)}
   {!!unclassified.length&&<details className="sheet-office-group sheet-office-unclassified">
    <summary><span className="sheet-office-avatar"><FileText size={22}/></span><span className="sheet-office-summary-title"><strong>Fichas sem oficina compatível</strong><small>Defina o tipo da peça para encontrar costureiros disponíveis</small></span><span className="sheet-office-number">{unclassified.length}</span><ChevronDown className="sheet-office-arrow" size={19}/></summary>
    <div className="sheet-office-inner"><div className="sheet-distribution-grid">
     {unclassified.map(s=><article className="sheet-card sheet-send-card" key={s.id}><div className="sheet-card-top"><span className="sheet-oc-label">OC {s.oc}</span><span className="sheet-status-pill is-pending">A classificar</span></div><h3>{s.model}</h3><p className="sheet-card-meta">REF {s.reference} · {sheetQuantity(s).toLocaleString('pt-BR')} peças</p><label className="sheet-unclassified-field">Tipo da peça (escolha ou escreva)<input list={`sheet-unclassified-${s.id}`} value={pieceType[s.id]??s.pieceType??''} onChange={e=>{setPieceType(v=>({...v,[s.id]:e.target.value}));setPriceOverride(v=>Object.fromEntries(Object.entries(v).filter(([key])=>!key.startsWith(s.id+':'))))}} placeholder="Ex.: Bermuda, Calça, Camiseta"/><datalist id={`sheet-unclassified-${s.id}`}>{TYPES.map(t=><option key={t} value={t}/>)}</datalist></label><small>Se não surgir nenhuma oficina, confira os tipos produzidos em Configurações → Oficinas e costureiros.</small></article>)}
    </div></div>
   </details>}
  </div>
 </section>}
 {printSheet&&createPortal(<SheetPrint sheet={printSheet}/>,document.body)}
 </section>;
}
