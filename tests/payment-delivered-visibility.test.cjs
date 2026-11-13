'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/CutOrders.tsx'),'utf8');

const order=(id,status='ENTREGUE',deliveredAt='12/11/2026',paymentDone='')=>({
 id,oc:id,model:'CAMISETA',office:'MAURO',status,deliveredAt,paymentDone,total:'120,00',
 qty:'20',defects:'',discountTotal:'',discountPiece:'',piecePrice:'6,00',paidAt:''
});
const toISO=br=>{
 if(!/^\d{2}\/\d{2}\/\d{4}$/.test(String(br||'')))return '';
 return br.slice(6,10)+'-'+br.slice(3,5)+'-'+br.slice(0,2);
};
function paymentView(rows,fridayDate,paymentQueue={}){
 const start=source.indexOf('const manualPaymentIds=');
 const end=source.indexOf('  const groups=',start);
 assert.ok(start>=0&&end>start,'encontrar lógica de OCs entregues e pagamento');
 const snippet=source.slice(start,end);
 const code=ts.transpileModule(snippet+
   '\nexports.selection=[...manualPaymentIds];exports.eligible=[...eligible];exports.waiting=[...awaitingPayment];exports.review=[...review];exports.ready=[...readyForPayment];',{
   compilerOptions:{target:ts.ScriptTarget.ES2020}
 }).outputText;
 const ctx={exports:{},rows,fridayDate,paymentQueue,paymentSearch:'',
  useMemo:fn=>fn(),done:o=>o.status==='ENTREGUE',paid:o=>o.paymentDone==='OK',
  num:value=>Number(String(value).replace(',','.')),norm:String,toISO};
 vm.runInNewContext(code,ctx);
 return Object.fromEntries(Object.entries(ctx.exports).map(([key,value])=>[key,key==='selection'?value:value.map(o=>o.id)]));
}
test('OCs 752, 753 e 754 entregues aparecem automaticamente no pagamento SEM seleção manual',()=>{
 const rows=[order('752'),order('753'),order('754')];
 assert.deepEqual(paymentView(rows,'2026-11-13',{}).eligible,['752','753','754']);
 assert.deepEqual(paymentView(rows,'2026-11-13',{}).ready,['752','753','754']);
 assert.deepEqual(paymentView(rows,'2026-11-13',{}).selection,[]);
});
test('entregues pendentes continuam visíveis na sexta seguinte até serem pagas',()=>{
 const rows=[order('752','ENTREGUE','11/11/2026'),order('753','ENTREGUE','12/11/2026')];
 const queue={'2026-11-13':['752'],'2026-11-20':['753']};
 assert.deepEqual(paymentView(rows,'2026-11-13',queue).eligible,['752','753']);
 assert.deepEqual(paymentView(rows,'2026-11-20',queue).eligible,['752','753']);
 assert.deepEqual(paymentView(rows,'2026-11-13',queue).selection,['752']);
 assert.deepEqual(paymentView(rows,'2026-11-20',queue).selection,['753']);
});
test('pagos, OCs em andamento e entregas futuras não entram no fechamento anterior',()=>{
 const rows=[order('752','ENTREGUE','12/11/2026','OK'),order('753','EM ANDAMENTO','12/11/2026'),order('754','ENTREGUE','20/11/2026'),order('755','ENTREGUE','11/11/2026')];
 assert.deepEqual(paymentView(rows,'2026-11-13').eligible,['755']);
 assert.deepEqual(paymentView(rows,'2026-11-20').eligible,['754','755']);
 assert.deepEqual(paymentView(rows,'2026-11-20').waiting,['754','755']);
});
test('entregas sem data, quantidade ou valor são VISÍVEIS para corrigir, mas não pagáveis',()=>{
 const noDate=order('752','ENTREGUE','');
 const noTotal=order('753');noTotal.total='';
 const noQty=order('754');noQty.qty='';
 const defect=order('755');defect.defects='3';defect.discountPiece='';
 const ready=order('756');
 const result=paymentView([noDate,noTotal,noQty,defect,ready],'2026-11-13');
 assert.deepEqual(result.eligible,['752','753','754','755','756']);
 assert.deepEqual(result.review,['752','753','754','755']);
 assert.deepEqual(result.ready,['756']);
});
test('tela mostra entregues por oficina e permite completar dados antes de pagar',()=>{
 assert.match(source,/const eligible=useMemo\(\(\)=>awaitingPayment\.filter/);
 assert.match(source,/const readyForPayment=useMemo/);
 assert.match(source,/ENTREGUES e ainda não pagas/);
 assert.match(source,/aparecem automaticamente por costureiro/);
 assert.match(source,/Precisam conferir/);
 assert.match(source,/Completar dados para pagar/);
 assert.match(source,/reviewIds\.has\(o\.id\)\?'A CONFERIR'/);
 assert.match(source,/canEdit&&!reviewIds\.has\(o\.id\)&&<button/);
 assert.match(source,/markPaid\(g\.list\.filter\(o=>!reviewIds\.has\(o\.id\)\)\)/);
 assert.doesNotMatch(source,/order-awaiting-delivered/);
 assert.doesNotMatch(source,/order-pending-deliveries/);
});
test('busca manual e histórico continuam, mas a seleção local não oculta entregas',()=>{
 assert.match(source,/aria-expanded=\{paymentPickerOpen\}/);
 assert.match(source,/\{paymentPickerOpen&&<section id="order-picker-panel"/);
 assert.match(source,/Pesquisar ou conferir uma OC/);
 assert.match(source,/addPaymentOC\(o\)/);
 assert.match(source,/Histórico de pagamentos por mês/);
 assert.match(source,/const manualPaymentIds=/);
 assert.match(source,/setPaymentPickerOpen\(false\)/);
});
test('entregar não marca PAGO; pagamento exige confirmação e validação da data',()=>{
 assert.match(source,/await save\(\{\.\.\.order,status:'ENTREGUE',deliveredFlag:'OK',deliveredAt:/);
 assert.match(source,/const markPaid=async\(items:Order\[\]\)/);
 assert.match(source,/Confirmar pagamento de/);
 assert.match(source,/!toISO\(o\.deliveredAt\)\|\|toISO\(o\.deliveredAt\)>fridayDate/);
 assert.match(source,/paymentDone:'OK',paidAt:paymentDate/);
 assert.match(source,/const awaitingPayment=useMemo\(\(\)=>rows\.filter\(o=>done\(o\)&&!paid\(o\)\)/);
});
