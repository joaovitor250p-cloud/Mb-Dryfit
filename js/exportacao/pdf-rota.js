(function iniciarExportacaoPdf(global) {
  'use strict';

  function formatarDistancia(m) {
    const n = Number(m);
    return Number.isFinite(n) ? `${(n / 1000).toFixed(1)} km` : '—';
  }
  function formatarTempo(s) {
    const min = Math.max(0, Math.round(Number(s || 0) / 60));
    return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}min` : `${min} min`;
  }
  function limparNome(nome) {
    return String(nome || 'rota').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-');
  }

  async function exportar(rota) {
    if (!global.jspdf?.jsPDF) throw new Error('Biblioteca de PDF não carregada.');
    const doc = new global.jspdf.jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 14;
    let y = 16;
    const line = 5;

    function garantir(altura) {
      if (y + altura > 285) { doc.addPage(); y = 16; }
    }
    function texto(text, x, yy, opt) {
      doc.text(String(text || ''), x, yy, opt || {});
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    texto('PACOTE É MATO', margin, y); y += 7;
    doc.setFontSize(13);
    texto(rota.nome || 'Rota', margin, y); y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    texto(`Data: ${rota.data || '—'}`, margin, y); y += line;
    texto(`Veículo: ${rota.veiculo || 'carro'}`, margin, y); y += line;
    texto(`Paradas: ${rota.paradas?.length || 0}`, margin, y); y += line;
    texto(`Distância: ${formatarDistancia(rota.distanciaTotalMetros)}`, margin, y); y += line;
    texto(`Duração estimada restante: ${formatarTempo(rota.duracaoTotalSegundos)}${rota.horarioTerminoEstimado ? ` | Término previsto: ${new Date(rota.horarioTerminoEstimado).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}` : ''}`, margin, y); y += 8;

    doc.setDrawColor(180);
    doc.line(margin, y, 196, y); y += 6;

    const byId = new Map((rota.paradas || []).map(p => [p.id, p]));
    const ordenadas = (rota.ordem || []).map(id => byId.get(id)).filter(Boolean);
    (rota.paradas || []).forEach(p => { if (!ordenadas.includes(p)) ordenadas.push(p); });

    ordenadas.forEach((p, idx) => {
      garantir(24);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      texto(`${p.ordemOtimizada || p.ordemOriginal || idx + 1}. ${p.enderecoOriginal || 'Endereço não informado'}`, margin, y); y += 5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      const extras = [
        p.bloco && `Bloco ${p.bloco}`,
        p.apartamento && `Apartamento ${p.apartamento}`,
        p.sala && `Sala ${p.sala}`,
        p.loja && `Loja ${p.loja}`,
        p.complemento
      ].filter(Boolean).join(' | ');
      if (extras) { texto(extras, margin + 4, y); y += 4.5; }
      if (p.observacao) {
        const linhas = doc.splitTextToSize(`Observação: ${p.observacao}`, 176);
        texto(linhas, margin + 4, y); y += linhas.length * 4;
      }
      texto(`Pacotes: ${(p.pacotes || []).length} | Status: ${p.statusEntrega || 'pendente'}`, margin + 4, y); y += 4.5;
      const codigos = (p.pacotes || []).join(', ');
      if (codigos) { const linhasCodigos = doc.splitTextToSize(`SPX TN: ${codigos}`, 176); texto(linhasCodigos, margin + 4, y); y += linhasCodigos.length * 4; }
      doc.setDrawColor(225);
      doc.line(margin, y, 196, y); y += 5;
    });

    doc.save(`${limparNome(rota.nome)}.pdf`);
  }

  global.PacoteEMatoPDF = Object.freeze({ exportar });
})(window);
