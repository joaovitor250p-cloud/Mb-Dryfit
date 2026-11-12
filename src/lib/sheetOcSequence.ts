// As OCs 752, 753 e 754 devem continuar preservadas em qualquer limpeza.
export const protectedProductionOcs = ['752','753','754'] as const;
export const normalizeOcNumber=(value:unknown):number=>{
 const text=String(value??'').trim().replace(/^(?:O\.?\s*C\.?|ORDEM\s+DE\s+CORTE)\s*[:#-]?\s*/i,'');
 if(!/^\d{1,12}$/.test(text))return 0;
 const number=Number(text);
 return Number.isSafeInteger(number)&&number>0?number:0;
};
export function nextProductionOc(...collections:ReadonlyArray<ReadonlyArray<{oc:unknown}>>):string{
 const all=collections.flat().map(item=>normalizeOcNumber(item.oc));
 return String(Math.max(754,...all)+1);
}
export function isProtectedProductionOc(value:unknown):boolean{
 return protectedProductionOcs.includes(String(normalizeOcNumber(value)) as typeof protectedProductionOcs[number]);
}
