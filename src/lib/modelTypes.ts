import { normalizeText } from './catalog';

export type ModelType = 'all' | 'bermudas' | 'camisas' | 'camisetas' | 'regatas' | 'conjuntos' | 'calcas' | 'jaquetas' | 'outros';
export const MODEL_TYPE_OPTIONS: ReadonlyArray<{value:ModelType;label:string}> = [
  {value:'all',label:'Todos os tipos'},
  {value:'bermudas',label:'Bermudas (BERM)'},
  {value:'camisas',label:'Camisas e Camisetas (CAM / CAMISETA)'},
  {value:'camisetas',label:'Somente Camisetas'},
  {value:'regatas',label:'Regatas (REGATA)'},
  {value:'conjuntos',label:'Conjuntos (CONJUNTO)'},
  {value:'calcas',label:'Calças (CALÇA)'},
  {value:'jaquetas',label:'Jaquetas (JAQUETA)'},
  {value:'outros',label:'Outros'},
];

export function modelType(name: string): Exclude<ModelType,'all'> {
  const n = normalizeText(name).replace(/^[^a-z0-9]+/, '');
  if (/^camisetas?(?:|$)/.test(n)) return 'camisetas';
  if (/^(?:berm(?:uda)?s?)(?:|$)/.test(n)) return 'bermudas';
  if (/^(?:cam|camisas?)(?:|$)/.test(n)) return 'camisas';
  if (/^regatas?(?:|$)/.test(n)) return 'regatas';
  if (/^(?:conj|conjuntos?)(?:|$)/.test(n)) return 'conjuntos';
  if (/^calcas?(?:|$)/.test(n)) return 'calcas';
  if (/^jaquetas?(?:|$)/.test(n)) return 'jaquetas';
  return 'outros';
}
export function matchesModelType(name: string, selected: ModelType): boolean {
  const current = modelType(name);
  if (selected === 'all') return true;
  if (selected === 'camisas') return current === 'camisas' || current === 'camisetas';
  return current === selected;
}
