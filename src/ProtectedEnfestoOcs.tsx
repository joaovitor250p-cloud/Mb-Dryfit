import {useEffect,useMemo,useState} from 'react';
import {collection,doc,onSnapshot,runTransaction,serverTimestamp,type Firestore} from 'firebase/firestore';
import type {User} from 'firebase/auth';
import {CheckCircle2,ChevronDown,ClipboardPlus,ShieldCheck,ArrowRight,AlertTriangle} from 'lucide-react';
import {normalizeOcNumber,protectedProductionOcs} from './lib/sheetOcSequence';
import {garmentTypeFromCatalog,upperField} from './lib/sheetCatalogAutofill';
import {safeProviderMessage} from './lib/safeMessage';

type SheetInfo={id:string;oc:string;model:string;reference:string;status:string;colors:unknown[];enfestoCompletedAt?:unknown;assignedTailor?:string};
type JobInfo={status:string};
type OrderInfo={id:string;oc:string;model:string;ref:string;qty:string;office:string;status:string};
type ColorInput={cor:string;p:string;m:string;g:string;gg:string;xg:string};
type FormValue={model:string;reference:string;rows:ColorInput[]};
type Props={db:Firestore;user:User;isAdmin:boolean;sheets:SheetInfo[];jobs:Record<string,JobInfo>;onPrepared:(id:string)=>void};
const blankRow=():ColorInput=>({cor:'',p:'',m:'',g:'',gg:'',xg:''});
const initial=(order?:OrderInfo):FormValue=>({model:upperField(order?.model||''),reference:upperField(order?.ref||''),rows:[blankRow()]});
const numeric=(v:unknown)=>Number(String(v??'').trim())||0;
const total=(rows:ColorInput[])=>rows.reduce((a,row)=>a+(['p','m','g','gg','xg'] as const).reduce((n,k)=>n+numeric(row[k]),0),0);

export default function ProtectedEnfestoOcs({db,user,isAdmin,sheets,jobs,onPrepared}:Props){
 const [orders,setOrders]=useState<OrderInfo[]>([]);
 const [open,setOpen]=useState<string|null>(null);
 const [forms,setForms]=useState<Record<string,FormValue>>({});
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 useEffect(()=>{
  if(!isAdmin)return;
  return onSnapshot(collection(db,'cut_orders'),snap=>{
   setOrders(snap.docs.map(x=>({id:x.id,oc:String(x.data().oc||''),model:String(x.data().model||''),ref:String(x.data().ref||''),qty:String(x.data().qty||''),office:String(x.data().office||''),status:String(x.data().status||'')}))
    .filter(x=>protectedProductionOcs.some(n=>normalizeOcNumber(x.oc)===Number(n))));
  },e=>setError('Não foi possível consultar as OCs antigas: '+safeProviderMessage(e)));
 },[db,isAdmin]);
 const cases=useMemo(()=>protectedProductionOcs.map(oc=>{
  const existing=sheets.filter(x=>normalizeOcNumber(x.oc)===Number(oc));
  const legacy=orders.filter(x=>normalizeOcNumber(x.oc)===Number(oc));
  return {oc,existing,legacy};
 }),[sheets,orders]);
 if(!isAdmin)return null;
 const activate=async(oc:string,id:string)=>{
  const selected=cases.find(item=>item.oc===oc)?.existing.find(x=>x.id===id);
  if(!selected)return;
  if(!window.confirm('Colocar a ficha da OC '+oc+' em Enfesto? A OC financeira e os pagamentos existentes NÃO serão alterados.'))return;
  setBusy(oc);setError('');setMessage('');
  try{
   await runTransaction(db,async transaction=>{
    const sheetRef=doc(db,'production_sheets',id),jobRef=doc(db,'enfesto_jobs',id);
    const [current,job]=await Promise.all([transaction.get(sheetRef),transaction.get(jobRef)]);
    if(!current.exists()||normalizeOcNumber(current.data().oc)!==Number(oc))throw Error('A ficha desta OC foi alterada. Atualize e confira novamente.');
    if(!['draft','pending'].includes(String(current.data().status)))throw Error('Esta OC já avançou e não pode voltar ao Enfesto sem duplicar etapas.');
    if(current.data().enfestoCompletedAt||job.exists()&&job.data().status==='completed')throw Error('O Enfesto já foi finalizado anteriormente. A conclusão e a baixa de estoque não podem ser repetidas.');
    if(current.data().assignedTailor)throw Error('Esta ficha já foi enviada a uma oficina. Não será reaberta automaticamente.');
    transaction.update(sheetRef,{status:'enfesto',updatedAt:serverTimestamp(),updatedBy:user.uid});
   });
   setMessage('OC '+oc+' incluída em Fichas para Enfestar. A ficha e a OC financeira foram preservadas.');
   onPrepared(id);
  }catch(e){setError('OC '+oc+': '+safeProviderMessage(e))}
  finally{setBusy('')}
 };
 const prepare=async(oc:string,legacy?:OrderInfo)=>{
  const form=forms[oc]||initial(legacy);
  const reference=form.reference.trim(),model=form.model.trim();
  const rows=form.rows.filter(row=>row.cor.trim()||(['p','m','g','gg','xg'] as const).some(k=>row[k].trim()));
  if(!model||!reference){setError('OC '+oc+': informe o nome da peça e a REF antes de criar a ficha.');return}
  if(!rows.length||rows.some(row=>!row.cor.trim())){setError('OC '+oc+': informe as cores reais da ficha. Não serão inventadas cores.');return}
  for(const row of rows){
   for(const k of ['p','m','g','gg','xg'] as const){
    if(row[k].trim()&&!/^\d{1,9}$/.test(row[k].trim())){setError('OC '+oc+': quantidades precisam ser números inteiros não negativos.');return}
   }
  }
  const qty=total(rows),expected=legacy?numeric(legacy.qty):0;
  if(qty<=0){setError('OC '+oc+': informe a quantidade por tamanho antes de enviar ao Enfesto.');return}
  if(expected>0&&qty!==expected){setError('OC '+oc+': a soma dos tamanhos ('+qty+') deve conferir com as '+expected+' peças da OC original.');return}
  if(legacy&&legacy.status.trim().toUpperCase()==='ENTREGUE'){
   setError('OC '+oc+' já foi marcada como ENTREGUE. Não é seguro reiniciar seu Enfesto e estoque. Confira o histórico.');return;
  }
  if(!window.confirm('Criar a ficha da OC '+oc+' com '+qty+' peças para o Enfesto? A OC e os pagamentos antigos não serão apagados nem substituídos.'))return;
  setBusy(oc);setError('');setMessage('');
  try{
   const sheetId=legacy?.id||'ficha_oc_'+oc;
   const ref=doc(db,'production_sheets',sheetId);
   await runTransaction(db,async transaction=>{
    const existing=await transaction.get(ref);
    if(existing.exists())throw Error('Esta OC já possui ficha vinculada. Atualize a página.');
    const empty={composition:'',trims:'',officeInstructions:'',withdrawalDate:'',tailorInstructions:'',finishingInstructions:''};
    transaction.set(ref,{
     ...empty,model,reference,pieceType:garmentTypeFromCatalog(model),
     oc,colors:rows.map(row=>({...row,cor:upperField(row.cor).trim(),detalhes:''})),
     status:'enfesto',assignedTailor:'',assignedAt:null,assignedBy:null,
     createdAt:serverTimestamp(),createdBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid
    });
   });
   setMessage('A ficha da OC '+oc+' foi criada e enviada para Enfesto. A OC financeira original foi mantida.');
   setOpen(null);
   onPrepared(sheetId);
  }catch(e){setError('OC '+oc+': '+safeProviderMessage(e))}
  finally{setBusy('')}
 };
 const edit=(oc:string,order:OrderInfo|undefined,fn:(value:FormValue)=>FormValue)=>
  setForms(previous=>({...previous,[oc]:fn(previous[oc]||initial(order))}));
 return <section className="enfesto-protected" aria-label="OCs 752, 753 e 754 para Enfesto">
  <div className="enfesto-protected-head"><div><h2>OCs 752, 753 e 754</h2><p>Prepare as três OCs para Enfesto sem alterar pagamentos ou movimentações antigas.</p></div><ShieldCheck size={24}/></div>
  {error&&<p className="production-alert" role="alert"><AlertTriangle size={16}/>{error}</p>}
  {message&&<p className="production-ok" role="status"><CheckCircle2 size={16}/>{message}</p>}
  <div className="enfesto-protected-grid">
   {cases.map(({oc,existing,legacy})=>{
    const sheet=existing[0],order=legacy[0];
    const form=forms[oc]||initial(order);
    const completed=sheet&&!!sheet.enfestoCompletedAt||sheet&&jobs[sheet.id]?.status==='completed';
    const canReactivate=!!sheet&&existing.length===1&&!completed&&!sheet.assignedTailor&&['draft','pending'].includes(sheet.status);
    return <article key={oc} className="enfesto-protected-card">
     <div className="enfesto-protected-title"><strong>OC {oc}</strong><span>{sheet?sheet.status==='enfesto'?'EM ENFESTO':sheet.status==='assigned'?'NA OFICINA':completed?'ENFESTO CONCLUÍDO':sheet.status==='draft'?'RASCUNHO':'PRONTA PARA DISTRIBUIÇÃO':order?'OC ENCONTRADA · SEM FICHA':'SEM FICHA CADASTRADA'}</span></div>
     {existing.length>1&&<small>Existem várias fichas para esta OC. Confira os documentos antes de reativar.</small>}
     <p>{sheet?.model||order?.model||'Dados ainda não cadastrados'}</p>
     {sheet?.status==='enfesto'&&<button type="button" className="outline-button" onClick={()=>onPrepared(sheet.id)}><ArrowRight size={15}/> Abrir Enfesto da OC {oc}</button>}
     {canReactivate&&<button type="button" disabled={!!busy} className="primary-button" onClick={()=>void activate(oc,sheet.id)}><ClipboardPlus size={16}/> {busy===oc?'Preparando...':'Colocar OC '+oc+' em Enfesto'}</button>}
     {sheet&&!canReactivate&&sheet.status!=='enfesto'&&<small>Registro preservado. Fichas já distribuídas ou com Enfesto concluído não são reiniciadas para evitar duplicar OC ou baixar estoque outra vez.</small>}
     {!sheet&&<div className="enfesto-protected-missing">
      <button type="button" className="outline-button" onClick={()=>{setOpen(open===oc?null:oc);setError('')}}><ChevronDown size={15}/> {open===oc?'Fechar cadastro':'Preparar ficha para Enfesto'}</button>
      {open===oc&&<div className="enfesto-protected-form">
       <label>Nome da peça<input value={form.model} onChange={e=>edit(oc,order,v=>({...v,model:upperField(e.target.value)}))} placeholder="Ex.: CAMISETA UV"/></label>
       <label>REF<input value={form.reference} onChange={e=>edit(oc,order,v=>({...v,reference:e.target.value.replace(/\D/g,'')}))} inputMode="numeric" placeholder="Ex.: 10001"/></label>
       {expectedRow(order)}
       {form.rows.map((row,i)=><div className="enfesto-protected-color" key={i}>
        <label>Cor {i+1}<input value={row.cor} onChange={e=>edit(oc,order,v=>({...v,rows:v.rows.map((r,j)=>j===i?{...r,cor:upperField(e.target.value)}:r)}))} placeholder="COR REAL"/></label>
        <div>{(['p','m','g','gg','xg'] as const).map(k=><label key={k}>{k.toUpperCase()}<input inputMode="numeric" type="number" min="0" value={row[k]} onChange={e=>edit(oc,order,v=>({...v,rows:v.rows.map((r,j)=>j===i?{...r,[k]:e.target.value}:r)}))}/></label>)}</div>
       </div>)}
       <div className="enfesto-protected-actions"><button type="button" className="outline-button" disabled={form.rows.length>=12} onClick={()=>edit(oc,order,v=>({...v,rows:[...v.rows,blankRow()]}))}>+ Cor</button><button type="button" className="primary-button" disabled={!!busy} onClick={()=>void prepare(oc,order)}>Enviar OC {oc} ao Enfesto</button></div>
      </div>}
     </div>}
    </article>
   })}
  </div>
 </section>;
}
function expectedRow(order?:OrderInfo){
 return order?.qty?<p className="enfesto-protected-hint">Quantidade original da OC: <b>{order.qty} peças</b>. Informe as cores e a divisão correta por tamanho.</p>:<p className="enfesto-protected-hint">Informe as cores e quantidades reais antes de preparar a ficha.</p>;
}
