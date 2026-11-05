// Modelo único de impressão: usado na criação/distribuição e na Ordem de Corte.
// Deve continuar idêntico ao documento original entregue ao costureiro.
export type SheetColorRow = { cor: string; p: string; m: string; g: string; gg: string; xg: string; detalhes: string };
export type PrintableSheet = {
  model: string; reference: string; pieceType?: string; fabric?: string; composition: string; trims: string;
  officeInstructions: string; oc: string; withdrawalDate: string;
  tailorInstructions: string; finishingInstructions: string;
  colors: SheetColorRow[]; assignedTailor: string;
};
const displayDate = (raw: string) => /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw.slice(8,10)}/${raw.slice(5,7)}/${raw.slice(0,4)}` : raw;
const quantity = (value: string) => { const t=String(value??'').trim(); return /^\d+$/.test(t) && Number.isSafeInteger(Number(t)) ? Number(t) : 0; };
const sizes = ['p','m','g','gg','xg'] as const;
const columns = ['cor','p','m','g','gg','xg','detalhes'] as const;

export default function SheetPrint({sheet}:{sheet:PrintableSheet}) {
  const filled = (sheet.colors||[]).filter(row=>columns.some(key=>String(row[key]??'').trim()));
  const total = filled.reduce((sum,row)=>sum+sizes.reduce((n,key)=>n+quantity(row[key]),0),0);
  return <div className="sheet-print-only"><div className="sheet-paper">
    <div className="sheet-top">
      <div><div className="sheet-field"><strong>Modelo:</strong><span>{sheet.model}</span></div><div className="sheet-field"><strong>REF:</strong><span>{sheet.reference}</span></div><div className="sheet-field"><strong>Tipo de roupa:</strong><span>{sheet.pieceType||''}</span></div></div>
      <div><div className="sheet-field"><strong>Composição</strong><span>{sheet.composition}</span></div><div className="sheet-field"><strong>Tecido:</strong><span>{sheet.fabric||''}</span></div></div>
    </div>
    <div className="sheet-middle">
      <div className="sheet-field"><strong>Aviamentos</strong><span>{sheet.trims}</span></div>
      <div className="sheet-right">
        <div className="sheet-field"><strong>Oficina - Costureiro</strong><span>{sheet.assignedTailor}</span></div>
        <div className="sheet-field"><strong>Inf. p/ oficina</strong><span>{sheet.officeInstructions}</span></div>
        <div className="sheet-field"><strong>O.C:</strong><span>{sheet.oc}</span></div>
        <div className="sheet-field"><strong>Data retirada:</strong><span>{displayDate(sheet.withdrawalDate)}</span></div>
        <div className="sheet-field"><strong>Informações dos costureiros:</strong><span>{sheet.tailorInstructions}</span></div>
      </div>
    </div>
    <table className="sheet-table"><thead><tr>{['CORES','P','M','G','GG','XG','DETALHES'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{filled.map((row,i)=><tr key={i}>{columns.map(key=><td key={key}>{row[key]}</td>)}</tr>)}
        <tr className="sheet-total-row"><th>TOTAL</th>{sizes.map(key=><td key={key}>{filled.reduce((sum,row)=>sum+quantity(row[key]),0)}</td>)}<td>GERAL: {total}</td></tr>
      </tbody>
    </table>
    <div className="sheet-field sheet-finishing"><strong>Informações acabamento:</strong><span>{sheet.finishingInstructions}</span></div>
  </div></div>;
}
