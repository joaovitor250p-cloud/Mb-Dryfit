(function iniciarSessaoOperacional(global) {
  'use strict';

  const PREFIX = 'pemato_sessao_operacional_v1';
  let restaurada = false;
  let ultimoSnapshot = null;
  let salvando = false;

  function usuario() {
    try { return String(localStorage.getItem('usuario_zap_salvo') || '').replace(/\D/g, '') || 'local'; }
    catch (_) { return 'local'; }
  }

  function chave() { return `${PREFIX}:${usuario()}`; }

  function lerLocal() {
    try {
      const bruto = localStorage.getItem(chave());
      if (!bruto) return null;
      const data = JSON.parse(bruto);
      return data && typeof data === 'object' ? data : null;
    } catch (_) { return null; }
  }

  function gravarLocal(data) {
    try { localStorage.setItem(chave(), JSON.stringify(data)); return true; }
    catch (_) { return false; }
  }

  function snapshot(extra) {
    const s = global.appState || {};
    const r = s.roteirizacao || {};
    const n = s.navegacao || {};
    const ui = s.ui || {};
    const rotaId = r.rotaAtivaId || null;
    return Object.assign({
      version: 1,
      usuario: usuario(),
      rotaAtivaId: rotaId,
      moduloAtual: (ui.moduloAtual === 'inicio' ? 'roteirizacao' : ui.moduloAtual) || document.body?.dataset?.pematoModule || 'roteirizacao',
      painelRoteirizacao: ui.painelRoteirizacao || 'collapsed',
      paradaSelecionadaId: n.ativa && n.paradaExibidaId ? n.paradaExibidaId : (r.paradaSelecionadaId || null),
      proximaParadaId: n.proximaParadaId || r.proximaParadaId || null,
      navegacaoAtiva: n.ativa === true,
      navegacaoProvider: n.provider || 'pacote_emato',
      navegacaoVozAtiva: n.vozAtiva !== false,
      navegacaoSeguirPosicao: n.seguirPosicao !== false,
      buscaParadas: String(ui.buscaParadas || ''),
      importacaoAberta: document.getElementById('routeImportFlow')?.classList?.contains('is-open') === true,
      atualizadoEm: Date.now(),
      ocultoEm: document.hidden ? Date.now() : null
    }, extra || {});
  }

  async function persistirAgora(extra) {
    if (salvando) return ultimoSnapshot;
    salvando = true;
    try {
      const data = snapshot(extra);
      gravarLocal(data);
      ultimoSnapshot = data;
      try { await global.PacoteEMatoRotaStore?.salvarMeta?.('sessao_operacional', data); } catch (_) {}
      return data;
    } finally { salvando = false; }
  }

  async function lerPersistida() {
    let data = lerLocal();
    try {
      const db = await global.PacoteEMatoRotaStore?.obterMeta?.('sessao_operacional');
      if (db && (!data || Number(db.atualizadoEm || 0) > Number(data.atualizadoEm || 0))) data = db;
    } catch (_) {}
    return data;
  }

  async function restaurar() {
    if (restaurada) return ultimoSnapshot;
    const data = await lerPersistida();
    restaurada = true;
    ultimoSnapshot = data;
    if (!data) return null;

    const rota = await global.PacoteEMatoRotaStore?.obterRotaAtiva?.();
    if (data.rotaAtivaId && rota && String(data.rotaAtivaId) !== String(rota.id)) return data;

    const s = global.appState || {};
    if (s.ui) {
      s.ui.moduloAtual = (data.moduloAtual === 'inicio' ? 'roteirizacao' : data.moduloAtual) || s.ui.moduloAtual || 'roteirizacao';
      s.ui.painelRoteirizacao = data.painelRoteirizacao || s.ui.painelRoteirizacao || 'collapsed';
      s.ui.buscaParadas = data.buscaParadas || '';
    }
    if (s.roteirizacao && rota) {
      if (data.paradaSelecionadaId && rota.paradas?.some(p => String(p.id) === String(data.paradaSelecionadaId))) {
        s.roteirizacao.paradaSelecionadaId = data.paradaSelecionadaId;
      }
      s.roteirizacao.proximaParadaId = data.proximaParadaId || s.roteirizacao.proximaParadaId || null;
    }
    if (s.navegacao) {
      s.navegacao.ativa = data.navegacaoAtiva === true && !!rota;
      s.navegacao.provider = data.navegacaoProvider || s.navegacao.provider;
      s.navegacao.vozAtiva = data.navegacaoVozAtiva !== false;
      s.navegacao.seguirPosicao = data.navegacaoSeguirPosicao !== false;
      s.navegacao.proximaParadaId = data.proximaParadaId || s.navegacao.proximaParadaId || null;
      s.navegacao.paradaExibidaId = data.paradaSelecionadaId || s.navegacao.paradaExibidaId || null;
    }
    return data;
  }

  function registrarCicloVida() {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) persistirAgora({ motivo: 'background' });
      else {
        // Retomar não reinicializa o aplicativo. Apenas notifica os módulos já montados.
        global.dispatchEvent(new CustomEvent('pemato:resume', { detail: ultimoSnapshot || lerLocal() }));
      }
    });
    global.addEventListener('pagehide', () => { persistirAgora({ motivo: 'pagehide' }); });
    global.addEventListener('pageshow', event => {
      if (event.persisted) global.dispatchEvent(new CustomEvent('pemato:resume', { detail: ultimoSnapshot || lerLocal() }));
    });
    global.addEventListener('focus', () => {
      if (!document.hidden) global.dispatchEvent(new CustomEvent('pemato:focus-return', { detail: ultimoSnapshot || lerLocal() }));
    });
  }

  registrarCicloVida();

  global.PacoteEMatoSessao = Object.freeze({
    snapshot,
    persistirAgora,
    restaurar,
    lerPersistida,
    lerLocal
  });
})(window);
