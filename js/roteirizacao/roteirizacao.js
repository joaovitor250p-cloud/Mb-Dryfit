(function iniciarRoteirizacao(global) {
  'use strict';

  let rotaAtual = null;
  let salvamentoTimer = null;
  let stopEmEdicao = null;
  let modoEdicaoNovo = false;
  let contextoEditor = 'rota';
  let rotaImportacaoPendente = null;
  let resultadoImportacaoPendente = null;
  let resolverDecisaoReotimizacao = null;
  let importacaoPendente = null;
  let resolverMapeamentoImportacao = null;
  let estadoPainel = (()=>{try{return sessionStorage.getItem('pemato_route_sheet')||'collapsed';}catch(_){return 'collapsed';}})();
  let sheetDragStartY = null;
  let sheetDragLastY = null;
  let estadoPainelAntesDesenho = null;

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
    const add = valor => {
      const texto = String(valor || '').trim();
      if (!texto) return;
      if (!itens.some(item => item.toLocaleLowerCase('pt-BR') === texto.toLocaleLowerCase('pt-BR'))) itens.push(texto);
    };
    add(p.complemento);
    if (p.bloco) add(`Bloco ${p.bloco}`);
    if (p.apartamento) add(`Apartamento ${p.apartamento}`);
    if (p.sala) add(`Sala ${p.sala}`);
    if (p.loja) add(`Loja ${p.loja}`);
    add(p.observacao);
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

  function mostrarProcessamento(titulo, mensagem) {
    const overlay = $('routingBusyOverlay');
    if (!overlay) return;
    if ($('routingBusyTitle')) $('routingBusyTitle').textContent = titulo || 'Processando rota';
    if ($('routingBusyMessage')) $('routingBusyMessage').textContent = mensagem || 'Aguarde um instante.';
    overlay.style.display = 'flex';
  }

  function atualizarProcessamento(titulo, mensagem) {
    if ($('routingBusyTitle') && titulo) $('routingBusyTitle').textContent = titulo;
    if ($('routingBusyMessage') && mensagem) $('routingBusyMessage').textContent = mensagem;
  }

  function esconderProcessamento() {
    const overlay = $('routingBusyOverlay');
    if (overlay) overlay.style.display = 'none';
  }

  async function garantirPontoInicialParaOtimizacao() {
    const atual = rotaAtual?.pontoInicial;
    const precisaGps = !pontoValido(atual) || String(atual?.tipo || '') === 'gps';
    if (!precisaGps) return atual;

    atualizarProcessamento('Obtendo ponto de partida', 'Atualizando sua posição antes de calcular a rota.');
    try {
      const local = await global.PacoteEMatoLocalizacaoAtual?.obter?.({ forcar: true });
      if (local && coordenadaValida(local.lat, local.lon)) {
        rotaAtual.pontoInicial = {
          tipo: 'gps',
          descricao: 'Posição GPS usada ao otimizar',
          lat: Number(local.lat),
          lon: Number(local.lon),
          accuracy: Number(local.accuracy || 0),
          obtidaEm: Number(local.timestamp || Date.now()),
          status: 'ok'
        };
        return rotaAtual.pontoInicial;
      }
    } catch (_) {}

    if (pontoValido(atual)) return atual;
    throw new Error('Não foi possível obter sua localização. Defina um ponto de partida nas Configurações e tente novamente.');
  }

  function preencherRevisaoOtimizacao() {
    if (!rotaAtual) return;
    if ($('routingReviewStops')) $('routingReviewStops').textContent = String(rotaAtual.paradas.length);
    if ($('routingReviewDistance')) $('routingReviewDistance').textContent = formatarDistancia(rotaAtual.distanciaTotalMetros);
    if ($('routingReviewDrive')) $('routingReviewDrive').textContent = formatarTempo(rotaAtual.duracaoDirecaoSegundos);
    if ($('routingReviewService')) $('routingReviewService').textContent = formatarTempo(rotaAtual.duracaoParadasSegundos);
    if ($('routingReviewTotal')) $('routingReviewTotal').textContent = formatarTempo(rotaAtual.duracaoTotalSegundos);
    if ($('routingReviewEnd')) $('routingReviewEnd').textContent = horaLocal(rotaAtual.horarioTerminoEstimado);
    if ($('routingReviewStart')) $('routingReviewStart').textContent = rotaAtual.pontoInicial?.descricao || 'Ponto de partida';

    const list = $('routingReviewStopsList');
    if (list) {
      list.replaceChildren();
      const byId = new Map((rotaAtual.paradas || []).map(p => [String(p.id), p]));
      (rotaAtual.ordem || []).forEach((id, index) => {
        const parada = byId.get(String(id));
        if (!parada) return;
        const row = document.createElement('div');
        row.className = 'routing-review-stop';
        const num = document.createElement('span');
        num.className = 'routing-review-number';
        num.textContent = String(index + 1);
        const copy = document.createElement('div');
        const strong = document.createElement('strong');
        const qtdMesmoEndereco = contagemMultiplos().get(chaveEnderecoMultiplo(parada)) || 1;
        strong.textContent = `${parada.enderecoFonte || parada.enderecoOriginal || 'Parada'}${qtdMesmoEndereco > 1 ? ` · ${qtdMesmoEndereco}x` : ''}`;
        const small = document.createElement('small');
        small.textContent = [detalheComplemento(parada), parada.bairro, parada.cidade, `${parada.pacotes?.length || 0} pacote(s)`].filter(Boolean).join(' · ');
        copy.append(strong, small);
        row.append(num, copy);
        list.appendChild(row);
      });
    }

    atualizarBotoesRefino();
  }

  function abrirRevisaoOtimizacao() {
    preencherRevisaoOtimizacao();
    const backdrop = $('routingOptimizationReviewBackdrop');
    if (backdrop) backdrop.style.display = 'flex';
  }

  function fecharRevisaoOtimizacao() {
    const backdrop = $('routingOptimizationReviewBackdrop');
    if (backdrop) backdrop.style.display = 'none';
    if ($('routingRefinePanel')) $('routingRefinePanel').style.display = 'none'; document.querySelector('.routing-review-card')?.classList.remove('is-refining');
  }

  async function confirmarRevisaoOtimizacao() {
    if (!rotaAtual) return;
    rotaAtual.confirmadaEm = Date.now();
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    fecharRevisaoOtimizacao();
    renderizarTudo({ fit: true });
    notificar('Rota confirmada. Você pode iniciar a navegação ou abrir a Bipagem.');
  }

  function alternarRefino() {
    const panel = $('routingRefinePanel');
    if (!panel) return;
    const abrir = panel.style.display === 'none'; panel.style.display = abrir ? 'grid' : 'none'; panel.closest('.routing-review-card')?.classList.toggle('is-refining', abrir);
  }


  function paradaFinalizada(p) {
    return !!p && ['entregue', 'concluida', 'nao_entregue'].includes(String(p.statusEntrega || ''));
  }

  function atualizarBotoesRefino() {
    const temRota = !!rotaAtual?.geometria;
    const historico = Array.isArray(rotaAtual?.historicoRefino) ? rotaAtual.historicoRefino : [];
    if ($('routingRefineAutoBtn')) $('routingRefineAutoBtn').disabled = !rotaAtual?.paradas?.length;
    if ($('routingRefineInvertBtn')) $('routingRefineInvertBtn').disabled = !temRota;
    if ($('routingRefineDrawBtn')) $('routingRefineDrawBtn').disabled = !temRota;
    if ($('routingRefineUndoBtn')) $('routingRefineUndoBtn').disabled = !historico.length;
    if ($('routingDrawUndoBtn')) $('routingDrawUndoBtn').disabled = !historico.length;
  }

  function atualizarIndicesOrdem() {
    if (!rotaAtual) return;
    const byId = new Map((rotaAtual.paradas || []).map(p => [String(p.id), p]));
    (rotaAtual.ordem || []).forEach((id, index) => {
      const p = byId.get(String(id));
      if (p) p.ordemOtimizada = index + 1;
    });
  }

  function reconstruirComPendentes(novaOrdemPendentes) {
    if (!rotaAtual) return [];
    const byId = new Map((rotaAtual.paradas || []).map(p => [String(p.id), p]));
    const fila = [...novaOrdemPendentes].map(String);
    let cursor = 0;
    return (rotaAtual.ordem || []).map(id => {
      const p = byId.get(String(id));
      if (paradaFinalizada(p)) return String(id);
      return fila[cursor++] || String(id);
    });
  }

  function snapshotRefino(tipo) {
    return { tipo: String(tipo || 'manual'), em: Date.now(), ordem: [...(rotaAtual?.ordem || [])] };
  }

  async function recalcularAposRefino(tipo, mensagem, opcoes) {
    if (!rotaAtual) return false;
    const antes = opcoes?.rollback ? clone(opcoes.rollback) : clone(rotaAtual);
    try {
      mostrarProcessamento('Atualizando sua rota', 'Recalculando o trajeto pelas ruas sem perder o progresso das entregas.');
      atualizarIndicesOrdem();
      const route = await global.PacoteEMatoServicoRota.calcularRotaPelasRuas(rotaAtual);
      const feature = route.feature;
      rotaAtual.geometria = feature.geometry;
      rotaAtual.distanciaTotalMetros = Number(feature.properties?.distance || 0);
      rotaAtual.duracaoDirecaoSegundos = Number(feature.properties?.time || 0);
      rotaAtual.pernas = Array.isArray(feature.properties?.legs) ? feature.properties.legs : [];
      rotaAtual.instrucoes = global.PacoteEMatoServicoRota.extrairInstrucoes(feature);
      const pendentes = rotaAtual.paradas.filter(p => !paradaFinalizada(p)).length;
      rotaAtual.duracaoParadasSegundos = pendentes * Number(rotaAtual.tempoParadaSegundos || 0);
      rotaAtual.duracaoTotalSegundos = rotaAtual.duracaoDirecaoSegundos + rotaAtual.duracaoParadasSegundos;
      rotaAtual.horarioTerminoEstimado = Date.now() + rotaAtual.duracaoTotalSegundos * 1000;
      rotaAtual.rotaOtimizada = true;
      rotaAtual.tipoRefino = tipo || 'manual';
      rotaAtual.otimizadoEm = Date.now();
      rotaAtual.confirmadaEm = null;
      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      renderizarTudo({ fit: true });
      atualizarBotoesRefino();
      if (opcoes?.abrirRevisao !== false) abrirRevisaoOtimizacao();
      if (mensagem) notificar(mensagem);
      return true;
    } catch (erro) {
      rotaAtual = antes;
      aplicarRotaNoState();
      renderizarTudo({ fit: true });
      notificar(erro?.message || 'Não foi possível recalcular a rota depois da alteração. A ordem anterior foi restaurada.');
      return false;
    } finally {
      esconderProcessamento();
    }
  }

  async function aplicarOrdemRefinada(novaOrdem, tipo, mensagem, opcoes) {
    if (!rotaAtual || !Array.isArray(novaOrdem) || novaOrdem.length !== rotaAtual.ordem.length) return false;
    const rollback = clone(rotaAtual);
    const idsAtuais = new Set((rotaAtual.ordem || []).map(String));
    if (novaOrdem.some(id => !idsAtuais.has(String(id)))) return false;
    if (opcoes?.registrarHistorico !== false) {
      const historico = Array.isArray(rotaAtual.historicoRefino) ? [...rotaAtual.historicoRefino] : [];
      historico.push(snapshotRefino(tipo));
      rotaAtual.historicoRefino = historico.slice(-8);
    }
    rotaAtual.ordem = novaOrdem.map(String);
    return recalcularAposRefino(tipo, mensagem, Object.assign({}, opcoes || {}, { rollback }));
  }

  async function desfazerUltimoRefino() {
    if (!rotaAtual) return;
    const rollback = clone(rotaAtual);
    fecharRevisaoOtimizacao();
    const historico = Array.isArray(rotaAtual.historicoRefino) ? [...rotaAtual.historicoRefino] : [];
    const ultimo = historico.pop();
    if (!ultimo?.ordem?.length) return notificar('Não há uma alteração manual para desfazer.');
    const ordemAntes = [...rotaAtual.ordem];
    rotaAtual.historicoRefino = historico;
    rotaAtual.ordem = ultimo.ordem.map(String);
    const ok = await recalcularAposRefino('desfazer', 'Última alteração de ordem desfeita.', { abrirRevisao: true, rollback });
    if (!ok) {
      rotaAtual.ordem = ordemAntes;
      rotaAtual.historicoRefino = [...historico, ultimo];
    }
  }

  async function otimizarAutomaticamenteRefino() {
    if (!rotaAtual) return;
    rotaAtual.preferenciaRota = 'short';
    if ($('routingRefinePanel')) $('routingRefinePanel').style.display = 'none';
    fecharRevisaoOtimizacao();
    await otimizarRota({ refinamento: true });
  }

  function atualizarToolbarDesenho(detail) {
    const count = Number(detail?.count ?? global.PacoteEMatoMapa?.obterSelecaoDesenho?.().length ?? 0);
    if ($('routingDrawCount')) $('routingDrawCount').textContent = `${count} ${count === 1 ? 'parada selecionada' : 'paradas selecionadas'}`;
    ['routingDrawNextGroupBtn','routingDrawEndGroupBtn'].forEach(id => { if ($(id)) $(id).disabled = count < 1; });
    if ($('routingDrawSingleNextBtn')) $('routingDrawSingleNextBtn').disabled = count !== 1;
    const mode = detail?.mode || 'draw';
    if ($('routingDrawInteractionBtn')) $('routingDrawInteractionBtn').textContent = mode === 'draw' ? 'Mover mapa' : 'Voltar a desenhar';
    atualizarBotoesRefino();
  }

  function iniciarRefinoDesenho() {
    if (!rotaAtual?.geometria) return notificar('Calcule a rota antes de organizar pelo mapa.');
    const localizadasPendentes = rotaAtual.paradas.filter(p => !paradaFinalizada(p) && paradaLocalizada(p));
    if (!localizadasPendentes.length) return notificar('Não há paradas pendentes com coordenadas válidas para selecionar.');
    fecharRevisaoOtimizacao();
    fecharMenuAcoes();
    estadoPainelAntesDesenho = estadoPainel;
    definirEstadoPainel('collapsed');
    $('routingWorkspace')?.classList.add('is-draw-mode');
    if ($('routingDrawToolbar')) $('routingDrawToolbar').style.display = 'block';
    global.PacoteEMatoMapa?.iniciarSelecaoDesenho?.({ ids: [], mode: 'draw' });
    atualizarToolbarDesenho({ count: 0, mode: 'draw' });
    setTimeout(() => global.PacoteEMatoMapa?.renderizar?.(), 60);
  }

  function cancelarRefinoDesenho(opcoes) {
    global.PacoteEMatoMapa?.encerrarSelecaoDesenho?.({ limpar: true });
    $('routingWorkspace')?.classList.remove('is-draw-mode');
    if ($('routingDrawToolbar')) $('routingDrawToolbar').style.display = 'none';
    if (estadoPainelAntesDesenho && opcoes?.restaurarPainel !== false) definirEstadoPainel(estadoPainelAntesDesenho);
    estadoPainelAntesDesenho = null;
    if (opcoes?.reabrir !== false && rotaAtual?.geometria) abrirRevisaoOtimizacao();
  }

  async function aplicarSelecaoDesenho(destino) {
    if (!rotaAtual) return;
    const selecionados = new Set((global.PacoteEMatoMapa?.obterSelecaoDesenho?.() || []).map(String));
    const byId = new Map((rotaAtual.paradas || []).map(p => [String(p.id), p]));
    const pendentes = (rotaAtual.ordem || []).map(String).filter(id => !paradaFinalizada(byId.get(id)));
    const grupo = pendentes.filter(id => selecionados.has(id));
    if (!grupo.length) return notificar('Selecione pelo menos uma parada no mapa.');
    if (destino === 'proxima' && grupo.length !== 1) return notificar('Para definir uma única próxima parada, selecione somente um marcador.');
    const demais = pendentes.filter(id => !selecionados.has(id));
    const novaPendentes = destino === 'fim' ? [...demais, ...grupo] : [...grupo, ...demais];
    const novaOrdem = reconstruirComPendentes(novaPendentes);
    const texto = destino === 'fim'
      ? `${grupo.length} parada(s) foram movidas para o fim das pendentes.`
      : destino === 'proxima'
        ? 'A parada selecionada agora é a próxima pendente.'
        : `${grupo.length} parada(s) foram colocadas antes das demais pendentes.`;
    const ok = await aplicarOrdemRefinada(novaOrdem, `desenho_${destino}`, texto, { abrirRevisao: false });
    if (ok) {
      cancelarRefinoDesenho({ reabrir: false });
      abrirRevisaoOtimizacao();
    }
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
    s.preferenciaRota = rotaAtual.preferenciaRota || 'short';
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
    estadoPainel = ['expanded','intermediate','collapsed'].includes(estado) ? estado : 'collapsed';
    root.classList.toggle('sheet-expanded', estadoPainel === 'expanded');
    root.classList.toggle('sheet-intermediate', estadoPainel === 'intermediate');
    root.classList.toggle('sheet-collapsed', estadoPainel === 'collapsed');
    try{sessionStorage.setItem('pemato_route_sheet',estadoPainel);}catch(_){}
    if (global.appState?.ui) global.appState.ui.painelRoteirizacao = estadoPainel;
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
    // O menu bloqueia o scroll somente enquanto está aberto. Manter overflow:hidden
    // depois de fechá-lo travava a tela Início em alguns navegadores móveis.
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  }

  function atualizarDisponibilidadeAcoes() {
    const serviceReady = workerConfigurado();
    document.querySelectorAll('.routing-service-action').forEach(el => { el.style.display = serviceReady ? '' : 'none'; });
    const note = $('routingServiceDeferredNote');
    if (note) note.style.display = serviceReady ? 'none' : 'block';
    const routeReady = !!rotaAtual?.geometria;
    document.querySelectorAll('.routing-route-ready-action').forEach(el => { el.style.display = routeReady ? '' : 'none'; });
    if ($('routingInvertBtn')) $('routingInvertBtn').style.display = routeReady ? '' : 'none';
    const mainOptimize = $('routingMainOptimizeBtn');
    if (mainOptimize) {
      mainOptimize.disabled = !rotaAtual?.paradas?.length;
      mainOptimize.dataset.serviceReady = serviceReady ? 'true' : 'false';
      mainOptimize.title = serviceReady ? 'Otimizar a sequência pela rede viária' : 'Serviço seguro de otimização ainda não configurado';
    }
  }

  function atualizarAcaoPrincipal() {
    const btn = $('routingPrimaryActionBtn');
    const empty = $('routingEmptyState');
    const total = rotaAtual?.paradas?.length || 0;
    if (empty) empty.style.display = total ? 'none' : 'flex';
    const primaryGrid = document.querySelector('.routing-primary-grid');
    if (primaryGrid) primaryGrid.style.display = rotaAtual?.geometria ? 'none' : 'grid';
    if (!btn) return;
    if (rotaAtual?.geometria) {
      btn.textContent = 'Iniciar rota';
      btn.dataset.action = 'iniciar';
      btn.style.display = '';
    } else {
      btn.textContent = '';
      btn.dataset.action = '';
      btn.style.display = 'none';
    }
  }

  function executarAcaoPrincipal() {
    const acao = $('routingPrimaryActionBtn')?.dataset.action || '';
    if (acao === 'importar') return $('routingXlsxInput')?.click();
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
      const estados=['collapsed','intermediate','expanded'];
      const indice=estados.indexOf(estadoPainel);
      definirEstadoPainel(estados[Math.max(0,Math.min(2,indice+(delta<0?1:-1)))]);
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
    const concluidas = rotaAtual.paradas.filter(p => ['entregue','concluida'].includes(p.statusEntrega)).length;
    const naoEntregues = rotaAtual.paradas.filter(p => p.statusEntrega === 'nao_entregue').length;
    const pendentes = Math.max(0, total - concluidas - naoEntregues);
    const calculada = !!rotaAtual.geometria && Number.isFinite(Number(rotaAtual.distanciaTotalMetros));
    if ($('routeMetricStops')) $('routeMetricStops').textContent = String(total);
    if ($('routeMetricDelivered')) $('routeMetricDelivered').textContent = String(concluidas);
    if ($('routeMetricPending')) $('routeMetricPending').textContent = String(pendentes);
    if ($('routeMetricDistance')) $('routeMetricDistance').textContent = calculada ? formatarDistancia(rotaAtual.distanciaTotalMetros) : 'Aguardando cálculo';
    if ($('routeMetricDrive')) $('routeMetricDrive').textContent = calculada ? formatarTempo(rotaAtual.duracaoDirecaoSegundos) : 'Aguardando cálculo';
    if ($('routeMetricStopTime')) $('routeMetricStopTime').textContent = calculada ? formatarTempo(rotaAtual.duracaoParadasSegundos) : 'Aguardando cálculo';
    if ($('routeMetricTotal')) $('routeMetricTotal').textContent = calculada ? formatarTempo(rotaAtual.duracaoTotalSegundos) : 'Aguardando cálculo';
    if ($('routeMetricEnd')) $('routeMetricEnd').textContent = calculada ? horaLocal(rotaAtual.horarioTerminoEstimado) : 'Aguardando cálculo';
    if ($('routingEtaChip')) $('routingEtaChip').style.display = calculada ? 'grid' : 'none';
    if ($('routingEtaTime')) $('routingEtaTime').textContent = calculada ? horaLocal(rotaAtual.horarioTerminoEstimado) : '—';
    if ($('routingEtaRemaining')) $('routingEtaRemaining').textContent = calculada ? `aprox. ${formatarTempo(rotaAtual.duracaoTotalSegundos)} restantes` : 'Calculando previsão';
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

  function chaveEnderecoMultiplo(p) {
    const norm = v => String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\b(rua|r\.|avenida|av\.|av|travessa|tv\.|estrada|rodovia)\b/g,'').replace(/[^a-z0-9]+/g,' ').trim();
    const numero = String(p?.numero || '').trim() || (String(p?.enderecoOriginal || '').match(/,?\s+(\d+[a-z]?)\b/i)?.[1] || '');
    const log = p?.logradouro || String(p?.enderecoOriginal || '').split(/,\s*\d/)[0] || '';
    return `${norm(log)}|${norm(numero)}`;
  }
  function contagemMultiplos() {
    const mapa = new Map();
    (rotaAtual?.paradas || []).forEach(p => { const k=chaveEnderecoMultiplo(p); if(k && !k.endsWith('|')) mapa.set(k,(mapa.get(k)||0)+1); });
    return mapa;
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
    const multiplos = contagemMultiplos();
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
      const qtdMesmoEndereco = multiplos.get(chaveEnderecoMultiplo(p)) || 1;
      address.textContent = `${p.enderecoOriginal || 'Endereço não informado'}${qtdMesmoEndereco > 1 ? ` · ${qtdMesmoEndereco}x` : ''}`;
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
    const qtdMesmoEndereco = contagemMultiplos().get(chaveEnderecoMultiplo(p)) || 1;
    if ($('routingSelectedStopAddress')) $('routingSelectedStopAddress').textContent = `${p.enderecoOriginal || 'Endereço não informado'}${qtdMesmoEndereco > 1 ? ` · ${qtdMesmoEndereco}x` : ''}`;
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
    atualizarBotoesRefino();
    global.PacoteEMatoLocalizacaoAtual?.iniciarAutomaticamente?.().then(() => global.PacoteEMatoMapa?.renderizar?.()).catch(() => {});
    return rotaAtual;
  }

  function resumoLinha(row) {
    return (row || []).map(v => String(v ?? '').trim()).filter(Boolean).slice(0, 5).join(' | ');
  }

  function camposMapeamentoVisiveis() {
    const disponiveis = new Map(global.PacoteEMatoImportacaoXLSX?.camposMapeaveis || []);
    const ordem = [
      ['atId','AT ID'], ['sequenceOrigem','Sequence'], ['stopOrigem','Stop'], ['pacote','SPX TN / código do pacote'],
      ['endereco','Destination Address / endereço completo'], ['bairro','Bairro'], ['cidade','City / cidade'], ['cep','Zipcode / Postal code'],
      ['latitude','Latitude'], ['longitude','Longitude'], ['logradouro','Logradouro / rua'], ['numero','Número'], ['estado','Estado / UF'],
      ['complemento','Complemento'], ['apartamento','Apartamento'], ['bloco','Bloco'], ['sala','Sala'], ['loja','Loja'], ['observacao','Observação'],
      ['pacotes','Outros códigos de pacotes'], ['id','ID da parada']
    ];
    return ordem.filter(([campo]) => disponiveis.has(campo)).map(([campo,label]) => [campo,label]);
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
    const fluxo = global.PacoteEMatoFluxoImportacao;
    fluxo?.iniciar?.(file.name, 'Lendo a planilha e identificando as colunas.');
    definirStatusImportacao('Lendo a planilha e identificando as colunas...', null);
    try {
      if (!global.PacoteEMatoImportacaoXLSX) throw new Error('Módulo de importação não carregado. Recarregue a página e tente novamente.');
      fluxo?.atualizarEtapa?.('Analisando o cabeçalho e os campos disponíveis.');
      const inspecao = await global.PacoteEMatoImportacaoXLSX.inspecionarArquivo(file);
      let opcoes = { inspecao };
      fluxo?.atualizarEtapa?.('A planilha foi lida. Confira a associação das colunas antes de continuar.');
      definirStatusImportacao('Confira AT ID, Sequence, Stop, SPX TN, endereço, bairro, cidade, CEP, latitude e longitude.', null);
      const mapeamento = await abrirMapeamentoImportacao(inspecao);
      if (!mapeamento) {
        fluxo?.fechar?.();
        definirStatusImportacao('Importação cancelada. Nenhuma parada foi alterada.', 'warning');
        return;
      }
      opcoes = Object.assign(opcoes, mapeamento);

      fluxo?.atualizarEtapa?.('Convertendo as linhas em paradas e preservando pacotes e observações.');
      const resultado = await global.PacoteEMatoImportacaoXLSX.lerArquivo(file, opcoes);
      const cfg = global.PacoteEMatoConfiguracoes?.obter?.() || {};
      const candidata = global.PacoteEMatoRotaStore.criarRota({
        nome: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
        origem: 'xlsx', status: 'planejamento', veiculo: cfg.veiculo || 'carro',
        modoRoteamento: global.PacoteEMatoRotaStore.modoPorVeiculo(cfg.veiculo || 'carro'),
        tempoParadaSegundos: Number(cfg.tempoParadaSegundos || 180), pontoInicial: cfg.pontoInicial || null,
        retornarAoInicio: cfg.retornarAoInicio === true, paradas: resultado.paradas, ordem: resultado.paradas.map(p => p.id),
        perfilImportacao: resultado.perfil || 'generico', arquivoOrigem: file.name
      });
      rotaImportacaoPendente = candidata;
      resultadoImportacaoPendente = resultado;
      fluxo?.atualizarEtapa?.('Preparando a conferência das paradas.');
      fluxo?.mostrarConferencia?.(rotaImportacaoPendente, resultado.erros || []);
      definirStatusImportacao(`${candidata.paradas.length} parada(s) lida(s). Revise os dados antes de substituir a rota ativa.`, resultado.erros?.length ? 'warning' : 'success');
    } catch (erro) {
      console.error('Pacote É Mato: falha na importação XLSX.', erro);
      fluxo?.mostrarErro?.(erro?.message || 'Não foi possível importar a planilha.', file.name);
      definirStatusImportacao(erro?.message || 'Não foi possível importar a planilha.', 'error');
      notificar(erro?.message || 'Falha ao importar planilha.');
    } finally {
      if ($('routingXlsxInput')) $('routingXlsxInput').value = '';
    }
  }

  async function confirmarImportacaoPendente() {
    if (!rotaImportacaoPendente) return;
    rotaAtual = rotaImportacaoPendente;
    rotaImportacaoPendente = null;
    const resultado = resultadoImportacaoPendente;
    resultadoImportacaoPendente = null;
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    global.PacoteEMatoFluxoImportacao?.fechar?.();
    renderizarTudo({ fit: true });
    definirEstadoPainel('expanded');
    const avisos = resultado?.erros?.length || 0;
    const jaLocalizadas = rotaAtual.paradas.filter(paradaLocalizada).length;
    if (jaLocalizadas === rotaAtual.paradas.length) {
      const origemCoords = rotaAtual.paradas.some(p => p.fonteCoordenada === 'xlsx') ? ' As coordenadas válidas da própria planilha foram preservadas.' : '';
      definirStatusImportacao(`${rotaAtual.paradas.length} parada(s) importada(s) e prontas para o mapa.${origemCoords} Confira a rota e toque em “Otimizar rota”.`, avisos ? 'warning' : 'success');
      return;
    }
    if (!workerConfigurado() || !global.PacoteEMatoGeocodificacao?.endpointAtual?.()) {
      definirStatusImportacao(`${rotaAtual.paradas.length} parada(s) importada(s); ${jaLocalizadas} já localizada(s). ${avisos ? `${avisos} linha(s) exigem revisão. ` : ''}As demais paradas foram preservadas para localização posterior.`, 'warning');
      return;
    }
    definirStatusImportacao(`${rotaAtual.paradas.length} parada(s) importada(s). Localizando apenas os endereços que ainda não possuem coordenadas...`, null);
    const resumoGeo = await geocodificarTodas({ silencioso: true });
    if (resumoGeo) {
      const problemas = resumoGeo.total - resumoGeo.ok;
      definirStatusImportacao(`${rotaAtual.paradas.length} parada(s) importada(s): ${resumoGeo.ok} localizada(s) e ${problemas} precisando de correção.`, problemas ? 'warning' : 'success');
    }
  }

  function cancelarImportacaoPendente() {
    rotaImportacaoPendente = null;
    resultadoImportacaoPendente = null;
    global.PacoteEMatoFluxoImportacao?.fechar?.();
    definirStatusImportacao('Importação cancelada. A rota ativa anterior foi preservada.', 'warning');
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
        throw new Error('Localização automática indisponível nesta versão sem o serviço externo. Nenhuma coordenada será inventada.');
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

  async function otimizarRota(opcoes) {
    if (!rotaAtual) return;
    if (!workerConfigurado() || !global.PacoteEMatoServicoRota?.endpoint?.('optimize')) {
      const msg = 'O serviço de otimização ainda não está disponível. As paradas foram preservadas.';
      definirStatusImportacao(msg, 'warning');
      return notificar(msg);
    }

    const botoes = [$('routingOptimizeBtn'), $('routingMainOptimizeBtn')].filter(Boolean);
    botoes.forEach(btn => { btn.disabled = true; });

    try {
      const unresolved = rotaAtual.paradas.filter(p => !paradaLocalizada(p));
      if (unresolved.length) throw new Error(`Localize ou corrija ${unresolved.length} parada(s) antes de otimizar.`);

      mostrarProcessamento('Preparando a rota', 'Conferindo ponto de partida e coordenadas.');
      await garantirPontoInicialParaOtimizacao();

      if (!rotaAtual.preferenciaRota) rotaAtual.preferenciaRota = 'short';
      atualizarProcessamento('Calculando melhor sequência', 'Otimização pela rede viária. Nenhuma distância em linha reta é usada.');
      const otimizada = await global.PacoteEMatoServicoRota.otimizar(rotaAtual);
      const orderIds = Array.isArray(otimizada.orderIds) ? otimizada.orderIds : [];
      if (!orderIds.length) throw new Error('O otimizador não retornou uma ordem de paradas.');

      const ordered = global.PacoteEMatoServicoRota.ordenarParadas(rotaAtual, orderIds);
      rotaAtual.ordem = ordered.map(p => p.id);

      atualizarProcessamento('Traçando percurso pelas ruas', 'Calculando a geometria completa, distância e tempo.');
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
      rotaAtual.duracaoPlanejadorSegundos = Number.isFinite(Number(otimizada.totalTime)) ? Number(otimizada.totalTime) : null;
      rotaAtual.horarioTerminoEstimado = Date.now() + rotaAtual.duracaoTotalSegundos * 1000;
      rotaAtual.rotaOtimizada = true;
      rotaAtual.confirmadaEm = null;
      rotaAtual.status = 'ativa';
      rotaAtual.otimizadoEm = Date.now();
      rotaAtual.resumoOtimizacao = {
        provider: otimizada.provider || 'geoapify-route-planner',
        preferencia: rotaAtual.preferenciaRota || 'short',
        pontoInicial: clone(rotaAtual.pontoInicial),
        distanciaPlanejadorMetros: Number(otimizada.distance || 0),
        tempoDirecaoPlanejadorSegundos: Number(otimizada.drivingTime || 0),
        totalPlanejadorSegundos: Number(otimizada.totalTime || 0)
      };

      await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
      renderizarTudo({ fit: true });
      definirStatusImportacao('Rota calculada. Confira a sequência antes de iniciar.', 'success');
      esconderProcessamento();
      abrirRevisaoOtimizacao();
      if (!opcoes?.refinamento) notificar('Rota calculada. Confira a sequência e confirme.');
    } catch (erro) {
      console.error(erro);
      esconderProcessamento();
      definirStatusImportacao(erro?.message || 'Não foi possível otimizar a rota.', 'error');
      notificar(erro?.message || 'Não foi possível otimizar a rota.');
    } finally {
      botoes.forEach(btn => { btn.disabled = false; });
    }
  }

  async function inverterRota() {
    if (!rotaAtual?.geometria) return notificar('Calcule a rota antes de inverter.');
    const byId = new Map((rotaAtual.paradas || []).map(p => [String(p.id), p]));
    const pendentes = (rotaAtual.ordem || []).map(String).filter(id => !paradaFinalizada(byId.get(id)));
    if (pendentes.length < 2) return notificar('Não há paradas pendentes suficientes para inverter.');
    if (rotaAtual.iniciadoEm && !global.confirm('Inverter somente as paradas pendentes? As entregas já registradas serão preservadas.')) return;
    fecharRevisaoOtimizacao();
    const novaOrdem = reconstruirComPendentes([...pendentes].reverse());
    await aplicarOrdemRefinada(novaOrdem, 'inverter', 'Ordem das paradas pendentes invertida.', { abrirRevisao: true });
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

  function abrirEditor(id, contexto = 'rota') {
    const modal = $('routeStopEditorModal');
    if (!modal) return;
    contextoEditor = contexto === 'conferencia' ? 'conferencia' : 'rota';
    const alvo = contextoEditor === 'conferencia' ? rotaImportacaoPendente : rotaAtual;
    modoEdicaoNovo = !id;
    stopEmEdicao = id ? alvo?.paradas.find(p => p.id === id) : null;
    const p = stopEmEdicao || {
      id: idNovo('manual'), logradouro: '', numero: '', complemento: '', apartamento: '', bloco: '', sala: '', loja: '',
      bairro: '', cidade: '', estado: '', cep: '', observacao: '', pacotes: [], statusEntrega: 'pendente', motivoNaoEntrega: '', observacaoNaoEntrega: ''
    };
    const fields = ['logradouro','numero','complemento','apartamento','bloco','sala','loja','bairro','cidade','estado','cep','observacao'];
    fields.forEach(key => { const el = $(`routeEdit_${key}`); if (el) el.value = p[key] || ''; });
    if ($('routeEdit_busca')) $('routeEdit_busca').value = p.enderecoOriginal || [p.logradouro,p.numero,p.complemento,p.observacao].filter(Boolean).join(' ');
    if ($('routeEditAdvanced')) $('routeEditAdvanced').open = !modoEdicaoNovo;
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
    contextoEditor = 'rota';
  }

  function pacotesDoCampo(texto) {
    const brs = String(texto || '').match(/BR[A-Za-z0-9]{8,25}/gi) || [];
    if (brs.length) return [...new Set(brs.map(v => v.toUpperCase()))];
    return [...new Set(String(texto || '').split(/[\n,;|]+/).map(v => v.trim()).filter(Boolean))];
  }

  async function salvarEditor() {
    const contextoSalvo = contextoEditor;
    const alvo = contextoSalvo === 'conferencia' ? rotaImportacaoPendente : rotaAtual;
    if (!alvo) return;
    const fields = ['logradouro','numero','complemento','apartamento','bloco','sala','loja','bairro','cidade','estado','cep','observacao'];
    const dados = {};
    fields.forEach(key => { dados[key] = String($(`routeEdit_${key}`)?.value || '').trim(); });
    const buscaLivre = String($('routeEdit_busca')?.value || '').trim();
    if (buscaLivre && !dados.logradouro) {
      const m = buscaLivre.match(/^(.+?)[,\s]+(\d+[A-Za-z]?)(?:\s+|,\s*)?(.*)$/);
      dados.logradouro = String(m?.[1] || buscaLivre).trim();
      dados.numero = dados.numero || String(m?.[2] || '').trim();
      dados.complemento = dados.complemento || String(m?.[3] || '').trim();
    }
    dados.pacotes = pacotesDoCampo($('routeEdit_pacotes')?.value || '');
    dados.statusEntrega = String($('routeEdit_status')?.value || 'pendente');
    dados.motivoNaoEntrega = dados.statusEntrega === 'nao_entregue' ? String($('routeEdit_motivo')?.value || '') : '';
    dados.observacaoNaoEntrega = dados.statusEntrega === 'nao_entregue' ? String($('routeEdit_observacaoNaoEntrega')?.value || '') : '';
    if (!dados.logradouro) return notificar('Informe o endereço/logradouro da parada.');

    const eraOtimizada = contextoSalvo === 'rota' && (alvo.rotaOtimizada === true || !!alvo.geometria);
    const eraNova = !stopEmEdicao;
    let p = stopEmEdicao;
    const enderecoAnterior = p?.enderecoOriginal || '';
    if (!p) {
      p = global.PacoteEMatoRotaStore.normalizarParada({
        id: idNovo('manual'), ordemOriginal: alvo.paradas.length + 1, origem: 'manual', ...dados
      }, alvo.paradas.length);
      alvo.paradas.push(p);
      alvo.ordem.push(p.id);
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
      if (contextoSalvo === 'rota') invalidarRotaCalculada();
    }
    fecharEditor();
    if (contextoSalvo === 'conferencia') {
      global.PacoteEMatoFluxoImportacao?.mostrarConferencia?.(alvo, resultadoImportacaoPendente?.erros || []);
      return;
    }
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

  function abrirEscolhaBipagem() {
    fecharMenuAcoes();
    const backdrop = $('routingBipagemChooserBackdrop');
    if (backdrop) backdrop.style.display = 'flex';
    const totalPacotes = (rotaAtual?.paradas || []).reduce((n, p) => n + (p.pacotes?.length || 0), 0);
    if ($('routingBipagemCurrentRouteBtn')) $('routingBipagemCurrentRouteBtn').disabled = !rotaAtual?.paradas?.length || !totalPacotes;
  }

  function fecharEscolhaBipagem() {
    const backdrop = $('routingBipagemChooserBackdrop');
    if (backdrop) backdrop.style.display = 'none';
  }

  async function abrirBipagemDaRota() {
    const totalPacotes = (rotaAtual?.paradas || []).reduce((n, p) => n + (p.pacotes?.length || 0), 0);
    if (!rotaAtual?.paradas?.length || !totalPacotes) return notificar('A rota atual ainda não possui códigos de pacote para bipar.');
    fecharEscolhaBipagem();
    await global.PacoteEMatoRotaStore?.salvarRota?.(rotaAtual, { ativa: true });
    await global.PacoteEMatoSessao?.persistirAgora?.({ motivo: 'abrir_bipagem_rota', paradaSelecionadaId: global.appState?.roteirizacao?.paradaSelecionadaId || null });
    await global.PacoteEMatoAppShell?.abrirModulo?.('bipagem', { usarRotaAtiva: true });
  }

  async function abrirBipagemPdf() {
    fecharEscolhaBipagem();
    await global.PacoteEMatoSessao?.persistirAgora?.({ motivo: 'abrir_bipagem_pdf' });
    await global.PacoteEMatoAppShell?.abrirModulo?.('bipagem', { usarRotaAtiva: false });
    setTimeout(() => $('pdfInput')?.click?.(), 120);
  }

  async function abrirNavegacao() {
    if (!rotaAtual?.geometria) return notificar('Calcule a rota pelas ruas antes de iniciar a operação.');
    rotaAtual.status = rotaAtual.status === 'concluida' ? 'concluida' : 'ativa';
    rotaAtual.iniciadoEm = rotaAtual.iniciadoEm || Date.now();
    const byId = new Map((rotaAtual.paradas || []).map(p => [String(p.id), p]));
    const selecionada = global.appState?.roteirizacao?.paradaSelecionadaId;
    const proxima = (selecionada && byId.get(String(selecionada)) && !paradaFinalizada(byId.get(String(selecionada))))
      ? byId.get(String(selecionada))
      : (rotaAtual.ordem || []).map(id => byId.get(String(id))).find(p => p && !paradaFinalizada(p));
    if (proxima) rotaAtual.paradaSelecionadaId = proxima.id;
    await global.PacoteEMatoRotaStore.salvarRota(rotaAtual, { ativa: true });
    await global.PacoteEMatoSessao?.persistirAgora?.({ motivo: 'iniciar_rota', paradaSelecionadaId: proxima?.id || null, navegacaoAtiva: true });
    await global.PacoteEMatoAppShell?.abrirModulo?.('navegacao');
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
    const abrirImportacao = () => {
      fecharMenuAcoes();
      const input = $('routingXlsxInput');
      if (!input) return definirStatusImportacao('Seletor de planilha não encontrado. Recarregue a página.', 'error');
      input.click();
    };
    $('routingImportBtn')?.addEventListener('click', abrirImportacao);
    $('routingMainImportBtn')?.addEventListener('click', abrirImportacao);
    $('routingEmptyImportBtn')?.addEventListener('click', abrirImportacao);
    $('routingXlsxInput')?.addEventListener('change', event => importarArquivo(event.target.files?.[0]));
    $('routingUseLegacyBtn')?.addEventListener('click', () => { fecharMenuAcoes(); usarRotaLegada(); });
    $('routingAddStopBtn')?.addEventListener('click', () => { fecharMenuAcoes(); abrirEditor(null); });
    $('routingGeocodeBtn')?.addEventListener('click', () => { fecharMenuAcoes(); geocodificarTodas(); });
    $('routingOptimizeBtn')?.addEventListener('click', () => { fecharMenuAcoes(); otimizarRota(); });
    $('routingMainOptimizeBtn')?.addEventListener('click', otimizarRota);
    $('routingInvertBtn')?.addEventListener('click', () => { fecharMenuAcoes(); inverterRota(); });
    $('routingExportPdfBtn')?.addEventListener('click', () => { fecharMenuAcoes(); exportarPdf(); });
    $('routingStartNavBtn')?.addEventListener('click', () => { fecharMenuAcoes(); abrirNavegacao(); });
    $('routingBipagemMenuBtn')?.addEventListener('click', abrirEscolhaBipagem);
    $('routingBipagemChooserClose')?.addEventListener('click', fecharEscolhaBipagem);
    $('routingBipagemChooserBackdrop')?.addEventListener('click', event => { if (event.target === $('routingBipagemChooserBackdrop')) fecharEscolhaBipagem(); });
    $('routingBipagemCurrentRouteBtn')?.addEventListener('click', abrirBipagemDaRota);
    $('routingBipagemPdfBtn')?.addEventListener('click', abrirBipagemPdf);
    $('routingReviewCloseBtn')?.addEventListener('click', fecharRevisaoOtimizacao);
    $('routingReviewConfirmBtn')?.addEventListener('click', confirmarRevisaoOtimizacao);
    $('routingReviewRefineBtn')?.addEventListener('click', alternarRefino);
    $('routingRefineAutoBtn')?.addEventListener('click', otimizarAutomaticamenteRefino);
    $('routingRefineInvertBtn')?.addEventListener('click', inverterRota);
    $('routingRefineDrawBtn')?.addEventListener('click', iniciarRefinoDesenho);
    $('routingRefineUndoBtn')?.addEventListener('click', desfazerUltimoRefino);
    $('routingOptimizationReviewBackdrop')?.addEventListener('click', event => { if (event.target === $('routingOptimizationReviewBackdrop')) fecharRevisaoOtimizacao(); });
    $('routingDrawCancelBtn')?.addEventListener('click', () => cancelarRefinoDesenho({ reabrir: true }));
    $('routingDrawClearBtn')?.addEventListener('click', () => global.PacoteEMatoMapa?.limparSelecaoDesenho?.());
    $('routingDrawUndoBtn')?.addEventListener('click', desfazerUltimoRefino);
    $('routingDrawNextGroupBtn')?.addEventListener('click', () => aplicarSelecaoDesenho('inicio'));
    $('routingDrawEndGroupBtn')?.addEventListener('click', () => aplicarSelecaoDesenho('fim'));
    $('routingDrawSingleNextBtn')?.addEventListener('click', () => aplicarSelecaoDesenho('proxima'));
    $('routingDrawInteractionBtn')?.addEventListener('click', () => {
      const atual = $('routingDrawInteractionBtn')?.textContent === 'Mover mapa' ? 'draw' : 'pan';
      const proximo = atual === 'draw' ? 'pan' : 'draw';
      global.PacoteEMatoMapa?.definirModoInteracaoSelecao?.(proximo);
    });
    $('routingOpenSettingsBtn')?.addEventListener('click', () => { fecharMenuAcoes(); global.PacoteEMatoAppShell?.abrirModulo?.('configuracoes'); });
    $('routingActionsBtn')?.addEventListener('click', abrirMenuAcoes);
    $('routingRefineMenuBtn')?.addEventListener('click', () => { fecharMenuAcoes(); abrirRevisaoOtimizacao(); setTimeout(() => { const p=$('routingRefinePanel'); if(p){p.style.display='grid';p.closest('.routing-review-card')?.classList.add('is-refining');} }, 0); });
    $('routingMapSettingsBtn')?.addEventListener('click', () => global.PacoteEMatoAppShell?.abrirModulo?.('configuracoes'));
    $('routingActionsCloseBtn')?.addEventListener('click', fecharMenuAcoes);
    $('routingActionsBackdrop')?.addEventListener('click', event => { if (event.target === $('routingActionsBackdrop')) fecharMenuAcoes(); });
    $('routingSheetToggle')?.addEventListener('click', alternarPainel);
    $('routingPrimaryActionBtn')?.addEventListener('click', executarAcaoPrincipal);
    $('routingStopSearch')?.addEventListener('input', () => {
      if (global.appState?.ui) global.appState.ui.buscaParadas = String($('routingStopSearch')?.value || '');
      renderizarLista();
    });
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

    global.addEventListener('pemato:import:confirmar', () => confirmarImportacaoPendente());
    global.addEventListener('pemato:import:cancelar', cancelarImportacaoPendente);
    global.addEventListener('pemato:import:tentar-outro', () => $('routingXlsxInput')?.click());
    global.addEventListener('pemato:import:editar', event => { if (rotaImportacaoPendente && event.detail?.id) abrirEditor(event.detail.id, 'conferencia'); });
    global.addEventListener('pemato:import:adicionar', () => { if (rotaImportacaoPendente) abrirEditor(null, 'conferencia'); });

    global.addEventListener('pemato:map-selection-change', event => atualizarToolbarDesenho(event.detail || {}));
    global.addEventListener('pemato:config:update', event => aplicarConfiguracoesNaRota(event.detail));
    global.addEventListener('pemato:worker:update', () => { renderizarPreferencias(); atualizarDisponibilidadeAcoes(); atualizarAcaoPrincipal(); });
    global.addEventListener('pemato:geo:update', () => { renderizarResumo(); renderizarLista(); global.PacoteEMatoMapa?.renderizar(); });
    global.addEventListener('pemato:geo:progress', () => renderizarResumo());
    global.addEventListener('pemato:rota:salva', e => {
      if (e.detail?.rota?.id === rotaAtual?.id) global.PacoteEMatoAppShell?.atualizarInicio?.();
    });
    global.addEventListener('resize', () => {
      if (!ambienteMobile()) definirEstadoPainel('expanded');
      else if (!['expanded','intermediate','collapsed'].includes(estadoPainel)) definirEstadoPainel('collapsed');
      setTimeout(() => global.PacoteEMatoMapa?.renderizar?.(), 80);
    });
  }

  function iniciar() {
    bind();
    const buscaRestaurada = String(global.appState?.ui?.buscaParadas || '');
    if ($('routingStopSearch') && buscaRestaurada) $('routingStopSearch').value = buscaRestaurada;
    const painelRestaurado = global.appState?.ui?.painelRoteirizacao;
    definirEstadoPainel(ambienteMobile()
      ? (['expanded','intermediate','collapsed'].includes(painelRestaurado) ? painelRestaurado : estadoPainel)
      : 'expanded');
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
    abrirNavegacao,
    abrirBipagemDaRota,
    abrirEscolhaBipagem,
    abrirRevisaoOtimizacao,
    iniciarRefinoDesenho,
    aplicarSelecaoDesenho,
    cancelarRefinoDesenho,
    desfazerUltimoRefino
  });
})(window);
