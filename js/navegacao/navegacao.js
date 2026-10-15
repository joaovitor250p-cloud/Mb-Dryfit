(function iniciarNavegacao(global) {
  'use strict';

  let rota = null;
  let mapa = null;
  let mapReady = false;
  let contextoPerdido = false;
  let watchId = null;
  let ordemPendente = [];
  let ultimaPosicao = null;
  let posicaoAnterior = null;
  let seguirPosicao = true;
  let vozAtiva = true;
  let processandoStatus = false;
  let ultimoIdNota = '';
  let ultimoRecalculo = 0;
  let eventosForaRota = 0;
  let ultimaCentralizacao = 0;
  let ultimoRetomar = 0;
  let backgroundEm = 0;
  let reconstruindoMapa = false;
  let estadoPainelNav = 'collapsed';
  let ultimaFalaEm = 0;
  let ultimaChaveFala = '';
  let mapLoadTimer = null;
  let fallbackBaseAtivo = false;
  const falasFeitas = new Set();
  let assinaturaParadasV11 = '';
  let persistenciaCartaoTimer = null;

  const SOURCE_ROUTE = 'pemato-nav-route';
  const SOURCE_ROUTE_STATUS = 'pemato-nav-route-status';
  const SOURCE_PROGRESS = 'pemato-nav-progress';
  const SOURCE_DRIVER = 'pemato-nav-driver';
  const SOURCE_STOPS = 'pemato-nav-all-stops';
  const LAYER_STOPS = 'pemato-nav-stops-simple';
  const LAYER_STOPS_MULTI = 'pemato-nav-stops-multi';
  const LAYER_STOPS_ACTIVE = 'pemato-nav-stops-active';
  const LAYER_STOPS_MULTI_ACTIVE = 'pemato-nav-stops-multi-active';
  let cartaoSelecionadoId = null;
  const LAYER_ROUTE_CASE = 'pemato-nav-route-case';
  const LAYER_ROUTE = 'pemato-nav-route-layer';
  const LAYER_ROUTE_STATUS_CASE = 'pemato-nav-route-status-case';
  const LAYER_ROUTE_STATUS = 'pemato-nav-route-status-layer';
  const LAYER_PROGRESS = 'pemato-nav-progress-layer';
  const LAYER_DRIVER_RING = 'pemato-nav-driver-ring';
  const LAYER_DRIVER = 'pemato-nav-driver';
  const LAYER_DRIVER_DOT = 'pemato-nav-driver-dot';

  function $(id) { return document.getElementById(id); }
  function cfg() { return global.PEMATO_MAP_CONFIG || {}; }
  function fc(features) { return { type: 'FeatureCollection', features: features || [] }; }

  function providerAtual() { return String(global.PacoteEMatoConfiguracoes?.obter?.().navegacao || global.appState?.navegacao?.provider || 'pacote_emato'); }
  function navegacaoInternaAtiva() { return providerAtual() === 'pacote_emato'; }

  function coordenadaValida(lat, lon) {
    if (lat === null || lat === undefined || lon === null || lon === undefined || String(lat).trim() === '' || String(lon).trim() === '') return false;
    const a = Number(lat), o = Number(lon);
    return Number.isFinite(a) && a >= -90 && a <= 90 && Number.isFinite(o) && o >= -180 && o <= 180;
  }

  function geometriaValida(g) { return global.PacoteEMatoServicoRota?.geometriaValida?.(g) === true; }
  function geometriaPontos(g) { return !geometriaValida(g) ? [] : (g.type === 'LineString' ? g.coordinates : g.coordinates.flat()); }

  function formatarDistancia(m) {
    const n = Number(m);
    if (!Number.isFinite(n)) return '—';
    if (n < 1000) return `${Math.max(0, Math.round(n))} m`;
    return `${(n / 1000).toFixed(1).replace('.', ',')} km`;
  }
  function formatarTempo(s) {
    const n = Number(s);
    if (!Number.isFinite(n)) return '—';
    const min = Math.max(0, Math.round(n / 60));
    return min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
  }

  function quantidadePacotesDaParada(p) {
    return global.PacoteEMatoMarcadores?.quantidadePacotesDaParada?.(p) || 1;
  }
  function chaveFisicaMarcador(p) {
    return global.PacoteEMatoMarcadores?.chaveFisicaMarcador?.(p) || `id:${String(p?.id || '')}`;
  }

  function deslocamentoMarcador(indice) {
    if (!indice) return [0,0];
    const anel = Math.ceil(indice / 8), angulo = ((indice - 1) % 8) * Math.PI / 4;
    return [Math.round(Math.cos(angulo)*44*anel), Math.round(Math.sin(angulo)*44*anel)];
  }
  function chaveFisicaMarcador(p) {
    return global.PacoteEMatoMarcadores?.chaveFisicaMarcador?.(p) || `id:${String(p?.id || '')}`;
  }

  function haversine(a, b) {
    if (!a || !b) return Infinity;
    const R = 6371000, rad = Math.PI / 180;
    const lat1 = Number(a[1]) * rad, lat2 = Number(b[1]) * rad;
    const dLat = (Number(b[1]) - Number(a[1])) * rad, dLon = (Number(b[0]) - Number(a[0])) * rad;
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon/2)**2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function paradasPorOrdem() {
    if (!rota) return [];
    const byId = new Map((rota.paradas || []).map(p => [String(p.id), p]));
    const ids = Array.isArray(rota.ordem) && rota.ordem.length ? rota.ordem : (rota.paradas || []).map(p => p.id);
    return ids.map(id => byId.get(String(id))).filter(Boolean);
  }

  function paradaFinalizada(p) {
    return ['entregue', 'concluida', 'nao_entregue'].includes(String(p?.statusEntrega || ''));
  }

  function animarCardParada(direcao) {
    const card = $('navStopCard');
    if (!card || typeof card.animate !== 'function') return;
    try { card.getAnimations?.().forEach(a => a.cancel()); } catch (_) {}
    const x = direcao === 'left' ? 12 : direcao === 'right' ? -12 : 0;
    const frames = x
      ? [{ transform:`translate3d(${x}px,0,0)`, opacity:.90 }, { transform:'translate3d(0,0,0)', opacity:1 }]
      : [{ transform:'scale(.994)', opacity:.94 }, { transform:'scale(1)', opacity:1 }];
    card.animate(frames,{duration:180,easing:'cubic-bezier(.2,.75,.25,1)',fill:'none'});
  }

  function persistirCartaoComAtraso(){
    clearTimeout(persistenciaCartaoTimer);
    persistenciaCartaoTimer = global.setTimeout(() => {
      persistirSelecao({motivo:'troca_cartao'});
    }, 180);
  }


  // V39: a parada verde é o ponto de continuidade da corrida, não necessariamente
  // a primeira pendente da lista. Se o motorista estiver na 2, abrir a 4 e concluir
  // a 4, a 2 continua pendente/branca e a 5 passa a ser a parada ativa/verde.
  function atualizarPendentes() {
    const ordenadas = paradasPorOrdem();
    ordemPendente = ordenadas.filter(p => !paradaFinalizada(p));

    let ativa = ordenadas.find(p => String(p.id) === String(rota?.proximaParadaId || '') && !paradaFinalizada(p));
    if (!ativa) ativa = ordemPendente[0] || null;
    if (rota) rota.proximaParadaId = ativa?.id || null;

    if (global.appState?.navegacao) {
      global.appState.navegacao.paradaAtualId = ativa?.id || null;
      global.appState.navegacao.proximaParadaId = ativa?.id || null;
    }
  }
  function proxima() {
    if (!rota) return ordemPendente[0] || null;
    const ativa = paradasPorOrdem().find(p => String(p.id) === String(rota.proximaParadaId || '') && !paradaFinalizada(p));
    return ativa || ordemPendente[0] || null;
  }
  function proximaPendenteDepois(idAtual) {
    const ordenadas = paradasPorOrdem();
    const indice = ordenadas.findIndex(p => String(p.id) === String(idAtual || ''));
    if (indice >= 0) {
      for (let i = indice + 1; i < ordenadas.length; i++) {
        if (!['entregue','concluida','nao_entregue'].includes(String(ordenadas[i].statusEntrega || ''))) return ordenadas[i];
      }
    }
    return ordemPendente[0] || null;
  }

  function adicionarSource(id, data) {
    if (mapa.getSource(id)) return;
    const opcoes = { type:'geojson', data };
    if (id === SOURCE_ROUTE || id === SOURCE_ROUTE_STATUS || id === SOURCE_PROGRESS) {
      // V20: geometria estável; simplificação leve apenas no pipeline do MapLibre.
      opcoes.tolerance = 0.2;
      opcoes.buffer = 128;
      opcoes.maxzoom = 20;
    }
    mapa.addSource(id, opcoes);
  }
  function antesRotulos() { return (mapa.getStyle()?.layers || []).find(l => l.type === 'symbol')?.id; }

  function removerCamadas3D() {
    if (!mapa || !mapReady) return;
    try {
      global.PacoteEMatoMapaConfig?.exibirConstrucoes2D?.(mapa); global.PacoteEMatoMapaConfig?.limparPontosInteresse?.(mapa);
      (mapa.getStyle()?.layers || []).forEach(layer => {
        if (layer?.type === 'fill-extrusion' && mapa.getLayer(layer.id)) mapa.removeLayer(layer.id);
      });
      mapa.setPitch?.(0);
    } catch (_) {}
  }

  function garantirImagemBalao() {
    if (!mapa) return;
    try {
      if (!mapa.hasImage?.('pemato-driver-arrow')) {
        const a = document.createElement('canvas'); a.width = 56; a.height = 56;
        const c = a.getContext('2d');
        if (c) {
          c.clearRect(0,0,56,56); c.beginPath(); c.moveTo(28,3); c.lineTo(49,49); c.lineTo(28,39); c.lineTo(7,49); c.closePath();
          c.fillStyle='#159766'; c.fill(); c.strokeStyle='#fff'; c.lineWidth=4; c.stroke();
          mapa.addImage('pemato-driver-arrow',c.getImageData(0,0,56,56));
        }
      }
    } catch(_){}
  }

  function prepararIconesParadasV12(features) {
    return global.PacoteEMatoMarcadores?.prepararFeatures?.(mapa, features, {
      prefixo: 'pemato-nav-v12',
      propriedadeSelecao: 'highlighted',
      propriedadeIcone: 'iconV12'
    }) || features;
  }

  function adicionarSourceParadas() {
    if (!mapa || mapa.getSource(SOURCE_STOPS)) return;
    mapa.addSource(SOURCE_STOPS, {
      type:'geojson',
      data:fc([])
    });
  }

  function selecionarMarcadorNav(event) {
    const props=event?.features?.[0]?.properties||{};
    const ids=String(props.ids||props.id||'').split(',').map(v=>v.trim()).filter(Boolean);
    const id=ids[0];
    if(!id)return;
    cartaoSelecionadoId=id;
    definirAcompanhamento(false);
    animarCardParada('pulse');
    atualizarPainel();
    atualizarFontesPontos();
    persistirSelecao({motivo:'selecionar_marcador_mapa'});
  }

  function bindEventosMarcadoresNav() {
    if(!mapa||mapa.__pematoNavMarkersBound)return;
    mapa.__pematoNavMarkersBound=true;
    [LAYER_STOPS,LAYER_STOPS_MULTI,LAYER_STOPS_ACTIVE,LAYER_STOPS_MULTI_ACTIVE].forEach(layerId=>{
      mapa.on('click',layerId,selecionarMarcadorNav);
      mapa.on('mouseenter',layerId,()=>{try{mapa.getCanvas().style.cursor='pointer';}catch(_){}});
      mapa.on('mouseleave',layerId,()=>{try{mapa.getCanvas().style.cursor='';}catch(_){}});
    });
  }

  function garantirCamadas() {
    if (!mapa || !mapReady) return;
    adicionarSource(SOURCE_ROUTE, fc([])); adicionarSource(SOURCE_ROUTE_STATUS, fc([])); adicionarSource(SOURCE_PROGRESS, fc([])); adicionarSource(SOURCE_DRIVER, fc([])); adicionarSourceParadas();
    garantirImagemBalao();
    const before = antesRotulos();
    if (!mapa.getLayer(LAYER_ROUTE_CASE)) mapa.addLayer({ id:LAYER_ROUTE_CASE,type:'line',source:SOURCE_ROUTE,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],10,3.8,13,5.2,16,7.6,18,8.6],'line-opacity':.72,'line-blur':0}}, before);
    if (!mapa.getLayer(LAYER_ROUTE)) mapa.addLayer({ id:LAYER_ROUTE,type:'line',source:SOURCE_ROUTE,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#3f9d72','line-width':['interpolate',['linear'],['zoom'],10,1.9,13,3,16,4.8,18,5.5],'line-opacity':.64,'line-blur':0}}, before);
    if (!mapa.getLayer(LAYER_ROUTE_STATUS_CASE)) mapa.addLayer({ id:LAYER_ROUTE_STATUS_CASE,type:'line',source:SOURCE_ROUTE_STATUS,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':['interpolate',['linear'],['zoom'],10,4.4,13,5.9,16,8.5,18,9.5],'line-opacity':.86}}, before);
    if (!mapa.getLayer(LAYER_ROUTE_STATUS)) mapa.addLayer({ id:LAYER_ROUTE_STATUS,type:'line',source:SOURCE_ROUTE_STATUS,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':['match',['get','status'],'passado','#9ca3af','proxima','#047857','#047857'],'line-width':['interpolate',['linear'],['zoom'],10,2.5,13,3.8,16,5.9,18,6.7],'line-opacity':['match',['get','status'],'passado',0.84,'proxima',1,0.9]}}, before);
    // V28: o trecho efetivamente percorrido fica por cima em cinza. Assim,
    // conforme o motorista avança, o caminho atrás dele deixa de competir
    // visualmente com o próximo trecho destacado.
    if (!mapa.getLayer(LAYER_PROGRESS)) mapa.addLayer({ id:LAYER_PROGRESS,type:'line',source:SOURCE_PROGRESS,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#7d8794','line-width':['interpolate',['linear'],['zoom'],10,2.6,13,3.9,16,6,18,6.8],'line-opacity':.9,'line-blur':0}}, before);
    if (!mapa.getLayer(LAYER_DRIVER_RING)) mapa.addLayer({ id:LAYER_DRIVER_RING,type:'circle',source:SOURCE_DRIVER,paint:{'circle-radius':12,'circle-color':'rgba(5,150,105,.16)','circle-stroke-color':'rgba(5,150,105,.35)','circle-stroke-width':1} });
    if (!mapa.getLayer(LAYER_DRIVER_DOT)) mapa.addLayer({ id:LAYER_DRIVER_DOT,type:'circle',source:SOURCE_DRIVER,filter:['==',['get','mode'],'external'],paint:{'circle-radius':7,'circle-color':'#059669','circle-stroke-color':'#ffffff','circle-stroke-width':3} });
    if (!mapa.getLayer(LAYER_DRIVER)) mapa.addLayer({ id:LAYER_DRIVER,type:'symbol',source:SOURCE_DRIVER,filter:['==',['get','mode'],'internal'],layout:{'icon-image':'pemato-driver-arrow','icon-size':1,'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-rotation-alignment':'map','icon-rotate':['coalesce',['get','heading'],0]} });
    const layoutMarcadorV12 = {
      'icon-image':['get','iconV12'],
      'icon-anchor':'center',
      'icon-size':['interpolate',['linear'],['zoom'],9,.62,12,.72,14,.86,16,1,18,1.04],
      'icon-offset': ['get','markerOffset'],
      'icon-allow-overlap':true,
      'icon-ignore-placement':true,
      'icon-padding':1,
      'symbol-sort-key':['get','order']
    };
    if(!mapa.getLayer(LAYER_STOPS)) mapa.addLayer({id:LAYER_STOPS,type:'symbol',source:SOURCE_STOPS,
      filter:['all',['<=',['get','multi'],1],['!=',['get','highlighted'],true]],
      layout:{...layoutMarcadorV12}});
    if(!mapa.getLayer(LAYER_STOPS_MULTI)) mapa.addLayer({id:LAYER_STOPS_MULTI,type:'symbol',source:SOURCE_STOPS,
      filter:['all',['>',['get','multi'],1],['!=',['get','highlighted'],true]],
      layout:{...layoutMarcadorV12}});
    if(!mapa.getLayer(LAYER_STOPS_ACTIVE)) mapa.addLayer({id:LAYER_STOPS_ACTIVE,type:'symbol',source:SOURCE_STOPS,
      filter:['all',['<=',['get','multi'],1],['==',['get','highlighted'],true]],
      layout:{...layoutMarcadorV12,'icon-allow-overlap':true,'icon-ignore-placement':true}});
    if(!mapa.getLayer(LAYER_STOPS_MULTI_ACTIVE)) mapa.addLayer({id:LAYER_STOPS_MULTI_ACTIVE,type:'symbol',source:SOURCE_STOPS,
      filter:['all',['>',['get','multi'],1],['==',['get','highlighted'],true]],
      layout:{...layoutMarcadorV12,'icon-allow-overlap':true,'icon-ignore-placement':true}});

  }

  function ocultarFallbackMapa() {
    const el = $('navMapFallback');
    if (!el) return;
    el.style.display = 'none';
    el.textContent = '';
  }

  function mostrarFallbackMapa(texto) {
    const el = $('navMapFallback');
    if (!el) return;
    el.textContent = texto || 'Mapa indisponível. Verifique sua conexão.';
    el.style.display = 'flex';
  }

  function ativarMapaBaseFallback() {
    if (!mapa || fallbackBaseAtivo || !cfg().fallbackMapStyle) return false;
    fallbackBaseAtivo = true;
    mapReady = false;
    try {
      mapa.setStyle(cfg().fallbackMapStyle);
      ocultarFallbackMapa();
      clearTimeout(mapLoadTimer);
      mapLoadTimer = setTimeout(() => {
        if (!mapReady) mostrarFallbackMapa('O mapa base não respondeu. Verifique sua conexão.');
      }, 9000);
      return true;
    } catch (erro) {
      console.warn('Pacote É Mato: falha ao ativar mapa de contingência na navegação.', erro);
      return false;
    }
  }

  // O primeiro quadro já mostra a rota, mesmo sem GPS ou rede disponíveis.
  function centroDaRota() {
    const p = ordemPendente.find(p => coordenadaValida(p.latitude, p.longitude)) || paradasPorOrdem().find(p => coordenadaValida(p.latitude, p.longitude));
    if (p && coordenadaValida(p.latitude, p.longitude)) return [Number(p.longitude), Number(p.latitude)];
    const g = normalizarGeometriaVisual(rota?.geometria);
    const c = g?.type === 'MultiLineString' ? g.coordinates?.[0]?.[0] : g?.coordinates?.[0];
    return c && coordenadaValida(c[1], c[0]) ? c : (cfg().initialCenter || [-46.6333,-23.5505]);
  }

  function atualizarTermino() {
    const el = $('navRouteEtaTime');
    const fim = Number(rota?.horarioTerminoEstimado);
    if (el) el.textContent = fim > 0 && Number.isFinite(fim)
      ? new Date(fim).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}) : '—';
    posicionarSobreposicoes();
  }

  function posicionarSobreposicoes() {
    const wrap = $('mapaNavegacao')?.parentElement;
    const card = wrap?.querySelector('.nav-maneuver-card');
    if (!wrap || !card) return;
    const topo = Math.max(100, card.getBoundingClientRect().bottom - wrap.getBoundingClientRect().top + 14);
    wrap.style.setProperty('--nav-overlay-top', `${topo}px`);
  }

  function garantirMapa() {
    const container = $('mapaNavegacao');
    if (!container || mapa || !global.maplibregl) return mapa;
    try {
      ocultarFallbackMapa();
      fallbackBaseAtivo = false;
      mapReady = false;
      clearTimeout(mapLoadTimer);
      mapa = new global.maplibregl.Map({
        container,
        // V18: volta para a mesma base vetorial que funcionava na V14.
        style: cfg().mapStyleUrl,
        center: centroDaRota(),
        zoom: 15,
        pitch: 0,
        bearing: 0,
        maxPitch: 60,
        dragRotate: true,
        touchPitch: true,
        attributionControl: true,
        fadeDuration: 120
      });
      contextoPerdido = false;
      mapa.on('webglcontextlost', () => { contextoPerdido = true; });
      mapa.on('webglcontextrestored', () => { contextoPerdido = false; });
      mapa.touchZoomRotate?.enableRotation?.();
      ['dragstart','zoomstart','rotatestart','pitchstart'].forEach(nome => mapa.on(nome, explorarMapa));
      mapa.on('zoomend', () => { atualizarProgressoVisual(nearestOnRoute(ultimaPosicao)); });

      const ready = () => {
        mapReady = true;
        clearTimeout(mapLoadTimer);
        ocultarFallbackMapa();
        assinaturaParadasV11 = '';
        removerCamadas3D();
        acompanharCamera(0);
        garantirCamadas();
        bindEventosMarcadoresNav();
        try { mapa.resize(); mapa.triggerRepaint?.(); } catch (_) {}
        desenharRota();
        atualizarFontesPontos();
      };

      mapa.on('load', ready);
      mapa.on('style.load', ready);

      // Se o estilo principal realmente não montar, só então cai para OSM.
      // Não trocamos de mapa por erros isolados de fonte/glyph/tile.
      mapLoadTimer = setTimeout(() => {
        if (mapReady) return;
        if (!ativarMapaBaseFallback()) mostrarFallbackMapa('O mapa base não respondeu. Verifique sua conexão.');
      }, 9000);

      mapa.on('error', ev => {
        const mensagem = ev?.error?.message || String(ev?.error || '');
        console.warn('Pacote É Mato: falha no mapa de navegação.', mensagem);
        if (!mapReady) {
          // Dá tempo para o estilo principal terminar antes de acionar contingência.
          setTimeout(() => {
            if (!mapReady && !fallbackBaseAtivo) ativarMapaBaseFallback();
          }, 1800);
        }
      });
    } catch (erro) {
      console.error('Pacote É Mato: erro ao iniciar mapa de navegação.', erro);
      mostrarFallbackMapa(erro?.message || 'Não foi possível abrir o mapa.');
    }
    return mapa;
  }

  function setSource(id, data) { if (!mapa || !mapReady) return; garantirCamadas(); mapa.getSource(id)?.setData?.(data); }

  function limparLinhaRota(linha) {
    const limpa = [];
    (linha || []).forEach(coord => {
      if (!Array.isArray(coord) || coord.length < 2) return;
      const lon = Number(coord[0]), lat = Number(coord[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) return;
      const atual = [lon, lat];
      const anterior = limpa[limpa.length - 1];
      if (!anterior || haversine(anterior, atual) > 0.35) limpa.push(atual);
    });
    return limpa;
  }

  function normalizarGeometriaVisual(g) {
    if (!geometriaValida(g)) return null;
    const orig = g.type === 'LineString' ? [g.coordinates] : g.coordinates;
    const partes = orig.map(limparLinhaRota).filter(linha => linha.length >= 2);
    if (!partes.length) return null;

    const distanciaCoord = (a, b) => haversine(a, b);
    const unidas = [];
    let atual = partes[0].slice();
    const LIMITE_JUNCAO_M = 8;
    for (let i = 1; i < partes.length; i++) {
      let proxima = partes[i].slice();
      const fim = atual[atual.length - 1];
      const dInicio = distanciaCoord(fim, proxima[0]);
      const dFim = distanciaCoord(fim, proxima[proxima.length - 1]);
      if (Math.min(dInicio, dFim) <= LIMITE_JUNCAO_M) {
        if (dFim < dInicio) proxima.reverse();
        const d = distanciaCoord(atual[atual.length - 1], proxima[0]);
        atual.push(...(d <= 0.35 ? proxima.slice(1) : proxima));
      } else {
        unidas.push(atual);
        atual = proxima;
      }
    }
    unidas.push(atual);
    return unidas.length === 1 ? { type:'LineString', coordinates:unidas[0] } : { type:'MultiLineString', coordinates:unidas };
  }

  function desenharRota() {
    if (!mapa || !mapReady) return;
    const g = normalizarGeometriaVisual(rota?.geometria);
    setSource(SOURCE_ROUTE, fc(g ? [{type:'Feature',properties:{},geometry:g}] : []));
    const segmentosStatus = global.PacoteEMatoMarcadores?.segmentosStatusDaRota?.(rota) || [];
    setSource(SOURCE_ROUTE_STATUS, fc(segmentosStatus));
  }

  function atualizarFontesPontos() {
    if (!mapa || !mapReady) return;
    const p = proxima();
    setSource(SOURCE_DRIVER, fc(ultimaPosicao && coordenadaValida(ultimaPosicao.lat,ultimaPosicao.lon) ? [{type:'Feature',properties:{heading:direcaoCamera(),mode:navegacaoInternaAtiva()?'internal':'external'},geometry:{type:'Point',coordinates:[Number(ultimaPosicao.lon),Number(ultimaPosicao.lat)]}}] : []));
    const ordenadas = paradasPorOrdem();
    const grupos = new Map();
    ordenadas.forEach((stop, i) => {
      if (!coordenadaValida(stop.latitude, stop.longitude)) return;
      const key = chaveFisicaMarcador(stop);
      if (!grupos.has(key)) grupos.set(key, []);
      grupos.get(key).push({ stop, order: i + 1 });
    });
    const ocupacaoVisual = new Map();
    const features = [];
    grupos.forEach(grupo => {
      grupo.sort((a,b) => a.order - b.order);
      const ativos = grupo.filter(item => !['entregue','concluida','nao_entregue'].includes(String(item.stop?.statusEntrega || '')));
      const grupoVisual = ativos.length ? ativos : grupo;
      // V41: o verde pertence à continuidade da corrida, não ao card aberto.
      // Ex.: se a 28 foi concluída, a 29 continua verde mesmo quando o motorista
      // desliza e consulta a parada 5. Se ele concluir a 4 fora de ordem, a 2
      // continua pendente/branca e a 5 passa a ser a continuação verde.
      const idAtivo = String(p?.id || rota?.proximaParadaId || '');
      const idConsultado = String(cartaoSelecionadoId || global.appState?.navegacao?.paradaExibidaId || '');
      const consultada = grupo.find(item => String(item.stop?.id) === idConsultado);
      const ativa = grupo.find(item => String(item.stop?.id) === idAtivo);
      const principal = consultada || ativa || grupoVisual[0];
      const stop = principal.stop;
      const multi = grupoVisual.reduce((total,item) => total + quantidadePacotesDaParada(item.stop), 0);
      const lat = Number(stop.latitude), lon = Number(stop.longitude);
      // V40: sem deslocamento dinâmico. O balão fica ancorado na coordenada
      // real da parada e não muda de posição ao selecionar, entregar ou recalcular.
      const stackIndex = 0;
      const ids = grupo.map(item => String(item.stop.id));
      const current = ids.includes(idAtivo);
      const selected = ids.includes(idConsultado) && idConsultado !== '';
      // V47: dois verdes independentes. A parada ativa da corrida permanece verde
      // e a parada consultada pelo motorista também fica verde sem substituir a ativa.
      features.push({type:'Feature',properties:{id:String(stop.id),ids:ids.join(','),order:principal.order,multi,stackIndex,markerOffset:[0,0],status:stop.statusEntrega||'pendente',current,selected,highlighted:(current||selected)},geometry:{type:'Point',coordinates:[lon,lat]}});
    });
    prepararIconesParadasV12(features);
    const assinatura = features.map(f => {
      const p = f.properties || {};
      const c = f.geometry?.coordinates || [];
      return `${p.id}:${p.order}:${p.multi}:${p.status||''}:${p.current?1:0}:${p.selected?1:0}:${p.highlighted?1:0}:${p.iconV12||''}:${c[0]}:${c[1]}`;
    }).join('|');
    if (assinatura !== assinaturaParadasV11) {
      assinaturaParadasV11 = assinatura;
      setSource(SOURCE_STOPS, fc(features));
    }
  }

  function nearestOnRoute(pos) {
    const coords = geometriaPontos(rota?.geometria);
    if (!coords.length || !pos) return null;
    const lon0 = Number(pos.lon), lat0 = Number(pos.lat), rad = Math.PI/180;
    const cos = Math.cos(lat0*rad), kx=111320*cos, ky=110540;
    let best={distance:Infinity,index:0,t:0,point:coords[0]};
    for(let i=0;i<coords.length-1;i++){
      const a=coords[i], b=coords[i+1];
      const ax=(a[0]-lon0)*kx, ay=(a[1]-lat0)*ky, bx=(b[0]-lon0)*kx, by=(b[1]-lat0)*ky;
      const dx=bx-ax, dy=by-ay, den=dx*dx+dy*dy;
      const t=den?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/den)):0;
      const px=ax+t*dx, py=ay+t*dy, d=Math.hypot(px,py);
      if(d<best.distance){best={distance:d,index:i,t,point:[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]};}
    }
    return best;
  }

  function distanciaAoLongo(coords, fromIndex, toIndex, firstPoint) {
    if (!coords.length) return Infinity;
    let i=Math.max(0,Math.min(coords.length-1,Number(fromIndex||0))), fim=Math.max(i,Math.min(coords.length-1,Number(toIndex||i)));
    let total=0, atual=firstPoint || coords[i];
    for(let j=i+1;j<=fim;j++){ total+=haversine(atual,coords[j]); atual=coords[j]; }
    return total;
  }

  function instrucaoAtual(nearest) {
    const lista=Array.isArray(rota?.instrucoes)?rota.instrucoes:[];
    if(!lista.length) return null;
    if(!nearest) return lista[0];
    return lista.find(inst => Number.isFinite(Number(inst.toIndex)) && Number(inst.toIndex)>=nearest.index) || lista[lista.length-1];
  }

  function atualizarProgressoVisual(nearest) {
    const coords=geometriaPontos(rota?.geometria);
    if(!mapa||!mapReady||!coords.length||!nearest){setSource(SOURCE_PROGRESS,fc([]));return;}
    const usados=coords.slice(0,nearest.index+1); usados.push(nearest.point);
    setSource(SOURCE_PROGRESS,fc(usados.length>=2?[{type:'Feature',properties:{},geometry:{type:'LineString',coordinates:usados}}]:[]));
  }

  function vozDisponivel() { return 'speechSynthesis' in global && 'SpeechSynthesisUtterance' in global; }
  function falar(texto, chave) {
    if(!navegacaoInternaAtiva()||!vozAtiva||!texto||!vozDisponivel()||falasFeitas.has(chave)) return;
    const agora=Date.now();
    if(chave===ultimaChaveFala && agora-ultimaFalaEm<12000) return;
    if(agora-ultimaFalaEm<2400) return;
    falasFeitas.add(chave); ultimaChaveFala=chave; ultimaFalaEm=agora;
    try{
      global.speechSynthesis.cancel?.();
      const u=new SpeechSynthesisUtterance(texto); u.lang='pt-BR'; u.rate=.98;
      const vozes=global.speechSynthesis.getVoices?.()||[];
      u.voice=vozes.find(v=>String(v.lang||'').toLowerCase().startsWith('pt-br'))||vozes.find(v=>String(v.lang||'').toLowerCase().startsWith('pt'))||null;
      global.speechSynthesis.speak(u);
    }catch(_){ }
  }

  function atualizarInstrucao(nearest) {
    const coords=geometriaPontos(rota?.geometria), inst=instrucaoAtual(nearest);
    const dist=inst&&nearest&&Number.isFinite(Number(inst.toIndex))?distanciaAoLongo(coords,nearest.index,Number(inst.toIndex),nearest.point):Number(inst?.distancia||NaN);
    if($('navManeuverText')) $('navManeuverText').textContent=inst?.texto||'Siga a rota destacada';
    if($('navManeuverStreet')) $('navManeuverStreet').textContent=inst?.rua||'Acompanhe o mapa e a próxima parada';
    if($('navManeuverDistance')) $('navManeuverDistance').textContent=Number.isFinite(dist)?formatarDistancia(dist):'—';
    if(inst&&Number.isFinite(dist)){
      const id=inst.id||`${inst.legIndex}:${inst.stepIndex}`;
      if(dist<=35) falar(inst.texto,`${id}:35`);
      else if(dist<=120) falar(`Em ${Math.max(20,Math.round(dist/10)*10)} metros, ${inst.texto}`,`${id}:120`);
      else if(dist<=400) falar(`Em ${Math.round(dist/50)*50} metros, ${inst.texto}`,`${id}:400`);
    }
  }

  function definirAcompanhamento(ativo) {
    seguirPosicao = ativo;
    if(global.appState?.navegacao) global.appState.navegacao.seguirPosicao = ativo;
    atualizarBotaoFollow();
  }
  function atualizarBotaoFollow() {
    const b=$('navFollowBtn');
    if(b){ b.hidden=seguirPosicao; b.title='Recentralizar e acompanhar'; b.setAttribute('aria-label','Recentralizar e acompanhar'); }
  }
  function explorarMapa(event) {
    if(event?.originalEvent) definirAcompanhamento(false);
  }
  function direcaoCamera() {
    const h = ultimaPosicao?.heading;
    if(h != null && Number.isFinite(Number(h))) return Number(h);
    const pos = ultimaPosicao || {lon:centroDaRota()[0],lat:centroDaRota()[1]};
    const perto=nearestOnRoute(pos), pontos=geometriaPontos(rota?.geometria);
    if(perto && perto.distance < 100 && pontos[perto.index+1]) {
      const a=pontos[perto.index], b=pontos[perto.index+1];
      return bearingEntre({lon:a[0],lat:a[1]},{lon:b[0],lat:b[1]}) ?? mapa?.getBearing?.() ?? 0;
    }
    return mapa?.getBearing?.() || 0;
  }
  function acompanharCamera(duracao=500) {
    if(!seguirPosicao || !mapa || !mapReady) return;
    const interna=navegacaoInternaAtiva(), container=$('mapaNavegacao');
    const area=container?.getBoundingClientRect();
    let offset=[0,0];
    if(area?.height && interna){
      const painel=$('navigationPanel')?.getBoundingClientRect();
      const manobra=container.parentElement?.querySelector('.nav-maneuver-card')?.getBoundingClientRect();
      const topo=Math.max(0,(manobra?.bottom || area.top)-area.top)+16;
      const sobrepoe=painel && painel.left<area.right && painel.right>area.left && painel.top<area.bottom;
      const fundo=sobrepoe ? Math.max(topo, painel.top-area.top-24) : area.height-24;
      offset=[0,topo+(fundo-topo)*0.72-area.height/2];
    }
    const recente=ultimaPosicao && Date.now()-ultimaPosicao.at<30000;
    mapa.easeTo({center:recente?[ultimaPosicao.lon,ultimaPosicao.lat]:centroDaRota(),
      zoom:interna?17.5:16, pitch:interna?58:0, bearing:interna?direcaoCamera():0,
      offset, duration:duracao});
  }

  function atualizarBotaoVoz(){ const b=$('navVoiceBtn'); if(b){const interna=navegacaoInternaAtiva();b.style.display=interna?'':'none';b.classList.toggle('active',vozAtiva&&interna);b.textContent=vozAtiva?'Voz ativa':'Voz muda';if(!interna)try{global.speechSynthesis?.cancel?.();}catch(_){}} }

  function detalhesDaParada(p) {
    if (!p) return '';
    const itens = [];
    const add = valor => {
      const texto = String(valor || '').trim();
      if (!texto) return;
      if (!itens.some(item => item.toLocaleLowerCase('pt-BR') === texto.toLocaleLowerCase('pt-BR'))) itens.push(texto);
    };
    add(p.complemento);
    if (p.bloco) add(`Bloco ${p.bloco}`);
    if (p.apartamento) add(`Apartamento ${p.apartamento}`);
    if (p.sala) add(`Sala ${p.sala}`);
    if (p.loja) add(`Loja ${p.loja}`);
    const vis = new Set(Array.isArray(rota?.camposVisiveisParada) ? rota.camposVisiveisParada : ['pacote','endereco','bairro','cidade']);
    if (vis.has('atId') && p.atId) add(`AT ID: ${p.atId}`);
    if (vis.has('sequenceOrigem') && p.sequenceOrigem && p.sequenceOrigem !== '-') add(`Sequence: ${p.sequenceOrigem}`);
    if (vis.has('stopOrigem') && p.stopOrigem && p.stopOrigem !== '-') add(`Stop: ${p.stopOrigem}`);
    if (vis.has('pacote') && (p.pacotes || []).length) add(`SPX TN: ${(p.pacotes || []).join(', ')}`);
    const localParts=[]; if(vis.has('bairro')&&p.bairro)localParts.push(p.bairro); if(vis.has('cidade')&&p.cidade)localParts.push(p.cidade); if(vis.has('cep')&&p.cep)localParts.push(p.cep);
    const local = localParts.map(v => String(v || '').trim()).filter(Boolean).join(' · ');
    if (local) add(local);
    if (vis.has('latitude') && vis.has('longitude') && coordenadaValida(p.latitude,p.longitude)) add(`GPS: ${Number(p.latitude).toFixed(6)}, ${Number(p.longitude).toFixed(6)}`);
    return itens.join('\n');
  }

  function observacaoClienteDaParada(p) {
    if (!p) return '';
    const itens = [];
    const add = valor => {
      const texto = String(valor || '').trim();
      if (!texto) return;
      const norm = texto.toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
      // Evita repetir um pedaço de uma observação maior. Ex.: se já temos
      // "T3 ROMA APTO 402", não adiciona novamente apenas "APTO 402".
      if (itens.some(v => {
        const atual = String(v || '').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ');
        return atual === norm || atual.includes(norm) || norm.includes(atual);
      })) return;
      itens.push(texto);
    };

    // Campo de observação da planilha é sempre prioritário.
    add(p.observacao);

    // Complementos operacionais também são instruções úteis para o entregador.
    if (p.apartamento) add(/^ap(?:to|artamento)?\b/i.test(String(p.apartamento)) ? p.apartamento : `Ap ${p.apartamento}`);
    if (p.bloco) add(/^bloco\b/i.test(String(p.bloco)) ? p.bloco : `Bloco ${p.bloco}`);
    if (p.sala) add(/^sala\b/i.test(String(p.sala)) ? p.sala : `Sala ${p.sala}`);
    if (p.loja) add(/^loja\b/i.test(String(p.loja)) ? p.loja : `Loja ${p.loja}`);
    add(p.complemento);

    // Algumas planilhas trazem o apartamento/instrução dentro do endereço.
    // Captura somente trechos claramente operacionais, sem copiar o endereço inteiro.
    const endereco = String(p.enderecoOriginal || '');
    const padroes = [
      /\b(?:ap|apt|apto|apartamento)\.?\s*[-º°#:]?\s*[a-z0-9-]+/ig,
      /\bbloco\s*[-º°#:]?\s*[a-z0-9-]+/ig,
      /\b(?:casa|sala|loja)\s*[-º°#:]?\s*[a-z0-9-]+/ig,
      /\b(?:tocar|toque)\s+(?:a\s+)?campainha\b[^,;|]*/ig,
      /\b(?:ligar|chamar|interfone|portaria)\b[^,;|]*/ig
    ];
    padroes.forEach(re => (endereco.match(re) || []).forEach(add));
    return itens.join(' · ');
  }

  function atualizarPainel() {
    atualizarTermino();
    atualizarPendentes(); const p=paradasPorOrdem().find(s=>String(s.id)===String(cartaoSelecionadoId)) || proxima();
    const pos=paradasPorOrdem().findIndex(s=>String(s.id)===String(p?.id));
    if($('navStopNumber')) $('navStopNumber').textContent=pos>=0?`PARADA ${String(pos+1).padStart(2,'0')}`:'SEM PARADA';
    if($('navNextAddress')) $('navNextAddress').textContent=p?.enderecoOriginal||'Nenhuma parada pendente';
    if($('navNextComplement')) $('navNextComplement').textContent=detalhesDaParada(p);
    const obsCliente = observacaoClienteDaParada(p);
    if($('navCustomerObservationText')) $('navCustomerObservationText').textContent = obsCliente || 'Sem observações do cliente.';
    if($('navCustomerObservation')) $('navCustomerObservation').classList.toggle('is-empty', !obsCliente);
    if($('navNextPackages')) {
      const quantidadeFisica = p ? (global.PacoteEMatoOperacoesPacotes?.quantidadePacotesFisicos?.(rota, p) ?? (p?.pacotes?.length || 0)) : 0;
      $('navNextPackages').textContent = `${quantidadeFisica} ${quantidadeFisica === 1 ? 'pacote' : 'pacotes'}`;
    }
    if($('navStopCard')) $('navStopCard').dataset.status = String(p?.statusEntrega || 'pendente');
    atualizarStatusCard(p);
    if(global.appState?.navegacao){global.appState.navegacao.paradaExibidaId=p?.id||null;global.appState.navegacao.proximaParadaId=proxima()?.id||null;}
    const idNota=String(p?.id||'');
    if(idNota!==ultimoIdNota){ultimoIdNota=idNota;if($('navDeliveryNote'))$('navDeliveryNote').value=String(p?.observacaoEntrega||'');}
    const list=$('navInstructions'); if(list){list.replaceChildren();(Array.isArray(rota?.instrucoes)?rota.instrucoes.slice(0,5):[]).forEach((inst,i)=>{const item=document.createElement('div');item.className='nav-instruction';const n=document.createElement('span');n.textContent=String(i+1);const t=document.createElement('div'),strong=document.createElement('strong'),meta=document.createElement('small');strong.textContent=inst.texto||'Continue';meta.textContent=`${formatarDistancia(inst.distancia)} · ${formatarTempo(inst.tempo)}`;t.append(strong,meta);item.append(n,t);list.append(item);});}
    atualizarFontesPontos();
  }

  function mostrarConclusao() {
    if(!rota) return;
    const entregues=(rota.paradas||[]).filter(p=>['entregue','concluida'].includes(p.statusEntrega)).length;
    const falhas=(rota.paradas||[]).filter(p=>p.statusEntrega==='nao_entregue').length;
    if($('navCompletionDelivered')) $('navCompletionDelivered').textContent=String(entregues);
    if($('navCompletionFailed')) $('navCompletionFailed').textContent=String(falhas);
    if($('navCompletionTotal')) $('navCompletionTotal').textContent=String(rota.paradas?.length||0);
    const percorrida = Number(rota.distanciaPercorridaMetros || 0);
    const inicio = Number(global.appState?.navegacao?.iniciadaEm || rota.iniciadoEm || 0);
    const execucao = inicio ? Math.max(0, Math.round((Date.now() - inicio) / 1000)) : null;
    if($('navCompletionDistance')) $('navCompletionDistance').textContent=formatarDistancia(percorrida > 0 ? percorrida : rota.distanciaTotalMetros);
    if($('navCompletionTime')) $('navCompletionTime').textContent=formatarTempo(execucao ?? rota.duracaoTotalSegundos);
    const modal=$('navCompletionBackdrop'); if(modal) modal.style.display='flex';
    if(global.appState?.navegacao) global.appState.navegacao.conclusaoPendente=true;
    falar('Todas as paradas foram tratadas. Revise os resultados antes de finalizar a rota.','route:complete');
  }

  async function recalcular(motivo) {
    if(!rota||!ultimaPosicao||!global.PacoteEMatoServicoRota) return false;
    atualizarPendentes(); if(!ordemPendente.length) return false;
    const points=[{lat:ultimaPosicao.lat,lon:ultimaPosicao.lon}];
    ordemPendente.forEach(p=>{if(coordenadaValida(p.latitude,p.longitude))points.push({lat:Number(p.latitude),lon:Number(p.longitude)});});
    if(rota.retornarAoInicio&&rota.pontoInicial&&coordenadaValida(rota.pontoInicial.lat,rota.pontoInicial.lon))points.push({lat:Number(rota.pontoInicial.lat),lon:Number(rota.pontoInicial.lon)});
    else if(rota.pontoFinal&&coordenadaValida(rota.pontoFinal.lat,rota.pontoFinal.lon))points.push({lat:Number(rota.pontoFinal.lat),lon:Number(rota.pontoFinal.lon)});
    if(points.length<2) return false;
    const btn=$('navRecalculateBtn');
    const textoBtn=btn?.textContent||'Recalcular rota';
    if(btn){btn.disabled=true;btn.textContent='Recalculando...';}
    if($('navGpsStatus')) $('navGpsStatus').textContent='Recalculando trajeto pelas ruas...';
    try{
      const response=await global.PacoteEMatoServicoRota.calcularRotaPelasRuas(rota,points), feature=response.feature;
      rota.geometria=feature.geometry; rota.distanciaTotalMetros=Number(feature.properties?.distance||0); rota.duracaoDirecaoSegundos=Number(feature.properties?.time||0);
      rota.pernas=Array.isArray(feature.properties?.legs)?feature.properties.legs:[]; rota.instrucoes=global.PacoteEMatoServicoRota.extrairInstrucoes(feature); rota.recalculadoEm=Date.now();
      const pendentesAgora=ordemPendente.length; rota.duracaoParadasSegundos=pendentesAgora*Number(rota.tempoParadaSegundos||0);
      rota.duracaoTotalSegundos=Number(rota.duracaoDirecaoSegundos||0)+Number(rota.duracaoParadasSegundos||0);
      rota.horarioTerminoEstimado=Date.now()+rota.duracaoTotalSegundos*1000;
      await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true}); desenharRota(); atualizarPainel(); ultimoRecalculo=Date.now(); eventosForaRota=0;
      if($('navGpsStatus')) $('navGpsStatus').textContent=motivo==='desvio'?'Rota recalculada após desvio':'Rota atualizada';
      return true;
    }catch(erro){global.notificar?.(erro?.message||'Não foi possível recalcular a rota.'); if($('navGpsStatus')) $('navGpsStatus').textContent='Não foi possível recalcular'; return false;}
    finally{if(btn){btn.disabled=false;btn.textContent=textoBtn;}}
  }

  function bearingEntre(a,b){
    if(!a||!b) return null;
    const rad=Math.PI/180; const lat1=Number(a.lat)*rad,lat2=Number(b.lat)*rad;
    const dLon=(Number(b.lon)-Number(a.lon))*rad;
    const y=Math.sin(dLon)*Math.cos(lat2);
    const x=Math.cos(lat1)*Math.sin(lat2)-Math.sin(lat1)*Math.cos(lat2)*Math.cos(dLon);
    const deg=(Math.atan2(y,x)/rad+360)%360;
    return Number.isFinite(deg)?deg:null;
  }

  function processarPosicao(pos) {
    const nova={lat:Number(pos.coords.latitude),lon:Number(pos.coords.longitude),accuracy:Number(pos.coords.accuracy||0),heading:pos.coords.heading!=null&&Number.isFinite(Number(pos.coords.heading))&&Number(pos.coords.heading)>=0?Number(pos.coords.heading):null,at:Date.now()};
    if(nova.heading==null && posicaoAnterior && coordenadaValida(posicaoAnterior.lat,posicaoAnterior.lon)) {
      const mov=haversine([posicaoAnterior.lon,posicaoAnterior.lat],[nova.lon,nova.lat]);
      if(Number.isFinite(mov)&&mov>=Math.max(8, nova.accuracy || 0)) nova.heading=bearingEntre(posicaoAnterior,nova);
    }
    ultimaPosicao=nova;
    if(!coordenadaValida(ultimaPosicao.lat,ultimaPosicao.lon)) return;
    if(global.appState?.navegacao){global.appState.navegacao.ultimaPosicao=ultimaPosicao;global.appState.navegacao.ultimaAtualizacaoEm=Date.now();}
    atualizarFontesPontos();
    if (posicaoAnterior && coordenadaValida(posicaoAnterior.lat,posicaoAnterior.lon)) {
      const trecho = haversine([posicaoAnterior.lon,posicaoAnterior.lat],[ultimaPosicao.lon,ultimaPosicao.lat]);
      if (Number.isFinite(trecho) && trecho >= 1 && trecho < 1000) rota.distanciaPercorridaMetros = Number(rota.distanciaPercorridaMetros || 0) + trecho;
    }
    posicaoAnterior = { ...ultimaPosicao };
    const nearest=nearestOnRoute(ultimaPosicao); atualizarProgressoVisual(nearest); atualizarInstrucao(nearest);
    const p=proxima(); if(p&&coordenadaValida(p.latitude,p.longitude)){
      const d=haversine([ultimaPosicao.lon,ultimaPosicao.lat],[Number(p.longitude),Number(p.latitude)]);
      if(d<=120) falar(`Aproximando-se da próxima parada: ${p.enderecoOriginal||'destino'}`,`stop:${p.id}:near`);
      if(d<=30) falar('Você chegou à parada.',`stop:${p.id}:arrived`);
    }
    const limite=Math.max(80,(ultimaPosicao.accuracy||0)*2.2);
    if(nearest&&nearest.distance>limite) eventosForaRota++; else eventosForaRota=0;
    if(global.appState?.navegacao) global.appState.navegacao.foraDaRota=eventosForaRota>=3;
    if($('navGpsStatus')) $('navGpsStatus').textContent=eventosForaRota>=3?'Fora da rota planejada':`GPS ativo${ultimaPosicao.accuracy?` · precisão ${Math.round(ultimaPosicao.accuracy)} m`:''}`;
    if(eventosForaRota>=3&&Date.now()-ultimoRecalculo>60000&&global.PacoteEMatoServicoRota?.endpoint?.('route')) recalcular('desvio');
    if(seguirPosicao&&mapa&&mapReady&&Date.now()-ultimaCentralizacao>1200){
      ultimaCentralizacao=Date.now();
      try{
        acompanharCamera();
      }catch(_){}
    }
  }

  function iniciarGPS() {
    if(!navigator.geolocation||watchId!=null){if(!navigator.geolocation&&$('navGpsStatus'))$('navGpsStatus').textContent='GPS indisponível neste navegador';return;}
    watchId=navigator.geolocation.watchPosition(processarPosicao,erro=>{if($('navGpsStatus'))$('navGpsStatus').textContent=erro?.code===1?'Permissão de localização negada':'Sinal de GPS indisponível';},{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
  }
  function pararGPS(){if(watchId!=null){try{navigator.geolocation.clearWatch(watchId);}catch(_){}watchId=null;}}

  async function persistirSelecao(extra){
    if(!rota)return;
    const alvo=cartaoSelecionadoId||proxima()?.id||null;
    const exibida=paradasPorOrdem().find(p=>String(p.id)===String(alvo||''));
    // O motorista pode digitar uma nota e tocar em Navegar sem tirar o foco do campo.
    // Copiamos o valor antes de abrir outro aplicativo para não perder esse texto.
    if(exibida&&$('navDeliveryNote')) exibida.observacaoEntrega=String($('navDeliveryNote').value||'').trim();
    rota.navegacaoSeguirPosicao=seguirPosicao;
    rota.paradaSelecionadaId=alvo;
    rota.proximaParadaId=proxima()?.id||null;
    if(global.appState?.navegacao){global.appState.navegacao.paradaExibidaId=alvo;global.appState.navegacao.proximaParadaId=rota.proximaParadaId;}
    try{await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});}catch(e){console.warn('Não foi possível persistir a parada selecionada',e);}
    try{await global.PacoteEMatoSessao?.persistirAgora?.(Object.assign({motivo:'navegacao',paradaSelecionadaId:alvo,proximaParadaId:rota.proximaParadaId,navegacaoAtiva:true},extra||{}));}catch(_){}
  }
  function selecionarCartao(delta){
    const lista=paradasPorOrdem(); if(!lista.length)return;
    const id=cartaoSelecionadoId||proxima()?.id;
    const indice=Math.max(0,lista.findIndex(s=>String(s.id)===String(id)));
    const anterior=lista[indice];
    if(anterior && $('navDeliveryNote')) anterior.observacaoEntrega=String($('navDeliveryNote').value||'').trim();
    const alvo=lista[Math.max(0,Math.min(lista.length-1,indice+delta))];
    if(!alvo || String(alvo.id)===String(id))return;
    definirAcompanhamento(false);
    cartaoSelecionadoId=alvo.id;
    // V43: o marcador verde pertence à continuidade da corrida, então navegar
    // pelos cards não precisa reconstruir a source de marcadores. Evita duas
    // repinturas pesadas e deixa o gesto muito mais fluido em celulares.
    global.requestAnimationFrame(() => {
      atualizarPainel();
      animarCardParada(delta>0?'left':'right');
      // V47: atualiza o destaque da parada consultada sem alterar a parada ativa.
      // Os ícones são cacheados, então esta atualização é bem mais leve que reconstruir o mapa.
      atualizarFontesPontos();
    });
    persistirCartaoComAtraso();
    if(mapa&&mapReady&&coordenadaValida(alvo.latitude,alvo.longitude)){
      const interna=navegacaoInternaAtiva();
      try { mapa.stop?.(); } catch (_) {}
      mapa.easeTo({center:[Number(alvo.longitude),Number(alvo.latitude)],zoom:interna?17:Math.max(15,mapa.getZoom()),pitch:interna?48:0,duration:240,easing:t=>1-Math.pow(1-t,3)});
    }
  }
  async function abrirExterno(provider){
    const p=paradasPorOrdem().find(s=>String(s.id)===String(cartaoSelecionadoId))||proxima();if(!p)return;
    cartaoSelecionadoId=p.id;
    await persistirSelecao({motivo:`abrir_${provider}`,navegacaoProvider:provider});
    try{sessionStorage.setItem('pemato_parada_externa',String(p.id));sessionStorage.setItem('pemato_provider_externo',String(provider));}catch(_){}
    const lat=Number(p.latitude),lon=Number(p.longitude), endereco=String(p.enderecoOriginal||'').trim();
    const coord=coordenadaValida(p.latitude,p.longitude)?`${lat},${lon}`:endereco;
    const ua=navigator.userAgent||''; const android=/Android/i.test(ua), ios=/iPhone|iPad|iPod/i.test(ua);
    let url='';
    if(provider==='waze'){
      if(android) url=coordenadaValida(p.latitude,p.longitude)?`waze://?ll=${encodeURIComponent(coord)}&navigate=yes`:`waze://?q=${encodeURIComponent(endereco)}&navigate=yes`;
      else if(ios) url=coordenadaValida(p.latitude,p.longitude)?`waze://?ll=${encodeURIComponent(coord)}&navigate=yes`:`waze://?q=${encodeURIComponent(endereco)}&navigate=yes`;
      else url=coordenadaValida(p.latitude,p.longitude)?`https://www.waze.com/ul?ll=${encodeURIComponent(coord)}&navigate=yes`:`https://www.waze.com/ul?q=${encodeURIComponent(endereco)}&navigate=yes`;
    } else if(provider==='google'){
      if(android) url=`google.navigation:q=${encodeURIComponent(coord)}&mode=d`;
      else if(ios) url=`comgooglemaps://?daddr=${encodeURIComponent(coord)}&directionsmode=driving`;
      else url=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coord)}&travelmode=driving`;
    }
    if(!url)return;
    // Em Android/iOS prioriza o app nativo e não navega o PWA para uma página web.
    if(android||ios){ global.location.href=url; } else { const aberta=global.open(url,'_blank','noopener'); if(!aberta) global.location.href=url; }
  }


  async function salvarStatusParadaAtual(status,motivo,observacao){
    if(processandoStatus) return; const atual=paradasPorOrdem().find(s=>String(s.id)===String(cartaoSelecionadoId))||proxima(); if(!rota||!atual)return; const parada=rota.paradas.find(p=>String(p.id)===String(atual.id)); if(!parada||['entregue','concluida','nao_entregue'].includes(parada.statusEntrega))return;
    processandoStatus=true; try{
      if(!['entregue','nao_entregue'].includes(status)) return;
      const motivoFinal=status==='nao_entregue'?String(motivo||'').trim():'';
      const timestamp=Date.now(); parada.statusEntrega=status; parada.statusAtualizadoEm=timestamp; parada.observacaoEntrega=String($('navDeliveryNote')?.value||'').trim();
      if(status==='entregue'){parada.motivoNaoEntrega='';parada.observacaoNaoEntrega='';parada.entregueEm=timestamp;parada.naoEntregueEm=null;}
      else {parada.motivoNaoEntrega=motivoFinal;parada.observacaoNaoEntrega=String(observacao||'').trim();parada.entregueEm=null;parada.naoEntregueEm=timestamp;}
      parada.alteradoEm=timestamp;
      const idTratado=parada.id;
      atualizarPendentes();
      const proximaDepois=proximaPendenteDepois(idTratado) || proxima();
      cartaoSelecionadoId=proximaDepois?.id || idTratado;
      rota.paradaSelecionadaId=cartaoSelecionadoId;
      rota.proximaParadaId=proximaDepois?.id||null;
      rota.duracaoParadasSegundos=ordemPendente.length*Number(rota.tempoParadaSegundos||0);
      if(Number.isFinite(Number(rota.duracaoDirecaoSegundos))){rota.duracaoTotalSegundos=Number(rota.duracaoDirecaoSegundos||0)+Number(rota.duracaoParadasSegundos||0);rota.horarioTerminoEstimado=Date.now()+rota.duracaoTotalSegundos*1000;}
      await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});
      await global.PacoteEMatoSessao?.persistirAgora?.({motivo:status==='entregue'?'parada_entregue':'parada_nao_entregue',paradaSelecionadaId:cartaoSelecionadoId,proximaParadaId:cartaoSelecionadoId,navegacaoAtiva:true});
      if($('navDeliveryNote'))$('navDeliveryNote').value=''; if($('navExtrasPanel'))$('navExtrasPanel').style.display='none'; ultimoIdNota='';
      animarCardParada('left');
      atualizarPainel(); desenharRota(); global.PacoteEMatoHistorico?.renderizar?.(); global.PacoteEMatoAppShell?.atualizarInicio?.();
      if(ordemPendente.length){if(global.PacoteEMatoServicoRota?.endpoint?.('route'))await recalcular('proxima');else {atualizarFontesPontos();desenharRota();}}
      else{rota.status='aguardando_finalizacao';rota.conclusaoPendente=true;await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});mostrarConclusao();}
    }finally{processandoStatus=false;}
  }

  async function finalizarRota(){if(!rota)return;rota.status='concluida';rota.concluidoEm=Date.now();rota.conclusaoPendente=false;await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};if($('navCompletionBackdrop'))$('navCompletionBackdrop').style.display='none';await global.PacoteEMatoRotaStore.limparRotaAtiva();global.PacoteEMatoAppShell?.abrirModulo?.('historico');}
  function revisarResultados(){if($('navCompletionBackdrop'))$('navCompletionBackdrop').style.display='none';global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');}

  async function navegarPreferido(){
    const pref=String(global.PacoteEMatoConfiguracoes?.obter?.().navegacao||'pacote_emato');
    if(global.appState?.navegacao)global.appState.navegacao.provider=pref;
    if(pref==='waze'||pref==='google') { try{global.speechSynthesis?.cancel?.();}catch(_){} atualizarBotaoVoz(); atualizarFontesPontos(); return abrirExterno(pref); }
    await persistirSelecao({motivo:'navegacao_interna',navegacaoProvider:'pacote_emato'});
    definirAcompanhamento(true);
    if(watchId==null)iniciarGPS();
    if($('navGpsStatus'))$('navGpsStatus').textContent='Navegação Pacote É Mato ativa';
    acompanharCamera(350);
  }

  async function iniciar(rotaEntrada){
    rota=rotaEntrada?global.PacoteEMatoRotaStore.normalizarRota(rotaEntrada):await global.PacoteEMatoRotaStore.obterRotaAtiva();
    if(rota?.precisaRecalculo){global.notificar?.('A rota foi alterada. Recalcule o trajeto antes de iniciar a navegação.');return;}
    if(!rota||!geometriaValida(rota.geometria)){global.notificar?.('Calcule uma rota válida antes de iniciar a navegação.');return;}
    global.PacoteEMatoMarcadores?.capturarBaseVisualStatus?.(rota, false);
    atualizarPendentes();let idExterno=null;try{idExterno=sessionStorage.getItem('pemato_parada_externa');sessionStorage.removeItem('pemato_parada_externa');}catch(_){}cartaoSelecionadoId=idExterno||rota.paradaSelecionadaId||global.appState?.navegacao?.paradaExibidaId||proxima()?.id||null;posicaoAnterior=null; const pref=global.PacoteEMatoConfiguracoes?.obter?.().navegacao||'pacote_emato';
    if(global.appState?.navegacao){global.appState.navegacao.ativa=true;global.appState.navegacao.provider=pref;global.appState.navegacao.iniciadaEm=global.appState.navegacao.iniciadaEm||Date.now();global.appState.navegacao.paradaExibidaId=cartaoSelecionadoId;rota.iniciadoEm=rota.iniciadoEm||global.appState.navegacao.iniciadaEm;vozAtiva=pref==='pacote_emato' && global.appState.navegacao.vozAtiva!==false;seguirPosicao=rota.navegacaoSeguirPosicao!==false;global.appState.navegacao.seguirPosicao=seguirPosicao;}
    garantirMapa(); acompanharCamera(0); desenharRota(); atualizarPainel(); atualizarBotaoFollow(); atualizarBotaoVoz();
    iniciarGPS();
    if(pref!=='pacote_emato'&&$('navGpsStatus'))$('navGpsStatus').textContent=`GPS ativo · navegação preferida: ${pref==='waze'?'Waze':'Google Maps'}`;
    await persistirSelecao({motivo:'abrir_navegacao',navegacaoProvider:pref});
    if(!ordemPendente.length)mostrarConclusao();
  }

  async function encerrar(){const ok=await global.PacoteEMatoDialog?.confirmar?.({titulo:'Sair da navegação?',mensagem:'A rota e todo o progresso serão preservados para você continuar depois.',confirmar:'Sair da navegação',cancelar:'Continuar na rota'});if(ok===false)return;pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};if(global.appState?.navegacao)global.appState.navegacao.ativa=false;global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');}
  function pausar(){pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};}
  function mapaNavegacaoSaudavel(){
    try {
      const container=$('mapaNavegacao'); const canvas=mapa?.getCanvas?.();
      return !!(mapa&&mapReady&&container&&container.isConnected&&container.clientWidth>0&&container.clientHeight>0&&canvas&&canvas.isConnected&&mapa.getStyle?.()?.layers?.length);
    } catch(_){ return false; }
  }

  function reconstruirMapaNavegacao(){
    if(reconstruindoMapa) return;
    reconstruindoMapa=true;
    try{ mapa?.remove?.(); }catch(_){}
    mapa=null; mapReady=false; fallbackBaseAtivo=false; clearTimeout(mapLoadTimer); assinaturaParadasV11='';
    const container=$('mapaNavegacao'); if(container) container.innerHTML='';
    const fallback=$('navMapFallback'); if(fallback) fallback.style.display='none';
    garantirMapa();
    setTimeout(()=>{ try{mapa?.resize?.();mapa?.triggerRepaint?.();}catch(_){} desenharRota();atualizarFontesPontos();reconstruindoMapa=false; },320);
  }

  async function retomar(opcoes){
    const agora=Date.now(); if(agora-ultimoRetomar<350)return; ultimoRetomar=agora;
    if(!global.appState?.navegacao?.ativa)return;
    if(!rota) try{ const salva=await global.PacoteEMatoRotaStore?.obterRotaAtiva?.(); if(salva) rota=global.PacoteEMatoRotaStore.normalizarRota(salva); }catch(_){}
    atualizarPendentes();
    const forcar=!mapa || contextoPerdido || !mapa.getCanvas?.()?.isConnected;
    if(forcar) reconstruirMapaNavegacao();
    else { try{mapa.resize();mapa.triggerRepaint?.();}catch(_){} garantirCamadas();desenharRota();atualizarFontesPontos(); }
    if(seguirPosicao) acompanharCamera(0);
    atualizarPainel(); atualizarBotaoFollow(); atualizarBotaoVoz();
    pararGPS(); iniciarGPS();
    if($('navGpsStatus'))$('navGpsStatus').textContent='Retorno ao Pacote É Mato · GPS retomado';
    persistirSelecao({motivo:'retorno_primeiro_plano'});
  }

  function abrirAcoesRota(){const el=$('navRouteActionsBackdrop');if(el)el.style.display='flex';}
  function fecharAcoesRota(){const el=$('navRouteActionsBackdrop');if(el)el.style.display='none';}
  async function abrirRefinoDaNavegacao(){fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>{global.PacoteEMatoRoteirizacao?.abrirRevisaoOtimizacao?.();setTimeout(()=>$('routingReviewRefineBtn')?.click?.(),80);},140);}
  async function abrirBipagemDaNavegacao(){fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.abrirEscolhaBipagem?.(),140);}
  async function exportarPdfNavegacao(){fecharAcoesRota();if(rota)await global.PacoteEMatoPDF?.exportar?.(rota);}

  function definirPainelNav(estado){
    estadoPainelNav=['expanded','intermediate','collapsed'].includes(estado)?estado:'collapsed';
    const panel=$('navigationPanel'); if(!panel)return;
    panel.classList.remove('is-expanded','is-intermediate','is-collapsed');
    panel.classList.add(`is-${estadoPainelNav}`);
    panel.dataset.state=estadoPainelNav;
  }

  function atualizarStatusCard(p){
    const badge=$('navStopStatusBadge'),delivery=$('navDeliveredBtn'),fail=$('navNotDeliveredBtn'),undo=$('navUndoStatusBtn');
    const status=String(p?.statusEntrega||'pendente'); const finalizado=['entregue','concluida','nao_entregue'].includes(status);
    if(badge){badge.className='nav-stop-status-badge'; if(status==='nao_entregue'){badge.classList.add('is-failed');badge.textContent='Não entregue';}else if(['entregue','concluida'].includes(status)){badge.classList.add('is-delivered');badge.textContent='Entregue';}else{badge.classList.add('is-pending');badge.textContent='Pendente';}}
    if(delivery)delivery.style.display=finalizado?'none':'';
    if(fail)fail.style.display=finalizado?'none':'';
    // O Desfazer pertence somente ao card de uma parada já tratada. Como a navegação
    // avança automaticamente após Entregue/Não entregue, ele não aparece na próxima parada.
    if(undo){undo.style.display=finalizado?'inline-flex':'none';undo.textContent=status==='nao_entregue'?'Desfazer não entrega':'Desfazer entrega';}
  }

  async function desfazerStatusAtual(){
    if(processandoStatus||!rota)return;
    const alvo=rota.paradas?.find(s=>String(s.id)===String(cartaoSelecionadoId||''));
    if(!alvo||!['entregue','concluida','nao_entregue'].includes(String(alvo.statusEntrega||'')))return;
    processandoStatus=true;
    try{
      alvo.statusEntrega='pendente';
      alvo.entregueEm=null;
      alvo.naoEntregueEm=null;
      alvo.motivoNaoEntrega='';
      alvo.observacaoNaoEntrega='';
      alvo.statusAtualizadoEm=Date.now();
      alvo.alteradoEm=Date.now();
      rota.conclusaoPendente=false;
      if($('navCompletionBackdrop'))$('navCompletionBackdrop').style.display='none';
      atualizarPendentes();
      rota.paradaSelecionadaId=alvo.id;
      rota.proximaParadaId=alvo.id;
      cartaoSelecionadoId=alvo.id;
      await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});
      await global.PacoteEMatoSessao?.persistirAgora?.({motivo:'desfazer_status_parada',paradaSelecionadaId:alvo.id,proximaParadaId:alvo.id,navegacaoAtiva:true});
      atualizarPainel(); desenharRota();
      if(global.PacoteEMatoServicoRota?.endpoint?.('route')&&ultimaPosicao) await recalcular('desfazer');
      else {atualizarFontesPontos();desenharRota();}
    }finally{processandoStatus=false;}
  }

  function bind(){
    definirPainelNav('collapsed');
    const swipe=$('navStopCard');let startX=0,startY=0;
    swipe?.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});
    swipe?.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)selecionarCartao(dx<0?1:-1);},{passive:true});
    $('navBackBtn')?.addEventListener('click',()=>global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao'));
    $('navUndoStatusBtn')?.addEventListener('click',desfazerStatusAtual);
    $('navNavigateBtn')?.addEventListener('click',navegarPreferido);
    $('navDeliveredBtn')?.addEventListener('click',()=>salvarStatusParadaAtual('entregue'));
    $('navNotDeliveredBtn')?.addEventListener('click',()=>salvarStatusParadaAtual('nao_entregue'));
    $('navMoreBtn')?.addEventListener('click',abrirAcoesRota);
    $('navRouteActionsClose')?.addEventListener('click',fecharAcoesRota);
    $('navRouteActionsBackdrop')?.addEventListener('click',e=>{if(e.target===$('navRouteActionsBackdrop'))fecharAcoesRota();});
    $('navActionImport')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>$('routingXlsxInput')?.click?.(),140);});
    $('navActionNewRoute')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.criarNovaRotaVazia?.(),140);});
    $('navActionAddStop')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.abrirEditor?.(null),140);});
    $('navActionPackages')?.addEventListener('click',()=>{fecharAcoesRota();if($('navPackagesChooserBackdrop'))$('navPackagesChooserBackdrop').style.display='flex';});
    $('navPackagesChooserClose')?.addEventListener('click',()=>{if($('navPackagesChooserBackdrop'))$('navPackagesChooserBackdrop').style.display='none';});
    $('navPackagesChooserBackdrop')?.addEventListener('click',e=>{if(e.target===$('navPackagesChooserBackdrop'))e.currentTarget.style.display='none';});
    $('navAddPackagesBtn')?.addEventListener('click',()=>{if($('navPackagesChooserBackdrop'))$('navPackagesChooserBackdrop').style.display='none';global.PacoteEMatoOperacoesPacotes?.iniciar?.('adicionar');});
    $('navRemovePackagesBtn')?.addEventListener('click',()=>{if($('navPackagesChooserBackdrop'))$('navPackagesChooserBackdrop').style.display='none';global.PacoteEMatoOperacoesPacotes?.iniciar?.('remover');});
    $('navActionValidate')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.geocodificarTodas?.(),140);});
    $('navActionOptimize')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.otimizarRota?.(),140);});
    $('navActionRefine')?.addEventListener('click',abrirRefinoDaNavegacao);
    $('navActionBipagem')?.addEventListener('click',abrirBipagemDaNavegacao);
    $('navActionExportPdf')?.addEventListener('click',exportarPdfNavegacao);
    $('navActionSettings')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('configuracoes');});
    $('navActionRecalculate')?.addEventListener('click',()=>{fecharAcoesRota();recalcular('manual');});
    $('navActionClearRoutes')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.removerTodasRotas?.(),140);});
    $('navActionExit')?.addEventListener('click',()=>{fecharAcoesRota();encerrar();});
    $('navRecalculateBtn')?.addEventListener('click',()=>recalcular('manual')); $('navEndBtn')?.addEventListener('click',encerrar);
    $('navFollowBtn')?.addEventListener('click',()=>{
      definirAcompanhamento(true);
      acompanharCamera(350);
      iniciarGPS();
    });
    $('navVoiceBtn')?.addEventListener('click',()=>{if(!navegacaoInternaAtiva())return;vozAtiva=!vozAtiva;if(global.appState?.navegacao)global.appState.navegacao.vozAtiva=vozAtiva;if(!vozAtiva)try{global.speechSynthesis?.cancel?.();}catch(_){};atualizarBotaoVoz();});
    $('navCompletionFinishBtn')?.addEventListener('click',finalizarRota); $('navCompletionReviewBtn')?.addEventListener('click',revisarResultados);
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden&&global.appState?.navegacao?.ativa){backgroundEm=Date.now();if($('navGpsStatus'))$('navGpsStatus').textContent='Aplicativo em segundo plano; rota preservada.';persistirSelecao({motivo:'background_navegacao'});}
      else if(!document.hidden&&document.body.dataset.pematoModule==='navegacao'&&global.appState?.navegacao?.ativa){const tempo=Date.now()-backgroundEm;setTimeout(()=>retomar({forcarMapa:tempo>1200}),120);}
    });
    global.addEventListener('pageshow',()=>{if(document.body.dataset.pematoModule==='navegacao'&&global.appState?.navegacao?.ativa)setTimeout(()=>retomar({forcarMapa:true}),120);});
    global.addEventListener('focus',()=>{if(document.body.dataset.pematoModule==='navegacao'&&global.appState?.navegacao?.ativa&&Date.now()-backgroundEm>1200)setTimeout(()=>retomar({forcarMapa:true}),150);});
    global.addEventListener('pemato:resume',()=>{if(document.body.dataset.pematoModule==='navegacao')retomar({forcarMapa:true});});
    $('navDeliveryNote')?.addEventListener('change',async()=>{const p=paradasPorOrdem().find(s=>String(s.id)===String(cartaoSelecionadoId))||proxima();if(!p||!rota)return;p.observacaoEntrega=String($('navDeliveryNote').value||'');await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});});
  }

  if (global.ResizeObserver) {
    const observar = () => {
      const card = document.querySelector('.nav-maneuver-card');
      if (card) new ResizeObserver(posicionarSobreposicoes).observe(card);
    };
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', observar, {once:true}); else observar();
  }
  global.addEventListener('resize', posicionarSobreposicoes);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  global.PacoteEMatoNavegacao=Object.freeze({iniciar,recalcular,encerrar,pausar,abrirExterno,navegarPreferido,salvarStatusParadaAtual,finalizarRota,selecionarCartao,persistirSelecao,retomar});
})(window);
