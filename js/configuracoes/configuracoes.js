(function iniciarConfiguracoes(global) {
  'use strict';

  const KEY = 'pemato_config_v2';
  const DEFAULTS = {
    navegacao: 'pacote_emato',
    veiculo: 'carro',
    tempoParadaSegundos: 180,
    pontoInicial: null,
    retornarAoInicio: false
  };

  function $(id) { return document.getElementById(id); }

  function obter() {
    try {
      const salvo = JSON.parse(localStorage.getItem(KEY) || '{}');
      return Object.assign({}, DEFAULTS, salvo && typeof salvo === 'object' ? salvo : {});
    } catch (_) { return Object.assign({}, DEFAULTS); }
  }

  function salvar(parcial) {
    const cfg = Object.assign(obter(), parcial || {});
    try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (_) {}
    renderizar();
    try { global.dispatchEvent(new CustomEvent('pemato:config:update', { detail: cfg })); } catch (_) {}
    return cfg;
  }

  function status(el, texto, tipo) {
    if (!el) return;
    el.textContent = texto || '';
    if (tipo) el.dataset.status = tipo;
    else delete el.dataset.status;
  }

  function descricaoPonto(p) {
    if (!p) return '';
    return String(p.descricao || p.endereco || '').trim();
  }

  function pontoValido(p) {
    if (!p || p.lat === null || p.lat === undefined || p.lon === null || p.lon === undefined) return false;
    if (String(p.lat).trim() === '' || String(p.lon).trim() === '') return false;
    const lat = Number(p.lat);
    const lon = Number(p.lon);
    return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180;
  }

  function renderizar() {
    const cfg = obter();
    if ($('settingsNavigation')) $('settingsNavigation').value = cfg.navegacao;
    if ($('settingsVehicle')) $('settingsVehicle').value = cfg.veiculo;
    if ($('settingsStopMinutes')) $('settingsStopMinutes').value = String(Math.round(Number(cfg.tempoParadaSegundos || 180) / 60));
    if ($('settingsReturnStart')) $('settingsReturnStart').checked = cfg.retornarAoInicio === true;

    const point = $('settingsStartPoint');
    if (point && document.activeElement !== point) point.value = descricaoPonto(cfg.pontoInicial);
    if (pontoValido(cfg.pontoInicial)) {
      status($('settingsStartStatus'), `Ponto validado: ${descricaoPonto(cfg.pontoInicial) || 'coordenada salva'}`, 'ok');
    } else {
      status($('settingsStartStatus'), 'Nenhum ponto de partida validado.', 'warning');
    }

    const worker = global.PacoteEMatoMapaConfig?.obterWorkerBaseUrl?.() || String(global.PEMATO_MAP_CONFIG?.workerBaseUrl || '');
    if ($('settingsWorkerUrl') && document.activeElement !== $('settingsWorkerUrl')) $('settingsWorkerUrl').value = worker;
    if (!worker && $('settingsGeocodeStartBtn')) {
      $('settingsGeocodeStartBtn').style.display = 'none';
      status($('settingsStartStatus'), 'Use sua localização atual. A validação de endereço dependerá do serviço externo em uma etapa futura.', 'warning');
    } else if ($('settingsGeocodeStartBtn')) {
      $('settingsGeocodeStartBtn').style.display = '';
    }
  }

  async function validarEnderecoPartida() {
    const input = $('settingsStartPoint');
    const texto = String(input?.value || '').trim();
    if (!texto) return status($('settingsStartStatus'), 'Informe um endereço antes de validar.', 'warning');
    const btn = $('settingsGeocodeStartBtn');
    if (btn) btn.disabled = true;
    status($('settingsStartStatus'), 'Validando endereço...', null);
    try {
      if (!global.PacoteEMatoGeocodificacao) throw new Error('Módulo de geocodificação não carregado.');
      const p = await global.PacoteEMatoGeocodificacao.geocodificarEnderecoLivre(texto);
      if (p.statusGeocodificacao === 'nao_configurado') throw new Error('Validação por endereço indisponível nesta versão sem o serviço externo. Use a localização atual.');
      if (p.statusGeocodificacao !== 'ok') throw new Error('O endereço não pôde ser localizado com confiança. Revise o endereço e tente novamente.');
      const pontoInicial = { tipo: 'endereco', descricao: texto, lat: p.latitude, lon: p.longitude, status: 'ok' };
      salvar({ pontoInicial });
      status($('settingsStartStatus'), `Ponto validado: ${texto}`, 'ok');
    } catch (erro) {
      status($('settingsStartStatus'), erro?.message || 'Falha ao validar o ponto de partida.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function usarGpsPartida() {
    if (!navigator.geolocation) return status($('settingsStartStatus'), 'Geolocalização não disponível neste navegador.', 'error');
    const btn = $('settingsUseGpsStartBtn');
    if (btn) btn.disabled = true;
    status($('settingsStartStatus'), 'Obtendo sua localização...', null);
    navigator.geolocation.getCurrentPosition(pos => {
      const pontoInicial = {
        tipo: 'gps',
        descricao: 'Minha localização',
        lat: Number(pos.coords.latitude),
        lon: Number(pos.coords.longitude),
        status: 'ok'
      };
      salvar({ pontoInicial });
      if ($('settingsStartPoint')) $('settingsStartPoint').value = pontoInicial.descricao;
      status($('settingsStartStatus'), 'Localização atual salva como ponto de partida.', 'ok');
      if (btn) btn.disabled = false;
    }, erro => {
      status($('settingsStartStatus'), erro?.message || 'Não foi possível acessar sua localização.', 'error');
      if (btn) btn.disabled = false;
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 });
  }

  function limparPonto() {
    salvar({ pontoInicial: null });
    if ($('settingsStartPoint')) $('settingsStartPoint').value = '';
    status($('settingsStartStatus'), 'Ponto de partida removido.', 'warning');
  }

  async function testarWorker() {
    const input = $('settingsWorkerUrl');
    const base = String(input?.value || '').trim().replace(/\/+$/, '');
    if (!base) return status($('settingsWorkerStatus'), 'Informe a URL do Worker.', 'warning');
    global.PacoteEMatoMapaConfig?.configurarWorkerBaseUrl?.(base);
    const btn = $('settingsWorkerTestBtn');
    if (btn) btn.disabled = true;
    status($('settingsWorkerStatus'), 'Testando conexão com o Worker...', null);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      const response = await fetch(`${base}/health`, { method: 'GET', credentials: 'omit', signal: controller.signal });
      clearTimeout(timer);
      let data = null;
      try { data = await response.json(); } catch (_) {}
      if (!response.ok || !data?.ok) throw new Error(data?.error || `Worker respondeu HTTP ${response.status}.`);
      if (data.providerConfigured === false) throw new Error('Worker publicado, mas o secret GEOAPIFY_API_KEY ainda não está configurado.');
      status($('settingsWorkerStatus'), 'Worker conectado e provedor de rota configurado.', 'ok');
    } catch (erro) {
      status($('settingsWorkerStatus'), erro?.name === 'AbortError' ? 'Tempo limite ao conectar ao Worker.' : (erro?.message || 'Não foi possível conectar ao Worker.'), 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function salvarFormulario() {
    const atual = obter();
    const navegacao = $('settingsNavigation')?.value || 'pacote_emato';
    const veiculo = $('settingsVehicle')?.value || 'carro';
    const tempoParadaSegundos = Math.max(0, Number($('settingsStopMinutes')?.value || 3) * 60);
    const retornarAoInicio = $('settingsReturnStart')?.checked === true;
    const textoPonto = String($('settingsStartPoint')?.value || '').trim();
    let pontoInicial = atual.pontoInicial;
    if (textoPonto !== descricaoPonto(atual.pontoInicial)) {
      // Endereço alterado não pode herdar silenciosamente coordenada antiga.
      pontoInicial = null;
      if (textoPonto) status($('settingsStartStatus'), 'Endereço alterado. Clique em “Validar endereço” antes de usar este ponto.', 'warning');
    }
    const workerField = $('settingsWorkerUrl');
    if (workerField) global.PacoteEMatoMapaConfig?.configurarWorkerBaseUrl?.(String(workerField.value || '').trim());
    salvar({ navegacao, veiculo, tempoParadaSegundos, retornarAoInicio, pontoInicial });
    if (typeof global.notificar === 'function') global.notificar('Configurações salvas e aplicadas à rota ativa.');
  }

  function bind() {
    $('settingsSaveBtn')?.addEventListener('click', salvarFormulario);
    $('settingsGeocodeStartBtn')?.addEventListener('click', validarEnderecoPartida);
    $('settingsUseGpsStartBtn')?.addEventListener('click', usarGpsPartida);
    $('settingsClearStartBtn')?.addEventListener('click', limparPonto);
    $('settingsWorkerTestBtn')?.addEventListener('click', testarWorker);
    $('settingsWorkerUrl')?.addEventListener('change', () => global.PacoteEMatoMapaConfig?.configurarWorkerBaseUrl?.($('settingsWorkerUrl')?.value || ''));
    renderizar();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  global.PacoteEMatoConfiguracoes = Object.freeze({ obter, salvar, renderizar, validarEnderecoPartida, testarWorker });
})(window);
