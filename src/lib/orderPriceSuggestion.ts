import { modelType } from './modelTypes';
import { STARTER_PRICES, normalizedGarmentType, parsePrice, type ReferencePrice } from './referencePrices';
import { workshopKey } from './workshopNames';

export type PriceWorkshop = { name:string; specialPrices?:ReferencePrice[] };
export type PriceSuggestion = { price:string; type:string; source:'costureiro'|'referencia'|'lista_inicial' };

const refKey=(value:string)=>String(value||'').trim().toUpperCase().replace(/^REF(?:ERENCIA)?\s*[.:\-#]?\s*/i,'');

export function garmentTypeFromModel(model:string):string {
  const text=String(model||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
  if (/(?:^|[^A-Z])M\s*\.?\s*L\.?(?:[^A-Z]|$)/.test(text) || /\bMANGA\s+LONGA\b/.test(text))return 'M.L.';
  const kind=modelType(model);
  if(kind==='camisas'||kind==='camisetas')return 'Camiseta';
  if(kind==='regatas')return 'Regata';
  if(kind==='bermudas')return 'Bermuda';
  if(kind==='calcas')return 'Calça';
  return '';
}

/**
 * Busca primeiro o preço especial da oficina, depois o global cadastrado
 * e por último a lista inicial (somente quando não há preço cadastrado).
 * Se a REF tiver mais de um tipo e o modelo não permitir identificá-lo,
 * não adivinha o valor: deixa o campo para preenchimento manual.
 */
export function suggestOrderPiecePrice(
  reference:string,
  model:string,
  office:string,
  prices:ReferencePrice[],
  workshops:PriceWorkshop[],
):PriceSuggestion|null {
  const key=refKey(reference);
  if(!key)return null;

  const specials=workshops
    .filter(w=>workshopKey(w.name)===workshopKey(office))
    .flatMap(w=>Array.isArray(w.specialPrices)?w.specialPrices:[]);
  const sameRef=(item:ReferencePrice)=>refKey(item.reference)===key
    && Number.isFinite(parsePrice(String(item.price||'')))
    && !!normalizedGarmentType(item.type);
  const sources=[
    {source:'costureiro' as const, list:specials},
    {source:'referencia' as const, list:prices},
    {source:'lista_inicial' as const, list:STARTER_PRICES},
  ];
  let kind=garmentTypeFromModel(model);
  if(!kind){
    const knownTypes=[...new Set(sources.flatMap(src=>src.list.filter(sameRef).map(p=>normalizedGarmentType(p.type))))];
    if(knownTypes.length!==1)return null;
    kind=knownTypes[0];
  }
  for(const source of sources){
    const found=source.list.find(p=>sameRef(p)&&normalizedGarmentType(p.type)===kind);
    if(!found)continue;
    const amount=parsePrice(String(found.price));
    if(Number.isFinite(amount))
      return {price:amount.toFixed(2).replace('.',','),type:kind,source:source.source};
  }
  return null;
}
