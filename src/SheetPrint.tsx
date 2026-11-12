// Uma única ficha visual para impressão (Nova Ficha, Distribuição e Ordem de Corte).
// Campos legados permanecem opcionais para não quebrar fichas antigas do Firebase.
export type SheetColorRow = { cor: string; p: string; m: string; g: string; gg: string; xg: string; detalhes: string };
export type PrintableSheet = {
  model: string; reference: string; client?: string; pieceType?: string; fabric?: string; composition: string; trims: string;
  officeInstructions: string; oc: string; withdrawalDate?: string; volumes?: string;
  tailorInstructions: string; finishingInstructions: string;
  colors: SheetColorRow[]; assignedTailor: string;
};
const quantity = (value: string) => { const t=String(value??'').trim(); return /^\d+$/.test(t) && Number.isSafeInteger(Number(t)) ? Number(t) : 0; };
const sizes = ['p','m','g','gg','xg'] as const;
const columns = ['cor','p','m','g','gg','xg','detalhes'] as const;

export default function SheetPrint({sheet}:{sheet:PrintableSheet}) {
  const rows=(sheet.colors||[]).map(row=>({...row}));
  // Mantém a ficha A4 inteira mesmo se CORES, tamanhos e quantidades estiverem vazios.
  const emptyRow=():SheetColorRow=>({cor:'',p:'',m:'',g:'',gg:'',xg:'',detalhes:''});
  while(rows.length<8)rows.push(emptyRow());
  const filled=rows;
  const total=filled.reduce((sum,row)=>sum+sizes.reduce((n,key)=>n+quantity(row[key]),0),0);
  return <div className="sheet-print-only"><div className="sheet-paper sheet-paper-a4">
    <div className="sheet-top">
      <div><div className="sheet-field"><strong>CLIENTE:</strong><span>{sheet.client?.trim()||'MB'}</span></div><div className="sheet-field"><strong>Modelo:</strong><span>{sheet.model}</span></div><div className="sheet-field"><strong>REF:</strong><span>{sheet.reference}</span></div><div className="sheet-field"><strong>Tipo de roupa:</strong><span>{sheet.pieceType||''}</span></div></div>
      <div><div className="sheet-field"><strong>Composição</strong><span>{sheet.composition}</span></div><div className="sheet-field"><strong>Tecido:</strong><span>{sheet.fabric||''}</span></div></div>
    </div>
    <div className="sheet-middle">
      <div className="sheet-field sheet-trims"><strong>Aviamentos</strong><span>{sheet.trims}</span></div>
      <div className="sheet-right">
        <div className="sheet-field"><strong>Oficina - Costureiro</strong><span>{sheet.assignedTailor}</span></div>
        <div className="sheet-field"><strong>Inf. p/ oficina</strong><span>{sheet.officeInstructions}</span></div>
        <div className="sheet-field"><strong>O.C:</strong><span>{sheet.oc}</span></div>
        <div className="sheet-field"><strong>Informações dos costureiros:</strong><span>{sheet.tailorInstructions}</span></div>
      </div>
    </div>
    <table className="sheet-table sheet-color-table"><colgroup><col className="sheet-col-color"/>{sizes.map(s=><col key={s} className="sheet-col-size"/>)}<col className="sheet-col-details"/></colgroup>
      <thead><tr>{['CORES','P','M','G','GG','XG','DETALHES'].map(h=><th key={h}>{h}</th>)}</tr></thead>
      <tbody>{filled.map((row,i)=><tr key={i}>{columns.map(key=><td key={key}>{row[key]}</td>)}</tr>)}
        <tr className="sheet-total-row"><th>TOTAL</th>{sizes.map(key=><td key={key}>{filled.reduce((sum,row)=>sum+quantity(row[key]),0)}</td>)}<td>GERAL: {total}</td></tr>
      </tbody>
    </table>
    <div className="sheet-field sheet-finishing"><strong>Informações acabamento:</strong><span>{sheet.finishingInstructions}</span></div>
    <div className="sheet-field sheet-volumes"><strong>VOL</strong><span>{sheet.volumes||''}</span></div>
  </div></div>;
}
