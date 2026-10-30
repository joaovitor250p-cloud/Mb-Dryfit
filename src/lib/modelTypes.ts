import { normalizeText } from './catalog';

export type ModelType = 'all' | 'bermudas' | 'camisas' | 'camisetas' | 'regatas' | 'conjuntos' | 'calcas' | 'jaquetas' | 'outros';

export const MODEL_TYPE_OPTIONS: ReadonlyArray<{ value: ModelType; label: string }> = [
  { value: 'all', label: 'Todos os tipos' },
  { value: 'bermudas', label: 'Bermudas (BERM)' },
  { value: 'camisas', label: 'Camisas e Camisetas (CAM / CAMISETA)' },
  { value: 'camisetas', label: 'Somente Camisetas' },
  { value: 'regatas', label: 'Regatas (REGATA)' },
  { value: 'conjuntos', label: 'Conjuntos (CONJUNTO)' },
  { value: 'calcas', label: 'Calças (CALÇA)' },
  { value: 'jaquetas', label: 'Jaquetas (JAQUETA)' },
  { value: 'outros', label: 'Outros' },
];

/**
 * Normaliza o nome antes de classificar. Alguns registros antigos incluem a OC
 * antes do nome da peça; removemos esse prefixo sem alterar o texto salvo.
 */
function normalizedModelName(name: string): string {
  return normalizeText(String(name ?? ''))
    .replace(/^(?:(?:oc|ordem(?:\s+de\s+corte)?)\s*(?:n(?:umero)?\s*)?[#ºo.]?\s*\d+\s*[-:–.]?\s*)+/i, '')
    .replace(/^(?:ref(?:erencia)?\.?\s*\d+\s*[-:–.]?\s*)+/i, '')
    .replace(/^[^a-z0-9]+/, '')
    .trim();
}

/** Reconhece os prefixos reais do catálogo, inclusive BERM e CAM. */
export function modelType(name: string): Exclude<ModelType, 'all'> {
  const tokens = normalizedModelName(name).split(/[^a-z0-9]+/).filter(Boolean);
  const ignoredLeadingLabels = new Set(['modelo', 'model', 'produto', 'peca']);
  const first = tokens.find(token => !ignoredLeadingLabels.has(token)) || '';

  // Separar CAMISETA antes de CAM evita classificar camisetas como camisas simples.
  if (first === 'camiseta' || first === 'camisetas' || first.startsWith('camiseta')) return 'camisetas';
  if (first === 'berm' || first === 'bermuda' || first === 'bermudas' || first.startsWith('bermuda') || first === 'short' || first === 'shorts') return 'bermudas';
  if (first === 'cam' || first === 'camisa' || first === 'camisas') return 'camisas';
  if (first === 'reg' || first === 'regata' || first === 'regatas' || first.startsWith('regata')) return 'regatas';
  if (first === 'conj' || first === 'conjunto' || first === 'conjuntos' || first.startsWith('conjunto')) return 'conjuntos';
  if (first === 'calca' || first === 'calcas' || first.startsWith('calca')) return 'calcas';
  if (first === 'jaqueta' || first === 'jaquetas' || first.startsWith('jaqueta')) return 'jaquetas';
  return 'outros';
}

export function matchesModelType(name: string, selected: ModelType): boolean {
  if (selected === 'all') return true;
  const current = modelType(name);
  if (selected === 'camisas') return current === 'camisas' || current === 'camisetas';
  return current === selected;
}

/**
 * Pesquisa tolerante a abreviações do catálogo:
 * "bermuda" encontra "BERM", "camisa" encontra "CAM" e ambos encontram
 * suas peças mesmo quando o restante do nome também foi digitado.
 */
export function matchesModelSearch(name: string, query: string): boolean {
  const q = normalizeText(String(query ?? '')).trim();
  if (!q) return true;
  const n = normalizedModelName(name);
  if (n.includes(q)) return true;

  const alias = /^(berm(?:uda)?s?|shorts?|cam(?:isa)?s?|camisetas?|reg(?:ata)?s?|conj(?:unto)?s?|calcas?|jaquetas?)(?:\s+(.+))?$/.exec(q);
  if (!alias) return false;

  const typed = alias[1];
  const remainder = normalizeText(alias[2] || '').trim();
  let typeMatches = false;
  if (typed.startsWith('berm') || typed.startsWith('short')) typeMatches = modelType(name) === 'bermudas';
  else if (typed.startsWith('camiseta')) typeMatches = modelType(name) === 'camisetas';
  else if (typed.startsWith('cam')) typeMatches = matchesModelType(name, 'camisas');
  else if (typed.startsWith('reg')) typeMatches = modelType(name) === 'regatas';
  else if (typed.startsWith('conj')) typeMatches = modelType(name) === 'conjuntos';
  else if (typed.startsWith('calca')) typeMatches = modelType(name) === 'calcas';
  else if (typed.startsWith('jaqueta')) typeMatches = modelType(name) === 'jaquetas';

  return typeMatches && (!remainder || n.includes(remainder));
}
