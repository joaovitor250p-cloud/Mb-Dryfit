import { createPortal } from 'react-dom';
import SheetPrint, { type PrintableSheet, type SheetColorRow } from './SheetPrint';
import { useContext, useEffect, useMemo, useState, useRef, type MouseEvent } from 'react';
import type { User } from 'firebase/auth';
import type { Firestore, DocumentData, UpdateData } from 'firebase/firestore';
import { collection, doc, getDoc, getDocs, query as fsQuery, where, runTransaction, onSnapshot, serverTimestamp, setDoc, updateDoc, writeBatch, deleteDoc } from 'firebase/firestore';
import { CalendarDays, CheckCircle2, ChevronDown, ClipboardList, Copy, Download, Edit3, Filter, Plus, Search, ShieldAlert, Trash2, UploadCloud, X } from 'lucide-react';
import { MODEL_TYPE_OPTIONS, matchesModelSearch, matchesModelType, modelType, type ModelType } from './lib/modelTypes';
import { TYPES, TAILORS, KEY, normalizedGarmentType, parsePrice, currency, type ReferencePrice } from './lib/referencePrices';
import { PageActiveContext, readPageMemory, usePageMemory } from './lib/pageMemory';
import { safeProviderMessage } from './lib/safeMessage';
import { currentAccountingMonth as monthNow, accountingMonthLabel as monthLabel, paymentMonth as monthOfPaidDate } from './lib/monthlyAccounting';
import { parseFinanceNumber as num } from './lib/financeNumbers';
import { workshopKey, canonicalWorkshopName } from './lib/workshopNames';

// Ordem de Corte: documentos separados de production_samples, sem alterar as OCs da tela Cortes.
// Todas as datas são apresentadas como DD/MM/AAAA e armazenadas como texto; assim, dados legados ficam intactos.
type DataField = 'oc'|'ref'|'model'|'office'|'qty'|'piecePrice'|'entry'|'sent'|'due'|'status'|'deliveredFlag'|'deliveredAt'|'defects'|'discountPiece'|'discountTotal'|'total'|'paidAt'|'paymentDone';
type View = 'summary'|'dates'|'finance'|'all';
type Order = Record<DataField, string> & {id: string; source: string; manualTotal: boolean; pieceType?: string; createdBy?: string; createdAt?: unknown};
type WorkshopPrice = {reference:string; type:string; price:string};
type WorkshopOption = {name:string; specialPrices: WorkshopPrice[]; types:string[]};
type Props = {db: Firestore; user: User; canEdit: boolean; isAdmin: boolean};
const names: Record<DataField,string> = {
  oc:'OC',ref:'REF',model:'Modelo / peça',office:'Costureiro / oficina',qty:'Quantidade',piecePrice:'Valor por peça',entry:'Data de entrada',sent:'Data de envio',due:'Prazo de 10 dias',status:'Produção',deliveredFlag:'Entregue (planilha)',deliveredAt:'Data de entrega',defects:'Faltas / defeitos',discountPiece:'Desconto por peça',discountTotal:'Desconto total',total:'Valor a pagar',paidAt:'Data pagamento',paymentDone:'Pagamento'
};
const fields = Object.keys(names) as DataField[];
const cols: Record<View,DataField[]> = {
  summary:['oc','ref','model','office','qty','status','sent','due','deliveredAt','piecePrice','total','paymentDone','paidAt'],
  dates:['oc','ref','model','office','entry','sent','due','status','deliveredAt','paidAt'],
  finance:['oc','model','office','qty','piecePrice','defects','discountPiece','discountTotal','total','paymentDone','paidAt'],
  all:fields
};
const fresh = (): Order => ({...Object.fromEntries(fields.map(k=>[k,''])),id:'',source:'manual',manualTotal:false} as unknown as Order);
const fromData = (id:string, d:DocumentData):Order => ({...fresh(),...Object.fromEntries(fields.map(k=>[k,typeof d[k]==='string'?d[k]:String(d[k]??'')])),id,office:canonicalWorkshopName(d.office),source:String(d.source||'manual'),pieceType:String(d.pieceType||''),manualTotal:d.manualTotal===true,createdBy:d.createdBy,createdAt:d.createdAt});
const errorText=(e:unknown)=>{const x=e as {code?:string;message?:string};return x?.code?.includes('permission-denied')?'Permissão negada. Confira se seu perfil tem acesso à área Ordem de Corte.':safeProviderMessage(x?.message,'Falha ao salvar.')};
const brl=(n:number)=>Number.isFinite(n)?n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'—';
const money=(s:string)=>{const n=num(s);return Number.isFinite(n)?brl(n):'—'};
const moneyText=(n:number)=>Number.isFinite(n)?brl(Math.max(0,n)):' ';
const integer=(s:string)=>{const amount=num(s);return Number.isSafeInteger(amount)&&amount>0?amount:0};
const toISO=(text:string):string=>{
  const m=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());if(!m)return '';
  const day=+m[1],month=+m[2],year=+m[3],date=new Date(year,month-1,day);
  return date.getFullYear()===year&&date.getMonth()===month-1&&date.getDate()===day?`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`:'';
};
const toBR=(iso:string)=>/^\d{4}-\d\d-\d\d$/.test(iso)?`${iso.slice(8,10)}/${iso.slice(5,7)}/${iso.slice(0,4)}`:'';
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const after=(iso:string,days:number)=>{const y=+iso.slice(0,4),m=+iso.slice(5,7)-1,d=+iso.slice(8);if(!toISO(toBR(iso)))return '';const x=new Date(y,m,d+days);return [x.getFullYear(),String(x.getMonth()+1).padStart(2,'0'),String(x.getDate()).padStart(2,'0')].join('-')};
const friday=(iso:string)=>{const d=new Date(+iso.slice(0,4),+iso.slice(5,7)-1,+iso.slice(8));return after(iso,(5-d.getDay()+7)%7)};
// A data do pagamento continua sendo uma sexta-feira, mas sem seletores
// de semanas: o histórico é consultado por mês e a data pode ser escolhida diretamente.
const firstFridayOfMonth=(month:string):string=>/^\d{4}-(0[1-9]|1[0-2])$/.test(month)?friday(`${month}-01`):'';
const norm=(s:string)=>workshopKey(s);
const officeLabel=(name:string)=>canonicalWorkshopName(name)||'SEM COSTUREIRO';
const done=(o:Order)=>o.status.trim().toUpperCase()==='ENTREGUE';
// Atraso é calculado apenas para pedidos ainda não entregues e com prazo válido já vencido.
// O campo due original nunca é alterado por esta regra.
const overdue=(o:Order, referenceDate:string)=>!done(o)&&!!toISO(o.due)&&toISO(o.due)<referenceDate;
const paid=(o:Order)=>o.paymentDone.trim().toUpperCase()==='OK';
const calcDiscount=(o:Order):number|null=>o.defects.trim()&&o.discountPiece.trim()&&Number.isFinite(num(o.defects))&&Number.isFinite(num(o.discountPiece))?integer(o.defects)*num(o.discountPiece):null;
const calcNet=(o:Order):number|null=>o.qty.trim()&&o.piecePrice.trim()&&Number.isFinite(num(o.qty))&&Number.isFinite(num(o.piecePrice))?Math.max(0,integer(o.qty)*num(o.piecePrice)-(Number.isFinite(num(o.discountTotal))?num(o.discountTotal):0)):null;
const recalc=(o:Order):Order=>{const v={...o},discount=calcDiscount(v);if(discount!==null)v.discountTotal=moneyText(discount);const net=calcNet(v);if(!v.manualTotal&&net!==null)v.total=moneyText(net);return v};
const asSeed=(r:Record<string,unknown>):Order=>{const o={...fresh(),...Object.fromEntries(fields.map(k=>[k,k==='paymentDone'?(String(r[k]||'').toUpperCase()==='OK'?'OK':''):String(r[k]??'')])),id:'legado_'+String(r.id||'').replace(/[^a-zA-Z0-9_-]/g,''),source:'planilha_original',manualTotal:false} as Order;const net=calcNet(o);o.manualTotal=net===null||!Number.isFinite(num(o.total))||Math.abs(net-num(o.total))>0.01;return o;};
const csvEsc=(s:unknown)=>'"'+String(s??'').replace(/"/g,'""')+'"';
function download(data:string,name:string,type='text/csv;charset=utf-8') {const blob=new Blob(['\ufeff',data],{type});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000)}
const dateKeys=new Set<DataField>(['entry','sent','due','deliveredAt','paidAt']);
const numberKeys=new Set<DataField>(['qty','defects']);
const moneyKeys=new Set<DataField>(['piecePrice','discountPiece','discountTotal','total']);
// Somente fichas criadas a partir desta versao recebem ID `ficha_...`.
// O fluxo automatico usa o mesmo ID na OC, sem alterar as regras do Firestore.
// OCs manuais, importadas e fichas antigas nao mostram o botao de PDF.
const hasNewProductionSheet=(o:Order)=>o.id.startsWith('ficha_')&&o.source==='manual';
const normalizedOC=(oc:string)=>oc.trim().normalize('NFKC').toLocaleUpperCase('pt-BR').replace(/\s+/g,' ');
const sampleIdForOc=(oc:string)=>`oc_${encodeURIComponent(normalizedOC(oc))}`;
// O tipo é explícito no editor: a mesma REF pode ter preços distintos em Camiseta, Bermuda e Calça.
const inferredGarmentType=(model:string):string=>{
  const text=String(model||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  if(/(?:^|[^A-Z])(?:M\.?\s*L\.?|MANGA\s+LONGA)(?:$|[^A-Z])/.test(text))return 'M.L.';
  const known=modelType(model);
  const map:Record<string,string>={bermudas:'Bermuda',camisas:'Camiseta',camisetas:'Camiseta',regatas:'Regata',calcas:'Calça'};
  return map[known]||'';
};
const refMatches=(entry:{reference:string;type:string},ref:string,type:string)=>
  entry.reference.trim().toUpperCase()===ref.trim().toUpperCase() && normalizedGarmentType(entry.type)===normalizedGarmentType(type);
const resolvedReferencePrice=(row:Order,prices:ReferencePrice[],workshops:WorkshopOption[]):string=>{
  const type=normalizedGarmentType(row.pieceType||'');
  if(!row.ref.trim()||!type)return '';
  const base=prices.find(p=>refMatches(p,row.ref,type));
  const shop=workshops.find(w=>workshopKey(w.name)===workshopKey(row.office));
  const special=shop?.specialPrices?.find(p=>refMatches(p,row.ref,type));
  const raw=special?.price??base?.price??'';
  const value=parsePrice(raw);
  return Number.isFinite(value)?currency(value):'';
};
const normalizeOrderQuantity=(value:string):boolean=>{const clean=value.trim();const count=num(clean);return /^(?:[1-9]\d*|[1-9]\d{0,2}(?:\.\d{3})+)$/.test(clean)&&Number.isSafeInteger(count)&&count>0};

const PAGE=75;
const monthOfPaid=(o:Order)=>monthOfPaidDate(o.paidAt);
export default function CutOrders({db,user,canEdit,isAdmin}:Props){
  const pageActive=useContext(PageActiveContext);
  const pageMemoryKey = `mb-referencias:${user.uid}:orders`;
  const currentDate=today();
  const [initialPageState] = useState(() => readPageMemory(pageMemoryKey, { query: '', typeFilter: 'all' as ModelType, office: 'all', production: 'all', payFilter: 'all', view: 'summary' as View, count: PAGE, fridayDate: friday(today()), showFriday: false }));
  const [rows,setRows]=useState<Order[]>([]),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true);
  const [alert,setAlert]=useState(''),[notice,setNotice]=useState('');
  const [deleteTarget,setDeleteTarget]=useState<Order|null>(null);
  const [printSheet,setPrintSheet]=useState<PrintableSheet|null>(null);
  const [loadingFicha,setLoadingFicha]=useState<string|null>(null);
  // A lista de preços/oficinas só é observada enquanto o editor está aberto.
  const [referencePrices,setReferencePrices]=useState<ReferencePrice[]>([]);
  const [workshopOptions,setWorkshopOptions]=useState<WorkshopOption[]>([]);
  const [pricesLoaded,setPricesLoaded]=useState(false);
  const [priceCatalogError,setPriceCatalogError]=useState('');
  const [addingReference,setAddingReference]=useState(false);
  const [newReferencePrice,setNewReferencePrice]=useState('');
  const [registeringReference,setRegisteringReference]=useState(false);

  const [query,setQuery]=useState(String(initialPageState.query || '')),[typeFilter,setTypeFilter]=useState<ModelType>((initialPageState.typeFilter as ModelType)||'all'),[office,setOffice]=useState(String(initialPageState.office||'all')),[production,setProduction]=useState(String(initialPageState.production||'all')),[payFilter,setPayFilter]=useState(String(initialPageState.payFilter||'all'));
  const [count,setCount]=useState(Number(initialPageState.count)||PAGE),[editing,setEditing]=useState<Order|null>(null),[draft,setDraft]=useState<Order|null>(null);
  const [fridayDate,setFridayDate]=useState(String(initialPageState.fridayDate||friday(today()))),[showFriday,setShowFriday]=useState(!!initialPageState.showFriday);
  // A impressão é renderizada em um portal diretamente no body, com o CSS A4
  // compartilhado por Fichas de Produção. O navegador oferece "Salvar como PDF".
  useEffect(()=>{
    if(!printSheet||!pageActive)return;
    const originalTitle=document.title;
    document.title=`Ficha_OC_${printSheet.oc.replace(/[^a-zA-Z0-9_-]+/g,'_')}`;
    const timer=window.setTimeout(()=>window.print(),350);
    return()=>{window.clearTimeout(timer);document.title=originalTitle};
  },[printSheet,pageActive]);
  useEffect(()=>{
    const finish=()=>setPrintSheet(null);
    window.addEventListener('afterprint',finish);
    return()=>window.removeEventListener('afterprint',finish);
  },[]);
  const [paymentMonth,setPaymentMonth]=useState(()=>monthNow());
  useEffect(()=>{
    let last=monthNow();
    const check=()=>{const next=monthNow();if(next!==last){setPaymentMonth(previous=>previous===last?next:previous);setFridayDate(previous=>previous.slice(0,7)===last?friday(today()):previous);last=next;}};
    document.addEventListener('visibilitychange',check);window.addEventListener('focus',check);
    const interval=window.setInterval(check,60000);
    return()=>{document.removeEventListener('visibilitychange',check);window.removeEventListener('focus',check);window.clearInterval(interval)};
  },[]);
  const tableRef=useRef<HTMLDivElement>(null),railRef=useRef<HTMLDivElement>(null);
  const [tableWidth,setTableWidth]=useState(1640);
  const [pixByOffice,setPixByOffice]=useState<Map<string,string>>(new Map());
  const [monthlyDetailsOpen,setMonthlyDetailsOpen]=useState(false);
  const selectMonth=(month:string)=>{
    setPaymentMonth(month);
    const current=friday(today());
    setFridayDate(current.slice(0,7)===month?current:firstFridayOfMonth(month));
    setMonthlyDetailsOpen(false);
  };
  usePageMemory(pageMemoryKey, { query, typeFilter, office, production, payFilter, count, fridayDate,showFriday }, !loading);
  useEffect(()=>{if(!pageActive)return;return onSnapshot(collection(db,'cut_orders'),s=>{setRows(s.docs.map(x=>fromData(x.id,x.data())).sort((a,b)=>(Number(b.oc)||0)-(Number(a.oc)||0)));setLoading(false);setAlert('')},e=>{setAlert(errorText(e));setLoading(false)})},[db,pageActive]);
  useEffect(()=>{
    if(!pageActive||!draft||!canEdit)return;
    setPricesLoaded(false);setPriceCatalogError('');
    const unsubscribePrices=onSnapshot(collection(db,'reference_prices'),snapshot=>{
      setReferencePrices(snapshot.docs.map(item=>({reference:String(item.data().reference||''),type:String(item.data().type||''),price:String(item.data().price||'')})));
      setPricesLoaded(true);setPriceCatalogError('');
    },error=>{setPricesLoaded(false);setPriceCatalogError('Não foi possível consultar Preços de REF: '+safeProviderMessage(error))});
    const unsubscribeWorkshops=onSnapshot(collection(db,'workshops'),snapshot=>{
      setWorkshopOptions(snapshot.docs.map(item=>({name:String(item.data().name||''),types:Array.isArray(item.data().types)?item.data().types:[],specialPrices:Array.isArray(item.data().specialPrices)?item.data().specialPrices:[]})));
    },error=>setPriceCatalogError('Não foi possível consultar Oficinas: '+safeProviderMessage(error)));
    return()=>{unsubscribePrices();unsubscribeWorkshops()};
  // A consulta não reinicia a cada tecla digitada: apenas ao abrir/fechar o editor.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[db,pageActive,!!draft,canEdit]);
  // Se a REF foi digitada antes de o Firebase responder, sugerir o preço assim que ele chegar.
  useEffect(()=>{
    if(!pricesLoaded||!draft?.ref||!draft?.pieceType||draft.piecePrice.trim())return;
    const suggestion=resolvedReferencePrice(draft,referencePrices,workshopOptions);
    if(suggestion)setDraft(current=>current&&current.ref===draft.ref&&current.pieceType===draft.pieceType&&!current.piecePrice.trim()?recalc({...current,piecePrice:suggestion,manualTotal:false}):current);
  },[pricesLoaded,draft?.ref,draft?.pieceType,draft?.office,draft?.piecePrice,referencePrices,workshopOptions]);
  // Carrega chaves PIX apenas quando o editor abre o fechamento de sexta.
  // As permissões do Firestore permitem somente a quem pode editar OCs acessar esses contatos.
  useEffect(()=>{if(!pageActive||!showFriday||!canEdit){setPixByOffice(new Map());return;}
    return onSnapshot(collection(db,'workshops'),snap=>{const next=new Map<string,string>();for(const item of snap.docs){const data=item.data();const name=norm(String(data.name||'')),pix=String(data.pix||'').trim();if(name&&pix&&!next.has(name))next.set(name,pix)}setPixByOffice(next)},()=>setPixByOffice(new Map()));
  },[db,pageActive,showFriday,canEdit]);
  // Mede somente a largura da tabela, sem observar o contêiner de rolagem.
  // Isso evita ciclos de layout e renderização enquanto arrastamos a barra horizontal.
  useEffect(()=>{if(!pageActive||showFriday||!tableRef.current)return;
    const table=tableRef.current.querySelector('table');if(!table)return;
    let frame=0;
    const update=()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;const width=Math.ceil(table.scrollWidth);setTableWidth(old=>old===width?old:width)})};
    update();const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(update):null;
    observer?.observe(table);
    return()=>{observer?.disconnect();if(frame)cancelAnimationFrame(frame)};
  },[pageActive,showFriday,count,rows.length]);
  const scrollRail=(left:number)=>{if(tableRef.current&&Math.abs(tableRef.current.scrollLeft-left)>1)tableRef.current.scrollLeft=left};
  const scrollBody=(left:number)=>{if(railRef.current&&Math.abs(railRef.current.scrollLeft-left)>1)railRef.current.scrollLeft=left};
  const copyPix=async(pix:string,name:string)=>{try{await navigator.clipboard.writeText(pix);notify(`Chave PIX de ${name} copiada.`)}catch{notify('Não foi possível copiar automaticamente o PIX. Selecione o texto e copie.',true)}};
  const offices=useMemo(()=>[...new Map(rows.map(x=>[norm(x.office),officeLabel(x.office)])).entries()].filter(([k])=>k).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')),[rows]);
  const filtered=useMemo(()=>rows.filter(o=>matchesModelType(o.model,typeFilter)&&(!query||norm([o.oc,o.ref,o.model,o.office].join(' ')).includes(norm(query))||matchesModelSearch(o.model,query))&&(office==='all'||norm(o.office)===office)&&(production==='all'||(production==='done'?done(o):production==='overdue'?overdue(o,currentDate):!done(o)))&&(payFilter==='all'||(payFilter==='paid'?paid(o):!paid(o)))),[rows,query,typeFilter,office,production,payFilter,currentDate]);
  const overdueCount=useMemo(()=>rows.filter(o=>overdue(o,currentDate)).length,[rows,currentDate]);
  const eligible=useMemo(()=>rows.filter(o=>done(o)&&!paid(o)&&!!toISO(o.deliveredAt)&&toISO(o.deliveredAt)<=fridayDate&&!o.paidAt&&num(o.total)>0),[rows,fridayDate]);
  const review=useMemo(()=>rows.filter(o=>done(o)&&!paid(o)&&(!!o.paidAt||!toISO(o.deliveredAt)||!(num(o.total)>0))),[rows]);
  const groups=useMemo(()=>{const m=new Map<string,{name:string;list:Order[];total:number}>();eligible.forEach(o=>{const key=norm(o.office);const item: {name:string;list:Order[];total:number}=m.get(key)||{name:officeLabel(o.office),list:[],total:0};item.list.push(o);item.total+=num(o.total);m.set(key,item)});return [...m.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))},[eligible]);
  const notify=(msg:string,isErr=false)=>{setAlert(isErr?msg:'');setNotice(isErr?'':msg)};
  const registeredTailors=useMemo(()=>{
    const choices=new Map<string,string>();
    [...TAILORS,...workshopOptions.map(x=>x.name),...rows.map(x=>x.office),...(draft?.office?[draft.office]:[])].forEach(name=>{
      const canonical=canonicalWorkshopName(name);const key=workshopKey(canonical);
      if(key&&!choices.has(key))choices.set(key,canonical);
    });
    return [...choices.values()].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  },[workshopOptions,rows,draft?.office]);
  const allGarmentTypes=useMemo(()=>[...new Set([...TYPES,...referencePrices.map(p=>normalizedGarmentType(p.type)),...workshopOptions.flatMap(w=>w.types.map(normalizedGarmentType)),...(draft?.pieceType?[draft.pieceType]:[])].filter(Boolean))],
    [referencePrices,workshopOptions,draft?.pieceType]);
  const referenceIsKnown=!!draft?.ref.trim()&&!!draft?.pieceType&&referencePrices.some(p=>refMatches(p,draft.ref,draft.pieceType||''));
  const sameRefOtherTypes=draft?.ref.trim()?referencePrices.filter(p=>p.reference.trim().toUpperCase()===draft.ref.trim().toUpperCase()).map(p=>p.type):[];
  const suggestedPrice=draft?resolvedReferencePrice(draft,referencePrices,workshopOptions):'';
  const open=(o?:Order)=>{if(!canEdit)return;setAlert('');setNotice('');setEditing(o||null);setAddingReference(false);setNewReferencePrice('');
    const base=o?{...o}:{...fresh(),id:'',status:'EM ANDAMENTO',paymentDone:'',source:'manual',manualTotal:false};
    setDraft({...base,pieceType:normalizedGarmentType(base.pieceType||'')||inferredGarmentType(base.model)});
  };
  const unlock=(event:MouseEvent, o:Order)=>{if(canEdit&&event.detail>=3)open(o)};
  const fieldChange=(key:DataField|'pieceType',value:string)=>{
    if(key==='ref'||key==='pieceType')setAddingReference(false);
    setDraft(current=>{
      if(!current)return current;
      const next={...current,[key]:value};
      if(key==='office')next.office=canonicalWorkshopName(value);
      if(key==='model'&&!current.pieceType){const type=inferredGarmentType(value);if(type)next.pieceType=type;}
      if(key==='ref'&&!current.pieceType){
        const matches=[...new Set(referencePrices.filter(p=>p.reference.trim().toUpperCase()===value.trim().toUpperCase()).map(p=>normalizedGarmentType(p.type)))];
        if(matches.length===1)next.pieceType=matches[0];
      }
      if(key==='ref'||key==='office'||key==='pieceType'||(key==='model'&&next.pieceType!==current.pieceType)){
        next.piecePrice=resolvedReferencePrice(next,referencePrices,workshopOptions);
        next.manualTotal=false;
        next.total='';
      }
      if(key==='sent')next.due=value?toBR(after(toISO(value),10)):'';
      if(key==='total')next.manualTotal=true;
      if(key==='status'&&value==='ENTREGUE'&&!next.deliveredAt)next.deliveredAt=toBR(today());
      return recalc(next);
    });
  };
  const registerReference=async()=>{
    if(!draft||registeringReference||!canEdit)return;
    const ref=draft.ref.trim().toUpperCase(),type=normalizedGarmentType(draft.pieceType||''),price=parsePrice(newReferencePrice);
    if(!ref||!type||!Number.isFinite(price))return notify('Informe REF, tipo de roupa e um preço maior que zero para cadastrar a referência.',true);
    if(!pricesLoaded)return notify('Aguarde a consulta de preços ou verifique a conexão com o Firebase.',true);
    if(referenceIsKnown)return notify('Esta referência já está cadastrada para esse tipo de roupa. Se desejar, edite o valor na aba Preços de REF.',true);
    setRegisteringReference(true);setAlert('');
    try{
      const referenceDoc=doc(db,'reference_prices',KEY(type,ref));
      await runTransaction(db,async transaction=>{
        const found=await transaction.get(referenceDoc);
        if(found.exists())throw new Error('A REF já foi cadastrada por outra pessoa. Confira a lista antes de tentar novamente.');
        transaction.set(referenceDoc,{reference:ref,type,price:price.toFixed(2).replace('.',','),updatedAt:serverTimestamp(),updatedBy:user.uid});
      });
      const value=currency(price);
      setReferencePrices(current=>[...current,{reference:ref,type,price:price.toFixed(2).replace('.',',')}]);
      setDraft(current=>current&&current.ref.trim().toUpperCase()===ref&&normalizedGarmentType(current.pieceType||'')===type?recalc({...current,piecePrice:value,manualTotal:false}):current);
      setAddingReference(false);setNewReferencePrice('');
      notify(`REF ${ref} (${type}) cadastrada e preço ${value} preenchido na OC.`);
    }catch(e){notify('Não foi possível cadastrar esta referência: '+errorText(e)+'. Verifique se as regras do Firestore foram atualizadas.',true)}
    finally{setRegisteringReference(false)}
  };
  const save=async()=>{if(!draft||!canEdit||busy)return;const row=recalc({...draft,office:canonicalWorkshopName(draft.office)});
    const missing=[!row.model.trim()?'nome da peça':null,!row.office.trim()?'costureiro':null,!row.oc.trim()?'OC':null,!row.ref.trim()?'REF':null,!normalizeOrderQuantity(row.qty)?'quantidade válida (maior que zero)':null].filter(Boolean);
    if(missing.length)return notify('Preencha os campos obrigatórios antes de salvar: '+missing.join(', ')+'.',true);
    if(!row.pieceType&&(!editing||row.ref!==editing.ref||row.model!==editing.model))return notify('Selecione o tipo de roupa para verificar o preço da referência.',true);
    if(!editing){
      if(!pricesLoaded)return notify('Aguarde carregar a lista de Preços de REF antes de salvar uma nova OC.',true);
      if(!referencePrices.some(p=>refMatches(p,row.ref,row.pieceType||'')))return notify('VERIFIQUE SE A REFERÊNCIA ESTÁ CORRETA. Se for uma REF nova, clique em Cadastrar esta REF aqui na própria OC antes de salvar.',true);
      if(!Number.isFinite(parsePrice(row.piecePrice)))return notify('Informe um valor por peça válido antes de criar a OC.',true);
    }
    for(const key of dateKeys){if(row[key]&&!toISO(row[key]))return notify(`Confira a data de ${names[key]}. Valor antigo inválido: ${row[key]}. Você pode corrigi-la ou apagar.`,true)}
    for(const key of [...numberKeys,...moneyKeys]){if(row[key]&&(!Number.isFinite(num(row[key]))||num(row[key])<0))return notify(`Confira ${names[key]}.`,true)}
    if(!editing&&rows.some(o=>o.oc.trim()===row.oc.trim()))return notify('Esse número de OC já existe. Confira antes de criar outro registro.',true);
    const id=editing?.id||`oc_${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
    const content={...Object.fromEntries(fields.map(k=>[k,row[k]])),pieceType:normalizedGarmentType(row.pieceType||''),manualTotal:row.manualTotal,source:editing?.source||'manual',updatedBy:user.uid,updatedAt:serverTimestamp()};
    const needsSample = row.status === 'ENTREGUE' && (!editing || editing.status !== 'ENTREGUE'
      || editing.qty !== row.qty || editing.ref !== row.ref || editing.model !== row.model || editing.office !== row.office);
    setBusy(true);
    try {
      if (needsSample) {
        // Procura uma amostra manual/antiga da mesma OC antes de criar outra.
        // Consulta só quando há uma entrega (ou mudança relevante), evitando lag na lista.
        const targetOC = normalizedOC(row.oc);
        const candidates = [...new Set([row.oc.trim(), targetOC])];
        const snapshots = await Promise.all(candidates.map(ocValue => getDocs(fsQuery(collection(db, 'production_samples'), where('oc','==',ocValue)))));
        const found = snapshots.flatMap(snapshot => snapshot.docs).find(sample => normalizedOC(String(sample.data().oc || '')) === targetOC);
        const sampleRef = doc(db, 'production_samples', found?.id || sampleIdForOc(row.oc));
        const orderRef = doc(db, 'cut_orders', id);
        await runTransaction(db, async transaction => {
          const [orderSnap, sampleSnap] = await Promise.all([transaction.get(orderRef), transaction.get(sampleRef)]);
          if (!editing && orderSnap.exists()) throw new Error(`A OC ${row.oc} já existe. Atualize a lista antes de cadastrar.`);
          const orderPayload = editing ? content : {...content,createdAt:serverTimestamp(),createdBy:user.uid};
          if (editing) transaction.update(orderRef, orderPayload);
          else transaction.set(orderRef, orderPayload);
          if (sampleSnap.exists()) {
            // Não apaga fotos ou conteúdo editado manualmente. Completa apenas metadados ausentes.
            const saved = sampleSnap.data();
            const patch: UpdateData<DocumentData> = {
              quantity: row.qty.trim(), orderId: id,
              updatedAt: serverTimestamp(), updatedBy: user.uid,
            };
            if (!String(saved.reference || '').trim() && row.ref.trim()) patch.reference = row.ref.trim();
            if (String(saved.tailor || '').trim() === 'NÃO INFORMADO' && row.office.trim()) patch.tailor = row.office.trim();
            transaction.update(sampleRef, patch);
          } else {
            transaction.set(sampleRef, {
              oc: row.oc.trim(), name: row.model.trim(), reference: row.ref.trim(),
              tailor: row.office.trim() || 'NÃO INFORMADO', quantity: row.qty.trim(),
              orderId: id, imageData: '', status: 'done',
              createdAt: serverTimestamp(), createdBy: user.uid,
              updatedAt: serverTimestamp(), updatedBy: user.uid,
              completedAt: serverTimestamp(), completedBy: user.uid,
            });
          }
        });
        notify(`OC ${row.oc} entregue e amostra vinculada. A foto poderá ser adicionada em Amostras.`);
      } else {
        if (editing) await updateDoc(doc(db,'cut_orders',id),content);
        else await setDoc(doc(db,'cut_orders',id),{...content,createdAt:serverTimestamp(),createdBy:user.uid});
        notify(`OC ${row.oc} salva com sucesso.`);
      }
      setDraft(null);
    } catch(e) {
      const detail = errorText(e);
      notify(needsSample ? `Entrega não concluída: a OC e a amostra precisam ser salvas juntas. ${detail} Confira se as novas regras do Firestore foram publicadas.` : detail,true);
    } finally {setBusy(false)}
  };
  // Regras do Firestore: excluir cut_orders é permitido somente a administradores.
  // Usar o ID real do documento preserva OCs com número duplicado.
  // O ID da OC criada automaticamente é o ID da ficha de produção.
  // OCs importadas/manuais não possuem ficha vinculada e recebem um aviso claro.
  const abrirFicha=async(o:Order)=>{
    if(!hasNewProductionSheet(o))return;
    if(loadingFicha)return;
    setLoadingFicha(o.id);
    setAlert('');setNotice('');
    try{
      const snapshot=await getDoc(doc(db,'production_sheets',o.id));
      if(!snapshot.exists()){
        notify(`A OC ${o.oc} não possui uma ficha vinculada. Apenas OCs criadas pela distribuição das Fichas de Produção têm esse documento.`,true);
        return;
      }
      const sheet=snapshot.data();
      if(sheet.status!=='assigned'){
        notify(`A ficha vinculada à OC ${o.oc} ainda não foi distribuída.`,true);
        return;
      }
      // Se a OC foi renumerada depois da distribuição, a ficha original continua disponível.
      if(String(sheet.oc||'').trim()!==o.oc.trim()){
        setNotice(`Esta OC foi alterada depois da distribuição. A ficha impressa preserva o número original ${String(sheet.oc||'—')}.`);
      }
      const colors=Array.isArray(sheet.colors)?sheet.colors as SheetColorRow[]:[];
      const filled=colors.filter(row=>Object.values(row||{}).some(v=>String(v??'').trim()));
      if(filled.length>14){
        notify(`A ficha da OC ${o.oc} tem ${filled.length} linhas de cores. Para não cortar informações na folha A4, faça a impressão pela área de Fichas de Produção após ajustar o documento.`,true);
        return;
      }
      setPrintSheet({
        model:String(sheet.model||''),reference:String(sheet.reference||''),
        pieceType:String(sheet.pieceType||''),fabric:String(sheet.fabric||''),
        composition:String(sheet.composition||''),trims:String(sheet.trims||''),
        officeInstructions:String(sheet.officeInstructions||''),oc:String(sheet.oc||''),
        withdrawalDate:String(sheet.withdrawalDate||''),volumes:String(sheet.volumes||''),
        tailorInstructions:String(sheet.tailorInstructions||''),
        finishingInstructions:String(sheet.finishingInstructions||''),
        colors,assignedTailor:String(sheet.assignedTailor||o.office||'')
      });
    }catch(e){
      const code=String((e as {code?:string})?.code||'');
      notify(code==='permission-denied'
        ?`Sem permissão para consultar a ficha da OC ${o.oc}. Publique as regras do Firestore incluídas nesta versão.`
        :`Não foi possível abrir a ficha da OC ${o.oc}: ${errorText(e)}`,true);
    }finally{setLoadingFicha(null)}
  };
  const removeOrder=async()=>{
    if(!isAdmin||!deleteTarget||busy)return;
    const target=deleteTarget;
    setBusy(true);
    try{
      await deleteDoc(doc(db,'cut_orders',target.id));
      if(editing?.id===target.id){setEditing(null);setDraft(null);}
      setDeleteTarget(null);
      notify(`OC ${target.oc} excluída com sucesso.`);
    }catch(e){notify(`Não foi possível excluir a OC ${target.oc}: ${errorText(e)}`,true);}
    finally{setBusy(false);}
  };
  const markPaid=async(items:Order[])=>{if(!canEdit||busy||!items.length)return;if(!toISO(toBR(fridayDate)))return notify('Selecione uma sexta-feira válida antes de pagar.',true);const sum=items.reduce((a,x)=>a+num(x.total),0);const paymentDate=toBR(fridayDate);if(!window.confirm(`Confirmar pagamento de ${items.length} OC(s) no valor total de ${brl(sum)}? A data ${paymentDate} será registrada em Ordem de Corte e as OCs ficarão com status PAGO.`))return;setBusy(true);
    try{for(let i=0;i<items.length;i+=150){const batch=writeBatch(db);items.slice(i,i+150).forEach(o=>batch.update(doc(db,'cut_orders',o.id),{paymentDone:'OK',paidAt:paymentDate,updatedBy:user.uid,updatedAt:serverTimestamp()}));await batch.commit()}notify(`${items.length} OC(s) pagas em ${paymentDate}. Pagamento e data atualizados em Ordem de Corte.`)}catch(e){notify(errorText(e),true)}finally{setBusy(false)}
  };
  const initialImport=async()=>{if(!isAdmin||busy)return;setBusy(true);try{const module=await import('./lib/cutOrderSeed.json');const original=(module.default as Record<string,unknown>[]).map(asSeed);const missing=original.filter(o=>!rows.some(x=>x.id===o.id||(!x.id.startsWith('legado_')&&x.oc.trim()===o.oc.trim())));
      if(!missing.length){notify('As 720 OCs da planilha já foram importadas. Nenhuma duplicação.');return}
      if(!window.confirm(`Importar ${missing.length} das 720 OCs históricas para o sistema? Os documentos existentes não serão substituídos. Confira primeiro o backup do aplicativo.`))return;
      let added=0;for(let i=0;i<missing.length;i+=150){const batch=writeBatch(db);missing.slice(i,i+150).forEach(o=>batch.set(doc(db,'cut_orders',o.id),{...Object.fromEntries(fields.map(k=>[k,o[k]])),manualTotal:o.manualTotal,source:'planilha_original',createdAt:serverTimestamp(),createdBy:user.uid,updatedAt:serverTimestamp(),updatedBy:user.uid}));await batch.commit();added+=Math.min(150,missing.length-i)}notify(`${added} OCs importadas para Ordem de Corte.`)
    }catch(e){notify(errorText(e),true)}finally{setBusy(false)}
  };
  const downloadCsv=(list:Order[],prefix:string)=>{const header=[...fields];download([header.map(k=>csvEsc(names[k])).join(';'),...list.map(o=>header.map(k=>csvEsc(o[k])).join(';'))].join('\r\n'),`${prefix}_${today()}.csv`)};
  const downloadJson=()=>download(JSON.stringify({version:1,exportedAt:new Date().toISOString(),rows},null,2),`BACKUP_ORDEM_DE_CORTE_${today()}.json`,'application/json;charset=utf-8');
  const amount=eligible.reduce((a,x)=>a+num(x.total),0);
  const paidThisFriday=useMemo(()=>rows.filter(o=>paid(o)&&toISO(o.paidAt)===fridayDate),[rows,fridayDate]);
  const monthlyPaid=useMemo(()=>rows.filter(o=>paid(o)&&monthOfPaid(o)===paymentMonth),[rows,paymentMonth]);
  const monthOptions=useMemo(()=>[...new Set([monthNow(),paymentMonth,...rows.flatMap(o=>[monthOfPaid(o),monthOfPaidDate(o.deliveredAt),monthOfPaidDate(o.sent)]).filter(x=>/^\d{4}-\d{2}$/.test(x))])].sort((a,b)=>b.localeCompare(a)),[rows,paymentMonth]);
  const monthlyTotal=useMemo(()=>monthlyPaid.reduce((sum,o)=>sum+(Number.isFinite(num(o.total))?num(o.total):0),0),[monthlyPaid]);
  return <div className="order-page">
    <header className="order-heading"><div><span className="order-eyebrow">MB REFERENCIAS / CONTROLE DAS OFICINAS</span><h1><ClipboardList size={26}/> Ordem de Corte</h1><p>Planilha compartilhada · 10 dias de prazo · pagamentos na sexta-feira</p></div><div className="order-buttons">{canEdit&&<button className="primary-button" onClick={()=>open()}><Plus size={17}/> Nova OC</button>}<button className="outline-button" onClick={()=>downloadCsv(filtered,'ORDEM_CORTE')}><Download size={15}/> CSV</button><button className="outline-button" onClick={downloadJson}>Backup</button></div></header>
    {alert&&<div className="production-alert" role="alert">{alert}</div>}{notice&&<div className="production-ok"><CheckCircle2 size={16}/>{notice}</div>}
    <div className="order-stats"><div><small>Ordens cadastradas</small><strong>{rows.length}</strong></div><div><small>Em andamento</small><strong>{rows.filter(o=>!done(o)).length}</strong></div><div className="order-stat-overdue"><small>Pedidos atrasados</small><strong>{overdueCount}</strong></div><div><small>Entregues</small><strong>{rows.filter(done).length}</strong></div><div><small>Pagamentos a conferir</small><strong>{review.length}</strong></div></div>
    {isAdmin&&rows.filter(o=>o.id.startsWith('legado_')).length<720&&<div className="order-seed"><div><strong><UploadCloud size={17}/> Importação inicial da planilha</strong><p>As 720 OCs históricas estão disponíveis para importar uma vez, com nomes, valores, datas e a OC duplicada preservados. Não substitui documentos já importados.</p></div><button type="button" className="outline-button" disabled={busy} onClick={()=>void initialImport()}>{busy?'Importando...':'Importar planilha (720)'}</button></div>}
    <div className="order-tabs"><button className={!showFriday?'active':''} onClick={()=>setShowFriday(false)}><ClipboardList size={15}/> Planilha de OCs</button><button className={showFriday?'active':''} onClick={()=>setShowFriday(true)}><CalendarDays size={15}/> Pagamento de sexta-feira</button></div>
    {showFriday?<section className="order-friday"><div className="order-friday-head"><div><h2>Fechamento por costureiro</h2><p>Selecione o mês do histórico e a data da sexta-feira para consultar e registrar pagamentos. Nenhuma transferência bancária é realizada pelo aplicativo.</p></div><label>Sexta-feira<input type="date" value={fridayDate} onChange={e=>{if(!e.target.value)return;const selected=friday(e.target.value);if(selected){setFridayDate(selected);setPaymentMonth(selected.slice(0,7))}}}/></label></div><div className="order-stats"><div><small>A pagar nesta sexta</small><strong>{brl(amount)}</strong></div><div><small>Oficinas</small><strong>{groups.length}</strong></div><div><small>OCs pendentes</small><strong>{eligible.length}</strong></div><div><small>Já pagas nesta sexta</small><strong>{paidThisFriday.length}</strong></div><div><small>Para conferir</small><strong>{review.length}</strong></div></div>
      <div className="order-month-history">
        <div className="order-month-history-heading"><div><strong>Histórico de pagamentos por mês</strong><small>O mês atual começa automaticamente em zero; pagamentos anteriores continuam salvos na OC original.</small></div><label>Consultar mês <select aria-label="Mês do histórico de pagamentos" value={paymentMonth} onChange={e=>selectMonth(e.target.value)}>{monthOptions.map(month=><option key={month} value={month}>{monthLabel(month)}{month===monthNow()?' · atual':''}</option>)}</select></label></div>
        <div className="order-month-history-numbers"><div><small>OCs pagas em {monthLabel(paymentMonth)}</small><strong>{monthlyPaid.length}</strong></div><div><small>Total registrado como pago</small><strong>{brl(monthlyTotal)}</strong></div></div>
        <details className="order-month-details" onToggle={e=>setMonthlyDetailsOpen(e.currentTarget.open)}><summary>Ver pagamentos registrados neste mês ({monthlyPaid.length})</summary>
          {monthlyDetailsOpen&&(monthlyPaid.length?monthlyPaid.map(o=><div className="order-office-line" key={o.id}><span>OC {o.oc} · {officeLabel(o.office)} · {o.paidAt}</span><strong>{money(o.total)}</strong></div>):<p>Nenhum pagamento registrado neste mês.</p>)}
        </details>
      </div>
      <p className="order-payment-guidance">Ao confirmar o pagamento, a OC é atualizada imediatamente com <strong>Pagamento: Pago</strong> e a data <strong>{toBR(fridayDate)||'—'}</strong>. Você pode quitar uma OC de cada vez ou todas as OCs de uma oficina.</p>
      {groups.length===0&&<div className="order-empty">Nenhuma OC pendente elegível na sexta-feira selecionada.</div>}{groups.map(g=>{const pix=pixByOffice.get(norm(g.name))||'';return <details key={norm(g.name)} className="order-office"><summary><span><strong>{g.name}</strong><small>{g.list.length} OCs pendentes</small></span><b>{brl(g.total)}</b><ChevronDown size={16}/></summary><div>
        <div className="order-friday-pix"><span><b>PIX da oficina</b><small>{pix||'Não cadastrado em Configurações → Oficinas'}</small></span>{pix&&<button className="outline-button" type="button" onClick={()=>void copyPix(pix,g.name)}><Copy size={14}/> Copiar PIX</button>}</div>
        {g.list.map(o=><div className="order-office-line order-payment-line" key={o.id}><span>OC {o.oc} — {o.model}</span><strong>{money(o.total)}</strong>{hasNewProductionSheet(o)&&<button type="button" className="order-ficha-button" disabled={!!loadingFicha} onClick={()=>void abrirFicha(o)}><Download size={14}/> Ficha</button>}{canEdit&&<button type="button" className="outline-button" disabled={busy} onClick={()=>void markPaid([o])}><CheckCircle2 size={14}/> Pago</button>}</div>)}
        {canEdit&&<button disabled={busy} className="primary-button" onClick={()=>void markPaid(g.list)}>Confirmar pagamento de todas as OCs da oficina</button>}
      </div></details>})}
      {!!paidThisFriday.length&&<details className="order-office order-paid-on-friday"><summary><span><strong>Pagas em {toBR(fridayDate)}</strong><small>{paidThisFriday.length} OCs atualizadas em Ordem de Corte</small></span><b>{brl(paidThisFriday.reduce((sum,item)=>sum+(Number.isFinite(num(item.total))?num(item.total):0),0))}</b><ChevronDown size={16}/></summary><div>{paidThisFriday.map(o=><div className="order-office-line" key={o.id}><span>OC {o.oc} — {officeLabel(o.office)}</span><strong>{money(o.total)}</strong></div>)}</div></details>}
      <button className="outline-button" onClick={()=>downloadCsv(eligible,'PAGAMENTOS_SEXTA')}>Exportar relação desta sexta</button>
      {review.length>0&&<details className="order-review"><summary><ShieldAlert size={17}/> {review.length} registros para conferir (não entram na soma)</summary>{review.slice(0,150).map(o=><p key={o.id}>OC {o.oc} — {officeLabel(o.office)}: {o.paidAt?'já possui data de pagamento':!toISO(o.deliveredAt)?'data de entrega ausente ou inválida':'valor a pagar ausente ou zerado'}.</p>)}</details>}
    </section>:<>
      <div className="order-toolbar"><label className="order-search"><Search size={16}/><input value={query} onChange={e=>{setQuery(e.target.value);setCount(PAGE)}} placeholder="Pesquisar OC, REF, bermuda, camisa ou oficina..."/></label><label><Filter size={15}/><select aria-label="Filtrar por tipo de peça" value={typeFilter} onChange={e=>setTypeFilter(e.target.value as ModelType)}>{MODEL_TYPE_OPTIONS.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}</select></label><label><Filter size={15}/><select value={office} onChange={e=>setOffice(e.target.value)}><option value="all">Todas as oficinas</option>{offices.map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label><select aria-label="Status da produção" value={production} onChange={e=>setProduction(e.target.value)}><option value="all">Todas as produções</option><option value="progress">Em andamento</option><option value="overdue">Atrasados</option><option value="done">Entregues</option></select><select aria-label="Status do pagamento" value={payFilter} onChange={e=>setPayFilter(e.target.value)}><option value="all">Todos os pagamentos</option><option value="pending">Pendentes</option><option value="paid">Pagos</option></select></div>
      <div className="order-summary-head"><strong>Resumo das OCs</strong><span>Role a barra horizontal para consultar as informações à direita.</span></div>
      <div className="order-helper"><span>{filtered.length} OCs encontradas · exibindo {Math.min(count,filtered.length)} {loading?'· carregando...':''}</span><span><Edit3 size={14}/> Para editar: <strong>3 cliques/toques</strong> no registro ou <strong>Editar</strong> com um toque</span></div>
      <div className="order-scrollbar-top" ref={railRef} tabIndex={0} role="region" onScroll={e=>scrollRail(e.currentTarget.scrollLeft)} aria-label="Barra horizontal para navegar nas colunas"><div style={{width:tableWidth,height:1}}/></div>
      <div className="order-scroll" ref={tableRef} onScroll={e=>scrollBody(e.currentTarget.scrollLeft)}><table className="order-table"><thead><tr>{cols.summary.map(k=><th key={k}>{names[k]}</th>)}<th>Ações</th></tr></thead><tbody>{filtered.slice(0,count).map(o=><tr key={o.id} onClick={e=>unlock(e,o)} title="Três cliques/toques no registro ou use o botão Editar">{cols.summary.map(k=><td key={k} data-label={names[k]} className={k==='model'?'order-model':''}>{k==='paymentDone'?<span className={paid(o)?'order-paid':'order-pending'}>{paid(o)?'Pago':'Pendente'}</span>:k==='status'?overdue(o,currentDate)?<span className="order-overdue" title={`Prazo vencido em ${o.due}`}>Atrasado</span>:<span className={done(o)?'order-done':'order-progress'}>{done(o)?'Entregue':'Em andamento'}</span>:moneyKeys.has(k)?money(o[k]):o[k]||'—'}</td>)}<td className="order-editcell">{canEdit?<button type="button" title="Editar esta OC com um toque" aria-label={`Editar OC ${o.oc}`} onClick={e=>{e.stopPropagation();open(o)}}><Edit3 size={13}/> Editar</button>:<span>Consulta</span>}{hasNewProductionSheet(o)&&<button type="button" className="order-ficha-button" title={`Abrir ficha enviada ao costureiro da OC ${o.oc} para salvar em PDF`} aria-label={`Ficha OC ${o.oc}`} disabled={!!loadingFicha} onClick={e=>{e.stopPropagation();void abrirFicha(o)}}><Download size={13}/> {loadingFicha===o.id?'Abrindo...':'Ficha'}</button>}{isAdmin&&<button type="button" className="order-delete-button" title={`Excluir a OC ${o.oc}`} aria-label={`Excluir OC ${o.oc}`} disabled={busy} onClick={e=>{e.stopPropagation();setDeleteTarget(o)}}><Trash2 size={13}/> Excluir</button>}</td></tr>)}</tbody></table></div>
      <div className="order-foot"><span>Você pode rolar a tabela para ver todas as colunas.</span>{count<filtered.length&&<div><button className="outline-button" onClick={()=>setCount(n=>n+PAGE)}>Mostrar mais 75</button><button className="outline-button" onClick={()=>setCount(filtered.length)}>Mostrar todas ({filtered.length})</button></div>}</div>
    </>}
    {draft&&pageActive&&createPortal(<div className="order-overlay" onMouseDown={e=>{if(e.currentTarget===e.target)setDraft(null)}}><section className="order-drawer" role="dialog" aria-modal="true" aria-label="Editar Ordem de Corte"><header><div><span className="order-eyebrow">{editing?'EDIÇÃO AUTORIZADA':'NOVO CADASTRO'}</span><h2>{editing?`OC ${editing.oc}`:'Nova Ordem de Corte'}</h2><p>Edite os campos e clique em Salvar. Os descontos são calculados automaticamente.</p></div><button className="outline-button" onClick={()=>setDraft(null)}><X size={17}/></button></header>
      {alert&&<div className="production-alert" role="alert">{alert}</div>}
      {([['Identificação',['oc','ref','model','office','qty','piecePrice']],['Produção e datas',['entry','sent','due','status','deliveredFlag','deliveredAt']],['Descontos e valores',['defects','discountPiece','discountTotal','total']],['Pagamento',['paymentDone','paidAt']]] as [string,DataField[]][]).map(([title,sectionFields])=>
        <fieldset key={title} className="order-fieldset">
          <legend>{title}</legend>
          {title==='Identificação'&&<div className="order-price-type"><label>Tipo de roupa *
            <input list="order-editor-garment-types" maxLength={80} value={draft.pieceType||''} onChange={e=>fieldChange('pieceType',e.target.value)} placeholder="Selecione ou digite o tipo de roupa"/>
            <datalist id="order-editor-garment-types">{allGarmentTypes.map(type=><option key={type} value={type}/>)}</datalist>
            <small>Necessário para encontrar o preço correto da REF.</small>
          </label></div>}
          <div className="order-fieldgrid">{sectionFields.map(k=><label key={k}>{names[k]}{(['oc','ref','model','office','qty'].includes(k))?' *':''}
            {k==='status'?<select value={draft[k]} onChange={e=>fieldChange(k,e.target.value)}><option value="EM ANDAMENTO">Em andamento</option><option value="ENTREGUE">Entregue</option></select>
              :k==='paymentDone'?<select value={draft[k]==='OK'?'OK':''} onChange={e=>fieldChange(k,e.target.value)}><option value="">Pendente</option><option value="OK">Pago</option></select>
              :k==='office'?<select value={draft.office} onChange={e=>fieldChange('office',e.target.value)} required><option value="">Selecione o costureiro / oficina</option>{registeredTailors.map(name=><option key={workshopKey(name)} value={name}>{name}</option>)}</select>
              :k==='discountTotal'?<input readOnly title="Calculado por quantidade de defeitos × desconto por peça. Valores históricos são preservados se não há dados suficientes." value={draft[k]}/>
              :dateKeys.has(k)?<><input type="date" value={toISO(draft[k])} onChange={e=>fieldChange(k,toBR(e.target.value))}/>{!!draft[k]&&!toISO(draft[k])&&<small>Data da planilha a corrigir: {draft[k]} <button type="button" onClick={()=>fieldChange(k,'')}>Apagar</button></small>}</>
              :<input type={numberKeys.has(k)?'number':'text'} min={k==='qty'?1:numberKeys.has(k)?0:undefined} required={['oc','ref','model','qty'].includes(k)} value={draft[k]} onChange={e=>fieldChange(k,e.target.value)} placeholder={moneyKeys.has(k)?'Ex.: 8,50':''}/>}</label>)}</div>
          {title==='Identificação'&&<div className="order-ref-helper">
            {priceCatalogError&&<div className="production-alert" role="alert">{priceCatalogError}</div>}
            {draft.ref.trim()&&draft.pieceType&&pricesLoaded&&(referenceIsKnown?
              <p className="order-ref-found">REF {draft.ref.trim()} ({draft.pieceType}) cadastrada. {suggestedPrice?<>Preço sugerido para {draft.office||'este costureiro'}: <strong>{suggestedPrice}</strong>. Você pode modificar o valor por peça.</>:'Informe ou ajuste o valor por peça.'}</p>
              :<div className="order-ref-missing" role="alert">
                <strong>VERIFIQUE SE A REFERÊNCIA ESTÁ CORRETA.</strong>
                <p>A REF {draft.ref.trim()} não está cadastrada para {draft.pieceType}. {sameRefOtherTypes.length?`Ela existe em: ${[...new Set(sameRefOtherTypes)].join(', ')}. Confira o tipo de roupa.`:'Se for uma REF nova, cadastre o valor aqui mesmo.'}</p>
                {!addingReference?<button className="outline-button" type="button" onClick={()=>{setAddingReference(true);setNewReferencePrice('')}}>+ Cadastrar esta REF aqui</button>
                  :<div className="order-inline-ref-form"><label>Preço padrão da REF (R$)<input inputMode="decimal" value={newReferencePrice} onChange={e=>setNewReferencePrice(e.target.value)} placeholder="Ex.: 4,50"/></label><div><button type="button" className="primary-button" disabled={registeringReference||!Number.isFinite(parsePrice(newReferencePrice))} onClick={()=>void registerReference()}>{registeringReference?'Cadastrando...':'Salvar REF e usar na OC'}</button><button type="button" className="outline-button" onClick={()=>setAddingReference(false)} disabled={registeringReference}>Cancelar</button></div><small>Salva também em Configurações → Preços de REF. O preço desta OC permanece editável.</small></div>}
              </div>)}
            {draft.ref.trim()&&!draft.pieceType&&<div className="production-alert" role="status">Selecione o tipo de roupa para o sistema encontrar o valor correto da REF {draft.ref.trim()}.</div>}
            {!pricesLoaded&&!priceCatalogError&&<small>Consultando preços cadastrados...</small>}
          </div>}
        </fieldset>)}
      <div className="order-calculation"><span>Total de desconto <strong>{money(draft.discountTotal)}</strong></span><span>Valor previsto <strong>{moneyText(calcNet(draft)??NaN)}</strong></span>{draft.manualTotal&&<button className="outline-button" onClick={()=>setDraft(current=>current?recalc({...current,manualTotal:false}):current)}>Usar valor calculado</button>}{draft.manualTotal&&<small>Valor a pagar definido manualmente. Não será sobrescrito pelo cálculo.</small>}</div>
      <footer>{editing&&hasNewProductionSheet(editing)&&<button type="button" className="outline-button" disabled={!!loadingFicha} onClick={()=>void abrirFicha(editing)}><Download size={16}/> {loadingFicha===editing.id?'Abrindo ficha...':'Ficha (PDF)'}</button>}{isAdmin&&editing&&<button type="button" className="order-delete-button" disabled={busy} onClick={()=>setDeleteTarget(editing)}><Trash2 size={16}/> Excluir OC</button>}<button className="outline-button" onClick={()=>setDraft(null)}>Cancelar</button><button className="primary-button" disabled={busy} onClick={()=>void save()}>{busy?'Salvando...':'Salvar alterações'}</button></footer></section></div>,document.body)}
    {printSheet&&pageActive&&createPortal(<SheetPrint sheet={printSheet}/>,document.body)}
    {deleteTarget&&isAdmin&&pageActive&&createPortal(<div className="order-delete-overlay" role="presentation" onMouseDown={e=>{if(e.currentTarget===e.target&&!busy)setDeleteTarget(null)}}><section className="order-delete-confirm" role="alertdialog" aria-modal="true" aria-labelledby="delete-oc-title" aria-describedby="delete-oc-description"><div className="order-delete-icon"><Trash2 size={23}/></div><h2 id="delete-oc-title">Excluir a OC {deleteTarget.oc}?</h2><p id="delete-oc-description">Tem certeza que deseja excluir a <strong>OC {deleteTarget.oc}</strong> — {deleteTarget.model || 'sem modelo'}?</p><p>Esta ação apaga o registro da Ordem de Corte do Firebase e não pode ser desfeita. A Ficha de Produção vinculada não será apagada.</p><div className="order-delete-actions"><button type="button" className="outline-button" disabled={busy} onClick={()=>setDeleteTarget(null)}>Cancelar</button><button type="button" className="order-delete-button order-delete-confirm-button" disabled={busy} onClick={()=>void removeOrder()}>{busy?'Excluindo...':`Sim, excluir OC ${deleteTarget.oc}`}</button></div></section></div>,document.body)}
  </div>;
}
