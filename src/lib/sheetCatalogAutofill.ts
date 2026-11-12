import {modelType} from './modelTypes';

export type RefCatalogModel={name:string;reference:string};

/** Case consistency without losing accents or the freeform garment vocabulary. */
export function upperField(value:string):string{
 return String(value??'').toLocaleUpperCase('pt-BR');
}
export function normalizeColorName(value:string):string{
 return upperField(value).replace(/\s+/g,' ').trim();
}
const garmentColorWords=new Set([
 'PRETO','PRETA','BRANCO','BRANCA','AZUL','MARINHO','ROYAL','CELESTE',
 'VERDE','MILITAR','LIMA','AMARELO','AMARELA','VERMELHO','VERMELHA','VINHO',
 'ROSA','PINK','LILAS','LILÁS','ROXO','ROXA','CINZA','CHUMBO','GRAFITE',
 'BEGE','AREIA','CAQUI','KAKI','NUDE','MARROM','CARAMELO','LARANJA','NEON',
 'FLUORESCENTE','OFFWHITE','OFF-WHITE','CREME','MOSTARDA','TURQUESA',
 'SALMAO','SALMÃO','BORDO','BORDÔ','MESCLA','CHOCOLATE'
]);
const garmentSizes=new Set(['PP','P','M','G','GG','XG','XGG','XXG','EG','EGG','G1','G2','G3','G4','G5','UNICO','ÚNICO']);
export function garmentNameWithoutColorOrSize(name:string):string{
 const input=upperField(name).replace(/\s+/g,' ').trim()
  .replace(/^(?:REF(?:ERÊNCIA|ERENCIA)?\.?\s*\d+\s*[-–:]?\s*)/,'');
 const tokens=input.split(' ').filter(Boolean);
 // Color/size are only removed as complete tokens, not inside garment descriptors.
 const clean=tokens.filter(token=>{
  const t=token.replace(/^[\s,;:()\[\]-]+|[\s,;:()\[\]-]+$/g,'');
  return !garmentColorWords.has(t) && !garmentSizes.has(t)
   && !/^(?:TAM|TAMANHO|COR)(?:[:=]|$)/.test(t);
 }).filter((token,i,arr)=>!(i===arr.length-1&&/^(?:3[4-9]|4[0-9]|5[0-9])$/.test(token)));
 return clean.join(' ').replace(/\s+/g,' ').trim()||input;
}
export function garmentTypeFromCatalog(name:string):string{
 const n=upperField(name);
 if(/\b(?:M\.L\.?|ML|MANGA LONGA)\b/.test(n))return 'M.L.';
 const type=modelType(name);
 const mapped:Record<string,string>={
  bermudas:'BERMUDA',camisas:'CAMISA',camisetas:'CAMISETA',regatas:'REGATA',
  calcas:'CALÇA',conjuntos:'CONJUNTO',jaquetas:'JAQUETA'
 };
 return mapped[type]||'';
}
export function lookupReference(models:RefCatalogModel[],reference:string):{names:string[];suggestedName:string;suggestedType:string}{
 const ref=upperField(reference).trim();
 if(!ref)return {names:[],suggestedName:'',suggestedType:''};
 const choices=models.filter(m=>upperField(m.reference).trim()===ref&&!!m.name.trim());
 const unique=[...new Set(choices.map(x=>garmentNameWithoutColorOrSize(x.name)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const chosen=unique[0]||'';
 return {names:unique,suggestedName:unique.length===1?chosen:'',suggestedType:unique.length===1?garmentTypeFromCatalog(chosen):''};
}
