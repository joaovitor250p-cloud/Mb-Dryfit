(function iniciarNavegacao(global) {
  'use strict';

  let rota = null;
  let mapa = null;
  let mapReady = false;
  let positionMarker = null;
  let nextMarker = null;
  let watchId = null;
  let ordemPendente = [];
  let indiceAtual = 0;
  let ultimaPosicao = null;
  const SOURCE = 'pemato-nav-route';
  const LAYER = 'pemato-nav-route-layer';

  function $(id) { return document.getElementById(id); }
  function cfg() { return global.PEMATO_MAP_CONFIG || {}; }

  function coordenadaValida(lat, lon) {
    if (lat === null || lat === undefined || lon === null || lon === undefined) return false;
    if (String(lat).trim() === '' || String(lon).trim() === '') return false;
    const a = Number(lat);
    const o = Number(lon);
    return Number.isFinite(a) && a >= -90 && a <= 90 && Number.isFinite(o) && o >= -180 && o <= 180;
  }

  function formatarDistancia(m) {
    const n = Number(m || 0);
    if (!Number.isFinite(n)) return '—';
    if (n < 1000) return `${Math.round(n)} m`;
    return `${(n / 1000).toFixed(1).replace('.', ',')} km`;
  }

  function formatarTempo(s) {
    const min = Math.max(0, Math.round(Number(s || 0) / 60));
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
  }

  function paradasPorOrdem() {
    if (!rota) return [];
    const byId = new Map(rota.paradas.map(p => [p.id, p]));
    return (rota.ordem || []).map(id => byId.get(id)).filter(Boolean);
  }

  function atualizarPendentes() {
    ordemPendente = paradasPorOrdem().filter(p => !['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega));
    if (indiceAtual >= ordemPendente.length) indiceAtual = Math.max(0, ordemPendente.length - 1);
  }

  function proxima() { return ordemPendente[indiceAtual] || null; }

  function garantirMapa() {
    const container = $('mapaNavegacao');
    if (!container || mapa || !global.maplibregl) return mapa;
    mapa = new global.maplibregl.Map({
      container,
      style: cfg().mapStyleUrl,
      center: cfg().initialCenter || [-51.9253, -14.2350],
      zoom: 14,
      pitch: 0,
      bearing: 0,
      maxPitch: 0,
      dragRotate: false,
      touchPitch: false
    });
    mapa.touchZoomRotate.disableRotation();
    mapa.addControl(new global.maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapa.on('load', () => {
      mapReady = true;
      if (!mapa.getSource(SOURCE)) mapa.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      if (!mapa.getLayer(LAYER)) {
        mapa.addLayer({
          id: LAYER,
          type: 'line',
          source: SOURCE,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': '#059669', 'line-width': 6, 'line-opacity': .9 }
        });
      }
      desenharRota();
      atualizarMarcadorProxima();
    });
    return mapa;
  }

  function desenharRota() {
    if (!mapa || !mapReady) return;
    const source = mapa.getSource(SOURCE);
    if (!source) return;
    const geometry = rota?.geometria;
    source.setData({
      type: 'FeatureCollection',
      features: geometry ? [{ type: 'Feature', properties: {}, geometry }] : []
    });
  }

  function atualizarMarcadorPosicao(pos) {
    if (!mapa || !mapReady || !pos) return;
    const lngLat = [Number(pos.lon), Number(pos.lat)];
    if (!positionMarker) {
      const el = document.createElement('div');
      el.className = 'nav-current-position';
      positionMarker = new global.maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(mapa);
    } else positionMarker.setLngLat(lngLat);
  }

  function atualizarMarcadorProxima() {
    if (!mapa || !mapReady) return;
    const p = proxima();
    if (nextMarker) { try { nextMarker.remove(); } catch (_) {} nextMarker = null; }
    if (!p || !coordenadaValida(p.latitude, p.longitude)) return;
    const el = document.createElement('div');
    el.className = 'nav-next-marker';
    el.textContent = String(p.ordemOtimizada || p.ordemOriginal || indiceAtual + 1);
    nextMarker = new global.maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([Number(p.longitude), Number(p.latitude)])
      .addTo(mapa);
  }

  function atualizarPainel() {
    atualizarPendentes();
    const p = proxima();
    if ($('navNextAddress')) $('navNextAddress').textContent = p?.enderecoOriginal || 'Rota concluída';
    if ($('navNextComplement')) $('navNextComplement').textContent = p ? [p.bloco && `Bloco ${p.bloco}`, p.apartamento && `Apartamento ${p.apartamento}`, p.sala && `Sala ${p.sala}`, p.observacao].filter(Boolean).join(' · ') : '';
    if ($('navRemaining')) $('navRemaining').textContent = String(ordemPendente.length ? (ordemPendente.length - indiceAtual) : 0);
    const leg = rota?.pernas?.[0] || null;
    if ($('navDistanceNext')) $('navDistanceNext').textContent = formatarDistancia(leg?.distance);
    if ($('navEtaNext')) $('navEtaNext').textContent = formatarTempo(leg?.time);
    if ($('navRouteTotal')) $('navRouteTotal').textContent = formatarDistancia(rota?.distanciaTotalMetros);
    if ($('navRouteTime')) $('navRouteTime').textContent = formatarTempo(rota?.duracaoDirecaoSegundos);

    const instructions = $('navInstructions');
    if (instructions) {
      instructions.replaceChildren();
      const list = Array.isArray(rota?.instrucoes) ? rota.instrucoes.slice(0, 8) : [];
      if (!list.length) {
        const item = document.createElement('div');
        item.className = 'nav-instruction-empty';
        item.textContent = 'As instruções aparecerão depois que a rota for calculada ou recalculada.';
        instructions.appendChild(item);
      } else {
        list.forEach((inst, i) => {
          const item = document.createElement('div');
          item.className = 'nav-instruction';
          const num = document.createElement('span');
          num.textContent = String(i + 1);
          const text = document.createElement('div');
          const strong = document.createElement('strong');
          strong.textContent = inst.texto || 'Siga pela via';
          const meta = document.createElement('small');
          meta.textContent = `${formatarDistancia(inst.distancia)} · ${formatarTempo(inst.tempo)}`;
          text.append(strong, meta);
          item.append(num, text);
          instructions.appendChild(item);
        });
      }
    }
    atualizarMarcadorProxima();
  }

  async function recalcular() {
    if (!rota || !ultimaPosicao || !global.PacoteEMatoServicoRota) return;
    atualizarPendentes();
    const remaining = ordemPendente.slice(indiceAtual);
    if (!remaining.length) return;
    const points = [{ lat: ultimaPosicao.lat, lon: ultimaPosicao.lon }];
    remaining.forEach(p => {
      if (coordenadaValida(p.latitude, p.longitude)) {
        points.push({ lat: Number(p.latitude), lon: Number(p.longitude) });
      }
    });
    if (rota.retornarAoInicio && rota.pontoInicial) points.push({ lat: Number(rota.pontoInicial.lat), lon: Number(rota.pontoInicial.lon) });
    if (points.length < 2) return;

    const btn = $('navRecalculateBtn');
    if (btn) btn.disabled = true;
    try {
      const response = await global.PacoteEMatoServicoRota.calcularRotaPelasRuas(rota, points);
      const feature = response.feature;
      rota.geometria = feature.geometry;
      rota.distanciaTotalMetros = Number(feature.properties?.distance || 0);
      rota.duracaoDirecaoSegundos = Number(feature.properties?.time || 0);
      rota.pernas = Array.isArray(feature.properties?.legs) ? feature.properties.legs : [];
      rota.instrucoes = global.PacoteEMatoServicoRota.extrairInstrucoes(feature);
      await global.PacoteEMatoRotaStore.salvarRota(rota, { ativa: true });
      desenharRota();
      atualizarPainel();
      if (mapa && mapReady) {
        try { mapa.easeTo({ center: [ultimaPosicao.lon, ultimaPosicao.lat], zoom: 16, duration: 400 }); } catch (_) {}
      }
    } catch (erro) {
      console.warn('Pacote É Mato: recálculo de navegação falhou.', erro);
      if (typeof global.notificar === 'function') global.notificar(erro?.message || 'Não foi possível recalcular a rota.');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  function iniciarGPS() {
    if (!navigator.geolocation || watchId != null) return;
    watchId = navigator.geolocation.watchPosition(pos => {
      ultimaPosicao = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy, at: Date.now() };
      if (global.appState?.navegacao) {
        global.appState.navegacao.ultimaPosicao = ultimaPosicao;
        global.appState.navegacao.ultimaAtualizacaoEm = Date.now();
      }
      atualizarMarcadorPosicao(ultimaPosicao);
      if (mapa && mapReady && !global.appState?.navegacao?._centradoUmaVez) {
        global.appState.navegacao._centradoUmaVez = true;
        mapa.easeTo({ center: [ultimaPosicao.lon, ultimaPosicao.lat], zoom: 16, duration: 450 });
        setTimeout(recalcular, 200);
      }
    }, erro => {
      console.warn('GPS indisponível:', erro?.message || erro);
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 });
  }

  function pararGPS() {
    if (watchId != null) {
      try { navigator.geolocation.clearWatch(watchId); } catch (_) {}
      watchId = null;
    }
  }

  function abrirExterno(provider) {
    const p = proxima();
    if (!p) return;
    const lat = Number(p.latitude);
    const lon = Number(p.longitude);
    let url = '';
    if (provider === 'waze' && coordenadaValida(p.latitude, p.longitude)) {
      url = `https://waze.com/ul?ll=${encodeURIComponent(lat + ',' + lon)}&navigate=yes`;
    } else if (provider === 'google') {
      const dest = coordenadaValida(p.latitude, p.longitude) ? `${lat},${lon}` : (p.enderecoOriginal || '');
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
    }
    if (url) global.open(url, '_blank', 'noopener');
  }

  function avancar() {
    if (indiceAtual < ordemPendente.length - 1) indiceAtual++;
    atualizarPainel();
    recalcular();
  }

  async function salvarStatusParadaAtual(status, motivo, observacao) {
    const atual = proxima();
    if (!rota || !atual) return;
    const parada = rota.paradas.find(p => p.id === atual.id);
    if (!parada) return;

    if (status === 'entregue') {
      parada.statusEntrega = 'entregue';
      parada.motivoNaoEntrega = '';
      parada.observacaoNaoEntrega = '';
      parada.entregueEm = Date.now();
    } else if (status === 'nao_entregue') {
      parada.statusEntrega = 'nao_entregue';
      parada.motivoNaoEntrega = String(motivo || 'outro');
      parada.observacaoNaoEntrega = String(observacao || '').trim();
      parada.entregueEm = null;
    } else return;

    parada.alteradoEm = Date.now();
    await global.PacoteEMatoRotaStore.salvarRota(rota, { ativa: true });
    const painel = $('navFailurePanel');
    if (painel) painel.style.display = 'none';
    if ($('navFailureNote')) $('navFailureNote').value = '';
    atualizarPendentes();
    indiceAtual = 0;
    atualizarPainel();
    if (ordemPendente.length) await recalcular();
    else {
      rota.status = 'concluida';
      rota.concluidoEm = Date.now();
      await global.PacoteEMatoRotaStore.salvarRota(rota, { ativa: true });
      desenharRota();
      atualizarPainel();
    }
    global.PacoteEMatoHistorico?.renderizar?.();
    global.PacoteEMatoAppShell?.atualizarInicio?.();
  }

  function abrirNaoEntrega() {
    if (!proxima()) return;
    const painel = $('navFailurePanel');
    if (painel) painel.style.display = 'grid';
  }

  function cancelarNaoEntrega() {
    const painel = $('navFailurePanel');
    if (painel) painel.style.display = 'none';
  }

  async function iniciar(rotaEntrada) {
    rota = rotaEntrada ? global.PacoteEMatoRotaStore.normalizarRota(rotaEntrada) : await global.PacoteEMatoRotaStore.obterRotaAtiva();
    if (!rota) return;
    atualizarPendentes();
    indiceAtual = 0;
    const pref = global.PacoteEMatoConfiguracoes?.obter?.().navegacao || 'pacote_emato';
    if (global.appState?.navegacao) {
      global.appState.navegacao.ativa = true;
      global.appState.navegacao.provider = pref;
      global.appState.navegacao.iniciadaEm = Date.now();
      global.appState.navegacao.indiceAtual = 0;
    }
    if (pref === 'waze') return abrirExterno('waze');
    if (pref === 'google') return abrirExterno('google');
    garantirMapa();
    atualizarPainel();
    desenharRota();
    iniciarGPS();
  }

  function encerrar() {
    pararGPS();
    if (global.appState?.navegacao) global.appState.navegacao.ativa = false;
    global.PacoteEMatoAppShell?.abrirModulo?.('inicio');
  }

  function bind() {
    $('navDeliveredBtn')?.addEventListener('click', () => salvarStatusParadaAtual('entregue'));
    $('navNotDeliveredBtn')?.addEventListener('click', abrirNaoEntrega);
    $('navFailureCancelBtn')?.addEventListener('click', cancelarNaoEntrega);
    $('navFailureConfirmBtn')?.addEventListener('click', () => salvarStatusParadaAtual(
      'nao_entregue',
      $('navFailureReason')?.value || 'outro',
      $('navFailureNote')?.value || ''
    ));
    $('navAdvanceBtn')?.addEventListener('click', avancar);
    $('navRecalculateBtn')?.addEventListener('click', recalcular);
    $('navOpenWazeBtn')?.addEventListener('click', () => abrirExterno('waze'));
    $('navOpenGoogleBtn')?.addEventListener('click', () => abrirExterno('google'));
    $('navEndBtn')?.addEventListener('click', encerrar);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();

  global.PacoteEMatoNavegacao = Object.freeze({ iniciar, recalcular, avancar, encerrar, abrirExterno, salvarStatusParadaAtual });
})(window);
