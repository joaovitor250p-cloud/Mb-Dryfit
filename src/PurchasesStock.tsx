import {useContext,useEffect,useMemo,useState} from 'react';
import type {User} from 'firebase/auth';
import type {Firestore} from 'firebase/firestore';
import {collection,onSnapshot,query,orderBy,limit} from 'firebase/firestore';
import {FileCode2,FileText,PackagePlus,Boxes,Scissors,CheckCircle2,AlertTriangle,UploadCloud,Download} from 'lucide-react';
import {PageActiveContext} from './lib/pageMemory';
import {safeProviderMessage} from './lib/safeMessage';
import {
  DEFAULT_COMPANY,MAX_PDF_BYTES,confirmInvoice,confirmEnfestoConsumption,
  money,parseNfeXml,quantityText,saveBoleto,decimal,qtyMilli,
  type InvoiceDraft,type PurchaseLine,type StockEntry,type StockUnit,type ConsumptionLine
} from './lib/purchasesInventory';
import './purchasesStock.css';

type Props={db:Firestore;user:User;canEdit:boolean;canConsume:boolean;companyId?:string};
type PurchaseRow={id:string;supplier:string;number:string;date:string;totalCents:number;status:string;lines:PurchaseLine[];pdfData?:string;pdfName?:string};
type BillRow={id:string;supplier:string;amountCents:number;dueDate:string;barcode:string;purchaseId:string;status:string;pdfData:string;pdfName:string};
type MovementRow={id:string;kind:string;sourceId:string;material:string;color:string;unit:string;beforeMilli:number;afterMilli:number;deltaMilli:number;oc:string;createdAt?:{toDate?:()=>Date}};
const initialLine=():PurchaseLine=>({description:'',color:'',kind:'material',unit:'UN',quantity:'1',unitPrice:'0',total:'0'});
const initialInvoice=():InvoiceDraft=>({accessKey:'',xmlHash:'',supplier:'',supplierTaxId:'',number:'',date:new Date().toISOString().slice(0,10),total:'0',lines:[initialLine()],source:'manual'});
const unitOptions:StockUnit[]=['KG','M','UN','PC','CX','L','OUT'];
const formatDate=(date:unknown)=>String(date||'').split('-').reverse().join('/')||'—';
const moneyValue=(value:string)=>{const n=decimal(value);return Number.isFinite(n)?new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n):value};
const pdfDownload=(data:string,name:string)=>{
 if(!data?.startsWith('data:application/pdf;base64,'))return;
 const link=document.createElement('a');link.href=data;link.download=name||'documento.pdf';
 document.body.append(link);link.click();link.remove();
};
async function pdfBase64(file:File):Promise<string>{
 if(file.size>MAX_PDF_BYTES)throw Error('PDF maior que 390 KB. Para manter o Firebase Spark gratuito, não é possível anexar este arquivo.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(bytes[0]!==37||bytes[1]!==80||bytes[2]!==68||bytes[3]!==70)throw Error('O arquivo não parece ser um PDF válido.');
 const chunks:string[]=[];for(let i=0;i<bytes.length;i+=8192)chunks.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
 return 'data:application/pdf;base64,'+btoa(chunks.join(''));
}
async function extractPdfText(file:File):Promise<string>{
 const pdfjs=await import('pdfjs-dist');
 pdfjs.GlobalWorkerOptions.workerSrc=new URL('pdfjs-dist/build/pdf.worker.min.mjs',import.meta.url).toString();
 const fileData=new Uint8Array(await file.arrayBuffer());
 const pdf=await pdfjs.getDocument({data:fileData}).promise;
 const parts:string[]=[];
 for(let i=1;i<=Math.min(pdf.numPages,5);i++){
   const page=await pdf.getPage(i);
   const items=await page.getTextContent();
   parts.push(items.items.map(item=>'str' in item?String(item.str):'').join(' '));
 }
 return parts.join('\n').slice(0,35000);
}
const findAmount=(text:string)=>{
 const samples=[...text.matchAll(/(?:VALOR\s+(?:DO\s+)?(?:DOCUMENTO|BOLETO|TOTAL|A\s+PAGAR)|TOTAL\s+(?:DA\s+)?NOTA)\s*[:\-]?\s*(?:R\$\s*)?([\d.,]+)/gi)];
 return samples.length?samples[samples.length-1][1]:'';
};
const guessSupplier=(text:string)=>{
 const found=/(?:BENEFICI[ÁA]RIO|CEDENTE|RAZ[ÃA]O\s+SOCIAL|NOME\s+DO\s+EMITENTE|FORNECEDOR)\s*[:\-]?\s*([A-ZÀ-Ÿ][\w\s.,&/-]{3,110}?)(?=\s{2,}|CNPJ|CPF|VENCIMENTO|VALOR|$)/i.exec(text);
 return found?.[1]?.trim()||'';
};
const guessDue=(text:string)=>{
 const match=/(?:VENCIMENTO|DATA\s+DE\s+VENCIMENTO)\s*[:\-]?\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
 if(!match)return '';
 const [d,m,y]=match[1].split('/');
 return y+'-'+m+'-'+d;
};
export default function PurchasesStock({db,user,canEdit,canConsume,companyId=DEFAULT_COMPANY}:Props){
 const active=useContext(PageActiveContext);
 const [mode,setMode]=useState<'invoice'|'bill'>('invoice');
 const [invoice,setInvoice]=useState<InvoiceDraft>(initialInvoice);
 const [invoices,setInvoices]=useState<PurchaseRow[]>([]);
 const [bills,setBills]=useState<BillRow[]>([]);
 const [stocks,setStocks]=useState<StockEntry[]>([]);
 const [moves,setMoves]=useState<MovementRow[]>([]);
 const [notice,setNotice]=useState(''),[error,setError]=useState('');
 const [busy,setBusy]=useState(false),[reading,setReading]=useState(false);
 const [billFile,setBillFile]=useState<File|null>(null);
 const [billSupplier,setBillSupplier]=useState(''),[billAmount,setBillAmount]=useState('');
 const [billDue,setBillDue]=useState(''),[billBarcode,setBillBarcode]=useState(''),[billPurchase,setBillPurchase]=useState('');
 const [enfestoId,setEnfestoId]=useState(''),[enfestoOC,setEnfestoOC]=useState(''),[enfestoNotes,setEnfestoNotes]=useState('');
 const [consumption,setConsumption]=useState<ConsumptionLine[]>([{stockId:'',quantity:''}]);
 const [openedStock,setOpenedStock]=useState(false),[openedConsumption,setOpenedConsumption]=useState(false);
 const path=(collectionName:string)=>collection(db,'companies',companyId,collectionName);
 const notify=(msg:string,invalid=false)=>{setNotice(invalid?'':msg);setError(invalid?msg:'')};
 useEffect(()=>{
   if(!active)return;
   const stop=[
     onSnapshot(query(path('purchases'),orderBy('createdAt','desc'),limit(80)),snapshot=>setInvoices(snapshot.docs.map(d=>({id:d.id,...d.data()} as PurchaseRow)).sort((a,b)=>(b.date||'').localeCompare(a.date||''))),e=>notify('Erro ao carregar notas: '+safeProviderMessage(e),true)),
     onSnapshot(query(path('bills'),orderBy('createdAt','desc'),limit(80)),snapshot=>setBills(snapshot.docs.map(d=>({id:d.id,...d.data()} as BillRow)).sort((a,b)=>(a.dueDate||'').localeCompare(b.dueDate||''))),e=>notify('Erro ao carregar boletos: '+safeProviderMessage(e),true)),
     onSnapshot(path('inventory'),snapshot=>setStocks(snapshot.docs.map(d=>({id:d.id,...d.data()} as StockEntry)).sort((a,b)=>a.material.localeCompare(b.material,'pt-BR')||a.color.localeCompare(b.color,'pt-BR'))),e=>notify('Erro ao carregar estoque: '+safeProviderMessage(e),true)),
     onSnapshot(query(path('stock_movements'),orderBy('createdAt','desc'),limit(80)),snapshot=>setMoves(snapshot.docs.map(d=>({id:d.id,...d.data()} as MovementRow)).sort((a,b)=>(b.createdAt?.toDate?.()?.getTime()||0)-(a.createdAt?.toDate?.()?.getTime()||0)).slice(0,80)),e=>notify('Erro ao carregar movimentações: '+safeProviderMessage(e),true))
   ];return()=>stop.forEach(off=>off());
 },[db,companyId,active]);
 const totalInStock=useMemo(()=>stocks.filter(s=>s.kind==='tecido').length,[stocks]);
 const pendingBills=useMemo(()=>bills.filter(b=>b.status==='pending'),[bills]);
 const fabrics=useMemo(()=>stocks.filter(s=>s.kind==='tecido'&&s.quantityMilli>0),[stocks]);
 const updateLine=(i:number,patch:Partial<PurchaseLine>)=>setInvoice(d=>({
   ...d,lines:d.lines.map((line,n)=>n===i?{...line,...patch}:line)
 }));
 const uploadInvoice=async(file:File|null)=>{
   if(!file)return;
   setReading(true);notify('');
   try{
     if(file.name.toLowerCase().endsWith('.xml')){
       const text=await file.text();
       if(text.length>2_000_000)throw Error('XML acima de 2 MB. Confira o arquivo.');
       const data=await parseNfeXml(text);
       setInvoice(data);
       notify('NF-e XML lida. Confira tipo, unidade, cor, preços e quantidades antes de confirmar a entrada. A assinatura digital fiscal não é verificada.');
     }else if(file.name.toLowerCase().endsWith('.pdf')){
       const data=await pdfBase64(file);
       const text=await extractPdfText(file);
       const amount=findAmount(text);
       setInvoice(old=>({...initialInvoice(),
         source:'pdf',supplier:guessSupplier(text),total:amount||'0',
         pdfData:data,pdfName:file.name,lines:[initialLine()]}));
       notify(text.trim()?
         'PDF lido. Identifique e confira manualmente os itens: DANFEs e PDFs variam de formato e nem sempre têm quantidades estruturadas.':
         'PDF sem texto extraível (possivelmente digitalizado). Preencha manualmente os dados; não houve reconhecimento por imagem.');
     }else throw Error('Selecione XML de NF-e ou PDF.');
   }catch(e){notify(safeProviderMessage(e,'Não foi possível ler o arquivo.'),true)}
   finally{setReading(false)}
 };
 const uploadBill=async(file:File|null)=>{
   if(!file)return;
   setReading(true);notify('');
   try{
     await pdfBase64(file);
     setBillFile(file);
     const text=await extractPdfText(file);
     setBillSupplier(guessSupplier(text));
     setBillAmount(findAmount(text));
     setBillDue(guessDue(text));
     const match=text.match(/(?:\d[\d.\s]{43,65}\d)/g)?.map(v=>v.replace(/\D/g,'')).find(v=>v.length===47||v.length===48);
     setBillBarcode(match||'');
     notify(text.trim()?'Boleto lido. Confira fornecedor, valor, vencimento e linha digitável antes de salvar.':'PDF digitalizado ou sem texto. Informe os dados manualmente.');
   }catch(e){notify(safeProviderMessage(e,'Falha ao carregar o boleto.'),true)}
   finally{setReading(false)}
 };
 const confirmPurchase=async()=>{
   if(!canEdit||busy)return;
   if(!window.confirm('Confirmar a entrada de materiais desta nota? O estoque por cor será aumentado uma única vez e a operação não poderá ser apagada.'))return;
   setBusy(true);notify('');
   try{
     const id=await confirmInvoice(db,companyId,user.uid,invoice);
     setInvoice(initialInvoice());
     notify('Nota confirmada: '+id.slice(0,18)+'... Entrada de estoque e histórico registrados sem duplicidade.');
   }catch(e){notify(safeProviderMessage(e,'Erro ao confirmar a nota fiscal.'),true)}
   finally{setBusy(false)}
 };
 const confirmBill=async()=>{
   if(!canEdit||busy)return;
   if(!billFile){notify('Selecione um boleto PDF.',true);return}
   setBusy(true);notify('');
   try{
     await saveBoleto(db,companyId,user.uid,{file:billFile,supplier:billSupplier,amount:billAmount,
       dueDate:billDue,barcode:billBarcode,purchaseId:billPurchase});
     setBillFile(null);setBillSupplier('');setBillAmount('');setBillDue('');setBillBarcode('');setBillPurchase('');
     notify('Boleto registrado em Contas a pagar, com PDF anexado e vínculo à compra, quando informado.');
   }catch(e){notify(safeProviderMessage(e,'Erro ao salvar boleto.'),true)}
   finally{setBusy(false)}
 };
 const confirmConsumption=async()=>{
   if(!canConsume||busy)return;
   const valid=consumption.filter(x=>x.stockId&&x.quantity.trim());
   if(!enfestoId.trim()||!enfestoOC.trim()||!valid.length){notify('Informe a OC, identificação do enfesto e os tecidos consumidos.',true);return}
   const summary=valid.map(x=>{const f=fabrics.find(v=>v.id===x.stockId);return (f?f.material+' / '+f.color:'Material')+' — '+x.quantity+' '+(f?.unit||'')}).join('\n');
   if(!window.confirm('CONFIRMAR CONSUMO DO ENFESTO '+enfestoId+' DA OC '+enfestoOC+'?\n'+summary+'\nA baixa será imediata, sem duplicidade e sem estorno automático.'))return;
   setBusy(true);notify('');
   try{
     await confirmEnfestoConsumption({db,company:companyId,uid:user.uid,confirmationId:enfestoId,
       oc:enfestoOC,lines:valid,notes:enfestoNotes});
     setEnfestoId('');setEnfestoOC('');setEnfestoNotes('');setConsumption([{stockId:'',quantity:''}]);
     notify('Enfesto confirmado. Baixa de estoque por cor, unidade e histórico concluídos na mesma transação.');
   }catch(e){notify(safeProviderMessage(e,'Falha ao baixar estoque do enfesto.'),true)}
   finally{setBusy(false)}
 };
 return <div className="purchases-page">
  <header className="purchase-heading">
   <div><span className="order-eyebrow">MB REFERÊNCIAS / SUPRIMENTOS</span><h1>Compras e Estoque</h1><p>Notas fiscais, boletos, materiais por cor e consumo confirmado do enfesto.</p></div>
   <div className="purchases-company">Empresa: <strong>{companyId===DEFAULT_COMPANY?'MB — empresa principal':companyId}</strong></div>
  </header>
  <div className="purchase-kpis">
   <div><small>Notas confirmadas</small><strong>{invoices.length}</strong></div>
   <div><small>Boletos a pagar</small><strong>{pendingBills.length}</strong></div>
   <div><small>Saldo por tecido / cor</small><strong>{totalInStock}</strong></div>
  </div>
  {error&&<div className="production-alert" role="alert">{error}</div>}
  {notice&&<div className="production-ok" role="status"><CheckCircle2 size={16}/>{notice}</div>}
  <div className="purchase-indicators">
   <button type="button" className={'purchase-indicator '+(mode==='invoice'?'active':'')} onClick={()=>setMode('invoice')}>
     <FileCode2 size={26}/><strong>1. Importar Nota Fiscal</strong><small>XML ou PDF · materiais · entrada de estoque</small>
   </button>
   <button type="button" className={'purchase-indicator '+(mode==='bill'?'active':'')} onClick={()=>setMode('bill')}>
     <FileText size={26}/><strong>2. Importar Boleto</strong><small>PDF · vencimento · contas a pagar</small>
   </button>
  </div>
  {mode==='invoice'?<section className="purchase-panel">
   <div className="purchase-panel-heading"><h2><PackagePlus size={21}/> Entrada de materiais</h2><span>Conferência antes de confirmar</span></div>
   {canEdit&&<><label className="purchase-upload"><UploadCloud size={19}/> Escolher XML ou PDF da nota
     <input type="file" accept=".xml,text/xml,application/xml,.pdf,application/pdf" disabled={busy||reading} onChange={e=>{void uploadInvoice(e.currentTarget.files?.[0]||null);e.currentTarget.value=''}}/>
   </label>{reading&&<p>Identificando dados do documento...</p>}
   <div className="purchase-fields">
     <label>Fornecedor<input value={invoice.supplier} onChange={e=>setInvoice(v=>({...v,supplier:e.target.value}))}/></label>
     <label>CNPJ / CPF<input value={invoice.supplierTaxId} onChange={e=>setInvoice(v=>({...v,supplierTaxId:e.target.value}))}/></label>
     <label>Número da NF<input value={invoice.number} onChange={e=>setInvoice(v=>({...v,number:e.target.value}))}/></label>
     <label>Data da nota<input type="date" value={invoice.date} onChange={e=>setInvoice(v=>({...v,date:e.target.value}))}/></label>
     <label>Chave da NF-e<input value={invoice.accessKey} maxLength={44} onChange={e=>setInvoice(v=>({...v,accessKey:e.target.value}))} placeholder="44 dígitos, se disponível"/></label>
     <label>Valor total (R$)<input inputMode="decimal" value={invoice.total} onChange={e=>setInvoice(v=>({...v,total:e.target.value}))}/></label>
   </div>
   <h3>Materiais da nota</h3>
   <div className="purchase-lines">{invoice.lines.map((line,i)=><div className="purchase-line" key={i}>
     <div className="purchase-line-title"><strong>Item {i+1}</strong><button type="button" className="outline-button" onClick={()=>setInvoice(v=>({...v,lines:v.lines.filter((_,n)=>n!==i)}))} disabled={invoice.lines.length<=1||busy}>Remover</button></div>
     <div className="purchase-fields">
      <label>Material / tecido<input value={line.description} onChange={e=>updateLine(i,{description:e.target.value})}/></label>
      <label>Tipo<select value={line.kind} onChange={e=>updateLine(i,{kind:e.target.value as 'tecido'|'material',unit:e.target.value==='tecido'?'KG':line.unit})}><option value="tecido">Tecido</option><option value="material">Outro material</option></select></label>
      <label>Cor<input value={line.color} onChange={e=>updateLine(i,{color:e.target.value})} placeholder={line.kind==='tecido'?'Obrigatória (ex.: PRETO)':'Opcional'}/></label>
      <label>Unidade<select value={line.unit} onChange={e=>updateLine(i,{unit:e.target.value as StockUnit})}>{unitOptions.filter(u=>line.kind!=='tecido'||u==='KG'||u==='M').map(u=><option key={u}>{u}</option>)}</select></label>
      <label>Quantidade<input inputMode="decimal" value={line.quantity} onChange={e=>updateLine(i,{quantity:e.target.value})}/></label>
      <label>Valor unitário<input inputMode="decimal" value={line.unitPrice} onChange={e=>updateLine(i,{unitPrice:e.target.value})}/></label>
      <label>Valor total<input inputMode="decimal" value={line.total} onChange={e=>updateLine(i,{total:e.target.value})}/></label>
     </div>
   </div>)}</div>
   <div className="purchase-actions"><button className="outline-button" type="button" disabled={invoice.lines.length>=25||busy} onClick={()=>setInvoice(v=>({...v,lines:[...v.lines,initialLine()]}))}>Adicionar item</button><button className="primary-button" type="button" disabled={busy||reading} onClick={()=>void confirmPurchase()}>{busy?'Registrando...':'Conferir e confirmar entrada'}</button></div>
   <p className="purchase-note"><AlertTriangle size={16}/> As cores precisam ser conferidas; a descrição da NF-e nem sempre informa as cores. PDF digitalizado exige preenchimento manual. A mesma NF não entra duas vezes.</p>
   </>}
   <h3>Histórico de notas ({invoices.length})</h3>
   <div className="purchase-table"><table><thead><tr><th>NF</th><th>Fornecedor</th><th>Data</th><th>Total</th><th>Arquivo</th></tr></thead><tbody>{invoices.slice(0,80).map(v=><tr key={v.id}><td>{v.number||v.id.slice(0,12)}</td><td>{v.supplier}</td><td>{formatDate(v.date)}</td><td>{money(v.totalCents||0)}</td><td>{v.pdfData?<button type="button" className="outline-button" onClick={()=>pdfDownload(v.pdfData!,v.pdfName||'nota.pdf')}><Download size={14}/> PDF</button>:'XML/dados'}</td></tr>)}</tbody></table>{!invoices.length&&<p>Sem notas cadastradas nesta empresa.</p>}</div>
  </section>:<section className="purchase-panel">
    <div className="purchase-panel-heading"><h2><FileText size={21}/> Contas a pagar</h2><span>Boletos com PDF anexado</span></div>
    {canEdit&&<><label className="purchase-upload"><UploadCloud size={19}/> Anexar boleto PDF (até 390 KB)
      <input type="file" accept=".pdf,application/pdf" disabled={busy||reading} onChange={e=>{void uploadBill(e.currentTarget.files?.[0]||null);e.currentTarget.value=''}}/>
    </label>{billFile&&<p>Arquivo selecionado: {billFile.name}</p>}
    <div className="purchase-fields">
      <label>Fornecedor / beneficiário<input value={billSupplier} onChange={e=>setBillSupplier(e.target.value)}/></label>
      <label>Valor (R$)<input inputMode="decimal" value={billAmount} onChange={e=>setBillAmount(e.target.value)}/></label>
      <label>Vencimento<input type="date" value={billDue} onChange={e=>setBillDue(e.target.value)}/></label>
      <label>Linha digitável / pagamento<input value={billBarcode} onChange={e=>setBillBarcode(e.target.value)}/></label>
      <label>Vincular à nota<select value={billPurchase} onChange={e=>setBillPurchase(e.target.value)}><option value="">Sem vínculo</option>{invoices.map(v=><option value={v.id} key={v.id}>NF {v.number||v.id.slice(0,10)} · {v.supplier}</option>)}</select></label>
    </div><button type="button" className="primary-button" disabled={busy||reading} onClick={()=>void confirmBill()}>{busy?'Salvando...':'Registrar no contas a pagar'}</button>
    <p className="purchase-note"><AlertTriangle size={16}/> PDF de até 390 KB salvo no Firestore Spark. PDFs maiores precisam ser reduzidos antes de importar. Nenhum pagamento bancário é realizado.</p></>}
    <h3>Boletos cadastrados ({bills.length})</h3>
    <div className="purchase-table"><table><thead><tr><th>Fornecedor</th><th>Vencimento</th><th>Valor</th><th>Status</th><th>Documento</th></tr></thead><tbody>{bills.slice(0,80).map(v=><tr key={v.id}><td>{v.supplier}</td><td>{formatDate(v.dueDate)}</td><td>{money(v.amountCents)}</td><td>{v.status==='pending'?'A pagar':'Pago'}</td><td><button className="outline-button" onClick={()=>pdfDownload(v.pdfData,v.pdfName)}><Download size={14}/> PDF</button></td></tr>)}</tbody></table>{!bills.length&&<p>Sem boletos cadastrados nesta empresa.</p>}</div>
  </section>}
  <section className="purchase-panel">
   <div className="purchase-panel-heading"><h2><Boxes size={21}/> Estoque por tecido e cor</h2><button type="button" className="outline-button" onClick={()=>setOpenedStock(v=>!v)}>{openedStock?'Recolher':'Ver saldos'} ({stocks.length})</button></div>
   {openedStock&&<div className="purchase-table"><table><thead><tr><th>Material</th><th>Cor</th><th>Tipo</th><th>Saldo</th></tr></thead><tbody>{stocks.map(s=><tr key={s.id}><td>{s.material}</td><td>{s.color}</td><td>{s.kind}</td><td><strong>{quantityText(s.quantityMilli)} {s.unit}</strong></td></tr>)}</tbody></table>{!stocks.length&&<p>O estoque começa vazio. Confirme uma nota fiscal para registrar a entrada.</p>}</div>}
  </section>
  <section className="purchase-panel">
   <div className="purchase-panel-heading"><h2><Scissors size={21}/> Baixa de tecido no enfesto</h2><button className="outline-button" type="button" onClick={()=>setOpenedConsumption(x=>!x)}>{openedConsumption?'Recolher':'Confirmar consumo'}</button></div>
   <p className="purchase-note">Ao confirmar o consumo, o sistema baixa imediatamente o estoque da cor selecionada, registra o histórico e bloqueia repetição do mesmo ID de enfesto. Esta função também pode ser chamada pela tela de enfesto quando ela estiver integrada ao repositório.</p>
   {openedConsumption&&canConsume&&<div className="purchase-consumption">
     <div className="purchase-fields"><label>OC<input value={enfestoOC} onChange={e=>setEnfestoOC(e.target.value)} placeholder="Ex.: 729"/></label><label>Identificação única do enfesto<input value={enfestoId} onChange={e=>setEnfestoId(e.target.value)} placeholder="Ex.: ENF-OC729-01"/></label></div>
     {consumption.map((line,i)=><div className="purchase-consume-row" key={i}>
      <label>Tecido / cor<select value={line.stockId} onChange={e=>setConsumption(old=>old.map((row,n)=>n===i?{...row,stockId:e.target.value}:row))}><option value="">Selecione tecido e cor</option>{fabrics.map(f=><option key={f.id} value={f.id}>{f.material} — {f.color} · {quantityText(f.quantityMilli)} {f.unit}</option>)}</select></label>
      <label>Consumo<input inputMode="decimal" value={line.quantity} onChange={e=>setConsumption(old=>old.map((row,n)=>n===i?{...row,quantity:e.target.value}:row))} placeholder="Ex.: 12,500"/></label>
      <button type="button" className="outline-button" disabled={consumption.length===1} onClick={()=>setConsumption(old=>old.filter((_,n)=>n!==i))}>Remover</button>
     </div>)}
     <label>Observação (opcional)<input value={enfestoNotes} maxLength={500} onChange={e=>setEnfestoNotes(e.target.value)}/></label>
     <div className="purchase-actions"><button className="outline-button" type="button" disabled={consumption.length>=20} onClick={()=>setConsumption(old=>[...old,{stockId:'',quantity:''}])}>Adicionar cor</button><button className="primary-button" type="button" disabled={busy||!fabrics.length||consumption.some(x=>x.quantity&&!Number.isFinite(qtyMilli(x.quantity)))} onClick={()=>void confirmConsumption()}>{busy?'Registrando...':'Confirmar enfesto e baixar estoque'}</button></div>
   </div>}
   {openedConsumption&&!canConsume&&<p>Seu usuário não possui permissão para confirmar consumo no estoque.</p>}
   <h3>Movimentações recentes</h3>
   <div className="purchase-table"><table><thead><tr><th>Tipo</th><th>Material / cor</th><th>Quantidade</th><th>Origem</th></tr></thead><tbody>{moves.slice(0,40).map(m=><tr key={m.id}><td>{m.kind==='enfesto_out'?'Saída · enfesto':'Entrada · NF'}</td><td>{m.material} / {m.color}</td><td>{m.deltaMilli<0?'-':'+'}{quantityText(Math.abs(m.deltaMilli))} {m.unit}</td><td>{m.oc?'OC '+m.oc:m.sourceId.slice(0,14)}</td></tr>)}</tbody></table>{!moves.length&&<p>Não há movimentações registradas.</p>}</div>
  </section>
 </div>;
}
