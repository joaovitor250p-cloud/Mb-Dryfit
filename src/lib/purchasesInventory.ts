import { collection, doc, getDoc, runTransaction, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';

export type StockUnit = 'KG'|'M'|'UN'|'PC'|'CX'|'L'|'OUT';
export type PurchaseLine = {
  description:string; color:string; kind:'tecido'|'material'; unit:StockUnit;
  quantity:string; unitPrice:string; total:string;
};
export type InvoiceDraft = {
  accessKey:string; xmlHash:string; supplier:string; supplierTaxId:string;
  number:string; date:string; total:string; lines:PurchaseLine[];
  source:'xml'|'pdf'|'manual'; pdfData?:string; pdfName?:string;
};
export type ConsumptionLine = {stockId:string; quantity:string};
export type StockEntry = {id:string;material:string;color:string;unit:StockUnit;kind:string;quantityMilli:number};
export const DEFAULT_COMPANY='mb-principal';
export const MAX_PDF_BYTES=390*1024;
const clean=(v:unknown)=>String(v??'').trim().replace(/\s+/g,' ');
const code=(v:string)=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('pt-BR');
const coll=(company:string,name:string)=>['companies',company,name] as const;
export const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
export const quantityText=(milli:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(milli/1000);
export function decimal(raw:unknown):number{
 const v=clean(raw).replace(/^R\$\s*/i,'').replace(/\s/g,'');
 if(!v||!/^\d[\d.,]*$/.test(v))return NaN;
 if(v.includes('.')&&v.includes(','))return Number(v.lastIndexOf(',')>v.lastIndexOf('.')?v.replace(/\./g,'').replace(',','.'):v.replace(/,/g,''));
 if(v.includes(',')){const parts=v.split(',');return Number(parts.length===2?parts[0]+'.'+parts[1]:v.replace(/,/g,''))}
 return Number(v);
}
export function qtyMilli(raw:unknown):number{
 const n=decimal(raw);
 if(!Number.isFinite(n)||n<=0||n>999999999)return NaN;
 const m=Math.round(n*1000);
 return Math.abs(m/1000-n)<0.000001?m:NaN;
}
export function cents(raw:unknown):number{
 const n=decimal(raw);
 return Number.isFinite(n)&&n>=0&&n<1e10?Math.round(n*100):NaN;
}
export async function sha256(text:string):Promise<string>{
 const bytes=new TextEncoder().encode(text);
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
const tag=(el:Element|Document|null,name:string)=>el?.getElementsByTagNameNS('*',name)[0]||null;
const val=(el:Element|Document|null,name:string)=>clean(tag(el,name)?.textContent||'');
export async function parseNfeXml(xml:string):Promise<InvoiceDraft>{
 const tree=new DOMParser().parseFromString(xml,'application/xml');
 if(tree.getElementsByTagName('parsererror').length)throw Error('XML inválido. Confira o arquivo da NF-e.');
 const info=tag(tree,'infNFe');
 if(!info)throw Error('XML não contém infNFe. Utilize o XML da NF-e, não um documento genérico.');
 const accessKey=clean(info.getAttribute('Id')||'').replace(/^NFe/i,'');
 const issuer=tag(info,'emit'),ide=tag(info,'ide');
 const lines=Array.from(info.getElementsByTagNameNS('*','det')).map(det=>{
   const prod=tag(det,'prod');
   const description=val(prod,'xProd');
   const rawUnit=code(val(prod,'uCom'));
   const unit:StockUnit=rawUnit==='KG'||rawUnit==='KGS'?'KG':rawUnit==='M'||rawUnit==='MT'?'M':rawUnit==='UN'||rawUnit==='UND'?'UN':rawUnit==='PC'?'PC':rawUnit==='CX'?'CX':rawUnit==='L'?'L':'OUT';
   const rawQty=val(prod,'qCom'),price=val(prod,'vUnCom'),total=val(prod,'vProd');
   const kind=/TECIDO|MALHA|DRY\s*FIT|DRYFIT|SUPLEX|RIBANA|POLI[EÉ]STER|HELANCA|ELASTANO/i.test(description)?'tecido':'material';
   return {description,color:'',kind:kind as 'tecido'|'material',unit,quantity:rawQty,unitPrice:price,total};
 }).filter(x=>x.description);
 if(!lines.length)throw Error('NF-e sem itens. Confira o XML original.');
 const date=val(ide,'dhEmi')||val(ide,'dEmi');
 return {accessKey:accessKey.length===44?accessKey:'',xmlHash:await sha256(xml),
   supplier:val(issuer,'xNome'),supplierTaxId:val(issuer,'CNPJ')||val(issuer,'CPF'),
   number:val(ide,'nNF'),date:date.slice(0,10),total:val(tag(info,'ICMSTot'),'vNF')||'0',
   source:'xml',lines};
}
export function validateInvoice(invoice:InvoiceDraft):void{
 if(!clean(invoice.supplier))throw Error('Informe o fornecedor.');
 if(!invoice.lines.length||invoice.lines.length>25)throw Error('Informe de 1 a 25 itens por nota.');
 if(!Number.isFinite(cents(invoice.total)))throw Error('Valor total da nota inválido.');
 for(const [i,line] of invoice.lines.entries()){
   if(!clean(line.description))throw Error('Informe a descrição do item '+(i+1)+'.');
   if(!Number.isFinite(qtyMilli(line.quantity)))throw Error('Quantidade inválida no item '+(i+1)+'.');
   if(!Number.isFinite(cents(line.unitPrice)))throw Error('Valor unitário inválido no item '+(i+1)+'.');
   if(!Number.isFinite(cents(line.total)))throw Error('Valor total inválido no item '+(i+1)+'.');
   if(line.kind==='tecido'){
     if(!clean(line.color))throw Error('Informe a cor do tecido no item '+(i+1)+'.');
     if(line.unit!=='KG'&&line.unit!=='M')throw Error('Tecido deve ser controlado por KG ou metro (item '+(i+1)+').');
   }
 }
}
export async function stockId(material:string,color:string,unit:string){
 return (await sha256(code(material)+'|'+code(color||'SEM COR')+'|'+unit)).slice(0,40);
}
type Delta = {id:string;material:string;color:string;kind:string;unit:StockUnit;amount:number;sourceId:string;sourceKind:'purchase_in'|'enfesto_out';oc:string};
async function createInventoryMovement(db:Firestore,company:string,uid:string,sourceId:string,kind:'purchase_in'|'enfesto_out',deltas:Delta[],sourcePayload:Record<string,unknown>):Promise<void>{
 if(!deltas.length)throw Error('Nenhum material informado.');
 const stocks=deltas.map(x=>doc(db,...coll(company,'inventory'),x.id));
 const movements=await Promise.all(deltas.map(async x=>doc(db,...coll(company,'stock_movements'),(await sha256(kind+'|'+sourceId+'|'+x.id)).slice(0,48))));
 const source=doc(db,...coll(company,kind==='purchase_in'?'purchases':'enfesto_confirmations'),sourceId);
 await runTransaction(db,async t=>{
   const existing=await t.get(source);
   if(existing.exists())throw Error(kind==='purchase_in'?'Esta nota já foi confirmada. Entrada duplicada bloqueada.':'Este enfesto já teve baixa. Consumo duplicado bloqueado.');
   const previous=await Promise.all(stocks.map(x=>t.get(x)));
   const before:number[]=previous.map(x=>x.exists()?Number(x.data().quantityMilli):0);
   for(let i=0;i<deltas.length;i++){
     if(kind==='enfesto_out'&&!previous[i].exists())throw Error('Material ou cor não cadastrado no estoque.');
     if(!Number.isSafeInteger(before[i])||before[i]+deltas[i].amount<0)throw Error('Saldo insuficiente para '+deltas[i].material+' / '+deltas[i].color+'.');
   }
   t.set(source,{...sourcePayload,createdBy:uid,createdAt:serverTimestamp()});
   deltas.forEach((item,i)=>{
     const after=before[i]+item.amount;
     t.set(movements[i],{
       stockId:item.id,kind,sourceId,oc:item.oc,beforeMilli:before[i],deltaMilli:item.amount,afterMilli:after,
       material:item.material,color:item.color,unit:item.unit,createdAt:serverTimestamp(),createdBy:uid
     });
     const patch={quantityMilli:after,lastMovementId:movements[i].id,lastDeltaMilli:item.amount,updatedAt:serverTimestamp(),updatedBy:uid};
     if(previous[i].exists())t.update(stocks[i],patch);
     else t.set(stocks[i],{...patch,material:item.material,color:item.color||'SEM COR',unit:item.unit,kind:item.kind,createdAt:serverTimestamp()});
   });
 });
}
export async function confirmInvoice(db:Firestore,company:string,uid:string,invoice:InvoiceDraft):Promise<string>{
 validateInvoice(invoice);
 const invoiceId=invoice.accessKey&&/^\d{44}$/.test(invoice.accessKey)?invoice.accessKey:
   invoice.supplierTaxId&&invoice.number
    ? (await sha256(code(invoice.supplierTaxId)+'|'+code(invoice.number)+'|'+clean(invoice.date))).slice(0,48)
    : invoice.xmlHash||await sha256(JSON.stringify(invoice));
 const aggregate=new Map<string,Delta>();
 for(const line of invoice.lines){
   const material=clean(line.description),color=line.kind==='tecido'?code(line.color):code(line.color||'SEM COR');
   const id=await stockId(material,color,line.unit);
   const existing=aggregate.get(id);
   if(existing)existing.amount+=qtyMilli(line.quantity);
   else aggregate.set(id,{id,material,color,unit:line.unit,kind:line.kind,amount:qtyMilli(line.quantity),sourceId:invoiceId,sourceKind:'purchase_in',oc:''});
 }
 await createInventoryMovement(db,company,uid,invoiceId,'purchase_in',[...aggregate.values()],{
   accessKey:invoice.accessKey,xmlHash:invoice.xmlHash,supplier:clean(invoice.supplier),
   supplierTaxId:clean(invoice.supplierTaxId),number:clean(invoice.number),date:invoice.date,
   totalCents:cents(invoice.total),source:invoice.source,status:'confirmed',
   ...(invoice.pdfData?{pdfData:invoice.pdfData,pdfName:invoice.pdfName||'nota.pdf'}:{}),
   lines:invoice.lines.map(line=>({...line,quantityMilli:qtyMilli(line.quantity),unitPriceCents:cents(line.unitPrice),totalCents:cents(line.total)}))
 });
 return invoiceId;
}
/**
 * Chamada de integração para o módulo de enfesto, executada NO ATO da confirmação.
 * A operação é atômica: marca o enfesto, baixa cada tecido/cor e grava histórico.
 * A mesma confirmationId nunca desconta novamente, inclusive em dois aparelhos.
 */
export async function confirmEnfestoConsumption(args:{
 db:Firestore;company:string;uid:string;confirmationId:string;oc:string;
 lines:ConsumptionLine[];notes?:string
}):Promise<string>{
 const {db,company,uid,confirmationId,oc,lines}=args;
 const id=clean(confirmationId),number=clean(oc);
 if(!id||id.length>100||!number||number.length>80)throw Error('Informe identificação do enfesto e OC.');
 if(!lines.length||lines.length>20)throw Error('Selecione de 1 a 20 tecidos por enfesto.');
 const aggregate=new Map<string,number>();
 for(const line of lines){
   const amount=qtyMilli(line.quantity);
   if(!Number.isFinite(amount))throw Error('Quantidade de consumo inválida.');
   aggregate.set(line.stockId,(aggregate.get(line.stockId)||0)+amount);
 }
 const stockRefs=[...aggregate.keys()].map(id=>doc(db,...coll(company,'inventory'),id));
 const snapshots=await Promise.all(stockRefs.map(ref=>getDoc(ref)));
 const deltas:Delta[]=[];
 for(let i=0;i<stockRefs.length;i++){
   const snap=snapshots[i];
   if(!snap.exists())throw Error('Tecido selecionado não existe mais.');
   const d=snap.data();
   if(d.kind!=='tecido'||(d.unit!=='KG'&&d.unit!=='M'))throw Error('O consumo do enfesto só pode baixar tecido por KG ou metro.');
   deltas.push({id:snap.id,material:String(d.material),color:String(d.color),unit:d.unit as StockUnit,
     kind:'tecido',amount:-aggregate.get(snap.id)!,sourceId:id,sourceKind:'enfesto_out',oc:number});
 }
 await createInventoryMovement(db,company,uid,id,'enfesto_out',deltas,{oc:number,notes:clean(args.notes).slice(0,500),status:'confirmed',
   lines:deltas.map(d=>({stockId:d.id,quantityMilli:-d.amount,unit:d.unit,color:d.color}))});
 return id;
}
export async function saveBoleto(db:Firestore,company:string,uid:string,payload:{
 file:File;supplier:string;amount:string;dueDate:string;barcode:string;purchaseId:string
}):Promise<string>{
 if(payload.file.size>MAX_PDF_BYTES)throw Error('Este PDF ultrapassa 390 KB, limite seguro para anexos no Firestore Spark. Não foi salvo.');
 if(payload.file.type!=='application/pdf'&&!payload.file.name.toLowerCase().endsWith('.pdf'))throw Error('Selecione um boleto PDF.');
 const bytes=new Uint8Array(await payload.file.arrayBuffer());
 if(bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70)throw Error('O arquivo selecionado não é um PDF válido.');
 const id=(await sha256(Array.from(bytes).map(x=>String.fromCharCode(x)).join(''))).slice(0,48);
 const amountCents=cents(payload.amount);
 if(!Number.isFinite(amountCents)||amountCents<=0)throw Error('Informe o valor do boleto.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate))throw Error('Informe o vencimento.');
 if(!clean(payload.supplier))throw Error('Informe o fornecedor.');
 const parts:string[]=[];for(let i=0;i<bytes.length;i+=8192)parts.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
 const pdfData='data:application/pdf;base64,'+btoa(parts.join(''));
 const ref=doc(db,...coll(company,'bills'),id);
 await runTransaction(db,async t=>{
   const old=await t.get(ref);
   if(old.exists())throw Error('Este boleto já foi importado.');
   if(payload.purchaseId){const purchase=await t.get(doc(db,...coll(company,'purchases'),payload.purchaseId));if(!purchase.exists())throw Error('Nota fiscal vinculada não encontrada.');}
   t.set(ref,{supplier:clean(payload.supplier),amountCents,dueDate:payload.dueDate,
     barcode:clean(payload.barcode).replace(/\s/g,''),purchaseId:payload.purchaseId||'',
     status:'pending',pdfName:payload.file.name,pdfData,createdBy:uid,createdAt:serverTimestamp()});
 });
 return id;
}
