export type Model = { id:string; name:string; reference:string; pendingReview?:boolean; updatedAt?:string };
export const normalizeText=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();
export const normalizeReference=(value:string)=>{
 const raw=value.trim(); if(!raw) return '';
 const refs=raw.split(/[;,\n]+|\s+\/\s+/).map(x=>x.trim()).filter(Boolean).map(x=>{
   const digits=x.replace(/^\s*(?:ref(?:er[eê]ncia)?\.?\s*)?/i,'').replace(/[^\d]/g,'');
   return digits ? `REF.${digits}` : x.toUpperCase();
 });
 return [...new Set(refs)].join(' / ');
};
export const sameModel=(a:string,b:string)=>normalizeText(a).replace(/[.,;:()\-_/]/g,' ').replace(/\s+/g,' ').trim()===normalizeText(b).replace(/[.,;:()\-_/]/g,' ').replace(/\s+/g,' ').trim();
export const referenceNumber=(ref:string)=>{const m=ref.match(/REF\.?\s*(\d+)/i);return m?Number(m[1]):Number.MAX_SAFE_INTEGER};
export const sortModels=(models:Model[],mode:'reference'|'name')=>[...models].sort((a,b)=>{
 if(mode==='name')return a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'});
 const an=referenceNumber(a.reference),bn=referenceNumber(b.reference); if(an!==bn)return an-bn;
 return a.name.localeCompare(b.name,'pt-BR',{sensitivity:'base'});
});
