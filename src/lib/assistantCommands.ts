/** Comandos controlados (sem API de IA). Nunca execute alterações apenas pelo reconhecimento. */
export type AssistantCommand =
  | { kind: 'pay-order'; oc: string }
  | { kind: 'find-order'; oc: string }
  | { kind: 'delete-sample'; oc: string }
  | { kind: 'price-change'; reference: string; amount: number }
  | { kind: 'price-lookup'; reference: string }
  | { kind: 'unknown' };

const clean = (value: string) => String(value || '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .replace(/[“”"']/g, '')
  .replace(/\s+/g, ' ').trim();

export function parseAssistantCommand(voiceOrText: string): AssistantCommand {
  const input = clean(voiceOrText);
  // Reconhecimento costuma transcrever "O C 707" ou "ordem de corte 707".
  const oc = /\b(?:oc|o\s+c|ordem\s+de\s+corte)\s*(?:n(?:umero)?\s*)?[#º°.:=-]?\s*(\d{1,9})\b/.exec(input)?.[1];
  const reference = /\b(?:ref|referencia)\s*(?:n(?:umero)?\s*)?[#º°.:=-]?\s*(\d{1,12})\b/.exec(input)?.[1];
  if (oc && /\b(?:apagar|excluir|deletar|remover)\b/.test(input) && /\b(?:amostra|amostras)\b/.test(input)) {
    if (/\b(?:nao|nunca|sem)\b/.test(input)) return {kind:'find-order',oc};
    return { kind: 'delete-sample', oc };
  }
  if (oc && /\b(?:pag[ao]|pague|pagar|quitar|quitad[ao]|liquidar|marcar como pag[ao])\b/.test(input)) {
    if (/\b(?:nao|nunca|sem)\b/.test(input)) return {kind:'find-order',oc};
    return { kind: 'pay-order', oc };
  }
  if (reference && /\b(?:mudar|alterar|atualizar|modificar|trocar|corrigir)\b/.test(input)) {
    // Evita confundir preço específico de costureiro com preço padrão da REF.
    if (/\b(?:mauro|dario|jony|rodrigo|francisca|ramiro|vitor|theodoro|virgilio|vigilio|costureiro|oficina)\b/.test(input)) return {kind:'unknown'};
    const amountRaw = /\b(?:para|por|valor|preco)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)\s*(?:reais?)?\b/.exec(input)?.[1];
    const amount = amountRaw ? Number(amountRaw.replace(',', '.')) : NaN;
    if (Number.isFinite(amount) && amount > 0 && amount <= 1000000) return { kind:'price-change', reference, amount };
  }
  if (reference) return { kind: 'price-lookup', reference };
  if (oc) return { kind: 'find-order', oc };
  return { kind: 'unknown' };
}

/** Usa a próxima sexta-feira, inclusive hoje, para pagamentos registrados na aba de sexta. */
export function fridayForDay(now: Date): string {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() + (5 - d.getDay() + 7) % 7);
  const day = String(d.getDate()).padStart(2,'0');
  const month = String(d.getMonth() + 1).padStart(2,'0');
  return `${day}/${month}/${d.getFullYear()}`;
}
