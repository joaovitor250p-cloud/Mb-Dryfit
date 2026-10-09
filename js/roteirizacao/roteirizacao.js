(function iniciarRoteirizacao(global) {
  'use strict';

  let rotaAtual = null;
  let salvamentoTimer = null;
  let stopEmEdicao = null;
  let modoEdicaoNovo = false;
  let resolverDecisaoReotimizacao = null;
  let importacaoPendente = null;
  let resolverMapeamentoImportacao = null;
  let estadoPainel = 'collapsed';
  let sheetDragStartY = null;
  let sheetDragLastY = null;

  function $(id) { return document.getElementById(id); }
  function clone(v) { return global.PacoteEMatoRotaStore?.clone?.(v) || JSON.parse(JSON.stringify(v)); }
  function agora() { return Date.now(); }

  function coordenadaValida(lat, lon) {
    if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
    if (String(lat).trim() === '' || String(lon).trim() === '') return false;
    const a = Number(lat);
    const o = Number(lon);
    return Number.isFinite(a) && a >= -90 && a <= 90 && Number.isFinite(o) && o >= -180 && o <= 180;
  }

  function pontoValido(p) { return !!p && coordenadaValida(p.lat, p.lon); }
  function paradaLocalizada(p) { return !!p && p.statusGeocodificacao === 'ok' && coordenadaValida(p.latitude, p.longitude); }

  function notificar(msg) {
    if (typeof global.notificar === 'function') global.notificar(msg);
    else console.log(msg);
  }

  function idNovo(prefix) {
    if (global.crypto?.randomUUID) return `${prefix}-${global.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function enderecoDaParada(p) {
    const principal = [String(p.logradouro || '').trim(), String(p.numero || '').trim()].filter(Boolean).join(', ');
    const base = principal || String(p.enderecoOriginal || '').trim();
    const local = [p.bairro, p.cidade, p.estado, p.cep].map(v => String(v || '').trim()).filter(Boolean).join(', ');
    return [base, local].filter(Boolean).join(' - ').trim();
  }

  function detalheComplemento(p) {
    const itens = [];
    if (p.complemento) itens.push(p.complemento);
    if (p.bloco) itens.push(`Bloco ${p.bloco}`);
    if (p.apartamento) itens.push(`Apartamento ${p.apartamento}`);
    if (p.sala) itens.push(`Sala ${p.sala}`);
    if (p.loja) itens.push(`Loja ${p.loja}`);
    return itens.join(' · ');
  }

  function statusGeoTexto(p) {
    const map = {
      ok: 'Localizada',
      consultando: 'Localizando',
      ambiguo: 'Precisa de correção',
      nao_encontrado: 'Endereço não localizado',
      nao_configurado: 'Serviço não configurado',
      erro: 'Falha ao localizar',
      pendente: 'Aguardando localização'
    };
    return map[p?.statusGeocodificacao] || 'Aguardando localização';
  }

  function statusEntregaTexto(p) {
    if (p.statusEntrega === 'nao_entregue') return 'Não entregue';
    if (['entregue', 'concluida'].includes(p.statusEntrega)) return 'Entregue';
    if (Number(p.quantidadeBipada || 0) > 0) return 'Parcial';
    return 'Pendente';
  }

  function formatarDistancia(m) {
    const n = Number(m);
    if (!Number.isFinite(n)) return '—';
    return n >= 1000 ? `${(n / 1000).toFixed(1).replace('.', ',')} km` : `${Math.round(n)} m`;
  }

  function formatarTempo(seg) {
    const n = Number(seg);
    if (!Number.isFinite(n)) return '—';
    const min = Math.max(0, Math.round(n / 60));
    const h = Math.floor(min / 60);
    const m = min % 60;
    if (!h) return `${m} min`;
    return `${h}h${String(m).padStart(2, '0')}`;
  }

  function horaLocal(timestamp) {
    if (!timestamp) return '—';
    try { return new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
    catch (_) { return '—'; }
  }

  function aplicarRotaNoState() {
    if (!rotaAtual || !global.appState?.roteirizacao) return;
    const s = global.appState.roteirizacao;
    s.rotaAtivaId = rotaAtual.id;
    s.origem = rotaAtual.origem;
    s.nome = rotaAtual.nome;
    s.pontoInicial = rotaAtual.pontoInicial;
    s.pontoFinal = rotaAtual.pontoFinal;
    s.retornarAoInicio = rotaAtual.retornarAoInicio;
    s.veiculo = rotaAtual.veiculo;
    s.modoRoteamento = rotaAtual.modoRoteamento;
    s.tempoParadaSegundos = rotaAtual.tempoParadaSegundos;
    s.paradas = rotaAtual.paradas;
    s.ordem = rotaAtual.ordem;
    s.geometria = rotaAtual.geometria;
    s.instrucoes = rotaAtual.instrucoes;
    s.pernas = rotaAtual.pernas;
    s.distanciaTotalMetros = rotaAtual.distanciaTotalMetros;
    s.duracaoDirecaoSegundos = rotaAtual.duracaoDirecaoSegundos;
    s.duracaoParadasSegundos = rotaAtual.duracaoParadasSegundos;
    s.duracaoTotalSegundos = rotaAtual.duracaoTotalSegundos;
    s.horarioTerminoEstimado = rotaAtual.horarioTerminoEstimado;
    s.rotaOtimizada = rotaAtual.rotaOtimizada === true;
    if (!s.paradaSelecionadaId || !rotaAtual.paradas.some(p => p.id === s.paradaSelecionadaId)) {
      s.paradaSelecionadaId = rotaAtual.ordem[0] || rotaAtual.paradas[0]?.id || null;
    }
  }

  function agendarSalvar() {
    clearTimeout(salvamentoTimer);
    salvamentoTimer = setTimeout(async () => {
      if (!rotaAtual) return;
      rotaAtual.alteradoEm = agora();
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      aplicarRotaNoState();
      renderizarTudo();
    }, 220);
  }

  function invalidarRotaCalculada() {
    if (!rotaAtual) return;
    rotaAtual.rotaOtimizada = false;
    rotaAtual.geometria = null;
    rotaAtual.instrucoes = [];
    rotaAtual.pernas = [];
    rotaAtual.distanciaTotalMetros = null;
    rotaAtual.duracaoDirecaoSegundos = null;
    rotaAtual.duracaoParadasSegundos = null;
    rotaAtual.duracaoTotalSegundos = null;
    rotaAtual.horarioTerminoEstimado = null;
    rotaAtual.otimizadoEm = null;
  }

  async function recalcularOrdemAtual() {
    if (!rotaAtual) return false;
    if (!pontoValido(rotaAtual.pontoInicial)) {
      notificar('Defina um ponto de partida válido para recalcular a rota atual.');
      return false;
    }
    const semCoordenada = rotaAtual.paradas.filter(p => !['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega) && (
      !paradaLocalizada(p)
    ));
    if (semCoordenada.length) {
      notificar(`Existem ${semCoordenada.length} parada(s) sem localização válida.`);
      return false;
    }
    try {
      const byId = new Map(rotaAtual.paradas.map(p => [p.id, p]));
      (rotaAtual.ordem || []).forEach((id, index) => {
        const parada = byId.get(id);
        if (parada) parada.ordemOtimizada = index + 1;
      });
      const route = await global.PacoteEMatoServicoRota.calcularRotaPelasRuas(rotaAtual);
      const feature = route.feature;
      rotaAtual.geometria = feature.geometry;
      rotaAtual.distanciaTotalMetros = Number(feature.properties?.distance || 0);
      rotaAtual.duracaoDirecaoSegundos = Number(feature.properties?.time || 0);
      rotaAtual.pernas = Array.isArray(feature.properties?.legs) ? feature.properties.legs : [];
      rotaAtual.instrucoes = global.PacoteEMatoServicoRota.extrairInstrucoes(feature);
      const pendentes = rotaAtual.paradas.filter(p => !['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega)).length;
      rotaAtual.duracaoParadasSegundos = pendentes * Number(rotaAtual.tempoParadaSegundos || 0);
      rotaAtual.duracaoTotalSegundos = rotaAtual.duracaoDirecaoSegundos + rotaAtual.duracaoParadasSegundos;
      rotaAtual.horarioTerminoEstimado = Date.now() + rotaAtual.duracaoTotalSegundos * 1000;
      rotaAtual.status = 'ativa';
      rotaAtual.rotaOtimizada = false;
      rotaAtual.otimizadoEm = null;
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      renderizarTudo({ fit: true });
      return true;
    } catch (erro) {
      console.error(erro);
      notificar(erro?.message || 'Não foi possível recalcular a rota na ordem atual.');
      return false;
    }
  }

  function perguntarReotimizacao(titulo, texto) {
    const modal = $('routeReoptDecisionModal');
    if (!modal) return Promise.resolve('manter');
    if ($('routeReoptDecisionTitle')) $('routeReoptDecisionTitle').textContent = titulo || 'Rota alterada';
    if ($('routeReoptDecisionText')) $('routeReoptDecisionText').textContent = texto || 'Escolha como atualizar a rota.';
    modal.style.display = 'flex';
    return new Promise(resolve => { resolverDecisaoReotimizacao = resolve; });
  }

  function concluirDecisaoReotimizacao(decisao) {
    const modal = $('routeReoptDecisionModal');
    if (modal) modal.style.display = 'none';
    const resolver = resolverDecisaoReotimizacao;
    resolverDecisaoReotimizacao = null;
    if (resolver) resolver(decisao);
  }

  function obterParadasOrdenadas() {
    if (!rotaAtual) return [];
    const mapa = new Map(rotaAtual.paradas.map(p => [p.id, p]));
    const lista = [];
    (rotaAtual.ordem || []).forEach(id => { const p = mapa.get(id); if (p) lista.push(p); });
    rotaAtual.paradas.forEach(p => { if (!lista.includes(p)) lista.push(p); });
    return lista;
  }

  function workerConfigurado() {
    return !!String(global.PEMATO_MAP_CONFIG?.workerBaseUrl || global.PacoteEMatoMapaConfig?.obterWorkerBaseUrl?.() || '').trim();
  }


  function ambienteMobile() {
    try { return global.matchMedia?.('(max-width: 820px)')?.matches === true; }
    catch (_) { return global.innerWidth <= 820; }
  }

  function definirEstadoPainel(estado) {
    const root = $('routingWorkspace');
    if (!root) return;
    estadoPainel = estado === 'expanded' ? 'expanded' : 'collapsed';
    root.classList.toggle('sheet-expanded', estadoPainel === 'expanded');
    root.classList.toggle('sheet-collapsed', estadoPainel !== 'expanded');
    $('routingSheetToggle')?.setAttribute('aria-expanded', estadoPainel === 'expanded' ? 'true' : 'false');
    if (estadoPainel === 'expanded') setTimeout(() => $('routingStopSearch')?.focus?.({ preventScroll: true }), 180);
    else setTimeout(() => global.PacoteEMatoMapa?.renderizar?.(), 220);
  }

  function alternarPainel() {
    definirEstadoPainel(estadoPainel === 'expanded' ? 'collapsed' : 'expanded');
  }

  function abrirMenuAcoes() {
    const backdrop = $('routingActionsBackdrop');
    if (!backdrop) return;
    atualizarDisponibilidadeAcoes();
    backdrop.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function fecharMenuAcoes() {
    const backdrop = $('routingActionsBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    if (document.body.dataset.pematoModule !== 'roteirizacao') document.body.style.overflow = '';
  }

  function atualizarDisponibilidadeAcoes() {
    const serviceReady = workerConfigurado();
    const temParadas = (rotaAtual?.paradas?.length || 0) > 0;
    // Localizar permanece acessível para permitir uma nova tentativa sem reimportar a planilha.
    if ($('routingGeocodeBtn')) $('routingGeocodeBtn').style.display = temParadas ? '' : 'none';
    // Otimização real só aparece quando o serviço de rota está configurado.
    if ($('routingOptimizeBtn')) $('routingOptimizeBtn').style.display = serviceReady && temParadas ? '' : 'none';
    const note = $('routingServiceDeferredNote');
    if (note) note.style.display = serviceReady ? 'none' : 'block';
    const routeReady = !!rotaAtual?.geometria;
    document.querySelectorAll('.routing-route-ready-action').forEach(el => { el.style.display = routeReady ? '' : 'none'; });
    if ($('routingInvertBtn')) $('routingInvertBtn').style.display = rotaAtual?.rotaOtimizada ? '' : 'none';
    if ($('routingExportPdfBtn')) $('routingExportPdfBtn').style.display = temParadas ? '' : 'none';
  }

  function atualizarAcaoPrincipal() {
    const btn = $('routingPrimaryActionBtn');
    const empty = $('routingEmptyState');
    const total = rotaAtual?.paradas?.length || 0;
    if (empty) empty.style.display = total ? 'none' : 'flex';
    if (!btn) return;
    if (!total) {
      btn.textContent = 'Importar planilha XLSX';
      btn.dataset.action = 'importar';
      btn.disabled = false;
      btn.removeAttribute('title');
      btn.style.display = '';
      return;
    }
    if (rotaAtual?.geometria) {
      btn.textContent = 'Iniciar rota';
      btn.dataset.action = 'iniciar';
      btn.disabled = false;
      btn.removeAttribute('title');
      btn.style.display = '';
      return;
    }
    const faltantes = rotaAtual.paradas.filter(p => !paradaLocalizada(p)).length;
    if (faltantes) {
      btn.textContent = workerConfigurado() ? 'Localizar endereços' : 'Tentar localizar';
      btn.dataset.action = 'localizar';
      btn.disabled = false;
      btn.removeAttribute('title');
      btn.style.display = '';
      return;
    }
    if (workerConfigurado()) {
      btn.textContent = 'Otimizar rota';
      btn.dataset.action = 'otimizar';
      btn.disabled = false;
      btn.removeAttribute('title');
      btn.style.display = '';
      return;
    }
    btn.textContent = 'Otimizar rota';
    btn.dataset.action = '';
    btn.disabled = true;
    btn.title = 'O serviço de otimização por ruas ainda não está configurado.';
    btn.style.display = '';
  }

  function solicitarImportacaoPlanilha() {
    fecharMenuAcoes();
    const input = $('routingXlsxInput');
    if (!input) {
      definirStatusImportacao('Seletor de planilha não encontrado. Recarregue a página.', 'error');
      return false;
    }
    if ((rotaAtual?.paradas?.length || 0) > 0) {
      const substituir = global.confirm('Já existe uma rota em planejamento. Deseja selecionar uma nova planilha para substituí-la? A rota atual será mantida até a nova planilha ser lida com sucesso.');
      if (!substituir) return false;
    }
    input.click();
    return true;
  }

  function executarAcaoPrincipal() {
    const btn = $('routingPrimaryActionBtn');
    if (btn?.disabled) return;
    const acao = btn?.dataset.action || '';
    if (acao === 'importar') return solicitarImportacaoPlanilha();
    if (acao === 'iniciar') return abrirNavegacao();
    if (acao === 'localizar') return geocodificarTodas();
    if (acao === 'otimizar') return otimizarRota();
    definirEstadoPainel('expanded');
  }

  function iniciarArrastePainel() {
    const handle = $('routingSheetHandle');
    if (!handle || handle.dataset.dragBound === '1') return;
    handle.dataset.dragBound = '1';
    handle.addEventListener('pointerdown', event => {
      if (!ambienteMobile()) return;
      sheetDragStartY = event.clientY;
      sheetDragLastY = event.clientY;
      try { handle.setPointerCapture(event.pointerId); } catch (_) {}
    });
    handle.addEventListener('pointermove', event => {
      if (sheetDragStartY == null) return;
      sheetDragLastY = event.clientY;
    });
    const concluir = () => {
      if (sheetDragStartY == null) return;
      const delta = (sheetDragLastY ?? sheetDragStartY) - sheetDragStartY;
      sheetDragStartY = null;
      sheetDragLastY = null;
      if (Math.abs(delta) < 18) return alternarPainel();
      definirEstadoPainel(delta < 0 ? 'expanded' : 'collapsed');
    };
    handle.addEventListener('pointerup', concluir);
    handle.addEventListener('pointercancel', concluir);
  }

  function definirStatusImportacao(texto, tom) {
    const el = $('routingImportStatus');
    if (!el) return;
    el.textContent = texto || '';
    el.style.display = texto ? 'block' : 'none';
    if (tom) el.dataset.tone = tom;
    else delete el.dataset.tone;
  }

  function renderizarPreferencias() {
    if (!rotaAtual) return;
    const veiculos = { carro: 'Carro', moto: 'Moto', caminhao: 'Caminhão' };
    if ($('routingPrefsVehicle')) $('routingPrefsVehicle').textContent = veiculos[rotaAtual.veiculo] || 'Carro';
    if ($('routingPrefsStopTime')) $('routingPrefsStopTime').textContent = `${Math.max(0, Math.round(Number(rotaAtual.tempoParadaSegundos || 0) / 60))} min`;
    if ($('routingPrefsStart')) $('routingPrefsStart').textContent = rotaAtual.pontoInicial?.descricao || 'Não definido';
    const service = $('routingServiceStatus');
    if (service) {
      const ok = workerConfigurado();
      service.textContent = ok ? 'Configurado' : 'Não configurado';
      service.dataset.status = ok ? 'ok' : 'warn';
    }
  }

  function renderizarResumo() {
    if (!rotaAtual) return;
    const total = rotaAtual.paradas.length;
    const localizadas = rotaAtual.paradas.filter(p => paradaLocalizada(p)).length;
    const problemas = total - localizadas;
    if ($('routingImportedCount')) $('routingImportedCount').textContent = String(total);
    if ($('routingLocatedCount')) $('routingLocatedCount').textContent = String(localizadas);
    if ($('routingProblemCount')) $('routingProblemCount').textContent = String(problemas);
    if ($('routeMetricStops')) $('routeMetricStops').textContent = String(total);
    if ($('routeMetricDistance')) $('routeMetricDistance').textContent = formatarDistancia(rotaAtual.distanciaTotalMetros);
    if ($('routeMetricDrive')) $('routeMetricDrive').textContent = formatarTempo(rotaAtual.duracaoDirecaoSegundos);
    if ($('routeMetricStopTime')) $('routeMetricStopTime').textContent = formatarTempo(rotaAtual.duracaoParadasSegundos);
    if ($('routeMetricTotal')) $('routeMetricTotal').textContent = formatarTempo(rotaAtual.duracaoTotalSegundos);
    if ($('routeMetricEnd')) $('routeMetricEnd').textContent = horaLocal(rotaAtual.horarioTerminoEstimado);
    if ($('routingRouteName') && document.activeElement !== $('routingRouteName')) $('routingRouteName').value = rotaAtual.nome || '';
    if ($('routingRouteNameMirror') && document.activeElement !== $('routingRouteNameMirror')) $('routingRouteNameMirror').value = rotaAtual.nome || '';
    if ($('routingMapTitle')) $('routingMapTitle').textContent = rotaAtual.nome || 'Rota de hoje';
    const flag = $('routingOptimizedFlag');
    if (flag) {
      flag.textContent = rotaAtual.rotaOtimizada ? 'Rota otimizada' : 'Rota em planejamento';
      flag.dataset.optimized = rotaAtual.rotaOtimizada ? 'true' : 'false';
    }
    const headline = $('routingSheetHeadline');
    const meta = $('routingSheetMeta');
    if (headline) {
      headline.textContent = rotaAtual.horarioTerminoEstimado
        ? `Término: ${horaLocal(rotaAtual.horarioTerminoEstimado)}`
        : (rotaAtual.rotaOtimizada ? 'Rota pronta' : 'Rota em planejamento');
    }
    if (meta) {
      const paradaTexto = `${total} ${total === 1 ? 'parada' : 'paradas'}`;
      const distancia = formatarDistancia(rotaAtual.distanciaTotalMetros);
      meta.textContent = distancia === '—' ? paradaTexto : `${paradaTexto} · ${distancia}`;
    }
    renderizarPreferencias();
    atualizarDisponibilidadeAcoes();
    atualizarAcaoPrincipal();
  }

  function criarBotao(texto, classe, handler) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = classe || 'route-list-action';
    b.textContent = texto;
    b.addEventListener('click', event => { event.stopPropagation(); handler(); });
    return b;
  }

  function renderizarLista() {
    const container = $('routePlannerStops');
    if (!container) return;
    container.replaceChildren();
    if (!rotaAtual?.paradas?.length) {
      const vazio = document.createElement('div');
      vazio.className = 'routing-empty';
      vazio.textContent = 'Importe uma planilha ou adicione uma parada para começar.';
      container.appendChild(vazio);
      return;
    }

    const termoBusca = String($('routingStopSearch')?.value || '').trim().toLowerCase();
    const listaFiltrada = obterParadasOrdenadas().filter(p => {
      if (!termoBusca) return true;
      const alvo = [p.enderecoOriginal, p.cidade, p.observacao, ...(p.pacotes || [])].join(' ').toLowerCase();
      return alvo.includes(termoBusca);
    });
    listaFiltrada.forEach((p, index) => {
      const card = document.createElement('article');
      card.className = 'routing-stop-card';
      if (global.appState?.roteirizacao?.paradaSelecionadaId === p.id) card.classList.add('is-selected');
      if (p.statusGeocodificacao !== 'ok') card.classList.add('needs-location');
      if (p.statusEntrega === 'nao_entregue') card.classList.add('is-failed');
      if (['entregue', 'concluida'].includes(p.statusEntrega)) card.classList.add('is-delivered');
      card.dataset.stopId = p.id;
      card.addEventListener('click', () => selecionarParada(p.id, 'lista'));

      const order = document.createElement('div');
      order.className = 'routing-stop-order';
      order.textContent = String(p.ordemOtimizada || p.ordemOriginal || index + 1);

      const body = document.createElement('div');
      body.className = 'routing-stop-body';
      const address = document.createElement('strong');
      address.textContent = p.enderecoOriginal || 'Endereço não informado';
      const complement = document.createElement('span');
      complement.className = 'routing-stop-complement';
      complement.textContent = detalheComplemento(p) || p.observacao || '';
      const meta = document.createElement('div');
      meta.className = 'routing-stop-meta';
      const pacoteTexto = p.pacotes?.length ? `${p.pacotes.length} pacote(s)` : 'Sem código de pacote';
      meta.textContent = `${pacoteTexto} · ${statusGeoTexto(p)} · ${statusEntregaTexto(p)}`;
      body.append(address);
      if (complement.textContent) body.append(complement);
      body.append(meta);

      const actions = document.createElement('div');
      actions.className = 'routing-stop-actions';
      actions.append(
        criarBotao('Editar', 'route-list-action', () => abrirEditor(p.id)),
        criarBotao('Duplicar', 'route-list-action', () => duplicarParada(p.id)),
        criarBotao('Remover', 'route-list-action danger', () => removerParada(p.id))
      );
      card.append(order, body, actions);
      container.appendChild(card);
    });
  }

  function renderizarParadaSelecionada() {
    const card = $('routingSelectedStopCard');
    if (!card || !rotaAtual) return;
    const id = global.appState?.roteirizacao?.paradaSelecionadaId;
    const p = rotaAtual.paradas.find(item => item.id === id);
    if (!p) {
      card.style.display = 'none';
      return;
    }
    const index = obterParadasOrdenadas().findIndex(item => item.id === p.id);
    card.style.display = 'grid';
    if ($('routingSelectedStopOrder')) $('routingSelectedStopOrder').textContent = String(p.ordemOtimizada || p.ordemOriginal || index + 1);
    if ($('routingSelectedStopAddress')) $('routingSelectedStopAddress').textContent = p.enderecoOriginal || 'Endereço não informado';
    if ($('routingSelectedStopComplement')) $('routingSelectedStopComplement').textContent = detalheComplemento(p) || p.observacao || '';
    if ($('routingSelectedStopMeta')) $('routingSelectedStopMeta').textContent = `${p.pacotes?.length || 0} pacote(s) · ${statusGeoTexto(p)} · ${statusEntregaTexto(p)}`;
  }

  function renderizarTudo(opcoes) {
    if (!rotaAtual) return;
    aplicarRotaNoState();
    renderizarResumo();
    renderizarLista();
    renderizarParadaSelecionada();
    global.PacoteEMatoMapa?.renderizar({ fit: opcoes?.fit === true });
    global.PacoteEMatoAppShell?.atualizarInicio?.();
  }

  async function carregarRotaAtiva() {
    const rota = await global.PacoteEMatoRotaStore.obterRotaAtiva();
    if (rota) rotaAtual = rota;
    if (!rotaAtual) {
      const cfg = global.PacoteEMatoConfiguracoes?.obter?.() || {};
      rotaAtual = global.PacoteEMatoRotaStore.criarRota({
        veiculo: cfg.veiculo || 'carro',
        modoRoteamento: global.PacoteEMatoRotaStore.modoPorVeiculo(cfg.veiculo || 'carro'),
        tempoParadaSegundos: Number(cfg.tempoParadaSegundos || 180),
        pontoInicial: cfg.pontoInicial || null,
        retornarAoInicio: cfg.retornarAoInicio === true
      });
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true, firestore: false });
    }
    renderizarTudo({ fit: true });
    return rotaAtual;
  }

  function resumoLinha(row) {
    return (row || []).map(v => String(v ?? '').trim()).filter(Boolean).slice(0, 5).join(' | ');
  }

  function camposMapeamentoVisiveis() {
    const permitidos = new Set(['endereco','logradouro','numero','cidade','estado','cep','complemento','apartamento','bloco','sala','loja','pacote','pacotes','observacao','latitude','longitude','id']);
    return (global.PacoteEMatoImportacaoXLSX?.camposMapeaveis || []).filter(([campo]) => permitidos.has(campo));
  }

  function renderizarPreviewImportacao(inspecao, headerIndex) {
    const table = $('routeImportPreview');
    if (!table) return;
    table.replaceChildren();
    const headers = (inspecao.matriz?.[headerIndex] || []).map(v => String(v ?? '').trim());
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    headers.forEach((h, i) => { const th = document.createElement('th'); th.textContent = h || `Coluna ${i + 1}`; trh.appendChild(th); });
    thead.appendChild(trh); table.appendChild(thead);
    const tbody = document.createElement('tbody');
    (inspecao.matriz || []).slice(headerIndex + 1, headerIndex + 5).forEach(row => {
      const tr = document.createElement('tr');
      headers.forEach((_, i) => { const td = document.createElement('td'); td.textContent = String(row?.[i] ?? ''); tr.appendChild(td); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function preencherMapeamentoImportacao(inspecao, headerIndex) {
    const headers = (inspecao.matriz?.[headerIndex] || []).map(v => String(v ?? '').trim());
    const auto = global.PacoteEMatoImportacaoXLSX.identificarColunas(headers);
    const container = $('routeImportMappingFields');
    if (!container) return;
    container.replaceChildren();
    camposMapeamentoVisiveis().forEach(([campo, label]) => {
      const wrap = document.createElement('div');
      wrap.className = 'route-import-map-field' + (campo === 'endereco' || campo === 'logradouro' ? ' route-import-map-required' : '');
      const lab = document.createElement('label');
      lab.textContent = label;
      const select = document.createElement('select');
      select.className = 'pemato-field';
      select.dataset.importMap = campo;
      const vazio = document.createElement('option'); vazio.value = ''; vazio.textContent = 'Não usar'; select.appendChild(vazio);
      headers.forEach((h, i) => { const opt = document.createElement('option'); opt.value = String(i); opt.textContent = h || `Coluna ${i + 1}`; select.appendChild(opt); });
      if (auto[campo] != null) select.value = String(auto[campo]);
      wrap.append(lab, select); container.appendChild(wrap);
    });
    renderizarPreviewImportacao(inspecao, headerIndex);
  }

  function concluirMapeamentoImportacao(valor) {
    const modal = $('routeImportMappingModal');
    if (modal) modal.style.display = 'none';
    const resolver = resolverMapeamentoImportacao;
    resolverMapeamentoImportacao = null;
    if (resolver) resolver(valor);
  }

  function abrirMapeamentoImportacao(inspecao) {
    const modal = $('routeImportMappingModal');
    if (!modal) return Promise.resolve(null);
    importacaoPendente = inspecao;
    if ($('routeImportFileName')) $('routeImportFileName').textContent = inspecao.nomeArquivo || 'Planilha';
    if ($('routeImportSheetInfo')) $('routeImportSheetInfo').textContent = `${inspecao.sheetName || 'Planilha'} · ${inspecao.totalLinhasDados || 0} linha(s) de dados`;
    const headerSelect = $('routeImportHeaderRow');
    if (headerSelect) {
      headerSelect.replaceChildren();
      const limite = Math.min(inspecao.matriz?.length || 0, 20);
      for (let i = 0; i < limite; i++) {
        const row = inspecao.matriz[i];
        if (!row || !row.some(v => String(v ?? '').trim())) continue;
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = `Linha ${i + 1}: ${resumoLinha(row) || '(vazia)'}`;
        headerSelect.appendChild(opt);
      }
      headerSelect.value = String(inspecao.headerIndex);
    }
    preencherMapeamentoImportacao(inspecao, inspecao.headerIndex);
    if ($('routeImportMappingError')) { $('routeImportMappingError').style.display = 'none'; $('routeImportMappingError').textContent = ''; }
    modal.style.display = 'flex';
    return new Promise(resolve => { resolverMapeamentoImportacao = resolve; });
  }

  function confirmarMapeamentoImportacao() {
    if (!importacaoPendente) return concluirMapeamentoImportacao(null);
    const headerIndex = Number($('routeImportHeaderRow')?.value ?? importacaoPendente.headerIndex);
    const columnMapping = {};
    document.querySelectorAll('[data-import-map]').forEach(select => {
      if (select.value !== '') columnMapping[select.dataset.importMap] = Number(select.value);
    });
    if (columnMapping.endereco == null && columnMapping.logradouro == null) {
      const err = $('routeImportMappingError');
      if (err) { err.textContent = 'Associe pelo menos “Endereço completo” ou “Logradouro / rua”.'; err.style.display = 'block'; }
      return;
    }
    concluirMapeamentoImportacao({ headerIndex, columnMapping });
  }

  async function importarArquivo(file) {
    if (!file) return;
    definirStatusImportacao('Lendo a planilha e identificando as colunas...', null);
    try {
      if (!global.PacoteEMatoImportacaoXLSX) throw new Error('Módulo de importação não carregado. Recarregue a página e tente novamente.');
      const inspecao = await global.PacoteEMatoImportacaoXLSX.inspecionarArquivo(file);
      let opcoes = { inspecao };
      if (inspecao.columns.endereco == null && inspecao.columns.logradouro == null) {
        definirStatusImportacao('A planilha foi lida, mas preciso saber quais colunas contêm os endereços.', 'warning');
        const mapeamento = await abrirMapeamentoImportacao(inspecao);
        if (!mapeamento) {
          definirStatusImportacao('Importação cancelada. Nenhuma parada foi alterada.', 'warning');
          return;
        }
        opcoes = Object.assign(opcoes, mapeamento);
      }

      const resultado = await global.PacoteEMatoImportacaoXLSX.lerArquivo(file, opcoes);
      const cfg = global.PacoteEMatoConfiguracoes?.obter?.() || {};
      rotaAtual = global.PacoteEMatoRotaStore.criarRota({
        nome: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
        origem: 'xlsx',
        status: 'planejamento',
        veiculo: cfg.veiculo || 'carro',
        modoRoteamento: global.PacoteEMatoRotaStore.modoPorVeiculo(cfg.veiculo || 'carro'),
        tempoParadaSegundos: Number(cfg.tempoParadaSegundos || 180),
        pontoInicial: cfg.pontoInicial || null,
        retornarAoInicio: cfg.retornarAoInicio === true,
        paradas: resultado.paradas,
        ordem: resultado.paradas.map(p => p.id)
      });
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      renderizarTudo({ fit: true });

      const ignoradas = resultado.erros?.length ? ` ${resultado.erros.length} linha(s) foram ignoradas por problema de dados.` : '';
      const avisosCoords = resultado.avisos?.length ? ` ${resultado.avisos.length} linha(s) tinham coordenadas incompletas/inválidas e foram mantidas para geocodificação posterior.` : '';
      definirStatusImportacao(`${rotaAtual.paradas.length} parada(s) importada(s) da aba “${resultado.sheetName || 'Planilha'}”.${ignoradas}${avisosCoords}`, (resultado.erros?.length || resultado.avisos?.length) ? 'warning' : 'success');
      definirEstadoPainel('expanded');

      if (!workerConfigurado() || !global.PacoteEMatoGeocodificacao?.endpointAtual?.()) {
        const localizadas = rotaAtual.paradas.filter(p => paradaLocalizada(p)).length;
        const faltantes = rotaAtual.paradas.length - localizadas;
        const msg = faltantes
          ? `${rotaAtual.paradas.length} parada(s) importada(s): ${localizadas} já localizada(s) no mapa e ${faltantes} aguardando geocodificação. O serviço de geocodificação não está configurado; a lista foi preservada e você pode tentar localizar novamente sem reimportar.`
          : `${rotaAtual.paradas.length} parada(s) importada(s) com coordenadas válidas e exibidas no mapa.`;
        definirStatusImportacao(msg, faltantes ? 'warning' : 'success');
        definirEstadoPainel('expanded');
        return;
      }

      definirStatusImportacao(`${rotaAtual.paradas.length} parada(s) importada(s). Localizando endereços...`, null);
      const resumoGeo = await geocodificarTodas({ silencioso: true });
      if (resumoGeo) {
        const problemas = resumoGeo.total - resumoGeo.ok;
        definirStatusImportacao(`${rotaAtual.paradas.length} parada(s) importada(s): ${resumoGeo.ok} localizada(s) e ${problemas} precisando de correção.`, problemas ? 'warning' : 'success');
      }
    } catch (erro) {
      console.error('Pacote É Mato: falha na importação XLSX.', erro);
      definirStatusImportacao(erro?.message || 'Não foi possível importar a planilha.', 'error');
      notificar(erro?.message || 'Falha ao importar planilha.');
    } finally {
      if ($('routingXlsxInput')) $('routingXlsxInput').value = '';
    }
  }

  function hashTexto(texto) {
    let h = 2166136261;
    const s = String(texto || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  }

  async function usarRotaLegada() {
    const mapa = global.mapaRotas && typeof global.mapaRotas === 'object' ? global.mapaRotas : {};
    const keys = Object.keys(mapa);
    if (!keys.length) {
      notificar('Carregue primeiro uma rota PDF na Bipagem para importá-la para a Roteirização.');
      return;
    }
    const names = global.nomeExibicao || {};
    const stops = global.stopCorrespondente || {};
    const paradas = keys.map((key, index) => {
      const pacotes = Array.isArray(mapa[key]) ? mapa[key].slice() : [];
      const pacotesJaBipados = pacotes.filter(c => global.pacotesBipados?.has(c));
      const related = [...new Set(pacotes.map(c => Number(stops[c])).filter(Number.isFinite))].sort((a, b) => a - b);
      return {
        id: `pdf-${hashTexto(key)}`,
        ordemOriginal: related[0] || index + 1,
        stopsRelacionados: related,
        enderecoOriginal: String(names[key] || key),
        enderecoNormalizado: key,
        pacotes,
        pacotesBipados: pacotesJaBipados,
        quantidadePacotes: pacotes.length,
        quantidadeBipada: pacotesJaBipados.length,
        statusEntrega: pacotes.length && pacotesJaBipados.length >= pacotes.length ? 'concluida' : (pacotesJaBipados.length ? 'parcial' : 'pendente'),
        statusGeocodificacao: 'pendente',
        origem: 'pdf-legado',
        chaveFisica: key
      };
    }).sort((a, b) => a.ordemOriginal - b.ordemOriginal);
    const cfg = global.PacoteEMatoConfiguracoes?.obter?.() || {};
    rotaAtual = global.PacoteEMatoRotaStore.criarRota({
      nome: 'Rota importada da Bipagem',
      origem: 'pdf-legado',
      status: 'planejamento',
      veiculo: cfg.veiculo || 'carro',
      modoRoteamento: global.PacoteEMatoRotaStore.modoPorVeiculo(cfg.veiculo || 'carro'),
      tempoParadaSegundos: Number(cfg.tempoParadaSegundos || 180),
      pontoInicial: cfg.pontoInicial || null,
      retornarAoInicio: cfg.retornarAoInicio === true,
      paradas,
      ordem: paradas.map(p => p.id)
    });
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarTudo({ fit: true });
    await geocodificarTodas();
  }

  async function geocodificarTodas(opcoes) {
    if (!rotaAtual?.paradas?.length) {
      if (!opcoes?.silencioso) notificar('Importe ou adicione paradas antes de validar endereços.');
      return null;
    }
    aplicarRotaNoState();
    const btn = $('routingGeocodeBtn');
    if (btn) btn.disabled = true;
    try {
      if (!global.PacoteEMatoGeocodificacao?.endpointAtual?.()) {
        throw new Error('Serviço de geocodificação não configurado. As paradas importadas foram preservadas; configure o serviço em uma etapa futura e use “Tentar localizar” sem reimportar o XLSX.');
      }
      if (!opcoes?.silencioso) definirStatusImportacao('Validando endereços...', null);
      const resumoGeo = await global.PacoteEMatoGeocodificacao.geocodificarParadas(rotaAtual.paradas);
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      renderizarTudo({ fit: true });
      if (!opcoes?.silencioso) {
        const problemas = resumoGeo.total - resumoGeo.ok;
        definirStatusImportacao(`${resumoGeo.ok} endereço(s) localizado(s). ${problemas} parada(s) precisam de correção.`, problemas ? 'warning' : 'success');
      }
      return resumoGeo;
    } catch (erro) {
      if (!opcoes?.silencioso) {
        definirStatusImportacao(erro?.message || 'Falha ao validar endereços.', 'error');
        notificar(erro?.message || 'Falha ao validar endereços.');
      }
      return null;
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function geocodificarParada(p) {
    if (!p) return;
    await global.PacoteEMatoGeocodificacao.geocodificarParada(p);
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarTudo({ fit: p.statusGeocodificacao === 'ok' });
  }

  async function usarLocalizacaoAtual() {
    if (!navigator.geolocation) {
      notificar('Geolocalização não disponível neste navegador.');
      return;
    }
    const btn = $('routingUseLocationBtn');
    if (btn) btn.disabled = true;
    navigator.geolocation.getCurrentPosition(async pos => {
      rotaAtual.pontoInicial = {
        tipo: 'gps', descricao: 'Localização atual', lat: pos.coords.latitude, lon: pos.coords.longitude, status: 'ok'
      };
      invalidarRotaCalculada();
      global.PacoteEMatoConfiguracoes?.salvar?.({ pontoInicial: rotaAtual.pontoInicial });
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      renderizarTudo({ fit: true });
      if (btn) btn.disabled = false;
    }, err => {
      if (btn) btn.disabled = false;
      notificar(err?.message || 'Não foi possível acessar sua localização.');
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  }

  async function localizarPontoInicial() {
    const texto = String($('routingStartAddress')?.value || '').trim();
    if (!texto) return notificar('Informe um endereço para o ponto de partida.');
    const p = await global.PacoteEMatoGeocodificacao.geocodificarEnderecoLivre(texto);
    if (p.statusGeocodificacao !== 'ok') {
      rotaAtual.pontoInicial = { tipo: 'endereco', descricao: texto, lat: null, lon: null, status: p.statusGeocodificacao };
      renderizarTudo();
      return notificar('Não foi possível validar esse ponto de partida com confiança.');
    }
    rotaAtual.pontoInicial = { tipo: 'endereco', descricao: texto, lat: p.latitude, lon: p.longitude, status: 'ok' };
    invalidarRotaCalculada();
    global.PacoteEMatoConfiguracoes?.salvar?.({ pontoInicial: rotaAtual.pontoInicial });
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarTudo({ fit: true });
  }

  async function usarPontoInicialSalvo() {
    const cfg = global.PacoteEMatoConfiguracoes?.obter?.() || {};
    const salvo = cfg.pontoInicial;
    if (!pontoValido(salvo)) {
      return notificar('Nenhum ponto de partida validado foi salvo ainda.');
    }
    rotaAtual.pontoInicial = clone(salvo);
    invalidarRotaCalculada();
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarTudo({ fit: true });
    notificar('Ponto de partida salvo aplicado à rota.');
  }

  function salvarPontoInicialAtual() {
    const p = rotaAtual?.pontoInicial;
    if (!pontoValido(p)) {
      return notificar('Valide um ponto de partida antes de salvá-lo.');
    }
    global.PacoteEMatoConfiguracoes?.salvar?.({ pontoInicial: clone(p) });
    notificar('Ponto de partida salvo nas configurações.');
  }

  async function otimizarRota() {
    if (!rotaAtual) return;
    if (!workerConfigurado() || !global.PacoteEMatoServicoRota?.endpoint?.('optimize')) {
      const msg = 'Otimização por ruas depende do serviço externo, que não será configurado nesta etapa. A rota não será simulada.';
      definirStatusImportacao(msg, 'warning');
      return notificar(msg);
    }
    const btn = $('routingOptimizeBtn');
    if (btn) btn.disabled = true;
    try {
      const unresolved = rotaAtual.paradas.filter(p => !paradaLocalizada(p));
      if (unresolved.length) throw new Error(`Corrija ou localize ${unresolved.length} parada(s) antes de otimizar.`);
      if (!pontoValido(rotaAtual.pontoInicial)) {
        throw new Error('Defina um ponto de partida válido antes de otimizar.');
      }

      const otimizada = await global.PacoteEMatoServicoRota.otimizar(rotaAtual);
      const orderIds = Array.isArray(otimizada.orderIds) ? otimizada.orderIds : [];
      if (!orderIds.length) throw new Error('O otimizador não retornou uma ordem de paradas.');

      const ordered = global.PacoteEMatoServicoRota.ordenarParadas(rotaAtual, orderIds);
      rotaAtual.ordem = ordered.map(p => p.id);
      const route = await global.PacoteEMatoServicoRota.calcularRotaPelasRuas(rotaAtual);
      const feature = route.feature;
      rotaAtual.geometria = feature.geometry;
      rotaAtual.distanciaTotalMetros = Number(feature.properties?.distance || otimizada.distance || 0);
      rotaAtual.duracaoDirecaoSegundos = Number(feature.properties?.time || otimizada.drivingTime || 0);
      rotaAtual.pernas = Array.isArray(feature.properties?.legs) ? feature.properties.legs : [];
      rotaAtual.instrucoes = global.PacoteEMatoServicoRota.extrairInstrucoes(feature);
      const pendentes = rotaAtual.paradas.filter(p => !['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega)).length;
      rotaAtual.duracaoParadasSegundos = pendentes * Number(rotaAtual.tempoParadaSegundos || 0);
      rotaAtual.duracaoTotalSegundos = rotaAtual.duracaoDirecaoSegundos + rotaAtual.duracaoParadasSegundos;
      rotaAtual.horarioTerminoEstimado = Date.now() + rotaAtual.duracaoTotalSegundos * 1000;
      rotaAtual.rotaOtimizada = true;
      rotaAtual.status = 'ativa';
      rotaAtual.otimizadoEm = Date.now();
      if (!rotaAtual.iniciadoEm) rotaAtual.iniciadoEm = Date.now();
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      renderizarTudo({ fit: true });
      definirStatusImportacao('Rota otimizada pela rede viária, desenhada no mapa e salva como rota ativa.', 'success');
      notificar('Rota otimizada pela rede viária e salva como rota ativa.');
    } catch (erro) {
      console.error(erro);
      definirStatusImportacao(erro?.message || 'Não foi possível otimizar a rota.', 'error');
      notificar(erro?.message || 'Não foi possível otimizar a rota.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  async function inverterRota() {
    if (!rotaAtual?.rotaOtimizada) return notificar('Otimize a rota antes de inverter.');
    const byId = new Map(rotaAtual.paradas.map(p => [p.id, p]));
    const concluidas = rotaAtual.ordem.filter(id => ['entregue', 'concluida', 'nao_entregue'].includes(byId.get(id)?.statusEntrega));
    const pendentes = rotaAtual.ordem.filter(id => !concluidas.includes(id)).reverse();
    rotaAtual.ordem = [...concluidas, ...pendentes];
    rotaAtual.ordem.forEach((id, index) => { const p = byId.get(id); if (p) p.ordemOtimizada = index + 1; });
    try {
      const route = await global.PacoteEMatoServicoRota.calcularRotaPelasRuas(rotaAtual);
      const feature = route.feature;
      rotaAtual.geometria = feature.geometry;
      rotaAtual.distanciaTotalMetros = Number(feature.properties?.distance || 0);
      rotaAtual.duracaoDirecaoSegundos = Number(feature.properties?.time || 0);
      rotaAtual.pernas = Array.isArray(feature.properties?.legs) ? feature.properties.legs : [];
      rotaAtual.instrucoes = global.PacoteEMatoServicoRota.extrairInstrucoes(feature);
      rotaAtual.duracaoParadasSegundos = rotaAtual.paradas.filter(p => !['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega)).length * Number(rotaAtual.tempoParadaSegundos || 0);
      rotaAtual.duracaoTotalSegundos = rotaAtual.duracaoDirecaoSegundos + rotaAtual.duracaoParadasSegundos;
      rotaAtual.horarioTerminoEstimado = Date.now() + rotaAtual.duracaoTotalSegundos * 1000;
      rotaAtual.otimizadoEm = Date.now();
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      renderizarTudo({ fit: true });
      notificar('Ordem invertida e rota pelas ruas recalculada.');
    } catch (erro) {
      notificar(erro?.message || 'Não foi possível recalcular a rota invertida.');
    }
  }

  function selecionarParada(id, origem) {
    if (!rotaAtual?.paradas.some(p => p.id === id)) return;
    global.appState.roteirizacao.paradaSelecionadaId = id;
    renderizarLista();
    renderizarParadaSelecionada();
    global.PacoteEMatoMapa?.renderizar();
    if (origem !== 'mapa') global.PacoteEMatoMapa?.centralizarParada(id);
    const card = document.querySelector(`.routing-stop-card[data-stop-id="${CSS.escape(id)}"]`);
    if (card && origem === 'mapa') card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function abrirEditor(id) {
    const modal = $('routeStopEditorModal');
    if (!modal) return;
    modoEdicaoNovo = !id;
    stopEmEdicao = id ? rotaAtual?.paradas.find(p => p.id === id) : null;
    const p = stopEmEdicao || {
      id: idNovo('manual'), logradouro: '', numero: '', complemento: '', apartamento: '', bloco: '', sala: '', loja: '',
      bairro: '', cidade: '', estado: '', cep: '', observacao: '', pacotes: [], statusEntrega: 'pendente', motivoNaoEntrega: '', observacaoNaoEntrega: ''
    };
    const fields = ['logradouro','numero','complemento','apartamento','bloco','sala','loja','bairro','cidade','estado','cep','observacao'];
    fields.forEach(key => { const el = $(`routeEdit_${key}`); if (el) el.value = p[key] || ''; });
    if ($('routeEdit_pacotes')) $('routeEdit_pacotes').value = (p.pacotes || []).join('\n');
    if ($('routeEdit_status')) $('routeEdit_status').value = p.statusEntrega || 'pendente';
    if ($('routeEdit_motivo')) $('routeEdit_motivo').value = p.motivoNaoEntrega || '';
    if ($('routeEdit_observacaoNaoEntrega')) $('routeEdit_observacaoNaoEntrega').value = p.observacaoNaoEntrega || '';
    if ($('routeStopEditorTitle')) $('routeStopEditorTitle').textContent = modoEdicaoNovo ? 'Adicionar parada' : 'Editar parada';
    modal.style.display = 'flex';
  }

  function fecharEditor() {
    const modal = $('routeStopEditorModal');
    if (modal) modal.style.display = 'none';
    stopEmEdicao = null;
    modoEdicaoNovo = false;
  }

  function pacotesDoCampo(texto) {
    const brs = String(texto || '').match(/BR[A-Za-z0-9]{8,25}/gi) || [];
    if (brs.length) return [...new Set(brs.map(v => v.toUpperCase()))];
    return [...new Set(String(texto || '').split(/[\n,;|]+/).map(v => v.trim()).filter(Boolean))];
  }

  async function salvarEditor() {
    if (!rotaAtual) return;
    const fields = ['logradouro','numero','complemento','apartamento','bloco','sala','loja','bairro','cidade','estado','cep','observacao'];
    const dados = {};
    fields.forEach(key => { dados[key] = String($(`routeEdit_${key}`)?.value || '').trim(); });
    dados.pacotes = pacotesDoCampo($('routeEdit_pacotes')?.value || '');
    dados.statusEntrega = String($('routeEdit_status')?.value || 'pendente');
    dados.motivoNaoEntrega = dados.statusEntrega === 'nao_entregue' ? String($('routeEdit_motivo')?.value || '') : '';
    dados.observacaoNaoEntrega = dados.statusEntrega === 'nao_entregue' ? String($('routeEdit_observacaoNaoEntrega')?.value || '') : '';
    if (!dados.logradouro) return notificar('Informe o endereço/logradouro da parada.');

    const eraOtimizada = rotaAtual.rotaOtimizada === true || !!rotaAtual.geometria;
    const eraNova = !stopEmEdicao;
    let p = stopEmEdicao;
    const enderecoAnterior = p?.enderecoOriginal || '';
    if (!p) {
      p = global.PacoteEMatoRotaStore.normalizarParada({
        id: idNovo('manual'), ordemOriginal: rotaAtual.paradas.length + 1, origem: 'manual', ...dados
      }, rotaAtual.paradas.length);
      rotaAtual.paradas.push(p);
      rotaAtual.ordem.push(p.id);
    } else {
      Object.assign(p, dados);
      p.alteradoEm = Date.now();
    }
    p.quantidadePacotes = p.pacotes.length;
    p.enderecoOriginal = enderecoDaParada(p);
    if (p.statusEntrega === 'entregue') p.entregueEm = p.entregueEm || Date.now();
    if (p.statusEntrega !== 'entregue') p.entregueEm = null;

    const enderecoMudou = p.enderecoOriginal !== enderecoAnterior || eraNova;
    if (enderecoMudou) {
      p.latitude = null;
      p.longitude = null;
      p.statusGeocodificacao = 'pendente';
      p.enderecoGeocodificado = '';
      p.geocodificadoEm = null;
      p.confiabilidade = null;
      p.confiabilidadeRua = null;
      invalidarRotaCalculada();
    }
    fecharEditor();
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarTudo();

    if (enderecoMudou) await geocodificarParada(p);

    if (eraOtimizada && (!enderecoMudou || p.statusGeocodificacao === 'ok')) {
      const titulo = eraNova ? 'Parada adicionada' : 'Rota alterada';
      const texto = eraNova
        ? 'A nova parada já foi adicionada. Você pode manter a ordem atual ou otimizar novamente usando a rede viária.'
        : 'O endereço foi atualizado e validado. Você pode manter a ordem atual ou otimizar novamente usando a rede viária.';
      const decisao = await perguntarReotimizacao(titulo, texto);
      if (decisao === 'otimizar') await otimizarRota();
      else await recalcularOrdemAtual();
    }
  }

  async function removerParada(id) {
    const p = rotaAtual?.paradas.find(item => item.id === id);
    if (!p) return;
    if (!confirm(`Remover a parada "${p.enderecoOriginal || 'sem endereço'}"?`)) return;
    const tinhaRotaCalculada = !!rotaAtual.geometria;
    rotaAtual.paradas = rotaAtual.paradas.filter(item => item.id !== id);
    rotaAtual.ordem = rotaAtual.ordem.filter(item => item !== id);
    invalidarRotaCalculada();
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarTudo({ fit: true });
    if (tinhaRotaCalculada && rotaAtual.paradas.length) await recalcularOrdemAtual();
  }

  async function duplicarParada(id) {
    const p = rotaAtual?.paradas.find(item => item.id === id);
    if (!p) return;
    const tinhaRotaCalculada = !!rotaAtual.geometria;
    const copia = clone(p);
    copia.id = idNovo('duplicada');
    copia.ordemOriginal = rotaAtual.paradas.length + 1;
    copia.ordemOtimizada = null;
    // Códigos de pacote são identificadores únicos; não são duplicados para evitar uma mesma etiqueta em duas paradas.
    copia.pacotes = [];
    copia.quantidadePacotes = 0;
    copia.quantidadeBipada = 0;
    copia.statusEntrega = 'pendente';
    copia.motivoNaoEntrega = '';
    copia.observacaoNaoEntrega = '';
    copia.entregueEm = null;
    copia.origem = 'duplicada';
    copia.criadoEm = Date.now();
    copia.alteradoEm = Date.now();
    rotaAtual.paradas.push(copia);
    rotaAtual.ordem.push(copia.id);
    invalidarRotaCalculada();
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarTudo({ fit: true });
    if (tinhaRotaCalculada) {
      const decisao = await perguntarReotimizacao(
        'Parada duplicada',
        'A nova parada foi adicionada com identificação própria. Você pode manter a ordem atual ou otimizar novamente.'
      );
      if (decisao === 'otimizar') await otimizarRota();
      else await recalcularOrdemAtual();
    }
  }

  async function alterarNomeRota() {
    if (!rotaAtual) return;
    const nome = String($('routingRouteName')?.value || rotaAtual.nome || 'Rota').trim();
    if (nome === rotaAtual.nome) return;
    rotaAtual.nome = nome || 'Rota';
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarResumo();
  }

  async function aplicarConfiguracoesNaRota(cfgRecebida) {
    if (!rotaAtual) return;
    const cfg = cfgRecebida || global.PacoteEMatoConfiguracoes?.obter?.() || {};
    const proximoVeiculo = cfg.veiculo || 'carro';
    const proximoTempo = Math.max(0, Number(cfg.tempoParadaSegundos || 0));
    const proximoRetorno = cfg.retornarAoInicio === true;
    const proximoPonto = cfg.pontoInicial || null;
    const pontoAnterior = JSON.stringify(rotaAtual.pontoInicial || null);
    const mudouCalculo = rotaAtual.veiculo !== proximoVeiculo
      || Number(rotaAtual.tempoParadaSegundos || 0) !== proximoTempo
      || rotaAtual.retornarAoInicio !== proximoRetorno
      || pontoAnterior !== JSON.stringify(proximoPonto);

    rotaAtual.veiculo = proximoVeiculo;
    rotaAtual.modoRoteamento = global.PacoteEMatoRotaStore.modoPorVeiculo(proximoVeiculo);
    rotaAtual.tempoParadaSegundos = proximoTempo;
    rotaAtual.retornarAoInicio = proximoRetorno;
    rotaAtual.pontoInicial = clone(proximoPonto);
    if (mudouCalculo && (rotaAtual.rotaOtimizada || rotaAtual.geometria)) invalidarRotaCalculada();
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    renderizarTudo({ fit: true });
  }

  function abrirNavegacao() {
    if (!rotaAtual?.geometria) return notificar('Calcule a rota pelas ruas antes de iniciar a navegação.');

    const cfg = global.PacoteEMatoConfiguracoes?.obter?.() || {};
    const preferencia = String(cfg.navegacao || 'pacote_emato');

    if (preferencia === 'waze' || preferencia === 'google') {
      const porId = new Map((rotaAtual.paradas || []).map(p => [p.id, p]));
      const proxima = (rotaAtual.ordem || [])
        .map(id => porId.get(id))
        .find(p => p && !['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega))
        || (rotaAtual.paradas || [])[0];

      if (!proxima) return notificar('A rota não possui uma parada disponível para navegação.');

      const endereco = String(proxima.enderecoOriginal || proxima.endereco || proxima.enderecoNormalizado || '').trim();
      if (!endereco) return notificar('A próxima parada não possui endereço válido para abrir a navegação externa.');

      // Reutiliza a integração já existente no sistema legado, sem duplicar regras de Waze/Google Maps.
      global.enderecoSelecionadoGps = endereco;
      if (typeof global.abrirGpsSelecionado === 'function') {
        global.abrirGpsSelecionado(preferencia);
      } else {
        const query = encodeURIComponent(endereco);
        const url = preferencia === 'waze'
          ? `https://waze.com/ul?q=${query}&navigate=yes`
          : `https://www.google.com/maps/search/?api=1&query=${query}`;
        global.open(url, '_blank');
      }
      return;
    }

    global.PacoteEMatoAppShell?.abrirModulo?.('navegacao');
    global.PacoteEMatoNavegacao?.iniciar?.(rotaAtual);
  }

  async function exportarPdf() {
    if (!rotaAtual) return;
    try { await global.PacoteEMatoPDF?.exportar?.(rotaAtual); }
    catch (erro) { notificar(erro?.message || 'Não foi possível gerar o PDF.'); }
  }

  function abrirMobilePane(tipo) {
    definirEstadoPainel(tipo === 'lista' ? 'expanded' : 'collapsed');
  }

  function bind() {
    $('routingEmptyImportBtn')?.addEventListener('click', solicitarImportacaoPlanilha);
    $('routingVisibleImportBtn')?.addEventListener('click', solicitarImportacaoPlanilha);
    $('routingXlsxInput')?.addEventListener('change', event => importarArquivo(event.target.files?.[0]));
    $('routingUseLegacyBtn')?.addEventListener('click', () => { fecharMenuAcoes(); usarRotaLegada(); });
    $('routingEmptyAddBtn')?.addEventListener('click', () => abrirEditor(null));
    $('routingAddStopInlineBtn')?.addEventListener('click', () => abrirEditor(null));
    $('routingInvertBtn')?.addEventListener('click', () => { fecharMenuAcoes(); inverterRota(); });
    $('routingExportPdfBtn')?.addEventListener('click', () => { fecharMenuAcoes(); exportarPdf(); });
    $('routingFitMapBtn')?.addEventListener('click', () => global.PacoteEMatoMapa?.ajustarTodos());
    $('routingActionsBtn')?.addEventListener('click', abrirMenuAcoes);
    $('routingActionsCloseBtn')?.addEventListener('click', fecharMenuAcoes);
    $('routingActionsBackdrop')?.addEventListener('click', event => { if (event.target === $('routingActionsBackdrop')) fecharMenuAcoes(); });
    $('routingSheetToggle')?.addEventListener('click', alternarPainel);
    $('routingPrimaryActionBtn')?.addEventListener('click', executarAcaoPrincipal);
    $('routingStopSearch')?.addEventListener('input', renderizarLista);
    iniciarArrastePainel();

    $('routingSelectedStopEdit')?.addEventListener('click', () => {
      const id = global.appState?.roteirizacao?.paradaSelecionadaId;
      if (id) abrirEditor(id);
    });
    $('routeStopEditorSave')?.addEventListener('click', salvarEditor);
    $('routeStopEditorCancel')?.addEventListener('click', fecharEditor);
    $('routeStopEditorClose')?.addEventListener('click', fecharEditor);
    $('routeKeepOrderBtn')?.addEventListener('click', () => concluirDecisaoReotimizacao('manter'));
    $('routeReoptBtn')?.addEventListener('click', () => concluirDecisaoReotimizacao('otimizar'));
    $('routingRouteName')?.addEventListener('change', alterarNomeRota);
    $('routingRouteNameMirror')?.addEventListener('change', async () => {
      if ($('routingRouteName')) $('routingRouteName').value = $('routingRouteNameMirror').value;
      await alterarNomeRota();
    });

    $('routeImportMappingClose')?.addEventListener('click', () => concluirMapeamentoImportacao(null));
    $('routeImportMappingCancel')?.addEventListener('click', () => concluirMapeamentoImportacao(null));
    $('routeImportMappingConfirm')?.addEventListener('click', confirmarMapeamentoImportacao);
    $('routeImportHeaderRow')?.addEventListener('change', () => {
      if (!importacaoPendente) return;
      const headerIndex = Number($('routeImportHeaderRow')?.value ?? importacaoPendente.headerIndex);
      preencherMapeamentoImportacao(importacaoPendente, headerIndex);
    });

    global.addEventListener('pemato:config:update', event => aplicarConfiguracoesNaRota(event.detail));
    global.addEventListener('pemato:worker:update', () => { renderizarPreferencias(); atualizarDisponibilidadeAcoes(); atualizarAcaoPrincipal(); });
    global.addEventListener('pemato:geo:update', () => { renderizarResumo(); renderizarLista(); global.PacoteEMatoMapa?.renderizar(); });
    global.addEventListener('pemato:geo:progress', () => renderizarResumo());
    global.addEventListener('pemato:rota:salva', e => {
      if (e.detail?.rota?.id === rotaAtual?.id) global.PacoteEMatoAppShell?.atualizarInicio?.();
    });
    global.addEventListener('resize', () => {
      if (!ambienteMobile()) definirEstadoPainel('expanded');
      else if (!['expanded','collapsed'].includes(estadoPainel)) definirEstadoPainel('collapsed');
      setTimeout(() => global.PacoteEMatoMapa?.renderizar?.(), 80);
    });
  }

  function iniciar() {
    bind();
    definirEstadoPainel(ambienteMobile() ? 'collapsed' : 'expanded');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar, { once: true });
  else iniciar();

  global.PacoteEMatoRoteirizacao = Object.freeze({
    carregarRotaAtiva,
    obterRotaAtual: () => clone(rotaAtual),
    renderizarTudo,
    selecionarParada,
    abrirEditor,
    geocodificarTodas,
    otimizarRota,
    inverterRota,
    recalcularOrdemAtual,
    usarRotaLegada,
    abrirNavegacao
  });
})(window);
