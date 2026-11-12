'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
const root=path.join(__dirname,'..');
const cut=fs.readFileSync(path.join(root,'src/CutOrders.tsx'),'utf8');
const app=fs.readFileSync(path.join(root,'src/App.tsx'),'utf8');
const samples=fs.readFileSync(path.join(root,'src/SampleWorkflow.tsx'),'utf8');

function clickSummary(target,initial={}){
 const start=cut.indexOf('const summaryFilter=');
 const end=cut.indexOf('const manualPaymentIds=',start);
 assert.ok(start>=0&&end>start,'funções do filtro do resumo');
 const snippet=ts.transpileModule(cut.slice(start,end)+'\nexports.click=summaryFilter;',{
  compilerOptions:{target:ts.ScriptTarget.ES2020}
 }).outputText;
 const state={production:'all',payFilter:'all',showFriday:true,query:'oc',typeFilter:'Bermuda',office:'MAURO',count:100,...initial};
 const ctx={exports:{},PAGE:75,
  get production(){return state.production;},
  get payFilter(){return state.payFilter;},
  setProduction:x=>{state.production=x;},
  setPayFilter:x=>{state.payFilter=x;},
  setShowFriday:x=>{state.showFriday=x;},
  setQuery:x=>{state.query=x;},
  setTypeFilter:x=>{state.typeFilter=x;},
  setOffice:x=>{state.office=x;},
  setCount:x=>{state.count=x;}
 };
 vm.runInNewContext(snippet,ctx);
 ctx.exports.click(target);
 return state;
}
test('card Em andamento abre a planilha filtrada e limpa os demais filtros',()=>{
 assert.deepEqual(clickSummary('progress'),{production:'progress',payFilter:'all',showFriday:false,query:'',typeFilter:'all',office:'all',count:75});
});
test('card Pedidos atrasados utiliza o filtro de prazo vencido',()=>{
 assert.equal(clickSummary('overdue').production,'overdue');
 assert.match(cut,/production==='overdue'\?overdue\(o,currentDate\)/);
});
test('card Entregues a pagar filtra somente entregas pendentes',()=>{
 assert.deepEqual([clickSummary('pending').production,clickSummary('pending').payFilter],['done','pending']);
 assert.match(cut,/payFilter==='paid'\?paid\(o\):!paid\(o\)/);
});
test('clicar novamente no card ativo volta a ver todas as ordens',()=>{
 const result=clickSummary('overdue',{production:'overdue'});
 assert.equal(result.production,'all');
 assert.equal(result.payFilter,'all');
});
test('todos os indicadores do resumo são botões acessíveis e ativos por filtro',()=>{
 for(const type of ['all','progress','overdue','done','pending']){
  assert.match(cut,new RegExp("onClick=\\{\\(\\)=>summaryFilter\\('"+type+"'\\)\\}"));
 }
 assert.match(cut,/aria-pressed=\{!showFriday&&activeSummary\('overdue'\)\}/);
 assert.match(cut,/aria-label="Filtrar ordens de corte pelo resumo"/);
});
test('painel de entregas não ocupa mais Pagamento; seleção e histórico permanecem intactos',()=>{
 assert.doesNotMatch(cut,/order-pending-deliveries/);
 assert.doesNotMatch(cut,/pendingPaymentResults/);
 assert.match(cut,/order-picker-panel/);
 assert.match(cut,/manualPaymentIds/);
 assert.match(cut,/const markPaid=async\(items:Order\[\]\)/);
 assert.match(cut,/const monthlyPaid=useMemo/);
 assert.match(cut,/Histórico de pagamentos por mês/);
});
test('Amostras mantém total de peças e mostra contagem dos cards, com rótulo curto no menu',()=>{
 assert.match(app,/samples:\{label:'Amostras',short:'Amostras'/);
 assert.match(samples,/Total de cards \(cortes\)/);
 assert.match(samples,/items\.length\.toLocaleString\('pt-BR'\)/);
 assert.match(samples,/samplePieces\.total\.toLocaleString\('pt-BR'\)/);
});
