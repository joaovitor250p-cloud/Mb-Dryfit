(function iniciarLocalizacaoAtualPacoteEMato(global) {
  'use strict';

  const FRESH_MS = 90 * 1000;
  const RETRY_MS = 45 * 1000;
  let ultimaTentativaEm = 0;
  let requisicaoAtual = null;
  let negadaNestaSessao = false;

  function state() { return global.appState?.roteirizacao || null; }
  function $(id) { return document.getElementById(id); }

  function coordenadaValida(lat, lon) {
    if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
    if (String(lat).trim() === '' || String(lon).trim() === '') return false;
    const a = Number(lat), o = Number(lon);
    return Number.isFinite(a) && a >= -90 && a <= 90 && Number.isFinite(o) && o >= -180 && o <= 180;
  }

  function segura() {
    if (global.isSecureContext) return true;
    const host = String(global.location?.hostname || '');
    return host === 'localhost' || host === '127.0.0.1';
  }

  function status(texto, tom) {
    const el = $('routingLocationStatus');
    if (!el) return;
    el.textContent = texto || '';
    el.hidden = !texto;
    if (tom) el.dataset.tone = tom; else delete el.dataset.tone;
  }

  function emitir(detail) {
    try { global.dispatchEvent(new CustomEvent('pemato:localizacao:update', { detail: detail || {} })); } catch (_) {}
  }

  function atualValida() {
    const atual = state()?.localizacaoAtual;
    return atual && coordenadaValida(atual.lat, atual.lon) ? atual : null;
  }

  function idade(atual) {
    return atual ? Math.max(0, Date.now() - Number(atual.capturadoEm || atual.timestamp || 0)) : Infinity;
  }

  async function permissao() {
    try {
      if (!navigator.permissions?.query) return 'desconhecida';
      const r = await navigator.permissions.query({ name: 'geolocation' });
      return String(r?.state || 'desconhecida');
    } catch (_) { return 'desconhecida'; }
  }

  function salvarPosicao(pos, opts) {
    const lat = pos?.coords?.latitude;
    const lon = pos?.coords?.longitude;
    if (!coordenadaValida(lat, lon)) throw new Error('O navegador retornou uma localização sem coordenadas válidas.');
    const s = state();
    if (!s) return null;
    s.localizacaoAtual = {
      lat: Number(lat),
      lon: Number(lon),
      accuracy: Number.isFinite(Number(pos.coords.accuracy)) ? Number(pos.coords.accuracy) : null,
      timestamp: Number(pos.timestamp || Date.now()),
      capturadoEm: Date.now(),
      desatualizada: false
    };
    s.localizacaoAtualStatus = 'ok';
    status('Localização atual disponível.', 'ok');
    emitir({ localizacao: s.localizacaoAtual, centralizar: opts?.centralizar === true });
    return s.localizacaoAtual;
  }

  function manterAnteriorComAviso(mensagem) {
    const s = state();
    const anterior = atualValida();
    if (anterior) {
      anterior.desatualizada = true;
      s.localizacaoAtualStatus = 'desatualizada';
      status(`${mensagem} Exibindo apenas a última localização desta sessão.`, 'warning');
      emitir({ localizacao: anterior, desatualizada: true });
      return anterior;
    }
    s && (s.localizacaoAtualStatus = 'erro');
    status(mensagem, 'warning');
    emitir({ erro: mensagem });
    return null;
  }

  function pedirPosicao(opts) {
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        pos => { try { resolve(salvarPosicao(pos, opts)); } catch (e) { resolve(manterAnteriorComAviso(e.message)); } },
        err => {
          const code = Number(err?.code || 0);
          if (code === 1) {
            negadaNestaSessao = true;
            if (state()) state().localizacaoAtualStatus = 'negada';
            status('Localização bloqueada. Autorize o acesso no navegador ou use o botão de localização quando quiser tentar novamente.', 'warning');
            emitir({ negada: true });
            return resolve(atualValida());
          }
          const msg = code === 3
            ? 'Tempo limite ao obter sua localização.'
            : 'Não foi possível obter sua localização atual.';
          resolve(manterAnteriorComAviso(msg));
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });
  }

  async function obter(opts) {
    const op = opts || {};
    const s = state();
    if (!s) return null;

    if (!segura()) {
      s.localizacaoAtualStatus = 'contexto_inseguro';
      status('A localização automática exige HTTPS. Use um endereço manual para o ponto de partida.', 'warning');
      return atualValida();
    }
    if (!navigator.geolocation) {
      s.localizacaoAtualStatus = 'indisponivel';
      status('Este navegador não oferece geolocalização. Use um endereço manual.', 'warning');
      return atualValida();
    }

    const atual = atualValida();
    if (!op.forcar && atual && idade(atual) <= FRESH_MS) {
      atual.desatualizada = false;
      s.localizacaoAtualStatus = 'ok';
      emitir({ localizacao: atual, centralizar: op.centralizar === true, cacheSessao: true });
      return atual;
    }

    if (!op.forcar && requisicaoAtual) return requisicaoAtual;
    if (!op.forcar && Date.now() - ultimaTentativaEm < RETRY_MS) return atual;

    const p = await permissao();
    if (p === 'denied' && !op.forcar) {
      negadaNestaSessao = true;
      s.localizacaoAtualStatus = 'negada';
      status('Localização bloqueada pelo navegador. Você pode continuar usando a rota e informar o ponto de partida manualmente.', 'warning');
      return atual;
    }
    if (negadaNestaSessao && !op.forcar) return atual;

    ultimaTentativaEm = Date.now();
    status(p === 'prompt' ? 'Aguardando permissão para usar sua localização...' : 'Atualizando sua localização...', null);
    requisicaoAtual = pedirPosicao(op).finally(() => { requisicaoAtual = null; });
    return requisicaoAtual;
  }

  function atualizarAutomaticamente() {
    return obter({ forcar: false, centralizar: false });
  }

  function atualizarAgora() {
    negadaNestaSessao = false;
    return obter({ forcar: true, centralizar: true });
  }

  function bind() {
    $('routingMyLocationBtn')?.addEventListener('click', atualizarAgora);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  global.PacoteEMatoLocalizacaoAtual = Object.freeze({
    atualizarAutomaticamente,
    atualizarAgora,
    obter,
    atualValida,
    coordenadaValida
  });
})(window);
