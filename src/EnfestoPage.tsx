import {useContext,useEffect,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';
import {createPortal} from 'react-dom';
import SheetPrint,{type PrintableSheet} from './SheetPrint';
import ProtectedEnfestoOcs from './ProtectedEnfestoOcs';
import type {Firestore} from 'firebase/firestore';
import {collection,doc,onSnapshot,runTransaction,serverTimestamp} from 'firebase/firestore';
import {AlertTriangle,CheckCircle2,ChevronDown,ClipboardList,Clock3,FileCheck2,Layers3,PackageCheck,Printer,Save,Scissors,Search,ShieldCheck,Warehouse} from 'lucide-react';
import {PageActiveContext} from './lib/pageMemory';
import {safeProviderMessage} from './lib/safeMessage';
import {calculatedKg,calculateConsumption,makeEnfestoRows,normalizeColor,totalCut,totalExpected,validateEnfesto,type EnfestoColor,type EnfestoDetails,type FichaCor} from './lib/enfestoWorkflow';
import {confirmEnfestoConsumption,finishEnfestoWithoutStock,quantityText,type StockEntry} from './lib/purchasesInventory';
import './enfesto.css';

type Sheet={id:string;oc:string;model:string;reference:string;client?:string;fabric?:string;pieceType?:string;colors:FichaCor[];status:string;assignedTailor?:string;composition?:string;trims?:string;officeInstructions?:string;withdrawalDate?:string;volumes?:string;tailorInstructions?:string;finishingInstructions?:string;enfestoCompletedAt?:{toDate?:()=>Date}};
type Job={id:string;sheetId:string;oc:string;status:'draft'|'completed';rows:EnfestoColor[];notes:string;stockConfirmed:boolean};
type Props={db:Firestore;user:User;companyId:string;canEdit:boolean;isAdmin:boolean};
const empty:EnfestoDetails={rows:[],notes:''};
const number=(v:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(v);
const localKey=(uid:string,id:string)=>'mb-enfesto-progress-'+uid+'-'+id;
const normalizeSearch=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const ocOrder=(a:Sheet,b:Sheet)=>b.oc.localeCompare(a.oc,'pt-BR',{numeric:true});
function readLocal(uid:string,id:string):EnfestoDetails|null{
 try{const data=JSON.parse(localStorage.getItem(localKey(uid,id))||'null');return data&&Array.isArray(data.rows)&&typeof data.notes==='string'?data:null}catch{return null}
}
export default function EnfestoPage({db,user,companyId,canEdit,isAdmin}:Props){
 const active=useContext(PageActiveContext);
 const [sheets,setSheets]=useState<Sheet[]>([]);
 const [jobs,setJobs]=useState<Record<string,Job>>({});
 const [stocks,setStocks]=useState<StockEntry[]>([]);
 const [edits,setEdits]=useState<Record<string,EnfestoDetails>>({});
 const [skipStock,setSkipStock]=useState<Record<string,boolean>>({});
 const [selectedId,setSelectedId]=useState('');
 const [printSheet,setPrintSheet]=useState<PrintableSheet|null>(null);
 const print=(sheet:Sheet)=>{
  const colors=(sheet.colors||[]).map(row=>({...row,detalhes:String((row as FichaCor&{detalhes?:string}).detalhes||'')}));
  setPrintSheet({
   oc:sheet.oc,reference:sheet.reference,model:sheet.model,client:sheet.client||'MB',pieceType:sheet.pieceType||'',
   fabric:sheet.fabric||'',composition:sheet.composition||'',trims:sheet.trims||'',
   officeInstructions:sheet.officeInstructions||'',withdrawalDate:sheet.withdrawalDate||'',
   volumes:sheet.volumes||'',tailorInstructions:sheet.tailorInstructions||'',
   finishingInstructions:sheet.finishingInstructions||'',assignedTailor:sheet.assignedTailor||'',
   colors
  });
 };
 useEffect(()=>{
  if(!printSheet||!active)return;
  const previousTitle=document.title;
  document.title='Ficha_OC_'+(printSheet.oc||'sem_numero').replace(/[^a-zA-Z0-9_-]/g,'_');
  const id=window.setTimeout(()=>window.print(),350);
  return()=>{window.clearTimeout(id);document.title=previousTitle};
 },[printSheet,active]);
 useEffect(()=>{
  const finish=()=>setPrintSheet(null);
  window.addEventListener('afterprint',finish);
  return()=>window.removeEventListener('afterprint',finish);
 },[]);
 const [search,setSearch]=useState('');
 const [section,setSection]=useState<'waiting'|'completed'>('waiting');
 const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[success,setSuccess]=useState('');
 const [confirmFinish,setConfirmFinish]=useState<{sheetId:string;oc:string;noStock:boolean}|null>(null);
 useEffect(()=>{
  if(!active)return;
  const unsubscribe=[
   onSnapshot(collection(db,'production_sheets'),snapshot=>{
    setSheets(snapshot.docs.map(x=>({...(x.data() as Omit<Sheet,'id'>),id:x.id})));
    setLoading(false);
   },e=>{setError('Falha ao ler fichas no Firebase: '+safeProviderMessage(e));setLoading(false)}),
   onSnapshot(collection(db,'enfesto_jobs'),snapshot=>{
    setJobs(Object.fromEntries(snapshot.docs.map(x=>[x.id,{...(x.data() as Omit<Job,'id'>),id:x.id}])));
   },e=>setError('Não foi possível carregar o progresso do enfesto: '+safeProviderMessage(e))),
   onSnapshot(collection(db,'companies',companyId,'inventory'),snapshot=>{
    setStocks(snapshot.docs.map(x=>({...x.data(),id:x.id} as StockEntry)).filter(x=>x.kind==='tecido'&&x.quantityMilli>=0));
   },e=>setError('Não foi possível consultar o estoque: '+safeProviderMessage(e)))
  ];
  return()=>unsubscribe.forEach(stop=>stop());
 },[db,companyId,active]);
 const waiting=useMemo(()=>sheets.filter(x=>x.status==='enfesto').sort(ocOrder),[sheets]);
 const completed=useMemo(()=>sheets.filter(x=>!!x.enfestoCompletedAt&&x.status!=='enfesto').sort(ocOrder),[sheets]);
 const filtered=(section==='waiting'?waiting:completed).filter(x=>!search||normalizeSearch([x.oc,x.model,x.reference,x.fabric||''].join(' ')).includes(normalizeSearch(search)));
 const sheet=sheets.find(x=>x.id===selectedId);
 const job=sheet?jobs[sheet.id]:null;
 const draft=sheet
  ?(edits[sheet.id]||(()=>{
    const saved=job?{rows:job.rows,notes:job.notes}:readLocal(user.uid,sheet.id);
    return {rows:makeEnfestoRows(sheet.colors||[],saved?.rows||[]),notes:saved?.notes||''};
   })())
  :empty;
 const completedCount=waiting.filter(x=>jobs[x.id]?.status==='draft').length;
 const saveEdit=(next:EnfestoDetails)=>{
  if(!sheet||sheet.status!=='enfesto')return;
  setEdits(old=>({...old,[sheet.id]:next}));
  try{localStorage.setItem(localKey(user.uid,sheet.id),JSON.stringify(next))}catch{/* navegador pode não permitir armazenamento */}
 };
 const changeRow=(index:number,patch:Partial<EnfestoColor>)=>saveEdit({...draft,rows:draft.rows.map((r,i)=>i===index?{...r,...patch,checked:patch.checked??(Object.keys(patch).some(k=>k!=='checked')?false:r.checked)}:r)});
 const saveDraft=async()=>{
  if(!sheet||!canEdit||busy||sheet.status!=='enfesto')return;
  if(!draft.rows.length){setError('Esta ficha não possui cores para enfestar. Corrija a ficha de produção.');return}
  setBusy(true);setError('');setSuccess('');
  try{
   const ref=doc(db,'enfesto_jobs',sheet.id),sheetRef=doc(db,'production_sheets',sheet.id);
   await runTransaction(db,async transaction=>{
    const [existing,current]=await Promise.all([transaction.get(ref),transaction.get(sheetRef)]);
    if(!current.exists()||current.data().status!=='enfesto')throw Error('Esta ficha já avançou de etapa.');
    if(existing.exists()&&existing.data().status==='completed')throw Error('O enfesto já foi finalizado.');
    transaction.set(ref,{
     sheetId:sheet.id,oc:sheet.oc,status:'draft',rows:draft.rows,notes:draft.notes.trim().slice(0,500),
     stockConfirmed:false,updatedAt:serverTimestamp(),updatedBy:user.uid,
     ...(!existing.exists()?{createdAt:serverTimestamp(),createdBy:user.uid}:{})
    },{merge:true});
   });
   setSuccess('Progresso salvo no Firebase. Você pode continuar depois, inclusive em outro aparelho.');
  }catch(e){setError('Falha ao SALVAR o progresso da OC '+sheet.oc+': '+safeProviderMessage(e)+'. Nenhuma ficha foi liberada.');setSuccess('')}
  finally{setBusy(false)}
 };
 const requestFinalize=()=>{
  if(!sheet||!canEdit||busy||sheet.status!=='enfesto')return;
  const noStock=!!skipStock[sheet.id];
  const warning=validateEnfesto(draft.rows,stocks,noStock);
  if(warning){setError(warning);setSuccess('');return}
  setError('');
  setConfirmFinish({sheetId:sheet.id,oc:sheet.oc,noStock});
 };
 const finalize=async()=>{
  if(!sheet||!canEdit||busy||sheet.status!=='enfesto'||!confirmFinish||confirmFinish.sheetId!==sheet.id||confirmFinish.oc!==sheet.oc)return;
  const noStock=confirmFinish.noStock;
  if(noStock!==!!skipStock[sheet.id]){setConfirmFinish(null);setError('A escolha de baixa de estoque mudou. Confirme novamente a OC '+sheet.oc+'.');return}
  const warning=validateEnfesto(draft.rows,stocks,noStock);
  if(warning){setConfirmFinish(null);setError(warning);setSuccess('');return}
  setConfirmFinish(null);
  setBusy(true);setError('');setSuccess('');
  const notes=draft.notes.trim().slice(0,500);
  try{
   if(noStock){
    await finishEnfestoWithoutStock({db,uid:user.uid,sheetId:sheet.id,oc:sheet.oc,rows:draft.rows.map(r=>({...r})),notes});
   }else{
    await confirmEnfestoConsumption({
     db,company:companyId,uid:user.uid,confirmationId:sheet.id,oc:sheet.oc,notes,
     lines:draft.rows.map(row=>({stockId:row.stockId,quantity:String(calculateConsumption(row,stocks.find(stock=>stock.id===row.stockId)?.unit||''))})),
     sheetCompletion:{sheetId:sheet.id,oc:sheet.oc,rows:draft.rows.map(row=>({...row})),notes}
    });
   }
   try{localStorage.removeItem(localKey(user.uid,sheet.id))}catch{/* progresso já está salvo no Firebase */}
   setEdits(old=>{const next={...old};delete next[sheet.id];return next});
   setSelectedId('');
   setSuccess('OC '+sheet.oc+' confirmada como ENFESTO CONCLUÍDO! Ficha liberada para o CENTRO DE DISTRIBUIÇÃO, em Distribuir fichas. '+(noStock?'Sem baixa de estoque.':'Estoque atualizado por cor.'));
  }catch(e){setError('Falha ao FINALIZAR o enfesto da OC '+sheet.oc+(noStock?' sem baixa de estoque: ': ' com baixa de estoque: ')+safeProviderMessage(e)+'. Confira o motivo antes de tentar novamente.');setSuccess('')}
  finally{setBusy(false)}
 };
 return <div className="enfesto-page">
  <header className="enfesto-heading"><div><span className="eyebrow">MB REFERÊNCIAS / PRODUÇÃO</span><h1>Enfesto e Corte</h1><p>Receba as fichas, registre camadas, peso por folha e consumo de tecido. Após conferir todas as cores, libere para distribuição.</p></div><span className="enfesto-flow">Ficha → Enfesto → Distribuição → OC</span></header>
  <div className="enfesto-kpis">
   <button type="button" className={section==='waiting'?'active':''} onClick={()=>{setSection('waiting');setSelectedId('')}}><Clock3/><span>Aguardando enfesto</span><strong>{waiting.length}</strong></button>
   <button type="button" onClick={()=>{setSection('waiting');setSelectedId('')}}><Layers3/><span>Com progresso salvo</span><strong>{completedCount}</strong></button>
   <button type="button" className={section==='completed'?'active':''} onClick={()=>{setSection('completed');setSelectedId('')}}><FileCheck2/><span>Enfestos finalizados</span><strong>{completed.length}</strong></button>
  </div>
  {error&&<div className="production-alert" role="alert"><AlertTriangle size={17}/>{error}{error.toLowerCase().includes('permission')&&<span> O Firebase recusou esta operação. Verifique qual etapa aparece no início da mensagem (leitura, salvamento ou finalização); as mesmas regras podem permitir uma etapa e bloquear outra.</span>}</div>}
  {success&&<div className="production-ok" role="status"><CheckCircle2 size={17}/>{success}</div>}
  {isAdmin&&<ProtectedEnfestoOcs db={db} user={user} isAdmin={isAdmin} sheets={sheets} jobs={jobs} onPrepared={id=>{setSection('waiting');setSelectedId(id);setSearch('');setSuccess('OC preparada para Enfesto. Abra a ficha e confirme as cores antes de concluir.')}}/>}
  <div className="enfesto-workspace">
   <aside className="enfesto-list">
    <div className="enfesto-list-head"><h2>{section==='waiting'?'Fichas para enfestar':'Enfestos concluídos'}</h2><span>{filtered.length} ficha(s)</span></div>
    <label className="enfesto-search"><Search size={18}/><input type="search" aria-label="Pesquisar OC do enfesto" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar OC, REF ou modelo..."/></label>
    <div className="enfesto-sheet-list">
     {filtered.map(item=><div className="enfesto-sheet-row" key={item.id}>
      <button type="button" className={selectedId===item.id?'enfesto-sheet selected':'enfesto-sheet'} onClick={()=>setSelectedId(item.id)}>
       <span className="enfesto-oc">OC {item.oc}</span><strong>{item.model}</strong><small>REF {item.reference} · {item.fabric||'Tecido não informado'}</small>
       <span className="enfesto-sheet-footer">{item.status==='enfesto'?jobs[item.id]?.status==='draft'?'Progresso salvo':'Aguardando conferência':'Enfesto finalizado'}<ChevronDown size={15}/></span>
      </button>
      {section==='completed'&&<button type="button" className="enfesto-list-print" title={`Baixar ou imprimir ficha OC ${item.oc}`} aria-label={`Baixar ficha PDF da OC ${item.oc}`} onClick={()=>print(item)}><Printer size={18}/><span>FICHA PDF</span></button>}
     </div>)}
     {!filtered.length&&<div className="enfesto-empty"><ClipboardList size={25}/>{loading?'Carregando fichas...':section==='waiting'?'Nenhuma ficha aguardando enfesto.':'Nenhum enfesto finalizado encontrado.'}</div>}
    </div>
   </aside>
   <section className="enfesto-editor">
    {!sheet?<div className="enfesto-placeholder"><Scissors size={34}/><strong>Selecione uma ficha</strong><p>Escolha uma OC na lista para começar a conferência do enfesto.</p></div>:<>
     <div className="enfesto-editor-head"><div><span className="enfesto-oc">OC {sheet.oc}</span><h2>{sheet.model}</h2><p>REF {sheet.reference} · {sheet.pieceType||'Tipo não informado'} · Tecido: {sheet.fabric||'Não informado'}</p></div><div className="enfesto-editor-tools"><span className={sheet.status==='enfesto'?'enfesto-state':'enfesto-state done'}>{sheet.status==='enfesto'?'Em enfesto':'Enfesto concluído'}</span><button type="button" className="outline-button enfesto-print-button" onClick={()=>print(sheet)}><Printer size={17}/> BAIXAR / IMPRIMIR FICHA PDF</button></div></div>
     <div className="enfesto-totals">
      <div><small>Peças previstas</small><strong>{number(totalExpected(draft.rows))}</strong></div>
      <div><small>Peças cortadas</small><strong>{number(totalCut(draft.rows))}</strong></div>
      <div><small>Cores conferidas</small><strong>{draft.rows.filter(r=>r.checked).length}/{draft.rows.length}</strong></div>
     </div>
     <div className="enfesto-color-list">
      {draft.rows.map((row,i)=>{
       const matching=stocks.filter(item=>item.kind==='tecido'&&normalizeColor(item.color)===normalizeColor(row.cor)&&(item.unit==='KG'||item.unit==='M'));
       const stock=stocks.find(item=>item.id===row.stockId);
       const consumption=stock?calculateConsumption(row,stock.unit):calculatedKg(row);
       return <article key={i} className={'enfesto-color-card '+(row.checked?'checked':'')}>
        <div className="enfesto-color-title"><strong>{row.cor}</strong><span>{row.expected} peças previstas</span></div>
        <div className="enfesto-fields">
         <label>Camadas<input type="number" min="1" step="1" inputMode="numeric" disabled={!canEdit||sheet.status!=='enfesto'} value={row.layers} onChange={e=>changeRow(i,{layers:e.target.value})} placeholder="Ex.: 12"/></label>
         <label>Peso por folha (KG)<input type="text" inputMode="decimal" disabled={!canEdit||sheet.status!=='enfesto'} value={row.weightPerLayer} onChange={e=>changeRow(i,{weightPerLayer:e.target.value})} placeholder="Ex.: 1,200"/></label>
         <label>Peças cortadas<input type="number" min="0" step="1" inputMode="numeric" disabled={!canEdit||sheet.status!=='enfesto'} value={row.cutPieces} onChange={e=>changeRow(i,{cutPieces:e.target.value})}/></label>
         <label>Tecido da cor no estoque<select disabled={!canEdit||sheet.status!=='enfesto'||!!skipStock[sheet.id]} value={row.stockId} onChange={e=>changeRow(i,{stockId:e.target.value,consumption:''})}><option value="">Selecionar tecido...</option>{matching.map(item=><option key={item.id} value={item.id}>{item.material} · {item.unit} · saldo {quantityText(item.quantityMilli)}</option>)}</select></label>
         <label>Consumo real ({stock?.unit||'KG/M'})<input type="text" inputMode="decimal" disabled={!canEdit||sheet.status!=='enfesto'||!!skipStock[sheet.id]} value={row.consumption} onChange={e=>changeRow(i,{consumption:e.target.value})} placeholder={stock?.unit==='KG'?'Automático pelas camadas':'Informe o total usado'}/></label>
        </div>
        <div className="enfesto-color-footer"><span>Consumo calculado: <strong>{Number.isFinite(consumption)?number(consumption):'—'} {stock?.unit||'KG'}</strong></span><label className="enfesto-check"><input type="checkbox" disabled={!canEdit||sheet.status!=='enfesto'} checked={row.checked} onChange={e=>changeRow(i,{checked:e.target.checked})}/> Cor cortada e conferida</label></div>
       </article>;
      })}
     </div>
     <label className="enfesto-notes">Observações do enfesto<textarea rows={3} maxLength={500} disabled={!canEdit||sheet.status!=='enfesto'} value={draft.notes} onChange={e=>saveEdit({...draft,notes:e.target.value})} placeholder="Detalhes do corte, aproveitamento, perda de tecido ou observações..."/></label>
     {sheet.status==='enfesto'&&<div className="enfesto-final-panel">
      <label className="enfesto-no-stock"><input type="checkbox" checked={!!skipStock[sheet.id]} onChange={e=>setSkipStock(old=>({...old,[sheet.id]:e.target.checked}))}/> Finalizar sem baixa de estoque <small>(use apenas se o tecido não estiver cadastrado; ficará registrado)</small></label>
      <div className="enfesto-actions"><button type="button" className="outline-button" disabled={busy||!canEdit} onClick={()=>void saveDraft()}><Save size={17}/> Salvar progresso</button><button type="button" className="primary-button" disabled={busy||!canEdit} onClick={requestFinalize}><ShieldCheck size={17}/>{busy?'Salvando...':'Finalizar Enfesto e liberar ficha'}</button></div>
      <p>Esta etapa não cria a OC de pagamento. A OC será criada quando o distribuidor escolher o costureiro e confirmar o envio da ficha.</p>
     </div>}
     {sheet.status!=='enfesto'&&<div className="enfesto-finished"><PackageCheck size={18}/> Enfesto concluído. Ficha liberada para a etapa de distribuição. {job?.stockConfirmed?'Baixa de tecido registrada no estoque.':'Sem baixa de estoque registrada.'}</div>}
    </>}
   </section>
  </div>
  {confirmFinish&&active&&createPortal(<div className="enfesto-confirm-overlay" role="presentation" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)setConfirmFinish(null)}}>
   <section className="enfesto-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="enfesto-confirm-title" aria-describedby="enfesto-confirm-description">
    <span className="enfesto-confirm-icon"><ShieldCheck size={27}/></span>
    <span className="enfesto-confirm-kicker">CONFIRMAÇÃO DE ENFESTO</span>
    <h2 id="enfesto-confirm-title">OC {confirmFinish.oc} — Confirmar como FEITO?</h2>
    <p id="enfesto-confirm-description">Ao confirmar, o enfesto da <strong>OC {confirmFinish.oc}</strong> será marcado como <strong>CONCLUÍDO</strong> e sua ficha ficará disponível no <strong>CENTRO DE DISTRIBUIÇÃO → Distribuir fichas</strong>.</p>
    <div className="enfesto-confirm-stock"><AlertTriangle size={17}/><span>{confirmFinish.noStock?'A conclusão será registrada SEM baixa de estoque.':'O tecido será baixado do estoque por cor. A baixa é definitiva e não será repetida.'}</span></div>
    <div className="enfesto-confirm-actions"><button type="button" className="outline-button" disabled={busy} onClick={()=>setConfirmFinish(null)}>Cancelar</button><button type="button" className="primary-button" disabled={busy||sheet?.id!==confirmFinish.sheetId} onClick={()=>void finalize()}><CheckCircle2 size={17}/>{busy?'Confirmando...':'Confirmar OC '+confirmFinish.oc+' e enviar à Distribuição'}</button></div>
   </section>
  </div>,document.body)}
  {printSheet&&active&&createPortal(<SheetPrint sheet={printSheet}/>,document.body)}
 </div>;
}
