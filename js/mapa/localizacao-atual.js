(function iniciarLocalizacaoAtual(global) {
  'use strict';

  const MAX_IDADE_MS = 45000;
  let solicitacaoEmAndamento = null;
  let ultima = null;
  let bloqueada = false;

  function state() { return global.appState?.roteirizacao || null; }

  function contextoSeguro() {
    if (global.isSecureContext === true) return true;
    const host = String(global.location?.hostname || '');
    return global.location?.protocol === 'https:' || host === 'localhost' || host === '127.0.0.1';
  }

  function normalizarPosition(pos) {
    const lat = Number(pos?.coords?.latitude);
    const lon = Number(pos?.coords?.longitude);
    const accuracy = Number(pos?.coords?.accuracy);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return {
      lat,
      lon,
      accuracy: Number.isFinite(accuracy) ? accuracy : null,
      timestamp: Number(pos?.timestamp || Date.now()),
      capturadaEm: Date.now()
    };
  }

  function salvar(posicao, status) {
    const s = state();
    if (posicao) ultima = posicao;
    if (s) {
      s.localizacaoAtual = posicao || s.localizacaoAtual || null;
      s.localizacaoAtualStatus = status || (posicao ? 'ok' : 'indisponivel');
      s.localizacaoAtualAtualizadaEm = posicao?.capturadaEm || s.localizacaoAtualAtualizadaEm || null;
    }
    try {
      global.dispatchEvent(new CustomEvent('pemato:localizacao-atual', { detail: { posicao: posicao || null, status: status || 'indisponivel' } }));
    } catch (_) {}
  }

  function recente(posicao) {
    return !!posicao && Number.isFinite(Number(posicao.capturadaEm)) && (Date.now() - Number(posicao.capturadaEm)) <= MAX_IDADE_MS;
  }

  async function permissao() {
    try {
      if (!navigator.permissions?.query) return 'desconhecida';
      const p = await navigator.permissions.query({ name: 'geolocation' });
      return p?.state || 'desconhecida';
    } catch (_) { return 'desconhecida'; }
  }

  async function obter(opcoes) {
    const force = opcoes?.forcar === true;
    if (!force && recente(ultima)) return ultima;
    const s = state();
    if (!force && recente(s?.localizacaoAtual)) {
      ultima = s.localizacaoAtual;
      return ultima;
    }
    if (!contextoSeguro()) {
      salvar(null, 'contexto_inseguro');
      throw Object.assign(new Error('A localização exige HTTPS ou um contexto seguro.'), { code: 'CONTEXTO_INSEGURO' });
    }
    if (!navigator.geolocation) {
      salvar(null, 'indisponivel');
      throw Object.assign(new Error('Geolocalização não disponível neste navegador.'), { code: 'GEO_INDISPONIVEL' });
    }
    const p = await permissao();
    if (p === 'denied' || bloqueada) {
      bloqueada = true;
      salvar(null, 'negada');
      throw Object.assign(new Error('Permissão de localização bloqueada. Libere o acesso nas configurações do navegador para usar sua posição.'), { code: 'GEO_NEGADA' });
    }
    if (solicitacaoEmAndamento) return solicitacaoEmAndamento;

    solicitacaoEmAndamento = new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(pos => {
        const valor = normalizarPosition(pos);
        solicitacaoEmAndamento = null;
        if (!valor) {
          salvar(null, 'invalida');
          reject(Object.assign(new Error('O navegador retornou uma localização inválida.'), { code: 'GEO_INVALIDA' }));
          return;
        }
        salvar(valor, 'ok');
        resolve(valor);
      }, erro => {
        solicitacaoEmAndamento = null;
        const code = Number(erro?.code || 0);
        if (code === 1) bloqueada = true;
        const status = code === 1 ? 'negada' : (code === 3 ? 'timeout' : 'erro');
        salvar(null, status);
        const msg = code === 1
          ? 'Permissão de localização negada.'
          : code === 3 ? 'Tempo limite ao obter sua localização.' : (erro?.message || 'Não foi possível obter sua localização.');
        reject(Object.assign(new Error(msg), { code: `GEO_${status.toUpperCase()}` }));
      }, { enableHighAccuracy: true, maximumAge: 15000, timeout: 12000 });
    });
    return solicitacaoEmAndamento;
  }

  async function iniciarAutomaticamente() {
    const p = await permissao();
    if (p === 'denied') {
      bloqueada = true;
      salvar(null, 'negada');
      return null;
    }
    try { return await obter({ forcar: false }); }
    catch (erro) {
      console.info('Pacote É Mato: localização automática não disponível.', erro?.message || erro);
      return null;
    }
  }

  function ultimaValida() {
    const s = state();
    const pos = ultima || s?.localizacaoAtual || null;
    return pos && Number.isFinite(Number(pos.lat)) && Number.isFinite(Number(pos.lon)) ? pos : null;
  }

  global.PacoteEMatoLocalizacaoAtual = Object.freeze({ obter, iniciarAutomaticamente, ultimaValida, permissao, recente });
})(window);
