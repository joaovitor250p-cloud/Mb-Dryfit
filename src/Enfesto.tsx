import { useContext, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { collection, onSnapshot, type Firestore } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { AlertTriangle, Boxes, CheckCircle2, ClipboardList, Printer, Scissors, Search, X } from 'lucide-react';
import { PageActiveContext } from './lib/pageMemory';
import { safeProviderMessage } from './lib/safeMessage';
import { confirmEnfestoConsumption, qtyMilli, quantityText, type StockEntry, type ConsumptionLine, type EnfestoColorAudit } from './lib/purchasesInventory';
import SheetPrint from './SheetPrint';
import './enfesto.css';

type Size='p'|'m'|'g'|'gg'|'xg';
type ColorRow = {cor:string;p:string;m:string;g:string;gg:string;xg:string;detalhes:string};
type Sheet = {
 id:string; oc:string;model:string;reference:string;pieceType?:string;fabric?:string;volumes?:string;
 colors?:ColorRow[];status:string;enfestoConfirmationId?:string;enfestoCompletedAt?:unknown;
 composition?:string;trims?:string;officeInstructions?:string;tailorInstructions?:string;
 finishingInstructions?:string;assignedTailor?:string;
};
type Props = {db:Firestore;user:User;canEdit:boolean;companyId:string};
type Cut = {
 quantities:Record<Size,string>;stockId:string;manualLayers:boolean;layers:string;
 weight:string;confirmedAt?:string;confirmedBy?:string
};
const sizes:Size[]=['p','m','g','gg','xg'];
const qty=(raw:string)=>/^\d+$/.test(raw.trim())&&Number.isSafeInteger(Number(raw))?Number(raw):NaN;
const positivePieces=(row:ColorRow)=>sizes.reduce((sum,k)=>sum+Math.max(0,Number(row[k])||0),0);
const rowsOf=(sheet:Sheet)=>(sheet.colors||[]).map((row,index)=>({row,index})).filter(({row})=>positivePieces(row)>0);
const sumPieces=(sheet:Sheet)=>rowsOf(sheet).reduce((total,{row})=>total+positivePieces(row),0);
const initialCut=(row:ColorRow):Cut=>({quantities:Object.fromEntries(sizes.map(k=>[k,row[k]||'0'])) as Record<Size,string>,
 stockId:'',manualLayers:false,layers:'',weight:''});
const layersOf=(cut:Cut)=>cut.manualLayers?qty(cut.layers):Math.min(...sizes.map(k=>qty(cut.quantities[k])).filter(n=>Number.isFinite(n)&&n>0));
const consumptionMilli=(cut:Cut)=>{const weight=qtyMilli(cut.weight),layers=layersOf(cut);return Number.isSafeInteger(layers)&&layers>0&&Number.isFinite(weight)&&Number.isSafeInteger(weight*layers)?weight*layers:NaN;};
const norm=(input:unknown)=>String(input||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const newerOC=(a:Sheet,b:Sheet)=>b.oc.localeCompare(a.oc,'pt-BR',{numeric:true,sensitivity:'base'});
const storageKey=(uid:string)=>'mb-referencias-enfesto-drafts-'+uid;
const loadCuts=(uid:string):Record<string,Record<number,Cut>>=>{
 try{const v=JSON.parse(localStorage.getItem(storageKey(uid))||'{}');return v&&typeof v==='object'&&!Array.isArray(v)?v:{};}catch{return {};}
};
const displayDateTime=(v:string)=>{const date=new Date(v);return Number.isNaN(date.getTime())?v:date.toLocaleString('pt-BR');};

export default function Enfesto({db,user,canEdit,companyId}:Props){
 const active=useContext(PageActiveContext);
 const [sheets,setSheets]=useState<Sheet[]>([]);
 const [stocks,setStocks]=useState<StockEntry[]>([]);
 const [cuts,setCuts]=useState<Record<string,Record<number,Cut>>>(()=>loadCuts(user.uid));
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [authorizeExcess,setAuthorizeExcess]=useState<Record<string,boolean>>({});
 const [search,setSearch]=useState('');
 const [openedId,setOpenedId]=useState<string|null>(null);
 const [printSheet,setPrintSheet]=useState<Sheet|null>(null);
 const [busyId,setBusyId]=useState<string|null>(null);
 const [error,setError]=useState('');
 const [message,setMessage]=useState('');
 const [showCompleted,setShowCompleted]=useState(false);
 useEffect(()=>{try{localStorage.setItem(storageKey(user.uid),JSON.stringify(cuts));}catch{/* salvamento local opcional */}},[cuts,user.uid]);
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
 const opened=sheets.find(s=>s.id===openedId)||null;
 const readCut=(s:Sheet,index:number,row:ColorRow):Cut=>{
  const original=initialCut(row),stored=cuts[s.id]?.[index];
  return stored&&typeof stored==='object'?{...original,...stored,quantities:{...original.quantities,...stored.quantities}}:original;
 };
 const updateCut=(s:Sheet,index:number,row:ColorRow,patch:Partial<Cut>)=>{
  setCuts(prev=>{const cut=readCut(s,index,row);return {...prev,[s.id]:{...prev[s.id],[index]:{...cut,...patch,confirmedAt:'',confirmedBy:''}}};});
 };
 const confirmColor=(s:Sheet,index:number,row:ColorRow)=>{
  const cut=readCut(s,index,row);
  if(!row.cor?.trim()){setError('Informe a cor na ficha de produção antes de confirmar o corte.');return;}
  if(sizes.some(k=>!Number.isSafeInteger(qty(cut.quantities[k]))||qty(cut.quantities[k])<0)||sizes.every(k=>qty(cut.quantities[k])===0)){
   setError('Confira as quantidades inteiras da cor '+row.cor+' (pelo menos uma peça).');return;
  }
  if(!cut.stockId||!stocks.some(stock=>stock.id===cut.stockId)){setError('Selecione um tecido cadastrado para '+row.cor+'.');return;}
  if(!Number.isFinite(consumptionMilli(cut))){setError('Informe camadas e peso por folha válidos para '+row.cor+'.');return;}
  const confirmedAt=new Date().toISOString(),confirmedBy=user.email||user.uid;
  setCuts(prev=>({...prev,[s.id]:{...prev[s.id],[index]:{...cut,confirmedAt,confirmedBy}}}));
  setError('');setMessage('Cor '+row.cor.toLocaleUpperCase('pt-BR')+' conferida. As cores devem ser confirmadas antes da finalização.');
 };
 const finish=async(s:Sheet)=>{
  if(!canEdit||busyId)return;
  const grades=rowsOf(s);
  if(!grades.length){setError('Esta ficha não tem grade de cores e tamanhos com peças. Corrija a ficha antes do corte.');return;}
  const aggregated=new Map<string,number>();
  const details:EnfestoColorAudit[]=[];
  let anyExcess=false;
  for(const {row,index} of grades){
   const cut=readCut(s,index,row);
   if(!cut.confirmedAt||!cut.confirmedBy){setError('Confirme a conferência das cores: '+grades.filter(({row:r,index:i})=>!readCut(s,i,r).confirmedAt).map(({row:r})=>r.cor||'Sem cor').join(', ')+'.');return;}
   if(sizes.some(k=>!Number.isSafeInteger(qty(cut.quantities[k]))||qty(cut.quantities[k])<0)){setError('Quantidade inválida para '+row.cor+'.');return;}
   if(sizes.some(k=>qty(cut.quantities[k])>Number(row[k]||0)))anyExcess=true;
   const stock=stocks.find(x=>x.id===cut.stockId);
   const used=consumptionMilli(cut),layers=layersOf(cut),weight=qtyMilli(cut.weight);
   if(!stock||!Number.isFinite(used)||used<=0||!Number.isFinite(weight)||weight<=0||!Number.isSafeInteger(used)){
    setError('Confira o tecido, as camadas e o peso por folha da cor '+row.cor+'.');return;
   }
   aggregated.set(stock.id,(aggregated.get(stock.id)||0)+used);
   details.push({cor:row.cor.trim().toLocaleUpperCase('pt-BR'),stockId:stock.id,camadas:layers,pesoFolhaMilli:weight,
    consumoMilli:used,quantidades:Object.fromEntries(sizes.map(k=>[k,qty(cut.quantities[k])])) as EnfestoColorAudit['quantidades'],
    confirmadoPor:cut.confirmedBy,confirmadoEm:cut.confirmedAt});
  }
  if(anyExcess&&!authorizeExcess[s.id]){setError('Há tamanhos acima da quantidade planejada. Marque a autorização de excedente para concluir.');return;}
  if(aggregated.size>5){setError('Esta ficha usa mais de cinco materiais distintos. O limite seguro do Firebase Spark é de cinco por confirmação.');return;}
  for(const [stockId,used] of aggregated){
   const stock=stocks.find(x=>x.id===stockId);
   if(!stock||!Number.isSafeInteger(used)||used<=0||used>stock.quantityMilli){
    setError('Estoque insuficiente para '+(stock?.material||'tecido')+' / '+(stock?.color||'cor')+'. Confira a quantidade antes de finalizar.');return;
   }
  }
  const entries:ConsumptionLine[]=[...aggregated].map(([stockId,used])=>({stockId,quantity:(used/1000).toFixed(3)}));
  const summary=entries.map(line=>{const stock=stocks.find(x=>x.id===line.stockId)!;return stock.material+' / '+stock.color+': '+line.quantity+' '+stock.unit;}).join('\n');
  if(!window.confirm('FINALIZAR ENFESTO DA OC '+s.oc+'?\n\n'+summary+
   '\n\nAs '+grades.length+' cores conferidas serão registradas e a baixa de estoque será feita uma única vez, junto da liberação para distribuição. Não há estorno automático.'))return;
  setBusyId(s.id);setError('');setMessage('');
  try{
   await confirmEnfestoConsumption({db,company:companyId,uid:user.uid,
    confirmationId:s.id,sheetId:s.id,oc:s.oc,lines:entries,notes:notes[s.id]||'',
    colorCuts:details,authorizeExcess:anyExcess&&authorizeExcess[s.id]===true});
   setMessage('Enfesto da OC '+s.oc+' concluído. Consumo por cor gravado, tecido baixado e ficha liberada!');
   setCuts(prev=>{const next={...prev};delete next[s.id];return next;});
   setNotes(prev=>{const next={...prev};delete next[s.id];return next;});
   setOpenedId(null);setShowCompleted(true);
  }catch(e){setError(safeProviderMessage(e,'Não foi possível confirmar o enfesto. Nenhuma etapa deve ser marcada como concluída.'))}
  finally{setBusyId(null)}
 };
 const print=(s:Sheet)=>{
  if((s.colors||[]).filter(r=>r.cor||positivePieces(r)>0).length>14){setError('A ficha contém mais de 14 cores. Divida as cores antes de imprimir em uma única página A4.');return;}
  setPrintSheet(s);
 };
 useEffect(()=>{
  if(!printSheet||!active)return;
  const oldTitle=document.title;document.title='Ficha_OC_'+printSheet.oc.replace(/[^a-zA-Z0-9_-]/g,'_');
  const timeout=window.setTimeout(()=>window.print(),350);
  return()=>{window.clearTimeout(timeout);document.title=oldTitle;};
 },[printSheet,active]);
 useEffect(()=>{const clear=()=>setPrintSheet(null);window.addEventListener('afterprint',clear);return()=>window.removeEventListener('afterprint',clear);},[]);
 useEffect(()=>{
  if(!openedId)return;
  const close=(event:KeyboardEvent)=>{if(event.key==='Escape')setOpenedId(null);};
  window.addEventListener('keydown',close);return()=>window.removeEventListener('keydown',close);
 },[openedId]);
 const activeList=showCompleted?completed:waiting;
 const selectedRows=opened?rowsOf(opened):[];
 const hasExcess=opened?selectedRows.some(({row,index})=>sizes.some(k=>qty(readCut(opened,index,row).quantities[k])>Number(row[k]||0))):false;

 return <section className="enfesto-page">
  <header className="enfesto-head">
   <div className="enfesto-eyebrow"><Scissors size={16}/> MB REFERÊNCIAS / PRODUÇÃO</div>
   <h1>Enfesto e Corte</h1>
   <p>Confira a grade por cor, registre as camadas e o peso por folha, confirme cada cor e finalize. A ficha só segue à distribuição quando o consumo estiver confirmado.</p>
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
  <div className="enfesto-list">
   {!matching(activeList).length&&<div className="enfesto-empty"><Scissors size={30}/><strong>{showCompleted?'Nenhuma ficha com enfesto e corte concluídos.':'Nenhuma ficha pendente ou em andamento.'}</strong><span>{showCompleted?'Os enfestos finalizados ficam disponíveis aqui.':'As fichas enviadas pela produção aparecerão aqui.'}</span></div>}
   {matching(activeList).map(s=><article className="enfesto-card" key={s.id}>
    <div className="enfesto-card-head"><div><span className="enfesto-oc">OC {s.oc}</span><h2>{s.model}</h2><p>REF {s.reference} · {s.pieceType||'Tipo não informado'}</p></div><span className={showCompleted?'enfesto-done':'enfesto-waiting'}>{showCompleted?<><CheckCircle2 size={15}/> FEITO</>:'Aguardando enfesto'}</span></div>
    <div className="enfesto-facts"><span><b>Peças:</b> {sumPieces(s).toLocaleString('pt-BR')}</span><span><b>Tecido:</b> {s.fabric||'Não informado'}</span><span><b>Cores:</b> {rowsOf(s).length}</span><span><b>VOL:</b> {s.volumes||'—'}</span></div>
    <div className="enfesto-card-actions"><button type="button" className="outline-button" onClick={()=>{setOpenedId(s.id);setError('');}}>Abrir ficha</button><button type="button" className="outline-button" onClick={()=>print(s)}><Printer size={15}/> PDF / imprimir</button></div>
   </article>)}
  </div>
  {opened&&active&&createPortal(<div className="enfesto-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)setOpenedId(null);}}>
   <div className="enfesto-modal" role="dialog" aria-modal="true" aria-label={'Ficha de enfesto OC '+opened.oc}>
    <div className="enfesto-modal-head"><div><span className="enfesto-oc">OC {opened.oc}</span><h2>{opened.model}</h2><p>REF {opened.reference} · {opened.pieceType||'Tipo não informado'} · {opened.composition||'Sem composição'}</p></div><div className="enfesto-modal-actions"><button type="button" className="outline-button" onClick={()=>print(opened)}><Printer size={16}/> PDF da ficha</button><button type="button" className="outline-button" onClick={()=>setOpenedId(null)}><X size={17}/> Fechar</button></div></div>
    <div className="enfesto-facts"><span><b>Tecido:</b> {opened.fabric||'Não informado'}</span><span><b>Peças planejadas:</b> {sumPieces(opened).toLocaleString('pt-BR')}</span><span><b>Cores:</b> {selectedRows.length}</span></div>
    {!selectedRows.length&&<div className="production-alert">Esta ordem não tem grade de cores e tamanhos. Salve a grade na ficha de produção antes de executar o corte.</div>}
    <div className="enfesto-color-board">{selectedRows.map(({row,index})=>{
     const cut=readCut(opened,index,row),layers=layersOf(cut),used=consumptionMilli(cut);
     const readOnly=!!opened.enfestoConfirmationId||!canEdit;
     return <section className="enfesto-color-card" key={index}>
      <div className="enfesto-color-head"><h3>{row.cor?.toLocaleUpperCase('pt-BR')||'SEM COR'}</h3><span className={readOnly?'enfesto-done':cut.confirmedAt?'enfesto-done':'enfesto-waiting'}>{readOnly||cut.confirmedAt?'COR OK':'PENDENTE'}</span></div>
      <div className="enfesto-size-grid">{sizes.filter(k=>Number(row[k])>0).map(k=><label key={k}>{k.toUpperCase()} <small>Previsto: {row[k]}</small><input type="number" min="0" step="1" disabled={readOnly} value={cut.quantities[k]} onChange={e=>updateCut(opened,index,row,{quantities:{...cut.quantities,[k]:e.target.value}})}/></label>)}</div>
      <div className="enfesto-cut-grid">
       <label>Camadas <small>{cut.manualLayers?'Manual':'Automático: menor quantidade positiva'}</small><input type="number" min="1" step="1" disabled={readOnly} value={cut.manualLayers?cut.layers:Number.isFinite(layers)?String(layers):''} onChange={e=>updateCut(opened,index,row,{layers:e.target.value,manualLayers:true})}/></label>
       <label>Peso por folha <small>KG ou metros, conforme o tecido</small><input inputMode="decimal" disabled={readOnly} placeholder="Ex.: 1,200" value={cut.weight} onChange={e=>updateCut(opened,index,row,{weight:e.target.value})}/></label>
       <label>Tecido / cor do estoque <small>Saldo existente</small><select disabled={readOnly} value={cut.stockId} onChange={e=>updateCut(opened,index,row,{stockId:e.target.value})}>
        <option value="">Selecione o tecido</option>
        {fabrics.map(stock=><option key={stock.id} value={stock.id}>{stock.material} · {stock.color} · {quantityText(stock.quantityMilli)} {stock.unit}</option>)}
        {cut.stockId&&!fabrics.some(x=>x.id===cut.stockId)&&<option value={cut.stockId}>Tecido sem saldo</option>}
       </select></label>
      </div>
      <div className="enfesto-color-footer"><span><b>Total da cor:</b> {sizes.reduce((sum,k)=>sum+(qty(cut.quantities[k])||0),0)} peças</span><span><b>Consumo:</b> {Number.isFinite(used)?quantityText(used):'—'} {stocks.find(x=>x.id===cut.stockId)?.unit||''}</span></div>
      {!readOnly&&<button type="button" className="outline-button" disabled={!!busyId} onClick={()=>confirmColor(opened,index,row)}>{cut.confirmedAt?'Confirmar novamente '+row.cor:'Confirmar '+row.cor}</button>}
      {!readOnly&&cut.confirmedAt&&<small className="enfesto-confirmed">Confirmado em {displayDateTime(cut.confirmedAt)} · {cut.confirmedBy}</small>}
     </section>;
    })}</div>
    {!opened.enfestoConfirmationId&&canEdit&&<div className="enfesto-finalize">
     {hasExcess&&<label className="enfesto-excess"><input type="checkbox" checked={!!authorizeExcess[opened.id]} onChange={e=>setAuthorizeExcess(v=>({...v,[opened.id]:e.target.checked}))}/> Autorizar quantidade acima do planejado</label>}
     <label className="enfesto-notes">Observações do enfesto<textarea rows={2} maxLength={500} value={notes[opened.id]||''} onChange={e=>setNotes(v=>({...v,[opened.id]:e.target.value}))}/></label>
     {!fabrics.length&&<p className="enfesto-warning"><AlertTriangle size={16}/> Sem tecido com saldo. Cadastre uma entrada em Compras e Estoque antes de concluir.</p>}
     <button type="button" className="primary-button enfesto-finish" disabled={!!busyId||!fabrics.length||!selectedRows.length} onClick={()=>void finish(opened)}><CheckCircle2 size={18}/>{busyId===opened.id?'Finalizando...':'FINALIZAR ENFESTO — FEITO'}</button>
     <p className="enfesto-finance-note">A finalização não seleciona oficina, não cria a OC e não marca pagamento. A OC será criada somente na Distribuição de Fichas.</p>
    </div>}
    {opened.enfestoConfirmationId&&<div className="production-ok"><CheckCircle2 size={17}/> Enfesto concluído. Esta ficha está disponível para distribuição ou já foi enviada.</div>}
    {error&&<div className="production-alert" role="alert">{error}</div>}
   </div>
  </div>,document.body)}
  {printSheet&&active&&createPortal(<SheetPrint sheet={{
   model:printSheet.model,reference:printSheet.reference,pieceType:printSheet.pieceType,
   fabric:printSheet.fabric,composition:printSheet.composition||'',trims:printSheet.trims||'',
   officeInstructions:printSheet.officeInstructions||'',oc:printSheet.oc,
   tailorInstructions:printSheet.tailorInstructions||'',finishingInstructions:printSheet.finishingInstructions||'',
   colors:printSheet.colors||[],assignedTailor:printSheet.assignedTailor||'',volumes:printSheet.volumes
  }}/>,document.body)}
 </section>;
}
