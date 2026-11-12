import {useState} from 'react';
import type {Firestore} from 'firebase/firestore';
import {collection,deleteDoc,doc,getDocs,writeBatch} from 'firebase/firestore';
import {AlertTriangle,Download,RefreshCcw,ShieldCheck,Trash2} from 'lucide-react';
import {isProtectedProductionOc} from './lib/sheetOcSequence';
import {safeProviderMessage} from './lib/safeMessage';

type SnapshotItem={id:string;data:Record<string,unknown>};
type CleanupPreview={sheets:SnapshotItem[];jobs:SnapshotItem[];signature:string};
type Props={db:Firestore;isAdmin:boolean};
const snapshotItems=(docs:{id:string;data:()=>Record<string,unknown>}[])=>docs.map(d=>({id:d.id,data:d.data()}));
function candidateSignature(a:SnapshotItem[],b:SnapshotItem[]){
 return JSON.stringify({sheets:a.map(x=>[x.id,x.data.oc,x.data.updatedAt]).sort(),jobs:b.map(x=>[x.id,x.data.oc,x.data.updatedAt]).sort()});
}
export default function ProductionCleanup({db,isAdmin}:Props){
 const [preview,setPreview]=useState<CleanupPreview|null>(null);
 const [confirm,setConfirm]=useState('');
 const [downloaded,setDownloaded]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 if(!isAdmin)return null;
 const collect=async()=>{
  const [allSheets,allJobs]=await Promise.all([
   getDocs(collection(db,'production_sheets')),getDocs(collection(db,'enfesto_jobs'))
  ]);
  const sheets=snapshotItems(allSheets.docs);
  const sheetOcById=new Map(sheets.map(item=>[item.id,item.data.oc]));
  const jobs=snapshotItems(allJobs.docs);
  return {
   sheets:sheets.filter(item=>!isProtectedProductionOc(item.data.oc)),
   jobs:jobs.filter(item=>!isProtectedProductionOc(item.data.oc)&&!isProtectedProductionOc(sheetOcById.get(item.id))),
   signature:candidateSignature(sheets,jobs),
   allSheets:sheets,allJobs:jobs
  };
 };
 const inspect=async()=>{
  setBusy(true);setError('');setMessage('');setDownloaded(false);setConfirm('');
  try{
   const result=await collect();
   setPreview({sheets:result.sheets,jobs:result.jobs,signature:result.signature});
  }catch(e){setError('Não foi possível conferir os registros: '+safeProviderMessage(e))}
  finally{setBusy(false)}
 };
 const backup=()=>{
  if(!preview)return;
  const payload={type:'MB REFERÊNCIAS - BACKUP ANTES DA LIMPEZA',date:new Date().toISOString(),
   protectedOC:['752','753','754'],scope:['production_sheets','enfesto_jobs'],sheets:preview.sheets,jobs:preview.jobs};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json;charset=utf-8'});
  const url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download='backup-fichas-enfesto-'+new Date().toISOString().slice(0,10)+'.json';
  document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
  setDownloaded(true);
 };
 const execute=async()=>{
  if(!preview||!downloaded||confirm!=='APAGAR FICHAS'||busy)return;
  if(!window.confirm('Confirmar exclusão de '+preview.sheets.length+' fichas e '+preview.jobs.length+' registros de Enfesto? As OCs 752, 753 e 754 serão preservadas. OCs financeiras, pagamentos e estoque NÃO serão apagados.'))return;
  setBusy(true);setError('');setMessage('');
  try{
   // Nunca apague registros que mudaram desde a prévia e o backup.
   const current=await collect();
   if(current.signature!==preview.signature)throw Error('Os registros mudaram desde a conferência. Faça nova prévia e baixe outro backup antes de excluir.');
   const remove=async(items:SnapshotItem[],path:string)=>{
    // Operações em lotes com limite inferior a 500 documentos.
    for(let start=0;start<items.length;start+=300){
     const batch=writeBatch(db);
     for(const item of items.slice(start,start+300))batch.delete(doc(db,path,item.id));
     await batch.commit();
    }
   };
   // Primeiro os jobs: sem regra de exclusão para admin, a operação falha
   // ANTES de apagar qualquer ficha de produção.
   await remove(current.jobs,'enfesto_jobs');
   await remove(current.sheets,'production_sheets');
   setPreview(null);setConfirm('');setDownloaded(false);
   setMessage('Limpeza concluída. OCs 752, 753 e 754 preservadas. OCs financeiras, pagamentos e estoque não foram excluídos.');
  }catch(e){setError('Limpeza interrompida: '+safeProviderMessage(e)+'. Consulte o backup antes de repetir uma exclusão.')}
  finally{setBusy(false)}
 };
 return <details className="production-cleanup">
  <summary><Trash2 size={16}/> Limpar fichas e Enfesto de teste (administrador)</summary>
  <div className="production-cleanup-body">
   <p><AlertTriangle size={17}/> <strong>Exclusão permanente e limitada:</strong> esta ação remove somente documentos de Fichas de Produção e registros de Enfesto, exceto as OCs <b>752, 753 e 754</b>. Não apaga OCs de pagamentos, registros de pagamento, amostras nem movimentações de estoque.</p>
   <p>Confirme o conjunto completo antes de excluir. Se também deseja remover OCs financeiras antigas, isso precisa ser decidido separadamente.</p>
   <button type="button" className="outline-button" disabled={busy} onClick={()=>void inspect()}><RefreshCcw size={16}/> Conferir registros antes de excluir</button>
   {preview&&<div className="production-cleanup-preview">
    <strong>Prévia da exclusão</strong>
    <span>{preview.sheets.length} fichas e {preview.jobs.length} registros de Enfesto serão removidos.</span>
    <small>OCs protegidas 752, 753 e 754 não entram na seleção.</small>
    <button type="button" className="outline-button" disabled={busy} onClick={backup}><Download size={16}/> Baixar backup JSON antes da exclusão</button>
    <label>Digite APAGAR FICHAS para confirmar<input type="text" autoComplete="off" value={confirm} onChange={e=>setConfirm(e.target.value.toLocaleUpperCase('pt-BR'))} placeholder="APAGAR FICHAS"/></label>
    <button type="button" className="order-delete-button" disabled={busy||!downloaded||confirm!=='APAGAR FICHAS'} onClick={()=>void execute()}><Trash2 size={16}/> {busy?'Excluindo...':'Excluir somente os registros conferidos'}</button>
   </div>}
   {error&&<p className="production-alert" role="alert">{error}</p>}
   {message&&<p className="production-ok" role="status"><ShieldCheck size={16}/>{message}</p>}
  </div>
 </details>;
}
