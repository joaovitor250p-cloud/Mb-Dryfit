(function configurarMapaPacoteEMato(global) {
  'use strict';

  const STORAGE_KEY = 'pemato_worker_base_url';
  const existente = global.PEMATO_MAP_CONFIG || {};

  function limparBase(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function baseSalva() {
    try { return limparBase(localStorage.getItem(STORAGE_KEY) || ''); }
    catch (_) { return ''; }
  }

  const inicial = limparBase(existente.workerBaseUrl || baseSalva());

  const cfg = global.PEMATO_MAP_CONFIG = Object.assign({
    // OpenFreeMap Liberty: mapa 2D colorido, legível e com nomes de vias.
    mapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    // Fallback sem chave para evitar tela vazia caso o estilo vetorial não carregue.
    fallbackMapStyle: {
      version: 8,
      sources: {
        osm: {
          type: 'raster',
          tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
          tileSize: 256,
          attribution: '© OpenStreetMap contributors'
        }
      },
      layers: [{ id: 'osm-raster', type: 'raster', source: 'osm' }]
    },
    workerBaseUrl: inicial,
    geocodingEndpoint: '',
    optimizeEndpoint: '',
    routeEndpoint: '',
    healthEndpoint: '',
    geocodingProvider: 'geoapify-worker',
    geocodingRequestTimeoutMs: 12000,
    routingRequestTimeoutMs: 45000,
    geocodingRequestGapMs: 400,
    geocodingCacheTtlMs: 90 * 24 * 60 * 60 * 1000,
    geocodingNegativeCacheTtlMs: 24 * 60 * 60 * 1000,
    geocodingMinConfidence: 0.90,
    geocodingMinStreetConfidence: 0.90,
    initialCenter: [-46.6333, -23.5505],
    initialZoom: 10
  }, existente);

  function derivarEndpoints(base) {
    const b = limparBase(base);
    cfg.workerBaseUrl = b;
    cfg.geocodingEndpoint = b ? `${b}/geocode` : '';
    cfg.optimizeEndpoint = b ? `${b}/optimize` : '';
    cfg.routeEndpoint = b ? `${b}/route` : '';
    cfg.healthEndpoint = b ? `${b}/health` : '';
    return cfg;
  }

  function configurarWorkerBaseUrl(url) {
    const b = limparBase(url);
    try {
      if (b) localStorage.setItem(STORAGE_KEY, b);
      else localStorage.removeItem(STORAGE_KEY);
      // Limpa overrides antigos para não manter endpoints divergentes.
      ['pemato_geocoding_endpoint', 'pemato_optimize_endpoint', 'pemato_route_endpoint'].forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    derivarEndpoints(b);
    try { global.dispatchEvent(new CustomEvent('pemato:worker:update', { detail: { workerBaseUrl: b } })); } catch (_) {}
    return b;
  }

  function obterWorkerBaseUrl() {
    return limparBase(cfg.workerBaseUrl || baseSalva());
  }

  derivarEndpoints(inicial);

  global.PacoteEMatoMapaConfig = Object.freeze({
    configurarWorkerBaseUrl,
    obterWorkerBaseUrl,
    derivarEndpoints
  });
})(window);
