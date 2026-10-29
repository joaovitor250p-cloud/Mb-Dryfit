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

/** Identifica o tipo pelo prefixo real usado no catálogo (BERM, CAM, CAMISETA etc.). */
export function modelType(name: string): Exclude<ModelType,'all'> {
  const n = normalizeText(name).replace(/^[^a-z0-9]+/, '');
  const first = n.split(/[^a-z0-9]+/).filter(Boolean)[0] || '';

  // CAMISETA precisa ser verificada antes de CAM, para não ser classificada por engano.
  if (first === 'camiseta' || first === 'camisetas' || first.startsWith('camiseta')) return 'camisetas';
  if (first === 'berm' || first === 'bermuda' || first === 'bermudas' || first.startsWith('bermuda')) return 'bermudas';
  if (first === 'cam' || first === 'camisa' || first === 'camisas' || first.startsWith('camisa')) return 'camisas';
  if (first === 'regata' || first === 'regatas' || first.startsWith('regata')) return 'regatas';
  if (first === 'conj' || first === 'conjunto' || first === 'conjuntos' || first.startsWith('conjunto')) return 'conjuntos';
  if (first === 'calca' || first === 'calcas' || first.startsWith('calca')) return 'calcas';
  if (first === 'jaqueta' || first === 'jaquetas' || first.startsWith('jaqueta')) return 'jaquetas';
  return 'outros';
}

export function matchesModelType(name: string, selected: ModelType): boolean {
  const current = modelType(name);
  if (selected === 'all') return true;
  if (selected === 'camisas') return current === 'camisas' || current === 'camisetas';
  return current === selected;
}

/** Busca por nomes completos ou pelas abreviações do catálogo: "bermuda" encontra "BERM" e "camisa" encontra "CAM". */
export function matchesModelSearch(name: string, query: string): boolean {
  const q = normalizeText(query).trim();
  if (!q) return true;
  const n = normalizeText(name);
  if (n.includes(q)) return true;

  const alias = /^(berm(?:uda)?s?|camisas?|camisetas?)(?:\s+(.+))?$/.exec(q);
  if (!alias) return false;
  const typed = alias[1];
  const remainder = normalizeText(alias[2] || '');
  const isBermuda = typed.startsWith('berm');
  const typeMatches = isBermuda ? modelType(name) === 'bermudas' : typed.startsWith('camiseta') ? modelType(name) === 'camisetas' : matchesModelType(name, 'camisas');
  return typeMatches && (!remainder || n.includes(remainder));
}
