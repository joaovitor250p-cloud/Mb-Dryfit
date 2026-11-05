/**
 * Identificação única de costureiros/oficinas.
 * Não altera registros antigos no Firebase: normaliza apenas comparação, exibição
 * e novos cadastros. A única grafia alternativa intencional é VIGILIO, informada
 * como sendo a mesma pessoa que VIRGÍLIO.
 */
const clean = (value: unknown): string => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim();
const unaccented = (text: string): string => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR');

const ALIASES: Record<string, string> = {
  VIGILIO: 'VIRGILIO',
};

const DISPLAY_NAMES: Record<string, string> = {
  VIRGILIO: 'VIRGÍLIO',
  MAURO: 'MAURO',
  'DARIO MEDINA': 'DARIO MEDINA',
  JONY: 'JONY',
  RODRIGO: 'RODRIGO',
  'DONA FRANCISCA': 'DONA FRANCISCA',
  RAMIRO: 'RAMIRO',
  VITOR: 'VITOR',
  THEODORO: 'THEODORO',
};

/** Usar como chave para filtros, grupos, PIX e associação de fichas. */
export const workshopKey = (value: unknown): string => {
  const key = unaccented(clean(value));
  return ALIASES[key] ?? key;
};

/** Nome para mostrar e salvar; mantém acento oficial de VIRGÍLIO. */
export const canonicalWorkshopName = (value: unknown): string => {
  const original = clean(value);
  if (!original) return '';
  return DISPLAY_NAMES[workshopKey(original)] ?? original.toLocaleUpperCase('pt-BR');
};
