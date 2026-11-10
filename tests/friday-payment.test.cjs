'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');

// Execute the actual handler with an isolated database; never touch live payments.
function paymentHarness(confirm=true){
  const source=fs.readFileSync(path.join(__dirname,'../src/CutOrders.tsx'),'utf8');
  const start=source.indexOf('const markPaid=');
  const end=source.indexOf('const initialImport=',start);
  assert.ok(start>=0&&end>start);
  const code=ts.transpileModule(source.slice(start,end)+'\nexports.markPaid=markPaid;',{
    compilerOptions:{target:ts.ScriptTarget.ES2020}
  }).outputText;
  const writes=[],prepared=[],messages=[],busyStates=[];
  let confirmations=0,commits=0;
  const context={exports:{},canEdit:true,busy:false,db:{},user:{uid:'editor'},fridayDate:'2026-11-13',
    done:o=>o.status==='ENTREGUE',paid:o=>o.paymentDone==='OK',num:Number,
    toBR:()=> '13/11/2026',toISO:()=> '2026-11-13',brl:String,
    window:{confirm:()=>{confirmations++;return confirm}},
    preparePayment:o=>prepared.push(o),notify:(...args)=>messages.push(args),
    setBusy:value=>busyStates.push(value),errorText:e=>e.message,
    doc:(_db,collection,id)=>({collection,id}),serverTimestamp:()=> 'timestamp',
    writeBatch:()=>({update:(ref,data)=>writes.push({ref,data}),commit:async()=>{commits++}})};
  vm.runInNewContext(code,context);
  return {...context.exports,writes,prepared,messages,busyStates,
    confirmations:()=>confirmations,commits:()=>commits};
}
const order=(qty='100')=>({id:'oc-1',oc:'1',qty,total:'350',status:'ENTREGUE',paymentDone:''});

test('confirmar pagamento aceita quantidade válida e grava status e sexta-feira',async()=>{
  const h=paymentHarness();
  await h.markPaid([order(),{...order('25'),id:'oc-2'}]);
  assert.equal(h.prepared.length,0);
  assert.equal(h.confirmations(),1);
  assert.equal(h.commits(),1);
  assert.equal(h.writes.length,2);
  for(const {ref,data} of h.writes){
    assert.equal(ref.collection,'cut_orders');
    assert.equal(data.paymentDone,'OK');
    assert.equal(data.paidAt,'13/11/2026');
    assert.equal(data.updatedBy,'editor');
  }
  assert.deepEqual(h.busyStates,[true,false]);
});
test('quantidades inválidas não gravam pagamento',async()=>{
  for(const qty of ['','0','-1','1.5','abc','\\d','1234567890123']){
    const h=paymentHarness();
    await h.markPaid([order(qty)]);
    assert.equal(h.prepared.length,1,qty);
    assert.equal(h.writes.length,0,qty);
    assert.equal(h.confirmations(),0,qty);
  }
});
test('cancelar confirmação não grava pagamento',async()=>{
  const h=paymentHarness(false);
  await h.markPaid([order()]);
  assert.equal(h.confirmations(),1);
  assert.equal(h.writes.length,0);
});
