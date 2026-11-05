/**
 * Relação segura entre Amostras e Ordens de Corte.
 * Usa a OC como chave e nunca substitui dados já preenchidos na amostra.
 * Em caso de OCs duplicadas na planilha, só utiliza a associação explícita por orderId.
 */
export type SampleInfo = {
  oc: string;
  name?: string;
  reference?: string;
  tailor?: string;
  quantity?: string;
  orderId?: string;
};
export type OrderInfo = {
  id: string;
  oc: string;
  model?: string;
  ref?: string;
  office?: string;
  qty?: string;
};
export type MissingSampleInfo = Partial<Pick<SampleInfo,'name'|'reference'|'tailor'|'quantity'|'orderId'>>;

export const normalizeSampleOC = (value: unknown): string => String(value ?? '')
  .normalize('NFKC').trim().toLocaleUpperCase('pt-BR').replace(/\s+/g, ' ')
  .replace(/^O\.?\s*C\.?\s*[-:#]?\s*(?=\d)/, '');

const normalizedText = (value: unknown): string => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLocaleUpperCase('pt-BR').trim().replace(/\s+/g,' ');

export const missingReference = (s: unknown): boolean =>
  ['', 'SEM REF', 'SEM REFERENCIA', 'SEM CODIGO', 'NAO INFORMADO', '-'].includes(normalizedText(s));
export const missingTailor = (s: unknown): boolean =>
  ['', 'NAO INFORMADO', 'SEM COSTUREIRO', 'SEM OFICINA', '-'].includes(normalizedText(s));
export const missingModel = (s: unknown): boolean =>
  ['', 'NAO INFORMADO', 'SEM MODELO', 'SEM NOME', '-'].includes(normalizedText(s));
export const missingQuantity = (s: unknown): boolean =>
  ['', '0', 'A INFORMAR', 'NAO INFORMADO', '-'].includes(normalizedText(s));

// A quantidade das OCs vem de uma planilha legada. Apenas números inteiros
// confiáveis podem ser gravados no campo quantity (restrição do Firestore).
export function quantityFromOrder(value: unknown): string {
  let raw = String(value ?? '').trim().replace(/\s/g,'');
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(raw)) raw = raw.replace(/[.,]/g,'');
  else if (/^\d+[.,]0+$/.test(raw)) raw = raw.split(/[.,]/)[0];
  return /^\d{1,12}$/.test(raw) ? raw : '';
}

export const sampleHasMissingData = (s: SampleInfo): boolean =>
  missingModel(s.name) || missingReference(s.reference) || missingTailor(s.tailor) || missingQuantity(s.quantity);

export function missingDataFromOrder(sample: SampleInfo, order?: OrderInfo | null): MissingSampleInfo {
  if (!order || !normalizeSampleOC(sample.oc) || normalizeSampleOC(sample.oc) !== normalizeSampleOC(order.oc)) return {};
  const result: MissingSampleInfo = {};
  const model = String(order.model ?? '').trim();
  const ref = String(order.ref ?? '').trim();
  const office = String(order.office ?? '').trim();
  const qty = quantityFromOrder(order.qty);
  if (missingModel(sample.name) && !missingModel(model)) result.name = model;
  if (missingReference(sample.reference) && !missingReference(ref)) result.reference = ref;
  if (missingTailor(sample.tailor) && !missingTailor(office)) result.tailor = office;
  if (missingQuantity(sample.quantity) && qty) result.quantity = qty;
  if (Object.keys(result).length && !String(sample.orderId || '').trim()) result.orderId = order.id;
  return result;
}

export function buildOrderLookup(orders: OrderInfo[]) {
  const byOc = new Map<string, OrderInfo|null>();
  const byId = new Map<string, OrderInfo>();
  for (const order of orders) {
    const key = normalizeSampleOC(order.oc);
    if (!key) continue;
    byId.set(order.id, order);
    // Duas OCs iguais podem indicar documentos diferentes. Não adivinhar.
    if (byOc.has(key) && byOc.get(key)?.id !== order.id) byOc.set(key, null);
    else if (!byOc.has(key)) byOc.set(key, order);
  }
  return {byOc,byId};
}

export function orderForSample(sample: SampleInfo, lookup: ReturnType<typeof buildOrderLookup>): OrderInfo|null {
  const key = normalizeSampleOC(sample.oc);
  if (!key) return null;
  const linked = lookup.byId.get(String(sample.orderId || ''));
  if (linked && normalizeSampleOC(linked.oc) === key) return linked;
  return lookup.byOc.get(key) || null;
}
