import { useEffect, useRef, useState } from 'react';
import './local-ai.css';
import { createPortal } from 'react-dom';
import type { User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import {
  collection, doc, getDocs, query, runTransaction,
  serverTimestamp, where,
  type DocumentData, type QueryDocumentSnapshot
} from 'firebase/firestore';
import { Bot, CheckCircle2, ClipboardList, Copy, Mic, MicOff, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { fridayForDay, parseAssistantCommand } from './lib/assistantCommands';
import { askFreeAI, isFreeAIConfigured, loadFreeAI } from './lib/freeAI';
import { safeProviderMessage } from './lib/safeMessage';
import { workshopKey, canonicalWorkshopName } from './lib/workshopNames';
import { parseFinanceNumber } from './lib/financeNumbers';

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
type WorkshopReport = {kind:'workshop-debt'|'workshop-pending'|'workshop-production'|'workshop-paid-month'; name:string; orders:Row[]; total:number; qty:number; withoutPrice:number; period?:string};
type WorkshopPix = {kind:'workshop-pix'; name:string; pix:string; phone:string};
type Preview =
  | {kind:'pay'; row:Row; paymentDate:string}
  | {kind:'delete-sample'; row:Row}
  | {kind:'change-price'; rows:Row[]; amount:number; reference:string}
  | {kind:'show-order'; row:Row}
  | {kind:'show-price'; rows:Row[]}
  | WorkshopReport
  | WorkshopPix;

type Props = {
  db:Firestore;
  user:User;
  canReadOrders:boolean;
  canEditOrders:boolean;
  canReadSamples:boolean;
  canEditSamples:boolean;
  canReadPrices:boolean;
  canReadWorkshops:boolean;
  canEditPrices:boolean;
};

const safe=(value:unknown)=>String(value??'').trim();
const asRows=(snap:{docs:QueryDocumentSnapshot<DocumentData>[]}):Row[]=>snap.docs.map(doc=>({id:doc.id,data:doc.data()}));
const amount=(value:unknown):number=>parseFinanceNumber(safe(value));
const money=(value:unknown)=>{
  const n=amount(value);
  return Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
};
const displayName=(name:string)=>canonicalWorkshopName(name)||name.toLocaleUpperCase('pt-BR');
const isPaid=(data:DocumentData)=>safe(data.paymentDone).toLocaleUpperCase('pt-BR')==='OK';
const moneyValue=(n:number)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
const getMonth=(now:Date)=>`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
const paidMonth=(raw:unknown)=>{const date=safe(raw);const br=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date);if(br)return `${br[3]}-${br[2].padStart(2,'0')}`;return /^\d{4}-\d{2}-\d{2}/.test(date)?date.slice(0,7):'';};
const errorMessage=(error:unknown)=>safeProviderMessage(error,'Não foi possível executar o comando. Confira suas permissões e tente novamente.');

export default function AssistantMB({
  db,user,canReadOrders,canEditOrders,canReadSamples,canEditSamples,canReadPrices,canEditPrices,canReadWorkshops
}:Props){
  const [open,setOpen]=useState(false);
  const [input,setInput]=useState('');
  const [heard,setHeard]=useState('');
  const [status,setStatus]=useState('Pergunte pelo PIX, valores a pagar, OCs ou use um comando por voz.');
  const [preview,setPreview]=useState<Preview|null>(null);
  const [selectedPrice,setSelectedPrice]=useState('');
  const [busy,setBusy]=useState(false);
  const [listening,setListening]=useState(false);
  const [error,setError]=useState(false);
  const [copied,setCopied]=useState(false);

  const [aiNote,setAiNote]=useState('');
  const [aiReady,setAiReady]=useState(false);
  const [loadingAI,setLoadingAI]=useState(false);
  const [aiProgress,setAiProgress]=useState('');
  const aiHistory=useRef<Array<{role:'user'|'assistant';text:string}>>([]);
  const recognition=useRef<VoiceRecognizer|null>(null);
  const busyRef=useRef(false);
  const inputRef=useRef<HTMLInputElement|null>(null);
  const voiceAvailable=typeof window!=='undefined' && !!((window as Window & {SpeechRecognition?:RecognizerConstructor;webkitSpeechRecognition?:RecognizerConstructor}).SpeechRecognition || (window as Window & {webkitSpeechRecognition?:RecognizerConstructor}).webkitSpeechRecognition);
  useEffect(()=>()=>{recognition.current?.stop();recognition.current=null},[]);
  useEffect(()=>{if(open)inputRef.current?.focus()},[open]);

  const notice=(message:string,failed=false)=>{setError(failed);setStatus(message)};
  const activateAI=async()=>{
    if(loadingAI||aiReady)return;
    setLoadingAI(true);setAiProgress('Preparando IA local...');
    try{
      await loadFreeAI(setAiProgress);
      setAiReady(true);setAiProgress('IA local carregada. Pode escrever ou falar normalmente.');
      notice('IA local pronta. Os dados reais continuam sendo buscados pelo aplicativo, com suas permissões.');
    }catch(e){notice(`Não foi possível carregar a IA local: ${errorMessage(e)}`,true);setAiProgress('')}
    finally{setLoadingAI(false)}
  };
  // A saída do modelo é texto NÃO CONFIÁVEL; só aceita ações explícitas do usuário.
  const aiIntentMatches=(raw:string,command:ReturnType<typeof parseAssistantCommand>):boolean=>{
    const simplified=raw.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const mentions=(n:string)=>new RegExp(`(^|\\D)${n.replace(/[^0-9]/g,'')}(\\D|$)`).test(simplified);
    const negated=/\b(?:nao|nunca|sem)\b/.test(simplified);
    if(command.kind==='pay-order')return !negated&&mentions(command.oc)&&/\b(?:paga|pago|pagar|pague|quitar|quite|liquidar|marcar como paga)\b/.test(simplified);
    if(command.kind==='delete-sample')return !negated&&mentions(command.oc)&&/\b(?:apaga|apagar|exclui|excluir|remove|remover|deletar)\b/.test(simplified)&&/\bamostra/.test(simplified);
    if(command.kind==='price-change'){
      const prices=[...simplified.matchAll(/(?:r\$\s*)?(\d+(?:[.,]\d{1,2}))\b/g)].map(m=>Number(m[1].replace(',','.')));
      return !negated&&mentions(command.reference)&&/\b(?:mudar|alterar|trocar|corrigir|atualizar)\b/.test(simplified)&&/\b(?:preco|valor|ref|referencia)\b/.test(simplified)&&prices.some(n=>Math.abs(n-command.amount)<0.001);
    }
    if(command.kind==='find-order')return mentions(command.oc);
    if(command.kind==='price-lookup')return mentions(command.reference);
    if(command.kind==='workshop-debt'||command.kind==='workshop-pix'||command.kind==='workshop-pending'||command.kind==='workshop-production'||command.kind==='workshop-paid-month'){
      const key=workshopKey(command.workshop);
      return Boolean(key)&&workshopKey(raw).includes(key);
    }
    return false;
  };
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
    setHeard(raw);setPreview(null);setSelectedPrice('');setError(false);setCopied(false);setAiNote('');
    busyRef.current=true;setBusy(true);
    try{
      let command=parseAssistantCommand(raw);
      // Primeiro usa comandos locais gratuitos. Só consulta a IA quando a frase não foi compreendida.
      if(command.kind==='unknown'&&isFreeAIConfigured&&aiReady){
        const ai=await askFreeAI(user,raw,aiHistory.current,setAiProgress);

        aiHistory.current=[...aiHistory.current,{role:'user' as const,text:raw},{role:'assistant' as const,text:ai.reply}].slice(-6);
        if(ai.command){
          const interpreted=parseAssistantCommand(ai.command);
          // Uma ação financeira com preço especial nunca vira alteração de preço geral.
          const specialPrice=/\b(?:mauro|dario|jony|rodrigo|francisca|ramiro|vitor|theodoro|virg[ií]lio|vig[ií]lio|costureiro|oficina)\b/i.test(raw);
          if(interpreted.kind==='price-change'&&specialPrice){
            notice('Você mencionou um preço por costureiro. Para sua segurança, faça essa alteração em Configurações → Oficinas. Não alterei o preço geral.',true);
            return;
          }
          if(interpreted.kind!=='unknown'&&interpreted.kind!=='help'&&aiIntentMatches(raw,interpreted)){
            command=interpreted;
            setAiNote(`IA local interpretou: “${ai.command}”. Confira os dados antes de confirmar.`);
          }else{
            notice(ai.reply||'Não consegui transformar o pedido em uma operação segura.',true);
            return;
          }
        }else{
          notice(ai.reply||'Não consegui interpretar este pedido. Tente explicar de outro jeito.');
          return;
        }
      }
      if(command.kind==='help'){
        notice('Posso consultar dívidas, PIX, OCs pendentes, peças em produção e pagamentos do mês. Também localizo OCs e referências. Para pagar, mudar preços ou excluir amostras, sempre peço confirmação.');
        return;
      }
      if(command.kind==='workshop-pix'){
        if(!canReadWorkshops)throw new Error('Seu acesso não permite consultar o PIX das Oficinas. Peça autorização ao administrador.');
        const key=workshopKey(command.workshop);
        const matches=asRows(await getDocs(collection(db,'workshops'))).filter(row=>workshopKey(row.data.name)===key);
        if(!matches.length){notice(`Não encontrei uma oficina com nome “${command.workshop}”. Confira o cadastro em Configurações → Oficinas.`,true);return;}
        const pixOptions=[...new Set(matches.map(row=>safe(row.data.pix)).filter(Boolean))];
        if(pixOptions.length>1){notice(`Encontrei cadastros de ${displayName(command.workshop)} com chaves PIX diferentes. Confira em Oficinas antes de copiar.`,true);return;}
        if(!pixOptions.length){notice(`${displayName(command.workshop)} está cadastrado, mas ainda não tem chave PIX informada.`,true);return;}
        setPreview({kind:'workshop-pix',name:displayName(command.workshop),pix:pixOptions[0],phone:safe(matches.find(r=>r.data.phone)?.data.phone)});
        notice('Chave PIX encontrada no cadastro de Oficinas. Confira e copie abaixo.');
        return;
      }
      if(command.kind==='workshop-debt'||command.kind==='workshop-pending'||command.kind==='workshop-production'||command.kind==='workshop-paid-month'){
        if(!canReadOrders)throw new Error('Seu acesso não permite consultar Ordens de Corte.');
        const key=workshopKey(command.workshop);
        const all=asRows(await getDocs(collection(db,'cut_orders'))).filter(r=>workshopKey(r.data.office)===key);
        if(!all.length){notice(`Não encontrei OCs para ${displayName(command.workshop)}. Confira a grafia do costureiro.`,true);return;}
        let found:Row[];
        if(command.kind==='workshop-production')found=all.filter(r=>safe(r.data.status).toUpperCase()!=='ENTREGUE');
        else if(command.kind==='workshop-paid-month'){
          const month=command.month||getMonth(new Date());
          found=all.filter(r=>isPaid(r.data)&&paidMonth(r.data.paidAt)===month);
        } else found=all.filter(r=>!isPaid(r.data));
        const total=found.reduce((sum,row)=>{const n=amount(row.data.total);return sum+(Number.isFinite(n)&&n>0?n:0)},0);
        const qty=found.reduce((sum,row)=>{const n=amount(row.data.qty);return sum+(Number.isFinite(n)&&n>0?n:0)},0);
        const withoutPrice=found.filter(row=>!Number.isFinite(amount(row.data.total))).length;
        const name=displayName(command.workshop);
        setPreview({kind:command.kind,name,orders:found,total,qty,withoutPrice,period:command.kind==='workshop-paid-month'?(command.month||getMonth(new Date())):undefined});
        const labels={
          'workshop-debt':`${found.length} OC(s) ainda não marcadas como pagas para ${name}.`,
          'workshop-pending':`${found.length} OC(s) com pagamento pendente para ${name}.`,
          'workshop-production':`${found.length} OC(s) em andamento para ${name}.`,
          'workshop-paid-month':`${found.length} OC(s) pagas no período consultado para ${name}.`
        };
        notice(labels[command.kind]+(withoutPrice?' Algumas não têm total válido e não entraram na soma.':''));
        return;
      }
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
      notice(!aiReady&&isFreeAIConfigured?'Para frases livres, clique em “Ativar IA local”. Ou tente um comando direto como “quanto devo ao Mauro?”.':'Não reconheci essa frase. Tente: “quanto devo ao Mauro?”, “qual o PIX do Virgílio?”, “quantas peças do Rodrigo estão em andamento?”, “OC 707 paga” ou digite “ajuda”.',true);
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

  const copyPix=async()=>{
    if(!preview||preview.kind!=='workshop-pix')return;
    try{await navigator.clipboard.writeText(preview.pix);setCopied(true);notice(`PIX de ${preview.name} copiado.`)}
    catch{notice('Não foi possível copiar automaticamente. Selecione a chave PIX abaixo para copiar manualmente.',true)}
  };
  const cancel=()=>{setPreview(null);notice('Operação cancelada. Nenhum dado foi alterado.')};
  const selected=preview?.kind==='change-price'?preview.rows.find(row=>row.id===selectedPrice):null;

  return createPortal(<div className="mb-assistant-root">
    {!open&&<button type="button" className="mb-assistant-launcher" title="Abrir Assistente MB" aria-label="Abrir Assistente MB" onClick={()=>setOpen(true)}><Bot size={23}/><span>Assistente MB</span></button>}
    {open&&<section className="mb-assistant-panel" role="dialog" aria-label="Assistente MB — comandos por texto e voz" aria-modal="false">
      <header className="mb-assistant-header"><div className="mb-assistant-avatar"><Bot size={22}/></div><div><strong>Assistente MB</strong><small>Voz e texto · IA local sem API paga</small></div><button type="button" onClick={()=>{recognition.current?.stop();setOpen(false)}} aria-label="Fechar assistente"><X size={18}/></button></header>
      <div className="mb-assistant-content" aria-live="polite">
        <p className="mb-assistant-intro">Fale ou digite. Os comandos conhecidos funcionam imediatamente. Para conversar com um modelo aberto, ative a IA local uma vez no seu dispositivo.</p>
        <p className="mb-assistant-safety" aria-live="polite"><ShieldCheck size={14}/>{isFreeAIConfigured?(aiReady?'IA local pronta · sem custo por mensagem':'IA local disponível neste aparelho · toque para ativar'):'Este aparelho não oferece WebGPU · comandos locais disponíveis'}</p>
        {isFreeAIConfigured&&!aiReady&&<div className="mb-assistant-ai-activation"><p><strong>IA local gratuita</strong> · Modelo aberto Qwen 0.5B. O primeiro download pode consumir centenas de MB; use Wi-Fi e um aparelho com memória disponível.</p><button type="button" disabled={loadingAI} onClick={()=>void activateAI()}>{loadingAI?'Carregando...':'Ativar IA local'}</button>{aiProgress&&<small aria-live="polite">{aiProgress}</small>}</div>}
        {!heard&&<div className="mb-assistant-suggestions"><button type="button" onClick={()=>void processCommand('Quanto devo ao Mauro?')}>Quanto devo ao Mauro?</button><button type="button" onClick={()=>void processCommand('Qual o PIX do Virgílio?')}>PIX do Virgílio</button><button type="button" onClick={()=>void processCommand('Quantas peças do Rodrigo estão em andamento?')}>Peças do Rodrigo</button><button type="button" onClick={()=>void processCommand('Ajuda')}>Ver comandos</button></div>}
        {heard&&<div className="mb-assistant-bubble mb-assistant-user"><small>{listening?'Ouvindo':'Você pediu'}</small>{heard}</div>}
        {aiNote&&<p className="mb-assistant-safety">{aiNote}</p>}
        <div className={`mb-assistant-bubble mb-assistant-reply ${error?'is-error':''}`}><small><Bot size={13}/> Assistente MB</small>{status}</div>
        {preview&&<div className="mb-assistant-preview"><h4><ClipboardList size={16}/>{preview.kind==='pay'?'Conferir pagamento':preview.kind==='delete-sample'?'Conferir exclusão':preview.kind==='change-price'?'Conferir alteração de preço':preview.kind==='show-price'?'Preços encontrados':preview.kind==='workshop-pix'?'Chave PIX':preview.kind.startsWith('workshop-')?'Resumo da oficina':'Ordem de Corte encontrada'}</h4>
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
          {preview.kind==='workshop-pix'&&<div className="mb-assistant-pix"><strong>{preview.name}</strong><label>PIX</label><div className="mb-assistant-pix-row"><code>{preview.pix}</code><button type="button" title="Copiar PIX" onClick={()=>void copyPix()}><Copy size={16}/>{copied?'Copiado':'Copiar'}</button></div>{preview.phone&&<small>WhatsApp: {preview.phone}</small>}</div>}
          {(preview.kind==='workshop-debt'||preview.kind==='workshop-pending'||preview.kind==='workshop-production'||preview.kind==='workshop-paid-month')&&<div className="mb-assistant-report">
            <strong>{preview.name}</strong>
            {preview.period&&<small>Pagamentos no mês {preview.period.slice(5,7)}/{preview.period.slice(0,4)}</small>}
            <div className="mb-assistant-report-total"><span>{preview.kind==='workshop-production'?'Peças em andamento':preview.kind==='workshop-paid-month'?'Total pago neste mês':'Total não marcado como pago'}</span><strong>{preview.kind==='workshop-production'?`${preview.qty.toLocaleString('pt-BR')} peças`:moneyValue(preview.total)}</strong></div>
            <small>{preview.orders.length} OC(s) · {preview.kind==='workshop-production'?`Valor previsto: ${moneyValue(preview.total)}`:`${preview.qty.toLocaleString('pt-BR')} peças`}</small>
            {preview.withoutPrice>0&&<small>Há {preview.withoutPrice} OC(s) sem total válido; elas não entraram no valor somado.</small>}
            {preview.orders.length>0&&<div className="mb-assistant-order-list">{preview.orders.slice(0,12).map(r=><div key={r.id}><span>OC {safe(r.data.oc)||'—'}</span><small>{safe(r.data.ref)||'Sem REF'}</small><strong>{money(r.data.total)}</strong></div>)}{preview.orders.length>12&&<small>Mostrando 12 de {preview.orders.length} OCs. A soma acima considera todas.</small>}</div>}
          </div>}
          {(preview.kind==='pay'||preview.kind==='delete-sample'||preview.kind==='change-price')&&<div className="mb-assistant-preview-actions"><button type="button" className="mb-assistant-cancel" disabled={busy} onClick={cancel}>Cancelar</button><button type="button" className={preview.kind==='delete-sample'?'mb-assistant-danger':'mb-assistant-confirm'} disabled={busy||(preview.kind==='change-price'&&!selectedPrice)} onClick={()=>void confirm()}>{preview.kind==='delete-sample'?<Trash2 size={15}/>:<CheckCircle2 size={15}/>} {busy?'Salvando...':preview.kind==='pay'?'Confirmar pagamento':preview.kind==='delete-sample'?'Excluir amostra':'Alterar preço'}</button></div>}
        </div>}
        <p className="mb-assistant-safety"><ShieldCheck size={14}/> Respeita as permissões do Firebase. Nenhuma mudança é realizada apenas por falar.</p>
      </div>
      <form className="mb-assistant-compose" onSubmit={event=>{event.preventDefault();void processCommand(input)}}><input ref={inputRef} aria-label="Comando para Assistente MB" value={input} maxLength={220} onChange={e=>setInput(e.target.value)} placeholder="Ex.: OC 707 paga" disabled={busy}/><button type="button" className={listening?'mb-assistant-mic is-listening':'mb-assistant-mic'} title={listening?'Parar de ouvir':'Falar comando'} aria-label={listening?'Parar de ouvir':'Falar comando'} onClick={startVoice} disabled={busy}>{listening?<MicOff size={19}/>:<Mic size={19}/>}</button><button className="mb-assistant-send" type="submit" title="Consultar comando" aria-label="Enviar comando" disabled={busy||!input.trim()}><Send size={17}/></button></form>
      {!voiceAvailable&&<small className="mb-assistant-hint">O microfone depende do suporte do navegador. Digitar funciona normalmente.</small>}
    </section>}
  </div>,document.body);
}
