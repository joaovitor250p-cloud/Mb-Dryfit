(function iniciarPostosProximos(global) {
  'use strict';

  const SOURCE_ID = 'pemato-fuel-stations';
  const LAYER_ID = 'pemato-fuel-stations-layer';
  const RADIUS_METERS = 5000;
  const MAX_RESULTS = 30;
  const CACHE_TTL_MS = 8 * 60 * 1000;
  const CACHE_MOVE_METERS = 1800;
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  const contexts = new Map();
  let cache = null;

  function $(id) { return document.getElementById(id); }

  function coordValida(lat, lon) {
    lat = Number(lat); lon = Number(lon);
    return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lon) && lon >= -180 && lon <= 180;
  }

  function haversine(a, b) {
    if (!a || !b || !coordValida(a.lat, a.lon) || !coordValida(b.lat, b.lon)) return Infinity;
    const R = 6371000;
    const rad = x => Number(x) * Math.PI / 180;
    const dLat = rad(b.lat - a.lat);
    const dLon = rad(b.lon - a.lon);
    const la1 = rad(a.lat), la2 = rad(b.lat);
    const h = Math.sin(dLat/2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon/2) ** 2;
    return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
  }

  function normalizarTexto(v) {
    return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function brandKey(tags) {
    const texto = normalizarTexto([tags?.brand, tags?.operator, tags?.name].filter(Boolean).join(' '));
    if (/shell/.test(texto)) return 'shell';
    if (/ipiranga|ultra.*ipiranga/.test(texto)) return 'ipiranga';
    if (/petrobras|posto br|rede br|vibra|br mania/.test(texto)) return 'br';
    if (/\bale\b|rede ale/.test(texto)) return 'ale';
    if (/esso/.test(texto)) return 'esso';
    if (/texaco/.test(texto)) return 'texaco';
    return 'generic';
  }

  function brandMeta(key) {
    return ({
      shell: { label: 'S', title: 'Shell', bg: '#ffd500', fg: '#d71920', border: '#d71920' },
      ipiranga: { label: 'IP', title: 'Ipiranga', bg: '#0057b8', fg: '#ffffff', border: '#f4cf00' },
      br: { label: 'BR', title: 'BR / Petrobras', bg: '#009739', fg: '#ffffff', border: '#ffd100' },
      ale: { label: 'ALE', title: 'ALE', bg: '#e31837', fg: '#ffffff', border: '#ffffff' },
      esso: { label: 'E', title: 'Esso', bg: '#ffffff', fg: '#e31837', border: '#0057b8' },
      texaco: { label: 'T', title: 'Texaco', bg: '#d71920', fg: '#ffffff', border: '#ffffff' },
      generic: { label: '⛽', title: 'Posto', bg: '#ffffff', fg: '#047857', border: '#047857' }
    })[key] || null;
  }

  function enderecoDeTags(tags) {
    const linha1 = [tags?.['addr:street'], tags?.['addr:housenumber']].filter(Boolean).join(', ');
    const linha2 = [tags?.['addr:suburb'] || tags?.['addr:neighbourhood'], tags?.['addr:city'], tags?.['addr:state']].filter(Boolean).join(' • ');
    return [linha1, linha2].filter(Boolean).join(' — ') || '';
  }

  function nomeDoPosto(tags, key) {
    return String(tags?.name || tags?.brand || tags?.operator || brandMeta(key)?.title || 'Posto de combustível').trim();
  }

  function parseElement(el, origem) {
    const lat = Number(el?.lat ?? el?.center?.lat);
    const lon = Number(el?.lon ?? el?.center?.lon);
    if (!coordValida(lat, lon)) return null;
    const tags = el?.tags || {};
    const key = brandKey(tags);
    return {
      id: `${String(el?.type || 'node')}-${String(el?.id || `${lat}-${lon}`)}`,
      lat, lon,
      brandKey: key,
      brand: String(tags.brand || brandMeta(key)?.title || '').trim(),
      name: nomeDoPosto(tags, key),
      address: enderecoDeTags(tags),
      operator: String(tags.operator || '').trim(),
      openingHours: String(tags.opening_hours || '').trim(),
      distance: haversine(origem, { lat, lon })
    };
  }

  function buildQuery(lat, lon) {
    return `[out:json][timeout:12];(node["amenity"="fuel"](around:${RADIUS_METERS},${lat},${lon});way["amenity"="fuel"](around:${RADIUS_METERS},${lat},${lon});relation["amenity"="fuel"](around:${RADIUS_METERS},${lat},${lon}););out center tags;`;
  }

  async function fetchComTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { method: 'GET', credentials: 'omit', signal: controller.signal, cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function buscarPostos(posicao) {
    if (cache && Date.now() - cache.at < CACHE_TTL_MS && haversine(posicao, cache.center) < CACHE_MOVE_METERS) {
      return cache.items;
    }
    const query = buildQuery(Number(posicao.lat).toFixed(6), Number(posicao.lon).toFixed(6));
    let ultimoErro = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const data = await fetchComTimeout(`${endpoint}?data=${encodeURIComponent(query)}`, 10000);
        const vistos = new Set();
        const items = (Array.isArray(data?.elements) ? data.elements : [])
          .map(el => parseElement(el, posicao))
          .filter(Boolean)
          .filter(item => {
            const key = `${item.name}|${item.lat.toFixed(5)}|${item.lon.toFixed(5)}`;
            if (vistos.has(key)) return false;
            vistos.add(key); return true;
          })
          .sort((a,b) => a.distance - b.distance)
          .slice(0, MAX_RESULTS);
        cache = { center: { lat: Number(posicao.lat), lon: Number(posicao.lon) }, at: Date.now(), items };
        return items;
      } catch (erro) {
        ultimoErro = erro;
        console.warn('Pacote É Mato: falha ao consultar postos.', endpoint, erro?.message || erro);
      }
    }
    throw ultimoErro || new Error('Não foi possível consultar postos próximos.');
  }

  function criarIconeMapa(meta) {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const c = canvas.getContext('2d');
    if (!c) return null;
    c.clearRect(0,0,64,64);
    c.beginPath(); c.arc(32,32,27,0,Math.PI*2); c.fillStyle = '#ffffff'; c.fill();
    c.beginPath(); c.arc(32,32,24,0,Math.PI*2); c.fillStyle = meta.bg; c.fill();
    c.lineWidth = 3; c.strokeStyle = meta.border; c.stroke();
    c.fillStyle = meta.fg;
    const len = String(meta.label).length;
    c.font = `900 ${len >= 3 ? 14 : len === 2 ? 19 : 26}px Arial, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(meta.label, 32, 33);
    return c.getImageData(0,0,64,64);
  }

  function garantirImagens(ctx) {
    if (!ctx?.map) return;
    ['shell','ipiranga','br','ale','esso','texaco','generic'].forEach(key => {
      const name = `pemato-fuel-${key}`;
      try {
        if (!ctx.map.hasImage?.(name)) {
          const img = criarIconeMapa(brandMeta(key));
          if (img) ctx.map.addImage(name, img, { pixelRatio: 2 });
        }
      } catch (_) {}
    });
  }

  function fc(features) { return { type:'FeatureCollection', features: Array.isArray(features) ? features : [] }; }

  function featuresDosPostos(items) {
    return fc((items || []).map(item => ({
      type:'Feature', id:item.id,
      geometry:{ type:'Point', coordinates:[item.lon,item.lat] },
      properties:{ id:item.id, icon:`pemato-fuel-${item.brandKey}`, name:item.name, brand:item.brand, distance:Math.round(item.distance) }
    })));
  }

  function garantirCamada(ctx) {
    const map = ctx?.map;
    if (!map || !map.getStyle?.()) return false;
    try {
      garantirImagens(ctx);
      if (!map.getSource(SOURCE_ID)) map.addSource(SOURCE_ID, { type:'geojson', data:fc([]) });
      if (!map.getLayer(LAYER_ID)) map.addLayer({
        id:LAYER_ID, type:'symbol', source:SOURCE_ID,
        layout:{
          'icon-image':['get','icon'],
          'icon-size':['interpolate',['linear'],['zoom'],10,.58,13,.72,16,.82],
          'icon-allow-overlap':true,
          'icon-ignore-placement':true,
          'icon-anchor':'center',
          'symbol-sort-key':['get','distance']
        }
      });
      return true;
    } catch (erro) {
      console.warn('Pacote É Mato: não foi possível montar camada de postos.', erro);
      return false;
    }
  }

  function removerFonte(ctx) {
    const map = ctx?.map;
    if (!map) return;
    try { if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID); } catch (_) {}
    try { if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID); } catch (_) {}
  }

  function formatarDistancia(m) {
    m = Number(m || 0);
    if (m < 1000) return `${Math.max(1, Math.round(m))} m`;
    return `${(m/1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
  }

  function fecharCard(ctx) {
    if (ctx?.card) ctx.card.style.display = 'none';
    if (ctx) ctx.selecionado = null;
  }

  function abrirUrl(url) {
    try { global.open(url, '_blank', 'noopener'); } catch (_) { global.location.href = url; }
  }

  function criarCard(ctx) {
    if (ctx.card?.isConnected) return ctx.card;
    const host = ctx.host || ctx.map?.getContainer?.()?.parentElement;
    if (!host) return null;
    const el = document.createElement('section');
    el.className = 'pemato-fuel-card';
    el.style.display = 'none';
    el.innerHTML = `
      <button class="pemato-fuel-close" type="button" aria-label="Fechar">×</button>
      <div class="pemato-fuel-card-brand"><span class="pemato-fuel-card-logo">⛽</span><div><small>POSTO PRÓXIMO</small><strong class="pemato-fuel-card-name">Posto</strong></div></div>
      <div class="pemato-fuel-card-meta"></div>
      <div class="pemato-fuel-card-address"></div>
      <div class="pemato-fuel-actions"><button class="pemato-fuel-waze" type="button">Waze</button><button class="pemato-fuel-maps" type="button">Google Maps</button></div>`;
    host.appendChild(el);
    el.querySelector('.pemato-fuel-close')?.addEventListener('click', () => fecharCard(ctx));
    el.querySelector('.pemato-fuel-waze')?.addEventListener('click', () => {
      const p = ctx.selecionado; if (!p) return;
      abrirUrl(`https://www.waze.com/ul?ll=${encodeURIComponent(`${p.lat},${p.lon}`)}&navigate=yes`);
    });
    el.querySelector('.pemato-fuel-maps')?.addEventListener('click', () => {
      const p = ctx.selecionado; if (!p) return;
      abrirUrl(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.lat},${p.lon}`)}&travelmode=driving`);
    });
    ctx.card = el;
    return el;
  }

  function mostrarCard(ctx, posto) {
    const card = criarCard(ctx);
    if (!card || !posto) return;
    ctx.selecionado = posto;
    const meta = brandMeta(posto.brandKey);
    const logo = card.querySelector('.pemato-fuel-card-logo');
    if (logo) {
      logo.textContent = meta?.label || '⛽';
      logo.style.background = meta?.bg || '#fff';
      logo.style.color = meta?.fg || '#047857';
      logo.style.borderColor = meta?.border || '#047857';
    }
    const name = card.querySelector('.pemato-fuel-card-name'); if (name) name.textContent = posto.name;
    const brand = posto.brand || meta?.title || 'Posto';
    const m = card.querySelector('.pemato-fuel-card-meta'); if (m) m.textContent = `${brand} • ${formatarDistancia(posto.distance)}`;
    const a = card.querySelector('.pemato-fuel-card-address'); if (a) a.textContent = posto.address || 'Endereço não informado pelo mapa.';
    card.style.display = 'block';
  }

  function encontrarPosto(ctx, feature) {
    const id = String(feature?.properties?.id || feature?.id || '');
    return (ctx.items || []).find(p => String(p.id) === id) || null;
  }

  function bindClicks(ctx) {
    if (!ctx?.map || ctx.bound) return;
    ctx.bound = true;
    ctx.map.on('click', LAYER_ID, event => {
      const posto = encontrarPosto(ctx, event?.features?.[0]);
      if (posto) mostrarCard(ctx, posto);
    });
    ctx.map.on('mouseenter', LAYER_ID, () => { try { ctx.map.getCanvas().style.cursor = 'pointer'; } catch (_) {} });
    ctx.map.on('mouseleave', LAYER_ID, () => { try { ctx.map.getCanvas().style.cursor = ''; } catch (_) {} });
  }

  function atualizarBotao(ctx) {
    const btn = $(ctx?.buttonId);
    if (!btn) return;
    btn.classList.toggle('active', ctx.ativo === true);
    btn.setAttribute('aria-pressed', ctx.ativo === true ? 'true' : 'false');
    btn.title = ctx.ativo ? 'Ocultar postos próximos' : 'Mostrar postos próximos';
  }

  async function obterPosicao() {
    const ultima = global.PacoteEMatoLocalizacaoAtual?.ultimaValida?.();
    if (ultima && coordValida(ultima.lat, ultima.lon)) return { lat:Number(ultima.lat), lon:Number(ultima.lon) };
    const p = await global.PacoteEMatoLocalizacaoAtual?.obter?.({ forcar:true });
    if (!p || !coordValida(p.lat, p.lon)) throw new Error('Não foi possível obter sua localização. Ative o GPS e tente novamente.');
    return { lat:Number(p.lat), lon:Number(p.lon) };
  }

  function desligar(ctx, restaurar) {
    if (!ctx) return;
    ctx.ativo = false;
    fecharCard(ctx);
    try { if (ctx.map?.getSource(SOURCE_ID)) ctx.map.getSource(SOURCE_ID).setData(fc([])); } catch (_) {}
    atualizarBotao(ctx);
    if (restaurar && ctx.previousView && ctx.map) {
      try { ctx.map.easeTo({ center:ctx.previousView.center, zoom:ctx.previousView.zoom, duration:280 }); } catch (_) {}
    }
    ctx.previousView = null;
  }

  async function ligar(ctx) {
    if (!ctx?.map) throw new Error('Mapa ainda não está pronto.');
    if (!ctx.previousView) {
      try { ctx.previousView = { center:ctx.map.getCenter().toArray(), zoom:ctx.map.getZoom() }; } catch (_) {}
    }
    const pos = await obterPosicao();
    ctx.ativo = true; atualizarBotao(ctx);
    ctx.loading = true;
    const btn = $(ctx.buttonId); if (btn) btn.dataset.loading = '1';
    try {
      const items = await buscarPostos(pos);
      ctx.items = items;
      if (!ctx.ativo) return;
      if (!garantirCamada(ctx)) throw new Error('Não foi possível criar a camada de postos no mapa.');
      bindClicks(ctx);
      ctx.map.getSource(SOURCE_ID)?.setData?.(featuresDosPostos(items));
      try { ctx.map.easeTo({ center:[pos.lon,pos.lat], zoom:Math.max(13, Math.min(14.2, ctx.map.getZoom())), duration:320 }); } catch (_) {}
      if (!items.length) global.notificar?.('Nenhum posto cadastrado foi encontrado em até 5 km.');
      else global.notificar?.(`${items.length} posto(s) próximo(s) encontrado(s).`);
    } finally {
      ctx.loading = false; if (btn) delete btn.dataset.loading;
    }
  }

  async function alternar(chave) {
    const ctx = contexts.get(String(chave));
    if (!ctx || ctx.loading) return;
    if (ctx.ativo) return desligar(ctx, true);
    try { await ligar(ctx); }
    catch (erro) {
      desligar(ctx, false);
      global.notificar?.(erro?.name === 'AbortError' ? 'A busca de postos demorou demais. Tente novamente.' : (erro?.message || 'Não foi possível buscar postos próximos.'));
    }
  }

  function registrarMapa(chave, map, opcoes) {
    chave = String(chave);
    let ctx = contexts.get(chave);
    if (!ctx) {
      ctx = { chave, map:null, host:null, buttonId:'', ativo:false, loading:false, items:[], card:null, selecionado:null, bound:false, previousView:null };
      contexts.set(chave, ctx);
    }
    if (ctx.map && ctx.map !== map) {
      removerFonte(ctx); ctx.bound = false; ctx.card?.remove?.(); ctx.card = null;
    }
    ctx.map = map;
    ctx.host = opcoes?.host || map?.getContainer?.()?.parentElement || null;
    ctx.buttonId = String(opcoes?.buttonId || ctx.buttonId || '');
    const btn = $(ctx.buttonId);
    if (btn && btn.dataset.fuelBound !== '1') {
      btn.dataset.fuelBound = '1';
      btn.addEventListener('click', () => alternar(chave));
    }
    atualizarBotao(ctx);
    try {
      if (!map.__pematoFuelStyleBound) {
        map.__pematoFuelStyleBound = true;
        map.on('style.load', () => {
          const atual = contexts.get(chave);
          if (!atual || atual.map !== map || !atual.ativo) return;
          setTimeout(() => {
            if (garantirCamada(atual)) {
              bindClicks(atual);
              atual.map.getSource(SOURCE_ID)?.setData?.(featuresDosPostos(atual.items));
            }
          }, 0);
        });
      }
    } catch (_) {}
    return ctx;
  }

  function destruir(chave) {
    const ctx = contexts.get(String(chave));
    if (!ctx) return;
    desligar(ctx, false); removerFonte(ctx); ctx.card?.remove?.(); contexts.delete(String(chave));
  }

  global.PacoteEMatoPostos = Object.freeze({ registrarMapa, alternar, destruir, buscarPostos, _parseElement:parseElement, _brandKey:brandKey });
})(window);
