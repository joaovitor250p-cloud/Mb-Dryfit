(function iniciarAppShell(global) {
  'use strict';

  const CHAVE_UI = 'pemato_ui_resume_v1';
  let iniciando = true;
  const modulos = ['inicio', 'roteirizacao', 'bipagem', 'navegacao', 'historico', 'configuracoes'];

  function $(id) { return document.getElementById(id); }

  function idModulo(nome) {
    return {
      inicio: 'moduloInicio',
      roteirizacao: 'moduloRoteirizacao',
      bipagem: 'moduloBipagem',
      navegacao: 'moduloNavegacao',
      historico: 'moduloHistorico',
      configuracoes: 'moduloConfiguracoes'
    }[nome];
  }

  function fecharSidebar() {
    const sb = $('sidebar');
    const ov = $('overlay');
    sb?.classList.remove('active');
    if (ov) ov.style.display = 'none';
  }


  function liberarTravasVisuais() {
    try {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      ['modal-open','no-scroll','overflow-hidden','sheet-open'].forEach(cls => {
        document.body.classList.remove(cls);
        document.documentElement.classList.remove(cls);
      });
      ['routingActionsBackdrop','routeImportMappingModal','routingOptimizationReviewBackdrop','routeStopEditorModal','routeReoptDecisionModal','navCompletionBackdrop'].forEach(id => {
        const el = $(id);
        if (el) el.style.display = 'none';
      });
      const importFlow = $('routeImportFlow');
      if (importFlow) importFlow.classList.remove('is-open');
    } catch (_) {}
  }

  async function abrirModulo(nome) {
    if (!modulos.includes(nome)) nome = 'inicio';
    if(!iniciando && document.body.dataset.pematoModule===nome){fecharSidebar();return;}
    liberarTravasVisuais();
    const anterior = document.body.dataset.pematoModule || global.appState?.ui?.moduloAtual || 'inicio';
    if (anterior === 'navegacao' && nome !== 'navegacao') global.PacoteEMatoNavegacao?.pausar?.();
    document.body.dataset.pematoModule = nome;
    modulos.forEach(m => {
      const el = $(idModulo(m));
      if (el) el.style.display = m === nome ? '' : 'none';
      document.querySelectorAll(`[data-pemato-nav="${m}"]`).forEach(btn => btn.classList.toggle('active', m === nome));
    });
    if (global.appState?.ui) global.appState.ui.moduloAtual = nome;
    salvarEstadoUI();
    fecharSidebar();
    if (nome !== 'navegacao') liberarTravasVisuais();

    if (nome === 'roteirizacao') {
      await global.PacoteEMatoRoteirizacao?.carregarRotaAtiva?.();
      setTimeout(() => global.PacoteEMatoMapa?.renderizar({ fit: true }), 100);
    } else if (nome === 'bipagem') {
      await global.PacoteEMatoBipagemBridge?.prepararRotaAtivaParaBipagem?.({ iniciarScanner: true });
    } else if (nome === 'historico') {
      global.PacoteEMatoHistorico?.renderizar?.();
    } else if (nome === 'configuracoes') {
      global.PacoteEMatoConfiguracoes?.renderizar?.();
    } else if (nome === 'navegacao') {
      const rota = await global.PacoteEMatoRotaStore?.obterRotaAtiva?.();
      if (rota?.geometria) global.PacoteEMatoNavegacao?.iniciar?.(rota);
    } else if (nome === 'inicio') {
      atualizarInicio();
    }
  }

  function formatarDistancia(m) {
    const n = Number(m);
    return Number.isFinite(n) ? `${(n / 1000).toFixed(1).replace('.', ',')} km` : '—';
  }
  function formatarTempo(s) {
    const min = Math.max(0, Math.round(Number(s || 0) / 60));
    if (!Number.isFinite(min)) return '—';
    return min >= 60 ? `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}` : `${min} min`;
  }

  async function atualizarInicio() {
    const rota = await global.PacoteEMatoRotaStore?.obterRotaAtiva?.();
    const card = $('homeActiveRouteCard');
    const empty = $('homeNoRoute');
    if (!rota) {
      if (card) card.style.display = 'none';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (card) card.style.display = 'block';
    if (empty) empty.style.display = 'none';
    if ($('homeRouteName')) $('homeRouteName').textContent = rota.nome || 'Rota ativa';
    if ($('homeRouteStatus')) $('homeRouteStatus').textContent = rota.rotaOtimizada ? 'Otimizada' : 'Em planejamento';
    if ($('homeRouteStops')) $('homeRouteStops').textContent = String(rota.paradas.length);
    if ($('homeRouteDistance')) $('homeRouteDistance').textContent = formatarDistancia(rota.distanciaTotalMetros);
    if ($('homeRouteTime')) $('homeRouteTime').textContent = formatarTempo(rota.duracaoTotalSegundos);
    const delivered = rota.paradas.filter(p => ['entregue','concluida'].includes(p.statusEntrega)).length;
    if ($('homeRouteProgress')) $('homeRouteProgress').textContent = `${delivered} de ${rota.paradas.length}`;
    const packages = rota.paradas.reduce((sum, p) => sum + (p.pacotes?.length || 0), 0);
    if ($('homeRoutePackages')) $('homeRoutePackages').textContent = String(packages);
  }

  function salvarEstadoUI(){
    try{const dados={modulo:document.body.dataset.pematoModule||'inicio',painel:document.getElementById('routingBottomSheet')?.dataset?.state||null,atualizadoEm:Date.now()};sessionStorage.setItem(CHAVE_UI,JSON.stringify(dados));localStorage.setItem(CHAVE_UI,JSON.stringify(dados));}catch(_){}
  }
  function recuperarEstadoUI(){
    try{const s=sessionStorage.getItem(CHAVE_UI)||localStorage.getItem(CHAVE_UI);const d=JSON.parse(s||'null');return d&&modulos.includes(d.modulo)?d.modulo:null;}catch(_){return null;}
  }
  function bind() {
    document.querySelectorAll('[data-pemato-nav]').forEach(btn => {
      btn.addEventListener('click', () => abrirModulo(btn.dataset.pematoNav));
    });
    $('homeOpenRouting')?.addEventListener('click', () => abrirModulo('roteirizacao'));
    $('homeOpenScanning')?.addEventListener('click', () => abrirModulo('bipagem'));
    $('homeOpenNavigation')?.addEventListener('click', () => abrirModulo('navegacao'));
    global.addEventListener('pemato:rota:salva', atualizarInicio);
    global.addEventListener('pemato:rota:ativa-limpa', atualizarInicio);
    // pageshow/focus/visibilitychange não reinicializam o aplicativo.
    // Se o sistema encerrar o processo, a última seção será recuperada somente após o login existente.
    global.addEventListener('pagehide',salvarEstadoUI);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)salvarEstadoUI();});
    global.addEventListener('pageshow',e=>{if(e.persisted){const m=document.body.dataset.pematoModule;if(m==='navegacao')global.PacoteEMatoNavegacao?.retomar?.();}});
    const restaurado=recuperarEstadoUI();
    abrirModulo(restaurado||global.appState?.ui?.moduloAtual||'inicio').finally(()=>{iniciando=false;});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  global.PacoteEMatoAppShell = Object.freeze({ abrirModulo, atualizarInicio, fecharSidebar, liberarTravasVisuais });
})(window);
