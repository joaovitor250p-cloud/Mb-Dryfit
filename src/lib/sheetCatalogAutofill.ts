import {modelType} from './modelTypes';

export type RefCatalogModel={name:string;reference:string};

/** Padroniza as letras sem retirar acentos dos nomes usados em produção. */
export function upperField(value:string):string{
 return String(value??'').toLocaleUpperCase('pt-BR');
}

/** A REF da ficha usa apenas o código numérico, mesmo se alguém colar "REF.10162". */
export function normalizeReferenceNumber(value:string):string{
 return String(value??'').replace(/[^0-9]/g,'').slice(0,12);
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

/** Palavras que descrevem marca/desenho, e não o corte da peça.
 * Deliberadamente NÃO retira T.UNI, R.L, T.F.L, M.LON, tipo ou tecido.
 */
const brandAndSymbolWords=new Set([
 'NIKE','ADIDAS','PUMA','FILA','LACOSTE','UMBRO','ASICS','OAKLEY','MIZUNO',
 'REEBOK','REBOOK','JORDAN','VANS','NEWBALANCE','UNDERARMOUR',
 'SIMB','SÍMB','SIMBOLO','SÍMBOLO','SIMBOL','SIM','LOGO','LOGOMARCA','LOGOTIPO',
 'MARCA','EMBLEMA','FAC','FACAO','FACÃO','VAZ','VAZADO','VAZADA',
 'BAS','BASE','CEN','CENT','CENTRAL'
]);

export function garmentNameWithoutColorOrSize(name:string):string{
 const input=upperField(name).replace(/\s+/g,' ').trim()
  .replace(/^(?:REF(?:ERÊNCIA|ERENCIA)?\.?\s*\d+\s*[-–:]?\s*)/,'');
 const tokens=input.split(' ').filter(Boolean);
 const clean=tokens.filter(token=>{
  const word=token.replace(/^[\s,;:()\[\]-]+|[\s,;:()\[\]-]+$/g,'');
  const normalized=word.normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  return !garmentColorWords.has(word)
   && !garmentSizes.has(word)
   && !brandAndSymbolWords.has(word)
   && !brandAndSymbolWords.has(normalized)
   && !/^(?:TAM|TAMANHO|COR)(?:[:=]|$)/.test(word);
 }).filter((token,i,arr)=>!(i===arr.length-1&&/^(?:3[4-9]|4[0-9]|5[0-9])$/.test(token)));
 return clean.join(' ').replace(/\s+/g,' ').trim()||input;
}

export function garmentTypeFromCatalog(name:string):string{
 const n=upperField(name);
 if(/\bM\.?\s*LON(?:GA)?\b|\bM\.?L(?:\.)?(?=\s|$)|\bML\b|\bMANGA LONGA\b/.test(n))return 'M.L.';
 const type=modelType(name);
 const mapped:Record<string,string>={
  bermudas:'BERMUDA',camisas:'CAMISA',camisetas:'CAMISETA',regatas:'REGATA',
  calcas:'CALÇA',conjuntos:'CONJUNTO',jaquetas:'JAQUETA'
 };
 return mapped[type]||'';
}

export function lookupReference(models:RefCatalogModel[],reference:string):{names:string[];suggestedName:string;suggestedType:string}{
 const ref=normalizeReferenceNumber(reference);
 if(!ref)return {names:[],suggestedName:'',suggestedType:''};
 const choices=models.filter(m=>normalizeReferenceNumber(m.reference)===ref&&!!m.name.trim());
 const names=[...new Set(choices.map(x=>garmentNameWithoutColorOrSize(x.name)))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 if(names.length===0)return {names:[],suggestedName:'',suggestedType:''};
 if(names.length===1)return {names,suggestedName:names[0],suggestedType:garmentTypeFromCatalog(names[0])};
 // Uma REF pode ter variações por marca e aplicação de logo.
 // Preencher somente o trecho TÉCNICO comum, sem escolher uma variante arbitrária.
 const types=[...new Set(names.map(garmentTypeFromCatalog))];
 const first=names[0].split(/\s+/);
 let common=first.length;
 for(const name of names.slice(1)){
  const words=name.split(/\s+/);
  let length=0;
  while(length<common&&length<words.length&&first[length]===words[length])length++;
  common=length;
 }
 const suggestedName=types.length===1&&types[0]&&common>=2?first.slice(0,common).join(' '):'';
 return {names,suggestedName,suggestedType:suggestedName?types[0]:''};
}
