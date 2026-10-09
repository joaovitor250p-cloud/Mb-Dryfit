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
  const LAYER_STOPS_GROUP_RING = 'pemato-stops-group-ring';
  const LAYER_STOPS_RING = 'pemato-stops-selected-ring';
  const LAYER_STOPS = 'pemato-stops-simple';
  const LAYER_STOPS_MULTI = 'pemato-stops-multi';
  const LAYER_STOPS_ACTIVE = 'pemato-stops-active';
  const LAYER_STOPS_MULTI_ACTIVE = 'pemato-stops-multi-active';
  const SOURCE_START = 'pemato-start';
  const LAYER_START = 'pemato-start-circle';
  const LAYER_START_TEXT = 'pemato-start-label';
  const SOURCE_DRIVER = 'pemato-driver';
  const LAYER_DRIVER_RING = 'pemato-driver-ring';
  const LAYER_DRIVER = 'pemato-driver';

  let selecaoDesenhoAtiva = false;
  let modoInteracaoSelecao = 'draw';
  let idsSelecaoDesenho = new Set();
  let pontosDesenho = [];
  let ponteiroDesenho = null;
  let overlayDesenho = null;
  let pathDesenho = null;
  let marcadoresDom = new Map();
  let organizarMarcadoresRaf = 0;

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

  function chaveMultiplo(p) {
    const numero = String(p?.numero || (String(p?.enderecoFonte || p?.enderecoOriginal || '').match(/\b\d+[A-Za-z]?\b/) || [''])[0] || '').toLowerCase();
    let rua = String(p?.logradouro || p?.enderecoFonte || p?.enderecoOriginal || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    if (numero) rua = rua.replace(new RegExp(`\\b${numero.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b.*$`, 'i'), '');
    rua = rua.replace(/\b(ap|apto|apartamento|casa|bloco|sala|loja|suite|fundos|frente)\b.*$/i,'').replace(/[^a-z0-9]+/g,' ').trim();
    return rua && numero ? `${rua}|${numero}` : '';
  }

  function featureCollection(features) { return { type: 'FeatureCollection', features: features || [] }; }

  function quantidadePacotesDaParada(p) {
    const n = Number(p?.pacotes?.length || p?.quantidadePacotes || 1);
    return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 1;
  }

  function chaveFisicaMarcador(p) {
    const chave = chaveMultiplo(p);
    if (chave) return `end:${chave}`;
    const lat = Number(p?.latitude), lon = Number(p?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return `coord:${lat.toFixed(5)}|${lon.toFixed(5)}`;
    return `id:${String(p?.id || '')}`;
  }

  function stopsGeoJSON() {
    const selectedId = state()?.paradaSelecionadaId || '';
    const lista = paradas().filter(coordenadaValida);
    const grupos = new Map();

    // Um ponto físico = um único balão. Se houver mais de um pacote no ponto,
    // o balão mostra a parada e a quantidade (ex.: 38 3x).
    lista.forEach(p => {
      const key = chaveFisicaMarcador(p);
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push(p);
    });

    const ocupacaoVisual = new Map();
    const features = [];
    grupos.forEach(grupo => {
      grupo.sort((a,b) => ordem(a) - ordem(b));
      const p = grupo[0];
      const totalPacotes = grupo.reduce((total, item) => total + quantidadePacotesDaParada(item), 0);
      const lat = Number(p.latitude), lon = Number(p.longitude);
      // Agrupa visualmente pontos muito próximos para que os balões sejam
      // deslocados em vez de ficarem um em cima do outro.
      const gridLat = Math.round(lat / 0.00032);
      const gridLon = Math.round(lon / 0.00032);
      const visualKey = `${gridLat}|${gridLon}`;
      const stackIndex = ocupacaoVisual.get(visualKey) || 0;
      ocupacaoVisual.set(visualKey, stackIndex + 1);
      const ids = grupo.map(item => String(item.id));
      features.push({
        type: 'Feature',
        id: String(p.id),
        geometry: { type: 'Point', coordinates: [lon, lat] },
        properties: {
          id: String(p.id),
          ids: ids.join(','),
          order: ordem(p),
          status: statusEntrega(p),
          selected: ids.includes(String(selectedId)) ? 1 : 0,
          groupSelected: grupo.some(item => idsSelecaoDesenho.has(String(item.id))) ? 1 : 0,
          multi: totalPacotes,
          stackIndex
        }
      });
    });
    return featureCollection(features);
  }

  function caixasColidem(a, b, margem) {
    const m = Number(margem || 0);
    return !(a.right + m <= b.left || a.left >= b.right + m || a.bottom + m <= b.top || a.top >= b.bottom + m);
  }

  function offsetsMarcador() {
    return [
      [0,0], [0,-38], [36,0], [-36,0], [0,38],
      [28,-30], [-28,-30], [28,30], [-28,30],
      [60,0], [-60,0], [0,-68], [0,68],
      [52,-42], [-52,-42], [52,42], [-52,42]
    ];
  }

  function atualizarConteudoMarcador(el, feature) {
    const props = feature?.properties || {};
    const ordemAtual = Number(props.order || 0) || 0;
    const multi = Math.max(1, Number(props.multi || 1) || 1);
    const selecionado = Number(props.selected || 0) === 1;
    const grupoSelecionado = Number(props.groupSelected || 0) === 1;
    el.classList.toggle('is-multi', multi > 1);
    el.classList.toggle('is-active', selecionado);
    el.classList.toggle('is-group-selected', grupoSelecionado);
    el.dataset.paradaId = String(props.id || '');
    el.dataset.ordem = String(ordemAtual);
    el.setAttribute('aria-label', multi > 1 ? `Parada ${ordemAtual}, ${multi} pacotes` : `Parada ${ordemAtual}`);
    const corpo = el.querySelector('.pemato-spoke-marker__body');
    if (!corpo) return;
    corpo.replaceChildren();
    const num = document.createElement('span');
    num.className = 'pemato-spoke-marker__num';
    num.textContent = String(ordemAtual);
    corpo.appendChild(num);
    if (multi > 1) {
      const qtd = document.createElement('span');
      qtd.className = 'pemato-spoke-marker__multi';
      qtd.textContent = `${multi}x`;
      corpo.appendChild(qtd);
    }
    el.style.zIndex = selecionado ? '9999' : String(Math.max(100, 6000 - ordemAtual));
  }

  function criarElementoMarcador(feature) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pemato-spoke-marker';
    const corpo = document.createElement('span');
    corpo.className = 'pemato-spoke-marker__body';
    el.appendChild(corpo);
    atualizarConteudoMarcador(el, feature);
    el.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const id = String(el.dataset.paradaId || '');
      if (!id) return;
      if (selecaoDesenhoAtiva) alternarIdSelecao(id);
      else global.PacoteEMatoRoteirizacao?.selecionarParada?.(id, 'mapa');
    });
    return el;
  }

  function organizarMarcadoresDom() {
    if (!mapa || !pronto || !marcadoresDom.size) return;
    if (organizarMarcadoresRaf) cancelAnimationFrame(organizarMarcadoresRaf);
    organizarMarcadoresRaf = requestAnimationFrame(() => {
      organizarMarcadoresRaf = 0;
      const ocupadas = [];
      const candidatos = offsetsMarcador();
      const registros = [...marcadoresDom.values()].sort((a,b) => {
        const aa = Number(a.feature?.properties?.selected || 0) === 1 ? 0 : 1;
        const bb = Number(b.feature?.properties?.selected || 0) === 1 ? 0 : 1;
        return aa - bb || Number(a.feature?.properties?.order || 0) - Number(b.feature?.properties?.order || 0);
      });
      registros.forEach((registro, indice) => {
        const feature = registro.feature;
        const coord = feature?.geometry?.coordinates;
        if (!Array.isArray(coord) || coord.length < 2) return;
        const pt = mapa.project(coord);
        const multi = Number(feature?.properties?.multi || 1) > 1;
        const w = multi ? 54 : 36;
        const h = 43;
        let escolhido = candidatos[0];
        let caixaEscolhida = null;
        for (const off of candidatos) {
          const caixa = { left:pt.x + off[0] - w/2, right:pt.x + off[0] + w/2, top:pt.y + off[1] - h, bottom:pt.y + off[1] + 2 };
          if (!ocupadas.some(c => caixasColidem(c, caixa, 3))) { escolhido = off; caixaEscolhida = caixa; break; }
        }
        if (!caixaEscolhida) caixaEscolhida = { left:pt.x + escolhido[0] - w/2, right:pt.x + escolhido[0] + w/2, top:pt.y + escolhido[1] - h, bottom:pt.y + escolhido[1] + 2 };
        ocupadas.push(caixaEscolhida);
        try { registro.marker.setOffset(escolhido); } catch (_) {}
      });
    });
  }

  function renderizarMarcadoresDom(data) {
    if (!mapa || !pronto || !global.maplibregl?.Marker) return;
    const features = Array.isArray(data?.features) ? data.features : [];
    const vivos = new Set();
    features.forEach(feature => {
      const id = String(feature?.properties?.id || feature?.id || '');
      const coord = feature?.geometry?.coordinates;
      if (!id || !Array.isArray(coord) || coord.length < 2) return;
      vivos.add(id);
      let registro = marcadoresDom.get(id);
      if (!registro) {
        const element = criarElementoMarcador(feature);
        const marker = new global.maplibregl.Marker({ element, anchor:'bottom' }).setLngLat(coord).addTo(mapa);
        registro = { marker, element, feature };
        marcadoresDom.set(id, registro);
      } else {
        registro.feature = feature;
        atualizarConteudoMarcador(registro.element, feature);
        try { registro.marker.setLngLat(coord); } catch (_) {}
      }
    });
    [...marcadoresDom.entries()].forEach(([id, registro]) => {
      if (vivos.has(id)) return;
      try { registro.marker.remove(); } catch (_) {}
      marcadoresDom.delete(id);
    });
    organizarMarcadoresDom();
  }

  function limparMarcadoresDom() {
    marcadoresDom.forEach(registro => { try { registro.marker.remove(); } catch (_) {} });
    marcadoresDom.clear();
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

  function garantirImagemBalao() {
    if (!mapa) return;
    const criarMarcador = (nome, largura, fundo, borda) => {
      if (mapa.hasImage?.(nome)) return;
      const altura = 50;
      const canvas = document.createElement('canvas');
      canvas.width = largura;
      canvas.height = altura;
      const c = canvas.getContext('2d');
      if (!c) return;
      c.clearRect(0, 0, largura, altura);
      c.fillStyle = fundo;
      c.strokeStyle = borda;
      c.lineWidth = 2.4;
      const x = 2.5, y = 2.5, w = largura - 5, bodyH = 36, r = 11;
      const cx = largura / 2, tipY = 47;
      c.beginPath();
      c.moveTo(x + r, y);
      c.lineTo(x + w - r, y);
      c.quadraticCurveTo(x + w, y, x + w, y + r);
      c.lineTo(x + w, y + bodyH - r);
      c.quadraticCurveTo(x + w, y + bodyH, x + w - r, y + bodyH);
      c.lineTo(cx + 6, y + bodyH);
      c.lineTo(cx, tipY);
      c.lineTo(cx - 6, y + bodyH);
      c.lineTo(x + r, y + bodyH);
      c.quadraticCurveTo(x, y + bodyH, x, y + bodyH - r);
      c.lineTo(x, y + r);
      c.quadraticCurveTo(x, y, x + r, y);
      c.closePath();
      c.fill();
      c.stroke();
      mapa.addImage(nome, c.getImageData(0, 0, largura, altura));
    };
    try {
      criarMarcador('pemato-stop-v8-simple', 38, '#ffffff', '#159766');
      criarMarcador('pemato-stop-v8-multi', 58, '#ffffff', '#159766');
      criarMarcador('pemato-stop-v8-active', 38, '#159766', '#159766');
      criarMarcador('pemato-stop-v8-multi-active', 58, '#159766', '#159766');
    } catch (e) { console.warn('Pacote É Mato: marcador de parada indisponível', e); }
  }

  function garantirCamadas() {
    if (!mapa || !pronto) return;
    adicionarSource(SOURCE_ROUTE, featureCollection([]));
    adicionarSource(SOURCE_STOPS, featureCollection([]));
    adicionarSource(SOURCE_START, featureCollection([]));
    adicionarSource(SOURCE_DRIVER, featureCollection([]));
    garantirImagemBalao();
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

    if (!mapa.getLayer(LAYER_STOPS_GROUP_RING)) mapa.addLayer({
      id: LAYER_STOPS_GROUP_RING, type: 'circle', source: SOURCE_STOPS,
      filter: ['==', ['get', 'groupSelected'], 1],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 14, 16, 20], 'circle-color': 'rgba(16,185,129,.20)', 'circle-stroke-color': '#059669', 'circle-stroke-width': 3 }
    });
    if (!mapa.getLayer(LAYER_STOPS_RING)) mapa.addLayer({
      id: LAYER_STOPS_RING, type: 'circle', source: SOURCE_STOPS,
      filter: ['==', ['get', 'selected'], 1],
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 12, 16, 18], 'circle-color': '#ffffff', 'circle-opacity': .94 }
    });
    const textoMultiplo = ['format',
      ['to-string', ['get', 'order']], { 'font-scale': 1 },
      '  ', { 'font-scale': .35 },
      ['to-string', ['get', 'multi']], { 'font-scale': .72 },
      'x', { 'font-scale': .58 }
    ];
    const layoutBase = {
      'icon-anchor': 'bottom',
      'text-anchor': 'bottom',
      'text-offset': [0, -1.53],
      'text-size': 12,
      'text-font': ['literal', ['Open Sans Semibold']],
      'icon-allow-overlap': false,
      'icon-ignore-placement': false,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'icon-optional': false,
      'text-optional': false
    };
    if (!mapa.getLayer(LAYER_STOPS)) mapa.addLayer({
      id: LAYER_STOPS, type: 'symbol', source: SOURCE_STOPS,
      filter: ['all', ['<=', ['get','multi'], 1], ['!=', ['get','selected'], 1]],
      layout: { ...layoutBase, 'icon-image':'pemato-stop-v8-simple', 'text-field':['to-string',['get','order']] },
      paint: { 'text-color':'#087a51', 'text-halo-color':'rgba(255,255,255,.45)', 'text-halo-width':.25 }
    });
    if (!mapa.getLayer(LAYER_STOPS_MULTI)) mapa.addLayer({
      id: LAYER_STOPS_MULTI, type: 'symbol', source: SOURCE_STOPS,
      filter: ['all', ['>', ['get','multi'], 1], ['!=', ['get','selected'], 1]],
      layout: { ...layoutBase, 'icon-image':'pemato-stop-v8-multi', 'text-field':textoMultiplo },
      paint: { 'text-color':'#087a51', 'text-halo-color':'rgba(255,255,255,.45)', 'text-halo-width':.25 }
    });
    if (!mapa.getLayer(LAYER_STOPS_ACTIVE)) mapa.addLayer({
      id: LAYER_STOPS_ACTIVE, type: 'symbol', source: SOURCE_STOPS,
      filter: ['all', ['<=', ['get','multi'], 1], ['==', ['get','selected'], 1]],
      layout: { ...layoutBase, 'icon-image':'pemato-stop-v8-active', 'text-field':['to-string',['get','order']], 'icon-allow-overlap':true, 'text-allow-overlap':true },
      paint: { 'text-color':'#ffffff' }
    });
    if (!mapa.getLayer(LAYER_STOPS_MULTI_ACTIVE)) mapa.addLayer({
      id: LAYER_STOPS_MULTI_ACTIVE, type: 'symbol', source: SOURCE_STOPS,
      filter: ['all', ['>', ['get','multi'], 1], ['==', ['get','selected'], 1]],
      layout: { ...layoutBase, 'icon-image':'pemato-stop-v8-multi-active', 'text-field':textoMultiplo, 'icon-allow-overlap':true, 'text-allow-overlap':true },
      paint: { 'text-color':'#ffffff' }
    });

    [LAYER_STOPS_GROUP_RING, LAYER_STOPS_RING, LAYER_STOPS, LAYER_STOPS_MULTI, LAYER_STOPS_ACTIVE, LAYER_STOPS_MULTI_ACTIVE].forEach(id => {
      try { if (mapa.getLayer(id)) mapa.setLayoutProperty(id, 'visibility', 'none'); } catch (_) {}
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
      if (!id) return;
      if (selecaoDesenhoAtiva) {
        alternarIdSelecao(String(id));
        return;
      }
      global.PacoteEMatoRoteirizacao?.selecionarParada?.(String(id), 'mapa');
    };
    [LAYER_STOPS, LAYER_STOPS_MULTI, LAYER_STOPS_ACTIVE, LAYER_STOPS_MULTI_ACTIVE].forEach(layerId => {
      mapa.on('click', layerId, selecionar);
      mapa.on('mouseenter', layerId, () => { try { mapa.getCanvas().style.cursor = 'pointer'; } catch (_) {} });
      mapa.on('mouseleave', layerId, () => { try { mapa.getCanvas().style.cursor = ''; } catch (_) {} });
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
      mapa.on('moveend', organizarMarcadoresDom);
      mapa.on('zoomend', organizarMarcadoresDom);
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

  function distanciaCoord(a,b){
    if(!Array.isArray(a)||!Array.isArray(b)) return Infinity;
    const R=6371000, rad=Math.PI/180;
    const lat1=Number(a[1])*rad, lat2=Number(b[1])*rad;
    const dLat=(Number(b[1])-Number(a[1]))*rad, dLon=(Number(b[0])-Number(a[0]))*rad;
    const h=Math.sin(dLat/2)**2+Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function geometriaVisualSegura(geometry){
    if(!geometriaValida(geometry)) return null;
    const orig=geometry.type==='LineString'?[geometry.coordinates]:geometry.coordinates;
    const linhas=[];
    orig.forEach(linha=>{
      let atual=[];
      linha.forEach(coord=>{
        if(!Array.isArray(coord)||coord.length<2) return;
        if(atual.length && distanciaCoord(atual[atual.length-1],coord)>1800){
          if(atual.length>=2) linhas.push(atual);
          atual=[];
        }
        const prev=atual[atual.length-1];
        if(!prev || prev[0]!==coord[0] || prev[1]!==coord[1]) atual.push(coord);
      });
      if(atual.length>=2) linhas.push(atual);
    });
    if(!linhas.length) return null;
    return linhas.length===1?{type:'LineString',coordinates:linhas[0]}:{type:'MultiLineString',coordinates:linhas};
  }
  function atualizarRota() {
    const geometry = geometriaVisualSegura(state()?.geometria);
    const feature = geometry ? { type: 'Feature', properties: { planned: true }, geometry } : null;
    atualizarSource(SOURCE_ROUTE, featureCollection(feature ? [feature] : []));
  }

  function renderizarMarcadores() { const data = stopsGeoJSON(); atualizarSource(SOURCE_STOPS, data); renderizarMarcadoresDom(data); }
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

  function ajustarParadasImportadas() {
    if (!mapa || !pronto) return;
    const validas = paradas().filter(coordenadaValida);
    if (!validas.length) return;

    const bounds = new global.maplibregl.LngLatBounds();
    validas.forEach(p => bounds.extend([Number(p.longitude), Number(p.latitude)]));

    try {
      if (validas.length === 1) {
        mapa.easeTo({ center: [Number(validas[0].longitude), Number(validas[0].latitude)], zoom: 16.2, duration: 500 });
      } else {
        const mobile = global.matchMedia?.('(max-width: 820px)')?.matches;
        mapa.fitBounds(bounds, {
          padding: mobile ? { top: 82, right: 34, bottom: 270, left: 34 } : { top: 78, right: 70, bottom: 90, left: 70 },
          maxZoom: 15.8,
          duration: 650
        });
      }
      fitFeito = true;
    } catch (_) {}
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

  function paradaPendente(p) {
    return !!p && !['entregue', 'concluida', 'nao_entregue'].includes(String(p.statusEntrega || 'pendente'));
  }

  function emitirSelecaoDesenho() {
    renderizarMarcadores();
    try {
      global.dispatchEvent(new CustomEvent('pemato:map-selection-change', {
        detail: { ids: [...idsSelecaoDesenho], count: idsSelecaoDesenho.size, mode: modoInteracaoSelecao }
      }));
    } catch (_) {}
  }

  function definirSelecaoDesenho(ids) {
    const validos = new Set(paradas().filter(paradaPendente).map(p => String(p.id)));
    idsSelecaoDesenho = new Set((ids || []).map(String).filter(id => validos.has(id)));
    emitirSelecaoDesenho();
    return [...idsSelecaoDesenho];
  }

  function alternarIdSelecao(id) {
    const p = paradas().find(item => String(item.id) === String(id));
    if (!paradaPendente(p)) return [...idsSelecaoDesenho];
    const key = String(id);
    if (idsSelecaoDesenho.has(key)) idsSelecaoDesenho.delete(key);
    else idsSelecaoDesenho.add(key);
    emitirSelecaoDesenho();
    return [...idsSelecaoDesenho];
  }

  function limparSelecaoDesenho() {
    idsSelecaoDesenho.clear();
    pontosDesenho = [];
    if (pathDesenho) pathDesenho.setAttribute('d', '');
    emitirSelecaoDesenho();
  }

  function pontoOverlay(event) {
    if (!overlayDesenho) return null;
    const rect = overlayDesenho.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function distanciaPontos(a, b) {
    return a && b ? Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y)) : Infinity;
  }

  function caminhoSvg(pontos, fechar) {
    if (!Array.isArray(pontos) || !pontos.length) return '';
    return pontos.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ') + (fechar && pontos.length > 2 ? ' Z' : '');
  }

  function pontoNoPoligono(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y, xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function paradaMaisProximaDaTela(point, maxPx) {
    if (!mapa || !pronto || !point) return null;
    let melhor = null;
    let dist = Number(maxPx || 34);
    paradas().filter(p => paradaPendente(p) && coordenadaValida(p)).forEach(p => {
      try {
        const projected = mapa.project([Number(p.longitude), Number(p.latitude)]);
        const d = Math.hypot(projected.x - point.x, projected.y - point.y);
        if (d <= dist) { dist = d; melhor = p; }
      } catch (_) {}
    });
    return melhor;
  }

  function concluirDesenho() {
    if (!mapa || !pronto || !pontosDesenho.length) return;
    const deslocamento = pontosDesenho.reduce((total, p, i) => i ? total + distanciaPontos(pontosDesenho[i - 1], p) : 0, 0);
    if (pontosDesenho.length < 3 || deslocamento < 22) {
      const alvo = paradaMaisProximaDaTela(pontosDesenho[pontosDesenho.length - 1], 38);
      if (alvo) alternarIdSelecao(alvo.id);
      pontosDesenho = [];
      if (pathDesenho) pathDesenho.setAttribute('d', '');
      return;
    }
    if (pathDesenho) pathDesenho.setAttribute('d', caminhoSvg(pontosDesenho, true));
    const selecionadas = [];
    paradas().filter(p => paradaPendente(p) && coordenadaValida(p)).forEach(p => {
      try {
        const projected = mapa.project([Number(p.longitude), Number(p.latitude)]);
        if (pontoNoPoligono({ x: projected.x, y: projected.y }, pontosDesenho)) selecionadas.push(String(p.id));
      } catch (_) {}
    });
    definirSelecaoDesenho(selecionadas);
  }

  function bindOverlayDesenho() {
    overlayDesenho = $('routingDrawOverlay');
    pathDesenho = $('routingDrawPath');
    if (!overlayDesenho || overlayDesenho.dataset.bound === '1') return;
    overlayDesenho.dataset.bound = '1';
    overlayDesenho.addEventListener('pointerdown', event => {
      if (!selecaoDesenhoAtiva || modoInteracaoSelecao !== 'draw') return;
      event.preventDefault();
      ponteiroDesenho = event.pointerId;
      pontosDesenho = [];
      const p = pontoOverlay(event);
      if (p) pontosDesenho.push(p);
      if (pathDesenho) pathDesenho.setAttribute('d', caminhoSvg(pontosDesenho, false));
      try { overlayDesenho.setPointerCapture(event.pointerId); } catch (_) {}
    });
    overlayDesenho.addEventListener('pointermove', event => {
      if (ponteiroDesenho !== event.pointerId || !selecaoDesenhoAtiva || modoInteracaoSelecao !== 'draw') return;
      event.preventDefault();
      const p = pontoOverlay(event);
      const ultimo = pontosDesenho[pontosDesenho.length - 1];
      if (p && (!ultimo || distanciaPontos(ultimo, p) >= 3)) pontosDesenho.push(p);
      if (pathDesenho) pathDesenho.setAttribute('d', caminhoSvg(pontosDesenho, false));
    });
    const terminar = event => {
      if (ponteiroDesenho !== event.pointerId) return;
      event.preventDefault();
      ponteiroDesenho = null;
      const p = pontoOverlay(event);
      const ultimo = pontosDesenho[pontosDesenho.length - 1];
      if (p && (!ultimo || distanciaPontos(ultimo, p) >= 2)) pontosDesenho.push(p);
      concluirDesenho();
      try { overlayDesenho.releasePointerCapture(event.pointerId); } catch (_) {}
    };
    overlayDesenho.addEventListener('pointerup', terminar);
    overlayDesenho.addEventListener('pointercancel', event => {
      if (ponteiroDesenho === event.pointerId) {
        ponteiroDesenho = null; pontosDesenho = [];
        if (pathDesenho) pathDesenho.setAttribute('d', '');
      }
    });
    overlayDesenho.addEventListener('contextmenu', event => event.preventDefault());
  }

  function definirModoInteracaoSelecao(modo) {
    modoInteracaoSelecao = modo === 'pan' ? 'pan' : 'draw';
    bindOverlayDesenho();
    if (overlayDesenho) {
      overlayDesenho.classList.toggle('is-active', selecaoDesenhoAtiva && modoInteracaoSelecao === 'draw');
      overlayDesenho.classList.toggle('is-pan', selecaoDesenhoAtiva && modoInteracaoSelecao === 'pan');
    }
    try {
      if (mapa) {
        if (modoInteracaoSelecao === 'pan') mapa.dragPan?.enable?.();
        else mapa.dragPan?.disable?.();
      }
    } catch (_) {}
    emitirSelecaoDesenho();
    return modoInteracaoSelecao;
  }

  function iniciarSelecaoDesenho(opcoes) {
    garantirMapa();
    selecaoDesenhoAtiva = true;
    if (opcoes?.preservar !== true) idsSelecaoDesenho = new Set((opcoes?.ids || []).map(String));
    bindOverlayDesenho();
    document.querySelector('.routing-map-pane')?.classList.add('is-drawing');
    definirModoInteracaoSelecao(opcoes?.mode || 'draw');
    renderizarMarcadores();
    return [...idsSelecaoDesenho];
  }

  function encerrarSelecaoDesenho(opcoes) {
    selecaoDesenhoAtiva = false;
    ponteiroDesenho = null;
    pontosDesenho = [];
    if (pathDesenho) pathDesenho.setAttribute('d', '');
    if (overlayDesenho) { overlayDesenho.classList.remove('is-active', 'is-pan'); }
    document.querySelector('.routing-map-pane')?.classList.remove('is-drawing');
    document.querySelector('.routing-workspace')?.classList.remove('is-draw-mode');
    try { mapa?.dragPan?.enable?.(); } catch (_) {}
    if (opcoes?.limpar !== false) idsSelecaoDesenho.clear();
    emitirSelecaoDesenho();
  }

  function bindControles() {
    bindOverlayDesenho();
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
    limparMarcadoresDom();
    selecaoDesenhoAtiva = false; idsSelecaoDesenho.clear(); pontosDesenho = []; ponteiroDesenho = null;
    mapa = null; pronto = false; fitFeito = false; fallbackBaseAtivo = false;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindControles, { once: true });
  else bindControles();

  global.PacoteEMatoMapa = Object.freeze({
    garantirMapa, renderizar, renderizarMarcadores, atualizarRota, ajustarTodos, ajustarParadasImportadas, centralizarParada, centralizarMinhaLocalizacao,
    iniciarSelecaoDesenho, encerrarSelecaoDesenho, definirModoInteracaoSelecao, limparSelecaoDesenho,
    obterSelecaoDesenho: () => [...idsSelecaoDesenho], selecaoDesenhoAtiva: () => selecaoDesenhoAtiva,
    destruir, coordenadaValida, geometriaValida, getMapa: () => mapa
  });
})(window);
