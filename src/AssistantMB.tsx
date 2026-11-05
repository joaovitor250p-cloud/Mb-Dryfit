import { useEffect, useRef, useState } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import {
  collection, doc, getDocs, query, runTransaction,
  serverTimestamp, where,
  type DocumentData, type QueryDocumentSnapshot
} from 'firebase/firestore';
import { Bot, CheckCircle2, ClipboardList, Mic, MicOff, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { fridayForDay, parseAssistantCommand } from './lib/assistantCommands';
import { safeProviderMessage } from './lib/safeMessage';

/** A voz só vira um comando de texto. Toda gravação exige confirmação visual. */
type VoiceRecognizer = {
  lang:string;
  interimResults:boolean;
  maxAlternatives:number;
  onresult: ((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;
  onerror: ((event:{error:string})=>void)|null;
  onend: (()=>void)|null;
  start:()=>void;
  stop:()=>void;
};
type RecognizerConstructor = new()=>VoiceRecognizer;
type Row = {id:string; data:DocumentData};
type Preview =
  | {kind:'pay'; row:Row; paymentDate:string}
  | {kind:'delete-sample'; row:Row}
  | {kind:'change-price'; rows:Row[]; amount:number; reference:string}
  | {kind:'show-order'; row:Row}
  | {kind:'show-price'; rows:Row[]};

type Props = {
  db:Firestore;
  user:User;
  canReadOrders:boolean;
  canEditOrders:boolean;
  canReadSamples:boolean;
  canEditSamples:boolean;
  canReadPrices:boolean;
  canEditPrices:boolean;
};

const safe=(value:unknown)=>String(value??'').trim();
const asRows=(snap:{docs:QueryDocumentSnapshot<DocumentData>[]}):Row[]=>snap.docs.map(doc=>({id:doc.id,data:doc.data()}));
const amount=(value:unknown):number=>{
  const raw=safe(value).replace(/\s|R\$/gi,'');
  const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;
  const n=Number(normalized);
  return Number.isFinite(n)?n:NaN;
};
const money=(value:unknown)=>{
  const n=amount(value);
  return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
};
const errorMessage=(error:unknown)=>safeProviderMessage(error,'Não foi possível executar o comando. Confira suas permissões e tente novamente.');

export default function AssistantMB({
  db,user,canReadOrders,canEditOrders,canReadSamples,canEditSamples,canReadPrices,canEditPrices
}:Props){
  const [open,setOpen]=useState(false);
  const [input,setInput]=useState('');
  const [heard,setHeard]=useState('');
  const [status,setStatus]=useState('Escreva ou fale um comando para começar.');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [selectedPrice,setSelectedPrice]=useState('');
  const [busy,setBusy]=useState(false);
  const [listening,setListening]=useState(false);
  const [error,setError]=useState(false);
  const recognition=useRef<VoiceRecognizer|null>(null);
  const busyRef=useRef(false);
  const inputRef=useRef<HTMLInputElement|null>(null);
  const voiceAvailable=typeof window!=='undefined' && !!((window as Window & {SpeechRecognition?:RecognizerConstructor;webkitSpeechRecognition?:RecognizerConstructor}).SpeechRecognition || (window as Window & {webkitSpeechRecognition?:RecognizerConstructor}).webkitSpeechRecognition);
  useEffect(()=>()=>{recognition.current?.stop();recognition.current=null},[]);
  useEffect(()=>{if(open)inputRef.current?.focus()},[open]);

  const notice=(message:string,failed=false)=>{setError(failed);setStatus(message)};
  const findUnique=async(collectionName:'cut_orders'|'production_samples',oc:string):Promise<Row|null>=>{
    const rows=asRows(await getDocs(query(collection(db,collectionName),where('oc','==',oc))));
    if(rows.length>1)throw new Error(`Encontrei ${rows.length} registros com a OC ${oc}. Confira os registros manualmente antes de executar este comando.`);
    return rows[0]||null;
  };
  const matchingPrices=async(reference:string)=>asRows(await getDocs(query(collection(db,'reference_prices'),where('reference','==',reference))));

  const processCommand=async(message:string)=>{
    if(busyRef.current)return;
    const raw=message.trim();
    if(!raw){notice('Digite ou fale um comando.',true);return;}
    setHeard(raw);setPreview(null);setSelectedPrice('');setError(false);
    busyRef.current=true;setBusy(true);
    try{
      const command=parseAssistantCommand(raw);
      if(command.kind==='pay-order'||command.kind==='find-order'){
        if(!canReadOrders)throw new Error('Seu usuário não tem permissão para consultar Ordens de Corte.');
        const row=await findUnique('cut_orders',command.oc);
        if(!row){notice(`Não encontrei a OC ${command.oc} em Ordem de Corte. Confira o número.`,true);return;}
        if(command.kind==='find-order'){
          setPreview({kind:'show-order',row});notice(`Encontrei a OC ${command.oc}. Nenhuma alteração foi feita.`);return;
        }
        if(!canEditOrders)throw new Error('Seu usuário não tem permissão para marcar Ordens de Corte como pagas.');
        if(safe(row.data.paymentDone).toUpperCase()==='OK'){
          notice(`A OC ${command.oc} já está paga em ${safe(row.data.paidAt)||'data não informada'}. Nenhum novo pagamento foi registrado.`,true);return;
        }
        if(safe(row.data.status).toUpperCase()!=='ENTREGUE')throw new Error(`A OC ${command.oc} ainda não está marcada como ENTREGUE. Confira antes de pagar.`);
        if(!(amount(row.data.total)>0))throw new Error(`A OC ${command.oc} não tem valor válido para pagar. Corrija na Ordem de Corte.`);
        const paymentDate=fridayForDay(new Date());
        setPreview({kind:'pay',row,paymentDate});
        notice(`Encontrei a OC ${command.oc}. Confira os dados e confirme o pagamento para a sexta-feira ${paymentDate}.`);
        return;
      }
      if(command.kind==='delete-sample'){
        if(!canReadSamples)throw new Error('Seu usuário não tem permissão para consultar Amostras.');
        if(!canEditSamples)throw new Error('Seu usuário não tem permissão para excluir Amostras.');
        const row=await findUnique('production_samples',command.oc);
        if(!row){notice(`Não encontrei amostra vinculada à OC ${command.oc}.`,true);return;}
        setPreview({kind:'delete-sample',row});notice(`Encontrei a amostra da OC ${command.oc}. Verifique antes de excluir definitivamente.`);return;
      }
      if(command.kind==='price-change'||command.kind==='price-lookup'){
        if(!canReadPrices)throw new Error('Seu usuário não tem permissão para consultar Preços de REF.');
        const rows=await matchingPrices(command.reference);
        if(!rows.length){notice(`A REF ${command.reference} não está cadastrada em Preços de REF. Não alterei nenhum valor.`,true);return;}
        if(command.kind==='price-lookup'){
          setPreview({kind:'show-price',rows});notice(`Encontrei ${rows.length} preço(s) para a REF ${command.reference}.`);return;
        }
        if(!canEditPrices)throw new Error('Alterar preços exige autorização para editar Configurações → Oficinas / Preços de REF.');
        setPreview({kind:'change-price',rows,reference:command.reference,amount:command.amount});
        setSelectedPrice(rows.length===1?rows[0].id:'');
        notice(rows.length>1?`Esta REF tem ${rows.length} tipos de peça. Escolha qual preço deseja alterar.`:`Confira a mudança da REF ${command.reference} e confirme.`);
        return;
      }
      notice('Não reconheci o comando. Exemplos: “OC 707 paga”, “consultar REF 10088”, “alterar preço da REF 10088 para 4,50” ou “apagar amostra da OC 303”.',true);
    }catch(e){notice(errorMessage(e),true)}
    finally{busyRef.current=false;setBusy(false)}
  };

  const confirm=async()=>{
    if(!preview||busyRef.current)return;
    if(preview.kind!=='pay'&&preview.kind!=='delete-sample'&&preview.kind!=='change-price')return;
    busyRef.current=true;setBusy(true);setError(false);
    try{
      if(preview.kind==='pay'){
        if(!canEditOrders)throw new Error('Você não tem autorização para pagar OCs.');
        const {row,paymentDate}=preview;
        await runTransaction(db,async txn=>{
          const ref=doc(db,'cut_orders',row.id),fresh=await txn.get(ref);
          if(!fresh.exists())throw new Error('Esta OC não existe mais. Atualize a página.');
          if(safe(fresh.data().paymentDone).toUpperCase()==='OK')throw new Error('Esta OC já foi marcada como paga por outro usuário.');
          if(safe(fresh.data().status).toUpperCase()!=='ENTREGUE')throw new Error('A OC precisa estar entregue para ser paga.');
          if(!(amount(fresh.data().total)>0))throw new Error('Esta OC está sem valor válido para pagamento.');
          txn.update(ref,{paymentDone:'OK',paidAt:paymentDate,updatedBy:user.uid,updatedAt:serverTimestamp()});
        });
        notice(`Pagamento da OC ${safe(row.data.oc)} confirmado e registrado na data ${paymentDate}. A Ordem de Corte será atualizada automaticamente.`);
      }else if(preview.kind==='change-price'){
        if(!canEditPrices)throw new Error('Você não tem autorização para alterar preços.');
        const selected=preview.rows.find(row=>row.id===selectedPrice);
        if(!selected)throw new Error('Selecione o tipo de roupa para atualizar o preço correto.');
        const priceText=preview.amount.toFixed(2).replace('.',',');
        await runTransaction(db,async txn=>{
          const ref=doc(db,'reference_prices',selected.id),fresh=await txn.get(ref);
          if(!fresh.exists()||safe(fresh.data().reference).toUpperCase()!==preview.reference.toUpperCase()||safe(fresh.data().price)!==safe(selected.data.price))throw new Error('O cadastro ou o preço da REF mudou. Consulte novamente antes de atualizar.');
          txn.update(ref,{price:priceText,updatedBy:user.uid,updatedAt:serverTimestamp()});
        });
        notice(`REF ${preview.reference} (${safe(selected.data.type)}) alterada para ${money(priceText)}. As OCs antigas não tiveram seus valores modificados.`);
      }else {
        if(!canEditSamples)throw new Error('Você não tem autorização para excluir amostras.');
        const {row}=preview;
        // Mesmo conjunto de subdocumentos que a tela de Amostras já remove.
        const target=doc(db,'production_samples',row.id);
        const audit=doc(collection(db,'audit_log'));
        await runTransaction(db,async txn=>{
          const fresh=await txn.get(target);
          if(!fresh.exists()||safe(fresh.data().oc)!==safe(row.data.oc))throw new Error('A amostra mudou ou foi apagada. Consulte novamente antes de excluir.');
          for(const [sub,id] of [['gallery','photo_2'],['gallery','photo_3'],['photos','photo_1'],['photos','photo_2']] as const){
            txn.delete(doc(db,'production_samples',row.id,sub,id));
          }
          txn.delete(target);
          txn.set(audit,{actorUid:user.uid,actorEmail:user.email||'',action:'excluiu_amostra_assistente',modelName:safe(row.data.name)||`OC ${safe(row.data.oc)}`,before:{oc:safe(row.data.oc),reference:safe(row.data.reference),name:safe(row.data.name)},after:null,at:serverTimestamp()});
        });
        notice(`A amostra da OC ${safe(row.data.oc)} foi excluída. A Ordem de Corte não foi apagada.`);
      }
      setPreview(null);
    }catch(e){notice(errorMessage(e),true)}
    finally{busyRef.current=false;setBusy(false)}
  };

  const startVoice=()=>{
    if(listening){recognition.current?.stop();return;}
    const win=window as Window & {SpeechRecognition?:RecognizerConstructor;webkitSpeechRecognition?:RecognizerConstructor};
    const Constructor=win.SpeechRecognition||win.webkitSpeechRecognition;
    if(!Constructor){notice('Este navegador não disponibiliza reconhecimento de voz. Use o campo de texto ou tente o Chrome/Edge atualizado.',true);return;}
    try{
      const current=new Constructor();recognition.current=current;
      current.lang='pt-BR';current.interimResults=false;current.maxAlternatives=1;
      current.onresult=(event)=>{
        const finalText=event.results[event.results.length-1]?.[0]?.transcript?.trim()||'';
        if(finalText){setInput(finalText);void processCommand(finalText)}
      };
      current.onerror=(event)=>{
        setListening(false);
        const message=event.error==='not-allowed'||event.error==='service-not-allowed'
          ?'Microfone bloqueado. Autorize o microfone nas configurações do navegador e tente novamente.'
          :`Não consegui reconhecer a voz (${event.error}). Você pode digitar o comando.`;
        notice(message,true);
      };
      current.onend=()=>{setListening(false);recognition.current=null};
      setListening(true);notice('Estou ouvindo. Fale um comando como “OC 707 paga”.');
      current.start();
    }catch(e){setListening(false);notice(errorMessage(e),true)}
  };

  const cancel=()=>{setPreview(null);notice('Operação cancelada. Nenhum dado foi alterado.')};
  const selected=preview?.kind==='change-price'?preview.rows.find(row=>row.id===selectedPrice):null;

  return <div className="mb-assistant-root">
    {!open&&<button type="button" className="mb-assistant-launcher" title="Abrir Assistente MB" aria-label="Abrir Assistente MB" onClick={()=>setOpen(true)}><Bot size={23}/><span>Assistente MB</span></button>}
    {open&&<section className="mb-assistant-panel" role="dialog" aria-label="Assistente MB — comandos por texto e voz" aria-modal="false">
      <header className="mb-assistant-header"><div className="mb-assistant-avatar"><Bot size={22}/></div><div><strong>Assistente MB</strong><small>Comandos por texto e voz</small></div><button type="button" onClick={()=>{recognition.current?.stop();setOpen(false)}} aria-label="Fechar assistente"><X size={18}/></button></header>
      <div className="mb-assistant-content" aria-live="polite">
        <p className="mb-assistant-intro">Fale ou digite o que precisa fazer. Vou localizar o registro, mostrar os dados e pedir confirmação antes de alterar.</p>
        {heard&&<div className="mb-assistant-bubble mb-assistant-user"><small>{listening?'Ouvindo':'Você pediu'}</small>{heard}</div>}
        <div className={`mb-assistant-bubble mb-assistant-reply ${error?'is-error':''}`}><small><Bot size={13}/> Assistente MB</small>{status}</div>
        {preview&&<div className="mb-assistant-preview"><h4><ClipboardList size={16}/>{preview.kind==='pay'?'Conferir pagamento':preview.kind==='delete-sample'?'Conferir exclusão':preview.kind==='change-price'?'Conferir alteração de preço':preview.kind==='show-price'?'Preços encontrados':'Ordem de Corte encontrada'}</h4>
          {(preview.kind==='pay'||preview.kind==='delete-sample'||preview.kind==='show-order')&&<dl>
            <div><dt>OC</dt><dd>{safe(preview.row.data.oc)}</dd></div>
            <div><dt>Modelo / peça</dt><dd>{safe(preview.row.data.model||preview.row.data.name)||'—'}</dd></div>
            <div><dt>Costureiro</dt><dd>{safe(preview.row.data.office||preview.row.data.tailor)||'—'}</dd></div>
            <div><dt>Referência</dt><dd>{safe(preview.row.data.ref||preview.row.data.reference)||'—'}</dd></div>
            {preview.kind!=='delete-sample'&&<><div><dt>Valor total</dt><dd>{money(preview.row.data.total)}</dd></div><div><dt>Pagamento</dt><dd>{safe(preview.row.data.paymentDone)==='OK'?'Pago':'Pendente'}</dd></div></>}
            {preview.kind==='pay'&&<div><dt>Data do pagamento</dt><dd>{preview.paymentDate} (sexta-feira)</dd></div>}
          </dl>}
          {preview.kind==='show-price'&&<div className="mb-assistant-price-list">{preview.rows.map(row=><div key={row.id}><strong>{safe(row.data.reference)} · {safe(row.data.type)}</strong><span>{money(row.data.price)}</span></div>)}</div>}
          {preview.kind==='change-price'&&<><label className="mb-assistant-label">Qual tipo de roupa? <select value={selectedPrice} onChange={e=>setSelectedPrice(e.target.value)}><option value="">Escolha a categoria</option>{preview.rows.map(row=><option key={row.id} value={row.id}>{safe(row.data.reference)} · {safe(row.data.type)} · atual {money(row.data.price)}</option>)}</select></label>{selected&&<dl><div><dt>Preço atual</dt><dd>{money(selected.data.price)}</dd></div><div><dt>Novo preço</dt><dd>{money(preview.amount)}</dd></div></dl>}</>}
          {(preview.kind==='pay'||preview.kind==='delete-sample'||preview.kind==='change-price')&&<div className="mb-assistant-preview-actions"><button type="button" className="mb-assistant-cancel" disabled={busy} onClick={cancel}>Cancelar</button><button type="button" className={preview.kind==='delete-sample'?'mb-assistant-danger':'mb-assistant-confirm'} disabled={busy||(preview.kind==='change-price'&&!selectedPrice)} onClick={()=>void confirm()}>{preview.kind==='delete-sample'?<Trash2 size={15}/>:<CheckCircle2 size={15}/>} {busy?'Salvando...':preview.kind==='pay'?'Confirmar pagamento':preview.kind==='delete-sample'?'Excluir amostra':'Alterar preço'}</button></div>}
        </div>}
        <p className="mb-assistant-safety"><ShieldCheck size={14}/> Respeita as permissões do Firebase. Nenhuma mudança é realizada apenas por falar.</p>
      </div>
      <form className="mb-assistant-compose" onSubmit={event=>{event.preventDefault();void processCommand(input)}}><input ref={inputRef} aria-label="Comando para Assistente MB" value={input} maxLength={220} onChange={e=>setInput(e.target.value)} placeholder="Ex.: OC 707 paga" disabled={busy}/><button type="button" className={listening?'mb-assistant-mic is-listening':'mb-assistant-mic'} title={listening?'Parar de ouvir':'Falar comando'} aria-label={listening?'Parar de ouvir':'Falar comando'} onClick={startVoice} disabled={busy}>{listening?<MicOff size={19}/>:<Mic size={19}/>}</button><button className="mb-assistant-send" type="submit" title="Consultar comando" aria-label="Enviar comando" disabled={busy||!input.trim()}><Send size={17}/></button></form>
      {!voiceAvailable&&<small className="mb-assistant-hint">O microfone depende do suporte do navegador. Digitar funciona normalmente.</small>}
    </section>}
  </div>;
}
