'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const source=fs.readFileSync(path.join(__dirname,'../src/CutOrders.tsx'),'utf8');
const js=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText;
function clockHarness(date){
  let now=date;
  const effects=[],dates=[],listeners={};
  const context={Date:class extends Date{constructor(...args){super(...(args.length?args:[now+'T12:00:00']))}},
    pageActive:true,useRef:current=>({current}),useEffect:fn=>effects.push(fn),
    setFridayDate:d=>dates.push(d),setPaymentSearch:()=>{},setPaymentPrepare:()=>{},setNotice:()=>{},
    document:{addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:()=>{}},
    window:{addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:()=>{},setInterval:fn=>listeners.timer=fn,clearInterval:()=>{}}};
  vm.createContext(context);
  vm.runInContext(js(source.slice(source.indexOf('const toISO='),source.indexOf('const norm='))),context);
  const start=source.indexOf('const paymentWeekRef=');
  vm.runInContext(js(source.slice(start,source.indexOf('const [paymentMonth',start))),context);
  effects[0]();
  return {dates,listeners,advance:d=>{now=d},run:code=>vm.runInContext(code,context)};
}
test('nova semana muda automaticamente na aba aberta e ao voltar ao aplicativo',()=>{
  const h=clockHarness('2026-11-13');
  assert.equal(h.run("friday(today())"),'2026-11-13');
  h.listeners.timer();assert.equal(h.dates.length,0);
  h.advance('2026-11-14');h.listeners.focus();
  assert.deepEqual(h.dates,['2026-11-20']);
  h.listeners.visibilitychange();assert.equal(h.dates.length,1);
  h.advance('2026-11-21');h.listeners.timer();
  assert.deepEqual(h.dates,['2026-11-20','2026-11-27']);
});
test('semana muda na virada do ano e abertura ignora sexta antiga em cache',()=>{
  const h=clockHarness('2027-01-02');
  const declaration=source.match(/const \[fridayDate,setFridayDate\]=useState\((.*?)\),\[showFriday/)[1];
  assert.equal(h.run(`const initialPageState={fridayDate:'2026-12-25'};const useState=fn=>fn();useState(${declaration})`),'2027-01-08');
});
test('pagas somem da relação, seleção e busca; pendências antigas continuam elegíveis',()=>{
  const rows=[
    {id:'paid',paymentDone:'OK',status:'ENTREGUE',total:'50',paidAt:'06/11/2026',deliveredAt:'05/11/2026',oc:'100'},
    {id:'pending',paymentDone:'',status:'ENTREGUE',total:'75',paidAt:'',deliveredAt:'05/11/2026',oc:'101'}
  ];
  const context={rows,fridayDate:'2026-11-13',paymentQueue:{'2026-11-13':['paid','pending']},paymentSearch:'10',
    paid:o=>o.paymentDone==='OK',done:o=>o.status==='ENTREGUE',num:Number,norm:String,
    toISO:s=>s?s.split('/').reverse().join('-'):'',useMemo:fn=>fn()};
  const start=source.indexOf('const manualPaymentIds=');
  const end=source.indexOf('const groups=',start);
  vm.createContext(context);
  vm.runInContext(js(source.slice(start,end)),context);
  for(const name of ['manualPaymentIds','eligible.map(o=>o.id)','paymentMatches.map(o=>o.id)']){
    assert.equal(vm.runInContext(`JSON.stringify(${name})`,context),'["pending"]');
  }
  assert.doesNotMatch(source,/order-paid-on-friday|paidThisFriday/);
  assert.match(source,/monthlyPaid\.map/);
  const selectMonth=source.slice(source.indexOf('const selectMonth='),source.indexOf('usePageMemory(pageMemoryKey'));
  assert.doesNotMatch(selectMonth,/setFridayDate/);
});
