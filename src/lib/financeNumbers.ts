/** Valores monetários do sistema podem vir de planilhas BR ou de campos com ponto decimal. */
export function parseFinanceNumber(raw: string): number {
  const cleaned = String(raw ?? '').trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
  if (!cleaned || !/^-?[\d.,]+$/.test(cleaned)) return NaN;
  const positive = cleaned.startsWith('-') ? cleaned.slice(1) : cleaned;
  const lastDot = positive.lastIndexOf('.');
  const lastComma = positive.lastIndexOf(',');
  let normalized = positive;
  if (lastDot >= 0 && lastComma >= 0) {
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    const parts = positive.split(decimal);
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return NaN;
    if (!/^\d{1,3}(?:[.,]\d{3})*$/.test(parts[0]) || parts[0].split(thousands).join('').includes(decimal)) return NaN;
    normalized = parts[0].split(thousands).join('') + '.' + parts[1];
  } else {
    const sep = lastDot >= 0 ? '.' : lastComma >= 0 ? ',' : '';
    if (sep) {
      const groups = positive.split(sep);
      if (groups.some(g => !/^\d+$/.test(g))) return NaN;
      if (groups.length === 2 && groups[1].length <= 2) normalized = groups[0]+'.'+groups[1];
      else if (groups.length > 1 && groups[0].length<=3 && groups.slice(1).every(g=>g.length===3)) normalized = groups.join('');
      else return NaN;
    }
  }
  const number = Number((cleaned.startsWith('-') ? '-' : '') + normalized);
  return Number.isFinite(number) ? number : NaN;
}
