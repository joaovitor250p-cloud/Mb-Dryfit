(function iniciarMapaRoteirizacao(global) {
  'use strict';

  let mapa = null;
  let pronto = false;
  let marcadores = new Map();
  let marcadorPartida = null;
  let marcadorLocalizacaoAtual = null;
  let fitFeito = false;
  let loadTimer = null;
  let resizeObserver = null;
  let fallbackBaseAtivo = false;
  const SOURCE_ROUTE = 'pemato-route-line';
  const LAYER_ROUTE = 'pemato-route-line-layer';
  const LAYER_ROUTE_CASE = 'pemato-route-line-case';

  function cfg() { return global.PEMATO_MAP_CONFIG || {}; }
  function state() { return global.appState?.roteirizacao || null; }
  function paradas() { return Array.isArray(state()?.paradas) ? state().paradas : []; }

  function valorCoordenadaValido(v, minimo, maximo) {
    if (v === null || v === undefined || String(v).trim() === '') return false;
    const n = Number(v);
    return Number.isFinite(n) && n >= minimo && n <= maximo;
  }

  function coordenadaValida(p) {
    return valorCoordenadaValido(p?.latitude, -90, 90) && valorCoordenadaValido(p?.longitude, -180, 180);
  }

  function pontoValido(p) {
    return valorCoordenadaValido(p?.lat, -90, 90) && valorCoordenadaValido(p?.lon, -180, 180);
  }


  function geometriaValida(geometry) {
    if (!geometry || geometry.type !== 'LineString' || !Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2) return false;
    return geometry.coordinates.every(c => Array.isArray(c) && c.length >= 2 && valorCoordenadaValido(c[1], -90, 90) && valorCoordenadaValido(c[0], -180, 180));
  }

  function ordem(p) {
    return Number(p?.ordemOtimizada || p?.ordemOriginal || 0) || '';
  }

  function statusEntrega(p) {
    if (p?.statusEntrega === 'nao_entregue') return 'nao-entregue';
    if (['entregue', 'concluida'].includes(p?.statusEntrega)) return 'concluida';
    if (Number(p?.quantidadeBipada || 0) > 0) return 'parcial';
    return 'pendente';
  }

  function mostrarFallback(texto) {
    const el = document.getElementById('mapaRoteirizacaoFallback');
    if (!el) return;
    el.textContent = texto || 'Mapa indisponível.';
    el.style.display = 'flex';
    if (state()) state().mapaDisponivel = false;
  }

  function ocultarFallback() {
    const el = document.getElementById('mapaRoteirizacaoFallback');
    if (el) el.style.display = 'none';
  }

  function removerCamadas3D() {
    if (!mapa || !pronto) return;
    try {
      const layers = mapa.getStyle()?.layers || [];
      layers.filter(layer => layer.type === 'fill-extrusion').forEach(layer => {
        try { mapa.setLayoutProperty(layer.id, 'visibility', 'none'); } catch (_) {}
      });
    } catch (_) {}
  }

  function observarTamanho(container) {
    if (resizeObserver || typeof ResizeObserver !== 'function' || !container) return;
    resizeObserver = new ResizeObserver(() => {
      if (!mapa) return;
      try { mapa.resize(); } catch (_) {}
    });
    try { resizeObserver.observe(container); } catch (_) {}
  }

  function ativarMapaBaseFallback() {
    if (!mapa || fallbackBaseAtivo || !cfg().fallbackMapStyle) return false;
    fallbackBaseAtivo = true;
    try {
      mapa.setStyle(cfg().fallbackMapStyle);
      ocultarFallback();
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        if (!pronto) mostrarFallback('O mapa base não respondeu. Verifique sua conexão. A lista de paradas continua disponível.');
      }, 10000);
      return true;
    } catch (erro) {
      console.warn('Pacote É Mato: não foi possível ativar o mapa base de contingência.', erro);
      return false;
    }
  }

  function garantirMapa() {
    if (mapa) return mapa;
    const container = document.getElementById('mapaRoteirizacao');
    if (!container) return null;
    observarTamanho(container);
    if (!global.maplibregl) {
      mostrarFallback('A biblioteca do mapa não carregou. A lista de paradas continua disponível.');
      return null;
    }

    try {
      mapa = new global.maplibregl.Map({
        container,
        style: cfg().mapStyleUrl,
        center: cfg().initialCenter || [-51.9253, -14.2350],
        zoom: Number(cfg().initialZoom || 3.4),
        pitch: 0,
        bearing: 0,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        attributionControl: true,
        fadeDuration: 120
      });
      mapa.touchZoomRotate.disableRotation();
      mapa.addControl(new global.maplibregl.NavigationControl({ showCompass: false }), 'top-right');

      const mapaPronto = () => {
        pronto = true;
        clearTimeout(loadTimer);
        if (state()) state().mapaDisponivel = true;
        ocultarFallback();
        removerCamadas3D();
        garantirCamadaRota();
        try { mapa.resize(); } catch (_) {}
        renderizar({ fit: !fitFeito });
      };

      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => {
        if (!pronto && !ativarMapaBaseFallback()) {
          mostrarFallback('O mapa base não respondeu. Verifique sua conexão. A lista de paradas continua disponível.');
        }
      }, 8500);

      mapa.on('load', mapaPronto);
      mapa.on('style.load', mapaPronto);
      mapa.on('error', event => {
        const mensagem = event?.error?.message || String(event?.error || '');
        console.warn('Pacote É Mato: falha no mapa.', mensagem);
        if (!pronto && !fallbackBaseAtivo) {
          setTimeout(() => { if (!pronto) ativarMapaBaseFallback(); }, 600);
        } else if (!pronto && fallbackBaseAtivo) {
          mostrarFallback('Não foi possível carregar as ruas do mapa. Verifique a conexão de internet. A lista de paradas continua funcionando.');
        }
      });
    } catch (erro) {
      console.error('Pacote É Mato: erro ao iniciar mapa.', erro);
      mapa = null;
      mostrarFallback('Não foi possível abrir o mapa. A roteirização continua disponível pela lista.');
    }
    return mapa;
  }

  function garantirCamadaRota() {
    if (!mapa || !pronto) return;
    if (!mapa.getSource(SOURCE_ROUTE)) {
      mapa.addSource(SOURCE_ROUTE, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });
    }
    const primeiroLabel = (mapa.getStyle()?.layers || []).find(layer => layer.type === 'symbol')?.id;
    if (!mapa.getLayer(LAYER_ROUTE_CASE)) {
      mapa.addLayer({
        id: LAYER_ROUTE_CASE,
        type: 'line',
        source: SOURCE_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': 8,
          'line-opacity': 0.92
        }
      }, primeiroLabel);
    }
    if (!mapa.getLayer(LAYER_ROUTE)) {
      mapa.addLayer({
        id: LAYER_ROUTE,
        type: 'line',
        source: SOURCE_ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#059669',
          'line-width': 5,
          'line-opacity': 0.95
        }
      }, primeiroLabel);
    }
  }

  function atualizarRota() {
    if (!mapa || !pronto) return;
    garantirCamadaRota();
    const geometry = state()?.geometria;
    const source = mapa.getSource(SOURCE_ROUTE);
    if (!source) return;
    const feature = geometriaValida(geometry) ? { type: 'Feature', properties: {}, geometry } : null;
    source.setData({ type: 'FeatureCollection', features: feature ? [feature] : [] });
  }

  function criarMarcador(p) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pemato-stop-marker';
    el.dataset.stopId = p.id;
    el.setAttribute('aria-label', `Parada ${ordem(p)}. ${p.enderecoOriginal || 'Endereço'}`);

    const numero = document.createElement('span');
    numero.className = 'pemato-stop-marker-number';
    numero.textContent = String(ordem(p) || '');
    const qtd = document.createElement('span');
    qtd.className = 'pemato-stop-marker-packages';
    qtd.textContent = String(Number(p.quantidadePacotes || p.pacotes?.length || 0));
    el.append(numero, qtd);
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      global.PacoteEMatoRoteirizacao?.selecionarParada?.(p.id, 'mapa');
    });
    return el;
  }

  function atualizarClasse(el, p) {
    if (!el) return;
    ['is-pendente', 'is-parcial', 'is-concluida', 'is-nao-entregue', 'is-selected'].forEach(c => el.classList.remove(c));
    el.classList.add(`is-${statusEntrega(p)}`);
    if (state()?.paradaSelecionadaId === p.id) el.classList.add('is-selected');
    const n = el.querySelector('.pemato-stop-marker-number');
    if (n) n.textContent = String(ordem(p) || '');
    const q = el.querySelector('.pemato-stop-marker-packages');
    if (q) q.textContent = String(Number(p.quantidadePacotes || p.pacotes?.length || 0));
  }

  function renderizarPartida() {
    if (!mapa || !pronto) return;
    const start = state()?.pontoInicial;
    const valida = pontoValido(start);
    if (!valida) {
      if (marcadorPartida) { try { marcadorPartida.remove(); } catch (_) {} marcadorPartida = null; }
      return;
    }
    const coordenada = [Number(start.lon), Number(start.lat)];
    if (!marcadorPartida) {
      const el = document.createElement('div');
      el.className = 'pemato-start-marker';
      el.textContent = 'P';
      el.setAttribute('aria-label', 'Ponto de partida');
      // O MapLibre precisa receber a posição antes de o marcador entrar no mapa.
      // addTo() sem setLngLat() deixa _lngLat indefinido e pode gerar erro ao ler .lng.
      marcadorPartida = new global.maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coordenada)
        .addTo(mapa);
      return;
    }
    marcadorPartida.setLngLat(coordenada);
  }

  function localizacaoAtualValida() {
    const atual = state()?.localizacaoAtual;
    return atual && valorCoordenadaValido(atual.lat, -90, 90) && valorCoordenadaValido(atual.lon, -180, 180);
  }

  function renderizarLocalizacaoAtual() {
    if (!mapa || !pronto) return;
    const atual = state()?.localizacaoAtual;
    if (!localizacaoAtualValida()) {
      if (marcadorLocalizacaoAtual) { try { marcadorLocalizacaoAtual.remove(); } catch (_) {} marcadorLocalizacaoAtual = null; }
      return;
    }
    const coordenada = [Number(atual.lon), Number(atual.lat)];
    if (!marcadorLocalizacaoAtual) {
      const el = document.createElement('div');
      el.className = 'pemato-current-location-marker';
      el.setAttribute('aria-label', atual.desatualizada ? 'Última localização conhecida' : 'Minha localização atual');
      marcadorLocalizacaoAtual = new global.maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coordenada)
        .addTo(mapa);
    } else {
      marcadorLocalizacaoAtual.setLngLat(coordenada);
    }
    const el = marcadorLocalizacaoAtual.getElement?.();
    if (el) el.classList.toggle('is-stale', atual.desatualizada === true);
  }

  function renderizarMarcadores() {
    if (!mapa || !pronto) return;
    const validas = paradas().filter(coordenadaValida);
    const ids = new Set(validas.map(p => p.id));
    for (const [id, item] of marcadores.entries()) {
      if (!ids.has(id)) {
        try { item.marker.remove(); } catch (_) {}
        marcadores.delete(id);
      }
    }
    validas.forEach(p => {
      let item = marcadores.get(p.id);
      if (!item) {
        const element = criarMarcador(p);
        const marker = new global.maplibregl.Marker({ element, anchor: 'center' })
          .setLngLat([Number(p.longitude), Number(p.latitude)])
          .addTo(mapa);
        item = { marker, element };
        marcadores.set(p.id, item);
      } else {
        item.marker.setLngLat([Number(p.longitude), Number(p.latitude)]);
      }
      atualizarClasse(item.element, p);
    });
  }

  function ajustarTodos() {
    if (!mapa || !pronto) return;
    const validas = paradas().filter(coordenadaValida);
    const start = state()?.pontoInicial;
    const atual = state()?.localizacaoAtual;
    if (!validas.length && !pontoValido(start) && !localizacaoAtualValida()) return;
    const bounds = new global.maplibregl.LngLatBounds();
    validas.forEach(p => bounds.extend([Number(p.longitude), Number(p.latitude)]));
    if (pontoValido(start)) bounds.extend([Number(start.lon), Number(start.lat)]);
    if (localizacaoAtualValida()) bounds.extend([Number(atual.lon), Number(atual.lat)]);
    try {
      mapa.fitBounds(bounds, { padding: { top: 70, right: 55, bottom: 80, left: 55 }, maxZoom: 16, duration: 550 });
      fitFeito = true;
    } catch (_) {}
  }

  function centralizarParada(id) {
    if (!mapa || !pronto) return;
    const p = paradas().find(item => item.id === id);
    if (!coordenadaValida(p)) return;
    try { mapa.easeTo({ center: [Number(p.longitude), Number(p.latitude)], zoom: Math.max(mapa.getZoom(), 16), duration: 450 }); }
    catch (_) {}
  }

  function centralizarLocalizacaoAtual() {
    if (!mapa || !pronto || !localizacaoAtualValida()) return false;
    const atual = state().localizacaoAtual;
    mapa.easeTo({ center: [Number(atual.lon), Number(atual.lat)], zoom: Math.max(mapa.getZoom(), 15), duration: 450 });
    return true;
  }

  function renderizar(opcoes) {
    garantirMapa();
    if (!mapa || !pronto) return;
    try { mapa.resize(); } catch (_) {}
    renderizarMarcadores();
    renderizarPartida();
    renderizarLocalizacaoAtual();
    atualizarRota();
    if (opcoes?.fit) ajustarTodos();
  }

  function destruir() {
    marcadores.forEach(item => { try { item.marker.remove(); } catch (_) {} });
    marcadores.clear();
    if (marcadorPartida) { try { marcadorPartida.remove(); } catch (_) {} marcadorPartida = null; }
    if (marcadorLocalizacaoAtual) { try { marcadorLocalizacaoAtual.remove(); } catch (_) {} marcadorLocalizacaoAtual = null; }
    clearTimeout(loadTimer);
    loadTimer = null;
    if (resizeObserver) { try { resizeObserver.disconnect(); } catch (_) {} resizeObserver = null; }
    if (mapa) { try { mapa.remove(); } catch (_) {} }
    mapa = null;
    pronto = false;
    fitFeito = false;
    fallbackBaseAtivo = false;
  }

  global.addEventListener('pemato:localizacao:update', event => {
    renderizar();
    if (event?.detail?.centralizar === true) centralizarLocalizacaoAtual();
  });

  global.PacoteEMatoMapa = Object.freeze({
    garantirMapa,
    renderizar,
    renderizarMarcadores,
    atualizarRota,
    ajustarTodos,
    centralizarParada,
    centralizarLocalizacaoAtual,
    destruir,
    coordenadaValida
  });
})(window);
