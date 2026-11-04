/** Agrupamento mensal sem alterar nem apagar os registros históricos do Firestore. */
export const currentAccountingMonth = (date = new Date()): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,'0')}`;

export const isAccountingMonth = (month: string): boolean => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

const validDate = (year: number, month: number, day: number): boolean => {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() + 1 === month && date.getDate() === day;
};

export const expenseMonth = (rawDate: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(rawDate.trim());
  return match && validDate(+match[1],+match[2],+match[3]) ? `${match[1]}-${match[2]}` : 'undated';
};

export const paymentMonth = (rawDate: string): string => {
  const value = rawDate.trim();
  const brazilian = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (brazilian && validDate(+brazilian[3],+brazilian[2],+brazilian[1])) {
    return `${brazilian[3]}-${String(+brazilian[2]).padStart(2,'0')}`;
  }
  return expenseMonth(value);
};

export const accountingMonthLabel = (month: string): string => {
  if (month === 'undated') return 'Sem data informada';
  if (!isAccountingMonth(month)) return 'Mês desconhecido';
  return new Date(Number(month.slice(0,4)),Number(month.slice(5,7))-1,1)
    .toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
};
