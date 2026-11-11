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
const toISO=(br)=>{
  if(!/^\d{2}\/\d{2}\/\d{4}$/.test(String(br||'')))return '';
  return br.slice(6,10)+'-'+br.slice(3,5)+'-'+br.slice(0,2);
};
function visibleFor(rows,selection=[]){
  const start=source.indexOf('const waitingDelivered=useMemo(');
  const end=source.indexOf('  const deliveredTodayAwaiting=',start);
  assert.ok(start>=0&&end>start,'encontrar computação das OCs entregues aguardando seleção');
  const snippet=source.slice(start,end);
  const code=ts.transpileModule(snippet+'\nexports.pending=waitingDelivered;',{
    compilerOptions:{target:ts.ScriptTarget.ES2020}
  }).outputText;
  const ctx={exports:{},useMemo:fn=>fn(),rows,
    paymentQueue:{'2026-11-13':selection},fridayDate:'2026-11-13',
    currentDate:'2026-11-11',done:o=>o.status==='ENTREGUE',
    paid:o=>o.paymentDone==='OK',toISO};
  vm.runInNewContext(code,ctx);
  return [...ctx.exports.pending];
}

test('OC entregue hoje não desaparece se ainda não foi selecionada para pagar',()=>{
  const result=visibleFor([order('729'),order('730','EM ANDAMENTO'),order('731','ENTREGUE','10/11/2026')]);
  assert.deepEqual(result.map(x=>x.id),['729','731']);
});
test('OCs entregues continuam visíveis em outro celular sem seleção local',()=>{
  assert.deepEqual(visibleFor([order('729'),order('730')],[]).map(x=>x.id),['729','730']);
  assert.deepEqual(visibleFor([order('729'),order('730')],['729']).map(x=>x.id),['730']);
});
test('OCs pagas não aparecem como pendentes; entrega sem data pode ser recuperada',()=>{
  const list=[order('729','ENTREGUE','11/11/2026','OK'),order('731','ENTREGUE','')];
  assert.deepEqual(visibleFor(list).map(x=>x.id),['731']);
});
test('a interface possui lista visível, link para planilha sem filtros e seleção explícita',()=>{
  assert.match(source,/OCs entregues aguardando seleção/);
  assert.match(source,/waitingDelivered\.slice\(0,waitingDeliveredLimit\)/);
  assert.match(source,/setProduction\('done'\);setCount\(PAGE\);setShowFriday\(false\)/);
  assert.match(source,/onClick=\{\(\)=>addPaymentOC\(o\)\}/);
  assert.match(source,/Apenas a confirmação em “Pago” altera o status financeiro/);
});
