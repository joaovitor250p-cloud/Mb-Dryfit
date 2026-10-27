import type { Model } from './catalog';
const KEY='catalogo-referencias-v1';
export function readLocal():Model[]|null {try{const v=localStorage.getItem(KEY);return v?JSON.parse(v) as Model[]:null}catch{return null}}
export function writeLocal(models:Model[]){try{localStorage.setItem(KEY,JSON.stringify(models));return true}catch{return false}}
export async function loadInitial():Promise<Model[]>{const res=await fetch(`${import.meta.env.BASE_URL}data/catalogo-inicial.json`);if(!res.ok)throw new Error('Não foi possível carregar o catálogo inicial.');return await res.json() as Model[]}
