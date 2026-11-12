'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'src/CutOrders.tsx'),'utf8');

const order=(id,status='ENTREGUE',deliveredAt='11/11/2026',paymentDone='')=>({
  id,oc:id,model:'CAMISETA',office:'MAURO',status,deliveredAt,paymentDone,total:'120,00',
  qty:'20',defects:'',discountTotal:'',piecePrice:'6,00'
});
const toISO=br=>{
  if(!/^\d{2}\/\d{2}\/\d{4}$/.test(String(br||'')))return '';
  return br.slice(6,10)+'-'+br.slice(3,5)+'-'+br.slice(0,2);
};
function selectedFor(rows,fridayDate,paymentQueue){
  const start=source.indexOf('const manualPaymentIds=');
  const end=source.indexOf('  const groups=',start);
  assert.ok(start>=0&&end>start,'encontrar seleção separada por sexta-feira');
  const snippet=source.slice(start,end);
  const code=ts.transpileModule(snippet+
    '\nexports.selection=[...manualPaymentIds];exports.eligible=[...eligible];exports.waiting=[...awaitingPayment];', {
    compilerOptions:{target:ts.ScriptTarget.ES2020}
  }).outputText;
  const ctx={exports:{},rows,fridayDate,paymentQueue,paymentSearch:'',pendingSearch:'',
    useMemo:fn=>fn(),done:o=>o.status==='ENTREGUE',paid:o=>o.paymentDone==='OK',
    num:value=>Number(String(value).replace(',','.')),norm:String,toISO};
  vm.runInNewContext(code,ctx);
  return {selection:[...ctx.exports.selection],eligible:[...ctx.exports.eligible].map(o=>o.id),waiting:[...ctx.exports.waiting].map(o=>o.id)};
}

test('sexta-feira atual contém apenas OCs selecionadas para essa mesma sexta',()=>{
  const rows=[order('729'),order('730'),order('731')];
  const queue={'2026-11-13':['729','731'],'2026-11-20':['730']};
  assert.deepEqual(selectedFor(rows,'2026-11-13',queue).eligible,['729','731']);
  assert.deepEqual(selectedFor(rows,'2026-11-20',queue).eligible,['730']);
});
test('próxima semana começa zerada e não herda OCs pendentes da semana anterior',()=>{
  const rows=[order('729'),order('730')];
  const queue={'2026-11-13':['729','730']};
  assert.deepEqual(selectedFor(rows,'2026-11-20',queue).selection,[]);
  assert.deepEqual(selectedFor(rows,'2026-11-20',queue).eligible,[]);
  // Consultar a semana anterior preserva os dados sem reaproveitá-los na nova semana.
  assert.deepEqual(selectedFor(rows,'2026-11-13',queue).eligible,['729','730']);
});
test('OCs pagas ou em andamento não entram na lista selecionada para pagar',()=>{
  const rows=[order('729','ENTREGUE','11/11/2026','OK'),order('730','EM ANDAMENTO'),order('731')];
  const queue={'2026-11-13':['729','730','731']};
  assert.deepEqual(selectedFor(rows,'2026-11-13',queue).eligible,['731']);
});
test('seção visual de pendências foi removida e seleção manual e histórico continuam funcionando',()=>{
  assert.match(source,/aria-expanded=\{paymentPickerOpen\}/);
  assert.match(source,/\{paymentPickerOpen&&<section id="order-picker-panel"/);
  assert.match(source,/Adicionar ou ajustar OCs desta semana/);
  assert.doesNotMatch(source,/order-awaiting-delivered/);
  assert.doesNotMatch(source,/waitingDelivered/);
  assert.doesNotMatch(source,/order-pending-deliveries/);
  assert.doesNotMatch(source,/pendingPaymentResults/);
  assert.match(source,/const awaitingPayment=useMemo/);
  assert.match(source,/addPaymentOC\(o\)/);
  assert.match(source,/Histórico de pagamentos por mês/);
  assert.match(source,/setPaymentPickerOpen\(false\)/);
});

test('OCs entregues e não pagas permanecem no Firestore e podem ser selecionadas em qualquer semana',()=>{
 const rows=[order('729','ENTREGUE','05/11/2026'),order('730','ENTREGUE','11/11/2026'),order('731','ENTREGUE','10/11/2026','OK'),order('732','EM ANDAMENTO')];
 assert.deepEqual(selectedFor(rows,'2026-11-13',{}).waiting,['729','730']);
 assert.deepEqual(selectedFor(rows,'2026-11-20',{}).waiting,['729','730']);
 assert.deepEqual(selectedFor(rows,'2026-11-13',{}).eligible,[]);
});
test('entregas incompletas não entram em pagamento automático e permanecem recuperáveis',()=>{
 const invalid=order('733','ENTREGUE','');invalid.total='';
 assert.deepEqual(selectedFor([invalid],'2026-11-13',{}).waiting,['733']);
 assert.deepEqual(selectedFor([invalid],'2026-11-13',{}).eligible,[]);
});
test('entrega não marca pagamento como pago e seleção de semana errada é rejeitada',()=>{
 assert.match(source,/const awaitingPayment=useMemo\(\(\)=>rows\.filter\(o=>done\(o\)&&!paid\(o\)\)/);
 assert.match(source,/const markPaid=async\(items:Order\[\]\)/);
 assert.match(source,/toISO\(o\.deliveredAt\)>fridayDate/);
});
