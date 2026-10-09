(function iniciarMapaRoteirizacao(global) {
  'use strict';

  let mapa = null;
  let pronto = false;
  let fitFeito = false;
  let loadTimer = null;
  let resizeObserver = null;
  let fallbackBaseAtivo = false;

  const SOURCE_ROUTE = 'pemato-route-line';
  const LAYER_ROUTE_CASE = 'pemato-route-line-case';
  const LAYER_ROUTE = 'pemato-route-line-layer';
  const SOURCE_STOPS = 'pemato-stops';
  const LAYER_STOPS_RING = 'pemato-stops-selected-ring';
  const LAYER_STOPS = 'pemato-stops-circle';
  const LAYER_STOPS_TEXT = 'pemato-stops-label';
  const SOURCE_START = 'pemato-start';
  const LAYER_START = 'pemato-start-circle';
  const LAYER_START_TEXT = 'pemato-start-label';
  const SOURCE_DRIVER = 'pemato-driver';
  const LAYER_DRIVER_RING = 'pemato-driver-ring';
  const LAYER_DRIVER = 'pemato-driver';

  function $(id) { return document.getElementById(id); }
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
    if (!geometry || !['LineString', 'MultiLineString'].includes(geometry.type)) return false;
    const linhas = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
    if (!Array.isArray(linhas) || !linhas.length) return false;
    return linhas.every(linha => Array.isArray(linha) && linha.length >= 2 && linha.every(c =>
      Array.isArray(c) && c.length >= 2 && valorCoordenadaValido(c[1], -90, 90) && valorCoordenadaValido(c[0], -180, 180)
    ));
  }

  function ordem(p) { return Number(p?.ordemOtimizada || p?.ordemOriginal || 0) || 0; }

  function statusEntrega(p) {
    if (p?.statusEntrega === 'nao_entregue') return 'nao_entregue';
    if (['entregue', 'concluida'].includes(p?.statusEntrega)) return 'concluida';
    if (Number(p?.quantidadeBipada || 0) > 0) return 'parcial';
    return 'pendente';
  }

  function featureCollection(features) { return { type: 'FeatureCollection', features: features || [] }; }

  function stopsGeoJSON() {
    const selectedId = state()?.paradaSelecionadaId || '';
    return featureCollection(paradas().filter(coordenadaValida).map(p => ({
      type: 'Feature',
      id: String(p.id),
      geometry: { type: 'Point', coordinates: [Number(p.longitude), Number(p.latitude)] },
      properties: {
        id: String(p.id),
        order: ordem(p),
        status: statusEntrega(p),
        selected: String(p.id) === String(selectedId) ? 1 : 0
      }
    })));
  }

  function pointGeoJSON(p, props) {
    return featureCollection(pontoValido(p) ? [{
      type: 'Feature', geometry: { type: 'Point', coordinates: [Number(p.lon), Number(p.lat)] }, properties: props || {}
    }] : []);
  }

  function driverGeoJSON() {
    const p = global.PacoteEMatoLocalizacaoAtual?.ultimaValida?.() || state()?.localizacaoAtual;
    return pointGeoJSON(p, { type: 'driver' });
  }

  function mostrarFallback(texto) {
    const el = $('mapaRoteirizacaoFallback');
    if (!el) return;
    el.textContent = texto || 'Mapa indisponível.';
    el.style.display = 'flex';
    if (state()) state().mapaDisponivel = false;
  }

  function ocultarFallback() {
    const el = $('mapaRoteirizacaoFallback');
    if (el) el.style.display = 'none';
  }

  function removerCamadas3D() {
    if (!mapa || !pronto) return;
    try {
      (mapa.getStyle()?.layers || []).filter(layer => layer.type === 'fill-extrusion').forEach(layer => {
        try { mapa.setLayoutProperty(layer.id, 'visibility', 'none'); } catch (_) {}
      });
    } catch (_) {}
  }

  function observarTamanho(container) {
    if (resizeObserver || typeof ResizeObserver !== 'function' || !container) return;
    resizeObserver = new ResizeObserver(() => { try { mapa?.resize(); } catch (_) {} });
    try { resizeObserver.observe(container); } catch (_) {}
  }

  function ativarMapaBaseFallback() {
    if (!mapa || fallbackBaseAtivo || !cfg().fallbackMapStyle) return false;
    fallbackBaseAtivo = true;
    try {
      mapa.setStyle(cfg().fallbackMapStyle);
      ocultarFallback();
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => { if (!pronto) mostrarFallback('O mapa base não respondeu. Verifique sua conexão. A lista de paradas continua disponível.'); }, 10000);
      return true;
    } catch (erro) {
      console.warn('Pacote É Mato: não foi possível ativar o mapa base de contingência.', erro);
      return false;
    }
  }

  function adicionarSource(id, data) {
    if (!mapa.getSource(id)) mapa.addSource(id, { type: 'geojson', data });
  }

  function antesDosRotulos() {
    return (mapa.getStyle()?.layers || []).find(layer => layer.type === 'symbol')?.id;
  }

  function garantirCamadas() {
    if (!mapa || !pronto) return;
    adicionarSource(SOURCE_ROUTE, featureCollection([]));
    adicionarSource(SOURCE_STOPS, featureCollection([]));
    adicionarSource(SOURCE_START, featureCollection([]));
    adicionarSource(SOURCE_DRIVER, featureCollection([]));
    const before = antesDosRotulos();

    if (!mapa.getLayer(LAYER_ROUTE_CASE)) mapa.addLayer({
      id: LAYER_ROUTE_CASE, type: 'line', source: SOURCE_ROUTE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 5, 16, 10], 'line-opacity': .92 }
    }, before);
    if (!mapa.getLayer(LAYER_ROUTE)) mapa.addLayer({
      id: LAYER_ROUTE, type: 'line', source: SOURCE_ROUTE,
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#059669', 'line-width': ['interpolate', ['linear'], ['zoom'], 9, 3, 16, 6], 'line-opacity': .96 }
    }, before);

    if (!mapa.getLayer(LAYER_STOPS_RING)) mapa.addLayer({
      id: LAYER_STOPS_RING, type: 'circle', source: SOURCE_STOPS,
      filter: ['==', ['get', 'selected'], 1],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 12, 16, 18], 'circle-color': '#ffffff', 'circle-opacity': .94 }
    });
    if (!mapa.getLayer(LAYER_STOPS)) mapa.addLayer({
      id: LAYER_STOPS, type: 'circle', source: SOURCE_STOPS,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 9, 16, 13],
        'circle-color': ['match', ['get', 'status'], 'concluida', '#059669', 'nao_entregue', '#b91c1c', 'parcial', '#d97706', '#334155'],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2, 'circle-opacity': .98
      }
    });
    if (!mapa.getLayer(LAYER_STOPS_TEXT)) mapa.addLayer({
      id: LAYER_STOPS_TEXT, type: 'symbol', source: SOURCE_STOPS,
      layout: { 'text-field': ['to-string', ['get', 'order']], 'text-size': ['interpolate', ['linear'], ['zoom'], 8, 9, 16, 12], 'text-allow-overlap': true, 'text-ignore-placement': true },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.18)', 'text-halo-width': .5 }
    });

    if (!mapa.getLayer(LAYER_START)) mapa.addLayer({ id: LAYER_START, type: 'circle', source: SOURCE_START, paint: { 'circle-radius': 11, 'circle-color': '#111827', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 } });
    if (!mapa.getLayer(LAYER_START_TEXT)) mapa.addLayer({ id: LAYER_START_TEXT, type: 'symbol', source: SOURCE_START, layout: { 'text-field': 'P', 'text-size': 10, 'text-allow-overlap': true }, paint: { 'text-color': '#ffffff' } });
    if (!mapa.getLayer(LAYER_DRIVER_RING)) mapa.addLayer({ id: LAYER_DRIVER_RING, type: 'circle', source: SOURCE_DRIVER, paint: { 'circle-radius': 12, 'circle-color': 'rgba(37,99,235,.20)' } });
    if (!mapa.getLayer(LAYER_DRIVER)) mapa.addLayer({ id: LAYER_DRIVER, type: 'circle', source: SOURCE_DRIVER, paint: { 'circle-radius': 6, 'circle-color': '#2563eb', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
  }

  function bindEventosMapa() {
    if (!mapa || mapa.__pematoBound) return;
    mapa.__pematoBound = true;
    const selecionar = event => {
      const id = event?.features?.[0]?.properties?.id;
      if (id) global.PacoteEMatoRoteirizacao?.selecionarParada?.(String(id), 'mapa');
    };
    mapa.on('click', LAYER_STOPS, selecionar);
    mapa.on('click', LAYER_STOPS_TEXT, selecionar);
    [LAYER_STOPS, LAYER_STOPS_TEXT].forEach(layer => {
      mapa.on('mouseenter', layer, () => { try { mapa.getCanvas().style.cursor = 'pointer'; } catch (_) {} });
      mapa.on('mouseleave', layer, () => { try { mapa.getCanvas().style.cursor = ''; } catch (_) {} });
    });
  }

  function garantirMapa() {
    if (mapa) return mapa;
    const container = $('mapaRoteirizacao');
    if (!container) return null;
    observarTamanho(container);
    if (!global.maplibregl) { mostrarFallback('A biblioteca do mapa não carregou. A lista de paradas continua disponível.'); return null; }
    try {
      mapa = new global.maplibregl.Map({
        container, style: cfg().mapStyleUrl, center: cfg().initialCenter || [-46.6333, -23.5505], zoom: Number(cfg().initialZoom || 10),
        pitch: 0, bearing: 0, maxPitch: 0, dragRotate: false, touchPitch: false, attributionControl: true, fadeDuration: 120
      });
      mapa.touchZoomRotate?.disableRotation?.();
      const mapaPronto = () => {
        pronto = true; clearTimeout(loadTimer); if (state()) state().mapaDisponivel = true; ocultarFallback(); removerCamadas3D();
        garantirCamadas(); bindEventosMapa(); try { mapa.resize(); } catch (_) {} renderizar({ fit: !fitFeito });
      };
      loadTimer = setTimeout(() => { if (!pronto && !ativarMapaBaseFallback()) mostrarFallback('O mapa base não respondeu. Verifique sua conexão.'); }, 8500);
      mapa.on('load', mapaPronto);
      mapa.on('style.load', mapaPronto);
      mapa.on('error', event => {
        const mensagem = event?.error?.message || String(event?.error || '');
        console.warn('Pacote É Mato: falha no mapa.', mensagem);
        if (!pronto && !fallbackBaseAtivo) setTimeout(() => { if (!pronto) ativarMapaBaseFallback(); }, 600);
      });
    } catch (erro) {
      console.error('Pacote É Mato: erro ao iniciar mapa.', erro); mapa = null;
      mostrarFallback('Não foi possível abrir o mapa. A roteirização continua disponível pela lista.');
    }
    return mapa;
  }

  function atualizarSource(id, data) {
    if (!mapa || !pronto) return;
    garantirCamadas();
    const src = mapa.getSource(id);
    if (src?.setData) src.setData(data);
  }

  function atualizarRota() {
    const geometry = state()?.geometria;
    const feature = geometriaValida(geometry) ? { type: 'Feature', properties: { planned: true }, geometry } : null;
    atualizarSource(SOURCE_ROUTE, featureCollection(feature ? [feature] : []));
  }

  function renderizarMarcadores() { atualizarSource(SOURCE_STOPS, stopsGeoJSON()); }
  function renderizarPartida() { atualizarSource(SOURCE_START, pointGeoJSON(state()?.pontoInicial, { type: 'start' })); }
  function renderizarMotorista() { atualizarSource(SOURCE_DRIVER, driverGeoJSON()); }

  function coordenadasGeometria(geometry) {
    if (!geometriaValida(geometry)) return [];
    return geometry.type === 'LineString' ? geometry.coordinates : geometry.coordinates.flat();
  }

  function ajustarTodos() {
    if (!mapa || !pronto) return;
    const bounds = new global.maplibregl.LngLatBounds();
    let total = 0;
    paradas().filter(coordenadaValida).forEach(p => { bounds.extend([Number(p.longitude), Number(p.latitude)]); total++; });
    const start = state()?.pontoInicial;
    if (pontoValido(start)) { bounds.extend([Number(start.lon), Number(start.lat)]); total++; }
    coordenadasGeometria(state()?.geometria).forEach(c => { bounds.extend(c); total++; });
    if (!total) return;
    try { mapa.fitBounds(bounds, { padding: { top: 84, right: 64, bottom: 150, left: 64 }, maxZoom: 16, duration: 500 }); fitFeito = true; }
    catch (_) {}
  }

  function centralizarParada(id) {
    if (!mapa || !pronto) return;
    const p = paradas().find(item => String(item.id) === String(id));
    if (!coordenadaValida(p)) return;
    try { mapa.easeTo({ center: [Number(p.longitude), Number(p.latitude)], zoom: Math.max(mapa.getZoom(), 16), duration: 380 }); } catch (_) {}
  }

  async function centralizarMinhaLocalizacao() {
    try {
      const p = await global.PacoteEMatoLocalizacaoAtual?.obter?.({ forcar: true });
      if (pontoValido(p) && mapa && pronto) mapa.easeTo({ center: [Number(p.lon), Number(p.lat)], zoom: Math.max(mapa.getZoom(), 16), duration: 380 });
      renderizarMotorista();
    } catch (erro) {
      global.notificar?.(erro?.message || 'Não foi possível obter sua localização.');
    }
  }

  function zoom(delta) {
    if (!mapa || !pronto) return;
    try { mapa.easeTo({ zoom: Math.max(1, Math.min(20, mapa.getZoom() + delta)), duration: 220 }); } catch (_) {}
  }

  function renderizar(opcoes) {
    garantirMapa();
    if (!mapa || !pronto) return;
    try { mapa.resize(); } catch (_) {}
    garantirCamadas(); renderizarMarcadores(); renderizarPartida(); renderizarMotorista(); atualizarRota();
    if (opcoes?.fit) ajustarTodos();
  }

  function bindControles() {
    $('routingMyLocationBtn')?.addEventListener('click', centralizarMinhaLocalizacao);
    $('routingFitMapBtn')?.addEventListener('click', ajustarTodos);
    $('routingZoomInBtn')?.addEventListener('click', () => zoom(1));
    $('routingZoomOutBtn')?.addEventListener('click', () => zoom(-1));
    global.addEventListener('pemato:localizacao-atual', () => renderizarMotorista());
  }

  function destruir() {
    clearTimeout(loadTimer); loadTimer = null;
    if (resizeObserver) { try { resizeObserver.disconnect(); } catch (_) {} resizeObserver = null; }
    if (mapa) { try { mapa.remove(); } catch (_) {} }
    mapa = null; pronto = false; fitFeito = false; fallbackBaseAtivo = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindControles, { once: true });
  else bindControles();

  global.PacoteEMatoMapa = Object.freeze({
    garantirMapa, renderizar, renderizarMarcadores, atualizarRota, ajustarTodos, centralizarParada, centralizarMinhaLocalizacao,
    destruir, coordenadaValida, geometriaValida, getMapa: () => mapa
  });
})(window);
