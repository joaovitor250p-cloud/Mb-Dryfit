import { normalizeText } from './catalog';

export type ModelType = 'all' | 'bermudas' | 'camisas' | 'camisetas' | 'regatas' | 'conjuntos' | 'calcas' | 'jaquetas' | 'outros';
export const MODEL_TYPE_OPTIONS: ReadonlyArray<{value:ModelType;label:string}> = [
  {value:'all',label:'Todos os tipos'},
  {value:'bermudas',label:'Bermudas (BERM)'},
  {value:'camisas',label:'Camisas (CAM)'},
  {value:'camisetas',label:'Camisetas (CAMISETA)'},
  {value:'regatas',label:'Regatas (REGATA)'},
  {value:'conjuntos',label:'Conjuntos (CONJUNTO)'},
  {value:'calcas',label:'Calças (CALÇA)'},
  {value:'jaquetas',label:'Jaquetas (JAQUETA)'},
  {value:'outros',label:'Outros'},
];

/** Classificação apenas pelo começo do nome. Não altera o nome ou a REF salvos. */
export function modelType(name: string): Exclude<ModelType,'all'> {
  const n = normalizeText(name).replace(/^[^a-z0-9]+/, '');
  // Mais específicos antes de CAM: CAMISETA não pode ser classificada como CAMISA.
  if (/^camisetas?(?:\b|$)/.test(n)) return 'camisetas';
  if (/^(?:berm(?:uda)?s?)(?:\b|$)/.test(n)) return 'bermudas';
  if (/^(?:cam|camisas?)(?:\b|$)/.test(n)) return 'camisas';
  if (/^regatas?(?:\b|$)/.test(n)) return 'regatas';
  if (/^(?:conj|conjuntos?)(?:\b|$)/.test(n)) return 'conjuntos';
  if (/^calcas?(?:\b|$)/.test(n)) return 'calcas';
  if (/^jaquetas?(?:\b|$)/.test(n)) return 'jaquetas';
  return 'outros';
}
export function matchesModelType(name: string, selected: ModelType): boolean {
  return selected === 'all' || modelType(name) === selected;
}
