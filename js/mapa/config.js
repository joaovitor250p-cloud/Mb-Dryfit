(function configurarMapaPacoteEMato(global) {
  'use strict';

  const STORAGE_KEY = 'pemato_worker_base_url';
  const DEFAULT_WORKER_BASE_URL = 'https://pacote-emato-rotas.joaovitor250p.workers.dev';
  const existente = global.PEMATO_MAP_CONFIG || {};

  function limparBase(url) {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  function baseSalva() {
    try { return limparBase(localStorage.getItem(STORAGE_KEY) || ''); }
    catch (_) { return ''; }
  }

  const inicial = limparBase(existente.workerBaseUrl || baseSalva() || DEFAULT_WORKER_BASE_URL);

  const cfg = global.PEMATO_MAP_CONFIG = Object.assign({
    // OpenFreeMap Liberty: mapa 2D colorido, legível e com nomes de vias.
    mapStyleUrl: 'https://tiles.openfreemap.org/styles/liberty',
    // Fallback sem chave para evitar tela vazia caso o estilo vetorial não carregue.
    fallbackMapStyle: {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
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
    // Rotas grandes são divididas em blocos no cliente antes de chamar o Worker.
    // 24 pontos reduz URL/carga do Routing API e evita 5xx em rotas de 100+ paradas.
    routingMaxPointsPerRequest: 24,
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


  // V34: mapa operacional limpo. Mantém ruas, bairros e referências viárias,
  // mas remove ícones/rótulos de POIs que disputavam espaço com paradas e postos.
  function limparPontosInteresse(mapa) {
    if (!mapa?.getStyle) return;
    const padrao = /(poi|amenity|hospital|clinic|pharmacy|school|university|college|kindergarten|bus|transit|station|railway|subway|tram|airport|aeroway|shop|store|restaurant|cafe|bar|fast.?food|hotel|motel|lodging|tourism|attraction|museum|theatre|cinema|place.?of.?worship|religion|parking)/i;
    const preservar = /(road|street|highway|motorway|trunk|primary|secondary|tertiary|route|place|city|town|village|neighbourhood|neighborhood|water|boundary)/i;
    (mapa.getStyle()?.layers || []).forEach(layer => {
      if (layer.type !== 'symbol') return;
      const texto = `${layer.id || ''} ${layer['source-layer'] || ''}`;
      if (padrao.test(texto) && !preservar.test(texto)) {
        try { mapa.setLayoutProperty(layer.id, 'visibility', 'none'); } catch (_) {}
      }
    });
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

  // Usa somente fontes de construções já declaradas pelo estilo carregado.
  // Converte a representação 3D em plantas 2D, sem uma nova requisição de dados.
  function exibirConstrucoes2D(mapa) {
    const camadas = mapa?.getStyle?.()?.layers || [];
    const bases = camadas.filter(l => l['source-layer'] &&
      /building/i.test(l['source-layer']) && ['fill','fill-extrusion'].includes(l.type));
    const fontes = new Map();
    bases.forEach(l => fontes.set(`${l.source}:${l['source-layer']}`, l));
    let indice = 0;
    fontes.forEach(base => {
      const id = `pemato-construcoes-2d-${indice++}`;
      if (mapa.getLayer(id)) return;
      const antes = camadas.find(l => l.source === base.source && l['source-layer'] === base['source-layer'])?.id;
      mapa.addLayer({
        id, type:'fill', source:base.source, 'source-layer':base['source-layer'], minzoom:14,
        layout:{visibility:'visible'},
        paint:{'fill-color':'#f0efed', 'fill-outline-color':'#b5b9bd',
          'fill-opacity':['interpolate',['linear'],['zoom'],14,0.45,16,0.85]}
      }, antes);
      // Evita que o preenchimento original esconda os contornos adicionados.
      bases.filter(l => l.source === base.source && l['source-layer'] === base['source-layer'])
        .forEach(l => mapa.setLayoutProperty(l.id, 'visibility', 'none'));
    });
  }

  global.PacoteEMatoMapaConfig = Object.freeze({
    exibirConstrucoes2D,
    limparPontosInteresse,
    configurarWorkerBaseUrl,
    obterWorkerBaseUrl,
    derivarEndpoints
  });
})(window);
