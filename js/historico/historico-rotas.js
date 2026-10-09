(function iniciarHistoricoRotas(global) {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function formatarDistancia(m) {
    const n = Number(m);
    return Number.isFinite(n) ? `${(n / 1000).toFixed(1).replace('.', ',')} km` : '—';
  }

  function formatarTempo(s) {
    const min = Math.max(0, Math.round(Number(s || 0) / 60));
    if (!Number.isFinite(min)) return '—';
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
  }

  function datasDoFiltro() {
    const tipo = $('historyFilter')?.value || 'semana';
    const hoje = new Date();
    let inicio = null;
    let fim = null;
    if (tipo === 'semana') {
      const day = (hoje.getDay() + 6) % 7;
      const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - day);
      inicio = d.toISOString().slice(0, 10);
      fim = hoje.toISOString().slice(0, 10);
    } else if (tipo === 'data') {
      const d = $('historyDate')?.value;
      inicio = d || null;
      fim = d || null;
    } else if (tipo === 'periodo') {
      inicio = $('historyStart')?.value || null;
      fim = $('historyEnd')?.value || null;
    }
    return { inicio, fim };
  }

  function criarLinha(label, value) {
    const div = document.createElement('div');
    div.className = 'history-detail-row';
    const a = document.createElement('span'); a.textContent = label;
    const b = document.createElement('strong'); b.textContent = value;
    div.append(a, b);
    return div;
  }

  async function abrirDetalhes(id) {
    const rota = await global.PacoteEMatoRotaStore.obterRota(id);
    if (!rota) return;
    const modal = $('routeHistoryDetailModal');
    const body = $('routeHistoryDetailBody');
    if (!modal || !body) return;
    body.replaceChildren();
    const title = document.createElement('h3');
    title.textContent = rota.nome || 'Rota';
    body.append(
      title,
      criarLinha('Data', rota.data || '—'),
      criarLinha('Paradas', String(rota.paradas.length)),
      criarLinha('Distância', formatarDistancia(rota.distanciaTotalMetros)),
      criarLinha('Direção', formatarTempo(rota.duracaoDirecaoSegundos)),
      criarLinha('Tempo total', formatarTempo(rota.duracaoTotalSegundos)),
      criarLinha('Entregues', String(rota.paradas.filter(p => ['entregue','concluida'].includes(p.statusEntrega)).length)),
      criarLinha('Não entregues', String(rota.paradas.filter(p => p.statusEntrega === 'nao_entregue').length))
    );
    const stops = document.createElement('div');
    stops.className = 'history-stop-list';
    rota.paradas.forEach(p => {
      const item = document.createElement('div');
      item.className = 'history-stop-item';
      const strong = document.createElement('strong');
      strong.textContent = `${p.ordemOtimizada || p.ordemOriginal || ''}. ${p.enderecoOriginal || 'Endereço'}`;
      const span = document.createElement('span');
      span.textContent = p.statusEntrega === 'nao_entregue'
        ? `Não entregue${p.motivoNaoEntrega ? ' · ' + p.motivoNaoEntrega : ''}`
        : (['entregue','concluida'].includes(p.statusEntrega) ? 'Entregue' : 'Pendente');
      item.append(strong, span);
      stops.appendChild(item);
    });
    body.appendChild(stops);
    modal.style.display = 'flex';
  }

  async function renderizar() {
    const container = $('historyRoutesList');
    if (!container || !global.PacoteEMatoRotaStore) return;
    const { inicio, fim } = datasDoFiltro();
    const rotas = await global.PacoteEMatoRotaStore.listarRotas({ dataInicio: inicio, dataFim: fim });
    container.replaceChildren();
    if (!rotas.length) {
      const empty = document.createElement('div');
      empty.className = 'history-empty';
      empty.textContent = 'Nenhuma rota encontrada para este período.';
      container.appendChild(empty);
      return;
    }
    rotas.forEach(rota => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'history-route-card';
      card.addEventListener('click', () => abrirDetalhes(rota.id));
      const top = document.createElement('div');
      top.className = 'history-route-top';
      const name = document.createElement('strong');
      name.textContent = rota.nome || 'Rota';
      const date = document.createElement('span');
      date.textContent = rota.data ? new Date(rota.data + 'T12:00:00').toLocaleDateString('pt-BR') : '';
      top.append(name, date);
      const meta = document.createElement('div');
      meta.className = 'history-route-meta';
      const delivered = rota.paradas.filter(p => ['entregue','concluida'].includes(p.statusEntrega)).length;
      const failed = rota.paradas.filter(p => p.statusEntrega === 'nao_entregue').length;
      meta.textContent = `${rota.paradas.length} paradas · ${formatarDistancia(rota.distanciaTotalMetros)} · ${formatarTempo(rota.duracaoTotalSegundos)} · ${delivered} entregues · ${failed} não entregues`;
      card.append(top, meta);
      container.appendChild(card);
    });
  }

  function bind() {
    ['historyFilter','historyDate','historyStart','historyEnd'].forEach(id => $(id)?.addEventListener('change', renderizar));
    $('historyRefreshBtn')?.addEventListener('click', renderizar);
    $('historyLegacyBtn')?.addEventListener('click', () => {
      if (typeof global.abrirModalHistorico === 'function') global.abrirModalHistorico();
    });
    $('routeHistoryDetailClose')?.addEventListener('click', () => { if ($('routeHistoryDetailModal')) $('routeHistoryDetailModal').style.display = 'none'; });
    global.addEventListener('pemato:rota:salva', renderizar);
    renderizar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  global.PacoteEMatoHistorico = Object.freeze({ renderizar, abrirDetalhes });
})(window);
