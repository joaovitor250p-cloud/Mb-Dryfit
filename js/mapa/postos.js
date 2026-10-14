(function iniciarPostosProximos(global) {
  'use strict';

  const RADIUS_METERS = 5000;
  const MAX_RESULTS = 30;
  const CACHE_TTL_MS = 10 * 60 * 1000;
  const CACHE_MOVE_METERS = 1800;
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter'
  ];

  const contexts = new Map();
  let cache = null;
  let buscaToken = 0;

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
    const commons = file => `https://commons.wikimedia.org/wiki/Special:Redirect/file/${file}`;
    return ({
      // Shell usa o símbolo da concha, não apenas a letra S.
      shell: {
        title: 'Shell',
        logo: 'https://cdn.simpleicons.org/shell/D71920',
        markerClass: 'is-shell'
      },
      // Logos completos oficiais/identificáveis. Se o host externo falhar, cai para o ícone genérico.
      ipiranga: {
        title: 'Ipiranga',
        logo: commons('Ipiranga_logo_(2023).svg'),
        markerClass: 'is-ipiranga'
      },
      br: {
        title: 'BR / Petrobras',
        logo: commons('Logotipo_da_Petrobras_(vertical).svg'),
        markerClass: 'is-petrobras'
      },
      ale: {
        title: 'ALE',
        logo: commons('AleSat_Combust%C3%ADveis.svg'),
        markerClass: 'is-ale'
      },
      esso: {
        title: 'Esso',
        logo: commons('Esso_textlogo.svg'),
        markerClass: 'is-esso'
      },
      texaco: {
        title: 'Texaco',
        logo: commons('Texaco_logo.svg'),
        markerClass: 'is-texaco'
      },
      generic: {
        title: 'Posto',
        logo: '',
        markerClass: 'is-generic'
      }
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
      fuelPrices: null,
      priceStatus: 'Preço não informado',
      source: 'OpenStreetMap/Overpass',
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
      const response = await fetch(url, { method: 'GET', credentials: 'omit', signal: controller.signal, cache: 'force-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
    }
  }

  async function buscarPostos(posicao) {
    const token = ++buscaToken;
    if (cache && Date.now() - cache.at < CACHE_TTL_MS && haversine(posicao, cache.center) < CACHE_MOVE_METERS) {
      return cache.items;
    }
    const query = buildQuery(Number(posicao.lat).toFixed(6), Number(posicao.lon).toFixed(6));
    let ultimoErro = null;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      try {
        const data = await fetchComTimeout(`${endpoint}?data=${encodeURIComponent(query)}`, 3500);
        if (token !== buscaToken) throw new Error('Busca de postos cancelada por uma nova pesquisa.');
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

  function criarImagemMarca(key, classeExtra) {
    const meta = brandMeta(key) || brandMeta('generic');
    const wrap = document.createElement('span');
    wrap.className = `pemato-fuel-brand-visual ${meta.markerClass || ''} ${classeExtra || ''}`.trim();

    if (meta.logo) {
      const img = document.createElement('img');
      img.src = meta.logo;
      img.alt = meta.title || 'Posto';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      img.addEventListener('error', () => {
        img.remove();
        wrap.classList.add('logo-fallback');
        wrap.textContent = '⛽';
      }, { once:true });
      wrap.appendChild(img);
    } else {
      wrap.classList.add('logo-fallback');
      wrap.textContent = '⛽';
    }
    return wrap;
  }

  function criarElementoMarcador(posto, ctx, indice) {
    const meta = brandMeta(posto.brandKey) || brandMeta('generic');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `pemato-fuel-marker ${meta.markerClass || ''}`;
    btn.setAttribute('aria-label', `${meta.title || 'Posto'}: ${posto.name}`);
    btn.title = posto.name;
    btn.style.zIndex = String(3000 - Math.min(2500, indice || 0));
    btn.appendChild(criarImagemMarca(posto.brandKey, 'pemato-fuel-marker-logo'));
    btn.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      mostrarCard(ctx, posto);
    });
    return btn;
  }

  function limparMarcadores(ctx) {
    if (!ctx?.markers) return;
    for (const marker of ctx.markers.values()) {
      try { marker.remove(); } catch (_) {}
    }
    ctx.markers.clear();
  }

  function renderizarMarcadores(ctx, items) {
    if (!ctx?.map || !global.maplibregl?.Marker) return;
    limparMarcadores(ctx);
    (items || []).forEach((posto, index) => {
      if (!coordValida(posto.lat, posto.lon)) return;
      try {
        const element = criarElementoMarcador(posto, ctx, index);
        const marker = new global.maplibregl.Marker({ element, anchor:'center' })
          .setLngLat([Number(posto.lon), Number(posto.lat)])
          .addTo(ctx.map);
        ctx.markers.set(String(posto.id), marker);
      } catch (erro) {
        console.warn('Pacote É Mato: falha ao desenhar logo do posto.', posto?.name, erro);
      }
    });
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
      <div class="pemato-fuel-card-brand"><span class="pemato-fuel-card-logo"></span><div><small>POSTO PRÓXIMO</small><strong class="pemato-fuel-card-name">Posto</strong></div></div>
      <div class="pemato-fuel-card-meta"></div>
      <div class="pemato-fuel-card-address"></div>
      <div class="pemato-fuel-actions"><button class="pemato-fuel-internal" type="button">Navegar pelo Pacote É Mato</button><button class="pemato-fuel-waze" type="button">Waze</button><button class="pemato-fuel-maps" type="button">Google Maps</button></div>`;
    host.appendChild(el);
    el.querySelector('.pemato-fuel-close')?.addEventListener('click', () => fecharCard(ctx));
    el.querySelector('.pemato-fuel-internal')?.addEventListener('click', () => {
      const p = ctx.selecionado; if (!p) return;
      if (global.PacoteEMatoNavegacao?.navegarParaPostoTemporario) { global.PacoteEMatoNavegacao.navegarParaPostoTemporario(p); }
      else { global.notificar?.('Navegação interna de posto indisponível nesta versão.'); }
    });
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
    const meta = brandMeta(posto.brandKey) || brandMeta('generic');
    const logo = card.querySelector('.pemato-fuel-card-logo');
    if (logo) {
      logo.replaceChildren(criarImagemMarca(posto.brandKey, 'pemato-fuel-card-logo-inner'));
      logo.className = `pemato-fuel-card-logo ${meta.markerClass || ''}`;
    }
    const name = card.querySelector('.pemato-fuel-card-name'); if (name) name.textContent = posto.name;
    const brand = posto.brand || meta?.title || 'Posto';
    const m = card.querySelector('.pemato-fuel-card-meta'); if (m) m.textContent = `${brand} • ${formatarDistancia(posto.distance)} • ${posto.priceStatus || 'Preço não informado'}`;
    const a = card.querySelector('.pemato-fuel-card-address'); if (a) a.textContent = posto.address || 'Endereço não informado pelo mapa.';
    card.style.display = 'block';
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
    limparMarcadores(ctx);
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
      renderizarMarcadores(ctx, items);
      try { ctx.map.easeTo({ center:[pos.lon,pos.lat], zoom:Math.max(13, Math.min(14.2, ctx.map.getZoom())), duration:320 }); } catch (_) {}
      if (!items.length) global.notificar?.('Nenhum posto cadastrado foi encontrado em até 5 km.');
      else global.notificar?.(`${items.length} posto(s) próximo(s) encontrado(s). Distâncias calculadas pela posição atual.`);
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
      ctx = { chave, map:null, host:null, buttonId:'', ativo:false, loading:false, items:[], card:null, selecionado:null, previousView:null, markers:new Map() };
      contexts.set(chave, ctx);
    }
    if (ctx.map && ctx.map !== map) {
      limparMarcadores(ctx);
      ctx.card?.remove?.(); ctx.card = null;
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
    if (ctx.ativo && ctx.items?.length) {
      setTimeout(() => renderizarMarcadores(ctx, ctx.items), 0);
    }
    return ctx;
  }

  function destruir(chave) {
    const ctx = contexts.get(String(chave));
    if (!ctx) return;
    desligar(ctx, false);
    ctx.card?.remove?.();
    contexts.delete(String(chave));
  }

  global.PacoteEMatoPostos = Object.freeze({ registrarMapa, alternar, destruir, buscarPostos, _parseElement:parseElement, _brandKey:brandKey, _brandMeta:brandMeta });
})(window);
