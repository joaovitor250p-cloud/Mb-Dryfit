import { useContext, useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { AlertTriangle, Boxes, CheckCircle2, ClipboardList, Plus, Scissors, Search, Trash2 } from 'lucide-react';
import { PageActiveContext } from './lib/pageMemory';
import { safeProviderMessage } from './lib/safeMessage';
import { confirmEnfestoConsumption, qtyMilli, quantityText, type StockEntry, type ConsumptionLine } from './lib/purchasesInventory';
import './enfesto.css';

type ColorRow = {cor:string;p:string;m:string;g:string;gg:string;xg:string;detalhes:string};
type Sheet = {
 id:string; oc:string;model:string;reference:string;pieceType?:string;fabric?:string;volumes?:string;
 colors?:ColorRow[];status:string;enfestoConfirmationId?:string;enfestoCompletedAt?:unknown;
};
type Props = {db:Firestore;user:User;canEdit:boolean;companyId:string};
const sizes=['p','m','g','gg','xg'] as const;
const sumPieces=(sheet:Sheet)=>(sheet.colors||[]).reduce((total,row)=>total+sizes.reduce((sum,k)=>{
 const n=Number(row[k]);return sum+(Number.isSafeInteger(n)&&n>0?n:0);
},0),0);
const initialConsumption=():ConsumptionLine[]=>[{stockId:'',quantity:''}];
const norm=(input:unknown)=>String(input||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const newerOC=(a:Sheet,b:Sheet)=>b.oc.localeCompare(a.oc,'pt-BR',{numeric:true,sensitivity:'base'});

export default function Enfesto({db,user,canEdit,companyId}:Props){
 const active=useContext(PageActiveContext);
 const [sheets,setSheets]=useState<Sheet[]>([]);
 const [stocks,setStocks]=useState<StockEntry[]>([]);
 const [lines,setLines]=useState<Record<string,ConsumptionLine[]>>({});
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [search,setSearch]=useState('');
 const [busyId,setBusyId]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [showCompleted,setShowCompleted]=useState(false);
 useEffect(()=>{
  if(!active)return;
  return onSnapshot(collection(db,'production_sheets'),snap=>{
   setSheets(snap.docs.map(d=>({id:d.id,...d.data()} as Sheet)));
  },e=>setError('Erro ao consultar fichas: '+safeProviderMessage(e)));
 },[active,db]);
 useEffect(()=>{
  if(!active||!canEdit)return;
  return onSnapshot(collection(db,'companies',companyId,'inventory'),snap=>{
   setStocks(snap.docs.map(d=>({id:d.id,...d.data()} as StockEntry)).filter(s=>s.kind==='tecido'&&(s.unit==='KG'||s.unit==='M')));
  },e=>setError('Erro ao consultar tecidos: '+safeProviderMessage(e)));
 },[active,canEdit,db,companyId]);
 const waiting=useMemo(()=>sheets.filter(s=>s.status==='enfesto'||(s.status==='pending'&&!s.enfestoConfirmationId)).sort(newerOC),[sheets]);
 const completed=useMemo(()=>sheets.filter(s=>!!s.enfestoConfirmationId&&(s.status==='pending'||s.status==='assigned')).sort(newerOC),[sheets]);
 const matching=(list:Sheet[])=>list.filter(s=>!search.trim()||norm([s.oc,s.model,s.reference,s.fabric,s.pieceType].join(' ')).includes(norm(search.trim())));
 const fabrics=useMemo(()=>stocks.filter(s=>s.quantityMilli>0).sort((a,b)=>a.material.localeCompare(b.material,'pt-BR')||a.color.localeCompare(b.color,'pt-BR')),[stocks]);
 const update=(id:string,index:number,patch:Partial<ConsumptionLine>)=>{
  setLines(prev=>({...prev,[id]:(prev[id]||initialConsumption()).map((line,i)=>i===index?{...line,...patch}:line)}));
 };
 const finish=async(s:Sheet)=>{
  if(!canEdit||busyId)return;
  const entries=(lines[s.id]||initialConsumption()).filter(line=>line.stockId||line.quantity.trim());
  if(!entries.length||entries.some(line=>!line.stockId||!Number.isFinite(qtyMilli(line.quantity)))){
   setError('Selecione o tecido, a cor e informe a quantidade válida em KG ou metros.');return;
  }
  if(entries.length>5||new Set(entries.map(line=>line.stockId)).size!==entries.length){
   setError('Escolha até cinco tecidos diferentes. Não repita o mesmo material/cor; some a quantidade em uma linha.');return;
  }
  for(const line of entries){
   const stock=stocks.find(item=>item.id===line.stockId);
   if(!stock||stock.quantityMilli<qtyMilli(line.quantity)){
    setError('Saldo insuficiente ou tecido indisponível. Confira os saldos antes de confirmar.');return;
   }
  }
  const confirmation='CONFIRMAR ENFESTO FEITO DA OC '+s.oc+'?\n\n'+entries.map(line=>{
   const stock=stocks.find(item=>item.id===line.stockId)!;
   return stock.material+' / '+stock.color+': '+line.quantity+' '+stock.unit;
  }).join('\n')+'\n\nA ficha será liberada para distribuição e a baixa no estoque ocorrerá na mesma operação. Não haverá estorno automático.';
  if(!window.confirm(confirmation))return;
  setBusyId(s.id);setError('');setMessage('');
  try{
   await confirmEnfestoConsumption({db,company:companyId,uid:user.uid,
    confirmationId:s.id,sheetId:s.id,oc:s.oc,lines:entries,notes:notes[s.id]||''});
   setMessage('Enfesto da OC '+s.oc+' concluído. Tecido baixado e ficha liberada para distribuição!');
   setLines(prev=>{const next={...prev};delete next[s.id];return next;});
   setNotes(prev=>{const next={...prev};delete next[s.id];return next;});
  }catch(e){setError(safeProviderMessage(e,'Não foi possível confirmar o enfesto. Nenhuma etapa deve ser marcada como concluída.'))}
  finally{setBusyId(null)}
 };
 return <section className="enfesto-page">
  <header className="enfesto-head">
   <div className="enfesto-eyebrow"><Scissors size={16}/> MB REFERÊNCIAS / PRODUÇÃO</div>
   <h1>Enfesto</h1>
   <p>Receba as fichas da produção, confira o consumo de tecido por cor e marque como FEITO. Somente fichas concluídas aparecem na distribuição.</p>
  </header>
  <div className="enfesto-summary" role="group" aria-label="Situação do enfesto">
   <button type="button" className={!showCompleted?'active':''} aria-pressed={!showCompleted} onClick={()=>setShowCompleted(false)}><span><ClipboardList size={19}/> ENFESTO / CORTE</span><strong>{waiting.length}</strong><small>Fichas aguardando conclusão</small></button>
   <button type="button" className={showCompleted?'active':''} aria-pressed={showCompleted} onClick={()=>setShowCompleted(true)}><span><CheckCircle2 size={19}/> FINALIZADOS</span><strong>{completed.length}</strong><small>Fichas liberadas ou distribuídas</small></button>
  </div>
  {error&&<div className="production-alert" role="alert">{error}</div>}
  {message&&<div className="production-ok" role="status"><CheckCircle2 size={17}/>{message}</div>}
  <div className="enfesto-controls">
   <label className="enfesto-search"><Search size={18}/><input aria-label="Pesquisar fichas no enfesto" placeholder="Pesquisar OC, REF, modelo ou tecido..." value={search} onChange={e=>setSearch(e.target.value)}/></label>

  </div>
  {!showCompleted&&<div className="enfesto-list">
   {!matching(waiting).length&&<div className="enfesto-empty"><Scissors size={30}/><strong>Nenhuma ficha pendente ou em andamento.</strong><span>As novas fichas enviadas pela produção aparecerão aqui.</span></div>}
   {matching(waiting).map(s=><article className="enfesto-card" key={s.id}>
    <div className="enfesto-card-head"><div><span className="enfesto-oc">OC {s.oc}</span><h2>{s.model}</h2><p>REF {s.reference} · {s.pieceType||'Tipo não informado'}</p></div><span className="enfesto-waiting">Aguardando enfesto</span></div>
    <div className="enfesto-facts"><span><b>Peças:</b> {sumPieces(s).toLocaleString('pt-BR')}</span><span><b>Tecido:</b> {s.fabric||'Não informado na ficha'}</span><span><b>VOL:</b> {s.volumes||'—'}</span></div>
    <div className="enfesto-colors">{(s.colors||[]).filter(c=>c.cor||sizes.some(k=>Number(c[k])>0)).map((c,i)=><span key={i}><b>{c.cor||'Sem cor'}</b> · {sizes.map(k=>k.toUpperCase()+' '+(c[k]||'0')).join(' · ')}</span>)}</div>
    {canEdit&&<div className="enfesto-consumption">
     <h3><Boxes size={17}/> Tecidos usados neste enfesto</h3>
     <p>Selecione o tecido e a cor exatos cadastrados em Compras e Estoque. A quantidade será descontada automaticamente ao confirmar.</p>
     {(lines[s.id]||initialConsumption()).map((line,i)=><div className="enfesto-consumption-row" key={i}>
      <label>Tecido / cor
       <select value={line.stockId} onChange={e=>update(s.id,i,{stockId:e.target.value})}>
        <option value="">Selecione o tecido...</option>
        {fabrics.map(stock=><option key={stock.id} value={stock.id}>{stock.material} · {stock.color} · {quantityText(stock.quantityMilli)} {stock.unit} disponíveis</option>)}
        {line.stockId&&!fabrics.some(x=>x.id===line.stockId)&&<option value={line.stockId}>Tecido sem saldo disponível</option>}
       </select>
      </label>
      <label>Quantidade {stocks.find(x=>x.id===line.stockId)?.unit||'(KG/M)'}
       <input inputMode="decimal" placeholder="Ex.: 2,500" value={line.quantity} onChange={e=>update(s.id,i,{quantity:e.target.value})}/>
      </label>
      <button type="button" className="enfesto-remove" aria-label={'Remover tecido '+(i+1)} disabled={(lines[s.id]||initialConsumption()).length===1} onClick={()=>setLines(prev=>({...prev,[s.id]:(prev[s.id]||initialConsumption()).filter((_,j)=>j!==i)}))}><Trash2 size={17}/></button>
     </div>)}
     <button className="outline-button" disabled={(lines[s.id]||initialConsumption()).length>=5} onClick={()=>setLines(prev=>({...prev,[s.id]:[...(prev[s.id]||initialConsumption()),{stockId:'',quantity:''}]}))}><Plus size={15}/> Adicionar tecido</button>
     <label className="enfesto-notes">Observações do enfesto<textarea value={notes[s.id]||''} maxLength={500} rows={2} onChange={e=>setNotes(v=>({...v,[s.id]:e.target.value}))}/></label>
     {!fabrics.length&&<p className="enfesto-warning"><AlertTriangle size={16}/> Sem tecido com saldo. Cadastre uma entrada em Compras e Estoque antes de concluir.</p>}
     <button type="button" className="primary-button enfesto-finish" disabled={!!busyId||!fabrics.length} onClick={()=>void finish(s)}><CheckCircle2 size={18}/>{busyId===s.id?'Confirmando...':'Marcar FEITO e liberar ficha'}</button>
    </div>}
   </article>)}
  </div>}
  {showCompleted&&<div className="enfesto-list">
   {!matching(completed).length&&<div className="enfesto-empty"><CheckCircle2 size={30}/><strong>Nenhuma ficha com enfesto e corte concluídos.</strong></div>}
   {matching(completed).map(s=><article key={s.id} className="enfesto-card enfesto-complete"><div className="enfesto-card-head"><div><span className="enfesto-oc">OC {s.oc}</span><h2>{s.model}</h2><p>REF {s.reference} · {sumPieces(s).toLocaleString('pt-BR')} peças</p></div><span className="enfesto-done"><CheckCircle2 size={15}/> FEITO</span></div><p>{s.status==='assigned'?'Ficha já distribuída ao costureiro.':'Ficha liberada, aguardando distribuição.'}</p></article>)}
  </div>}
 </section>;
}
