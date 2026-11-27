import { decimal, qtyMilli, type StockEntry } from './purchasesInventory';

export type FichaCor = {cor:string;p:string;m:string;g:string;gg:string;xg:string};
export type EnfestoColor = {
 cor:string; expected:number; layers:string; weightPerLayer:string;
 cutPieces:string; stockId:string; consumption:string; checked:boolean
};
export type EnfestoDetails = {rows:EnfestoColor[];notes:string};

const integer=(v:unknown)=>{const n=Number(String(v??'').trim());return Number.isSafeInteger(n)&&n>=0?n:0};
export const normalizeColor=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleUpperCase('pt-BR').trim();

/** Menor quantidade positiva entre P/M/G/GG/XG de UMA cor da ficha. */
export function sheetsForColor(row:FichaCor):number{
 const positives=(['p','m','g','gg','xg'] as const).map(size=>integer(row[size])).filter(value=>value>0);
 return positives.length?Math.min(...positives):0;
}
export const isBlackColor=(color:string)=>/^(PRET[OA]|BLACK)(?:\b|$)/.test(normalizeColor(color));
/** Propaga o peso único ao editar; não altera fichas salvas antes da edição. */
export function withSharedSheetWeight(rows:EnfestoColor[],weight:string):EnfestoColor[]{
 return rows.map(row=>({...row,weightPerLayer:weight,consumption:'',checked:row.weightPerLayer===weight?row.checked:false}));
}
export function makeEnfestoRows(colors:FichaCor[],saved:EnfestoColor[]=[]):EnfestoColor[]{
 const fromSheet=colors.filter(row=>row.cor.trim()||['p','m','g','gg','xg'].some(k=>integer(row[k as keyof FichaCor])>0));
 return fromSheet.map((row,i)=>{
  const expected=['p','m','g','gg','xg'].reduce((sum,k)=>sum+integer(row[k as keyof FichaCor]),0);
  const found=saved.find(item=>normalizeColor(item.cor)===normalizeColor(row.cor)&&item.expected===expected);
  const suggestedLayers=String(sheetsForColor(row)||'');
  return found?{...found,cor:row.cor,expected,layers:found.layers?.trim()?found.layers:suggestedLayers}:{cor:row.cor||'COR NÃO INFORMADA '+(i+1),expected,layers:suggestedLayers,weightPerLayer:'',cutPieces:String(expected),stockId:'',consumption:'',checked:false};
 });
}
/** Assinatura estável dos nomes e da distribuição por tamanho; independe da ordem das propriedades Firestore. */
export const sheetColorsSignature=(colors:FichaCor[]|undefined|null):string=>JSON.stringify(
 (Array.isArray(colors)?colors:[]).map(row=>[
  normalizeColor(String(row.cor||'')),
  ...(['p','m','g','gg','xg'] as const).map(size=>integer(row[size]))
 ]).filter(row=>row[0]!==''||row.slice(1).some(qty=>Number(qty)>0))
);
/** Ao corrigir a ficha, só reaproveita a conferência de cores cujos tamanhos
 * e quantidades realmente não mudaram. Mesmo que o TOTAL seja igual,
 * deslocar peças entre P/M/G deve obrigar uma nova conferência. */
export function reconcileEnfestoRowsAfterSheetEdit(
 previousColors:FichaCor[],nextColors:FichaCor[],savedRows:EnfestoColor[]
):EnfestoColor[]{
 const unchanged=new Set((previousColors||[]).filter(old=>(nextColors||[]).some(next=>
  normalizeColor(old.cor)===normalizeColor(next.cor)
  && (['p','m','g','gg','xg'] as const).every(size=>integer(old[size])===integer(next[size]))
 )).map(row=>normalizeColor(row.cor)));
 const safeRows=(savedRows||[]).filter(row=>unchanged.has(normalizeColor(row.cor)));
 return makeEnfestoRows(nextColors,safeRows);
}
export function calculatedKg(row:EnfestoColor):number{
 const layers=integer(row.layers),weight=decimal(row.weightPerLayer);
 return layers>0&&Number.isFinite(weight)&&weight>0?Math.round(layers*weight*1000)/1000:0;
}
export function calculateConsumption(row:EnfestoColor,unit:string):number{
 // Em KG, a baixa segue sempre folhas × peso compartilhado.
 // Unidades em metros continuam exigindo consumo informado em M.
 if(unit==='KG')return calculatedKg(row);
 return row.consumption.trim()?decimal(row.consumption):NaN;
}
export function validateEnfesto(rows:EnfestoColor[],stocks:StockEntry[],skipStock:boolean):string{
 if(!rows.length)return 'Esta ficha não possui cores ou quantidades válidas para enfestar.';
 if(!rows.some(row=>row.expected>0))return 'Informe quantidades positivas de peças antes de finalizar o enfesto.';
 for(const [index,row] of rows.entries()){
  const color=row.cor.trim(),label=color||'cor '+(index+1);
  if(!color||color.startsWith('COR NÃO INFORMADA'))return 'Preencha os nomes das cores na ficha de produção antes de concluir.';
  if(!Number.isSafeInteger(Number(row.layers))||Number(row.layers)<=0)return 'Informe o número de camadas da cor '+label+'.';
  const weight=decimal(row.weightPerLayer);
  if(!Number.isFinite(weight)||weight<=0)return 'Informe o peso por folha da cor '+label+'.';
  if(!/^\d+$/.test(row.cutPieces.trim())||Number(row.cutPieces)<0)return 'Informe a quantidade cortada da cor '+label+'.';
  if(!row.checked)return 'Confirme o corte da cor '+label+' antes de finalizar.';
  if(!skipStock){
   const stock=stocks.find(item=>item.id===row.stockId);
   if(!stock)return 'Selecione o tecido do estoque para a cor '+label+'.';
   if(normalizeColor(stock.color)!==normalizeColor(row.cor))return 'A cor do tecido no estoque não confere com a ficha: '+label+'.';
   if(stock.unit!=='KG'&&stock.unit!=='M')return 'O tecido da cor '+label+' deve ser controlado por KG ou M.';
   const amount=calculateConsumption(row,stock.unit);
   if(!Number.isFinite(qtyMilli(String(amount))))return 'Informe consumo válido em '+stock.unit+' para '+label+'.';
  }
 }
 if(!skipStock){
  const totals=new Map<string,number>();
  for(const row of rows){
   const stock=stocks.find(item=>item.id===row.stockId)!;
   totals.set(stock.id,(totals.get(stock.id)||0)+qtyMilli(String(calculateConsumption(row,stock.unit))));
  }
  for(const [id,amount] of totals){
   const stock=stocks.find(item=>item.id===id)!;
   if(amount>stock.quantityMilli)return 'Estoque insuficiente para '+stock.material+' / '+stock.color+'.';
  }
  if(totals.size>5)return 'É possível baixar até 5 tecidos/cores distintos por finalização integrada, respeitando as verificações do Firestore. Revise a ficha antes de concluir.';
 }
 return '';
}
export const totalExpected=(rows:EnfestoColor[])=>rows.reduce((sum,row)=>sum+row.expected,0);
export const totalCut=(rows:EnfestoColor[])=>rows.reduce((sum,row)=>sum+(Number(row.cutPieces)||0),0);
