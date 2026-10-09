const RATE_WINDOW_MS = 60_000;
const RATE_MAX_REQUESTS = 180;
const MAX_STOPS = 299;
const rateBuckets = new Map();

const MODES = new Set([
  'drive', 'motorcycle', 'scooter', 'light_truck', 'medium_truck', 'truck',
  'heavy_truck', 'long_truck', 'bus', 'bicycle', 'walk'
]);

function corsHeaders(origin, allowed) {
  const headers = {
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'Content-Type, X-Pacote-Em-Mato-Client',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400'
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
}

function originAllowed(origin, env) {
  const lista = allowedOrigins(env);
  if (!origin || !lista.length) return false;
  return lista.includes(origin);
}

function json(payload, status, origin, env, cacheControl = 'no-store') {
  const allowed = originAllowed(origin, env);
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': cacheControl,
      ...corsHeaders(origin, allowed)
    }
  });
}

function checkRateLimit(request) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now();
  const atual = rateBuckets.get(ip);
  if (!atual || now - atual.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  atual.count += 1;
  return atual.count <= RATE_MAX_REQUESTS;
}

function timeoutSignal(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function isCoordinate(value) {
  if (!value || typeof value !== 'object') return false;
  if (value.lat === null || value.lat === undefined || value.lon === null || value.lon === undefined) return false;
  if (String(value.lat).trim() === '' || String(value.lon).trim() === '') return false;
  const lat = Number(value.lat);
  const lon = Number(value.lon);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 &&
    Number.isFinite(lon) && lon >= -180 && lon <= 180;
}

function sanitizeMode(mode) {
  const value = String(mode || 'drive');
  return MODES.has(value) ? value : 'drive';
}

function uniqueCoordinateCount(points) {
  const keys = new Set();
  (points || []).filter(Boolean).forEach(point => {
    if (!isCoordinate(point)) return;
    keys.add(`${Number(point.lon).toFixed(7)},${Number(point.lat).toFixed(7)}`);
  });
  return keys.size;
}

function sanitizeResult(item) {
  const rank = item?.rank || {};
  const lat = item?.lat === null || item?.lat === undefined || String(item?.lat).trim() === '' ? NaN : Number(item.lat);
  const lon = item?.lon === null || item?.lon === undefined || String(item?.lon).trim() === '' ? NaN : Number(item.lon);
  return {
    lat,
    lon,
    formatted: String(item?.formatted || ''),
    address_line1: String(item?.address_line1 || ''),
    housenumber: String(item?.housenumber || ''),
    street: String(item?.street || ''),
    city: String(item?.city || ''),
    state: String(item?.state || ''),
    postcode: String(item?.postcode || ''),
    country: String(item?.country || ''),
    country_code: String(item?.country_code || ''),
    result_type: String(item?.result_type || ''),
    rank: {
      confidence: Number(rank.confidence ?? 0),
      confidence_city_level: Number(rank.confidence_city_level ?? 0),
      confidence_street_level: Number(rank.confidence_street_level ?? 0),
      confidence_building_level: Number(rank.confidence_building_level ?? 0),
      match_type: String(rank.match_type || '')
    }
  };
}

async function parseJson(request) {
  try { return await request.json(); }
  catch (_) { return null; }
}

async function providerFetch(url, options, timeoutMs = 15000) {
  const guard = timeoutSignal(timeoutMs);
  try {
    return await fetch(url, { ...options, signal: guard.signal });
  } finally {
    guard.clear();
  }
}

async function handleGeocode(request, env, origin) {
  const body = await parseJson(request);
  if (!body) return json({ ok: false, error: 'invalid_json' }, 400, origin, env);

  const address = String(body.address || '').replace(/\s+/g, ' ').trim();
  if (address.length < 5 || address.length > 280) {
    return json({ ok: false, error: 'invalid_address' }, 400, origin, env);
  }

  const cacheUrl = new URL('https://pemato-cache.internal/geocode');
  cacheUrl.searchParams.set('q', address.toLowerCase());
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const clone = new Response(cached.body, cached);
    clone.headers.set('Access-Control-Allow-Origin', origin);
    return clone;
  }

  const providerUrl = new URL('https://api.geoapify.com/v1/geocode/search');
  providerUrl.searchParams.set('text', address);
  providerUrl.searchParams.set('format', 'json');
  providerUrl.searchParams.set('limit', '5');
  providerUrl.searchParams.set('lang', 'pt');
  providerUrl.searchParams.set('apiKey', env.GEOAPIFY_API_KEY);

  let providerResponse;
  try {
    providerResponse = await providerFetch(providerUrl.toString(), {
      headers: { 'Accept': 'application/json' }
    }, 10000);
  } catch (erro) {
    return json({ ok: false, error: erro?.name === 'AbortError' ? 'provider_timeout' : 'provider_unavailable' }, 502, origin, env);
  }

  if (!providerResponse.ok) {
    return json({ ok: false, error: 'provider_error', status: providerResponse.status }, 502, origin, env);
  }

  const providerData = await providerResponse.json();
  const results = Array.isArray(providerData?.results)
    ? providerData.results.map(sanitizeResult).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lon))
    : [];

  const payload = JSON.stringify({ ok: true, provider: 'geoapify', results });
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=86400',
    ...corsHeaders(origin, true)
  };
  const cacheResponse = new Response(payload, { status: 200, headers });
  await cache.put(cacheKey, cacheResponse.clone());
  return cacheResponse;
}

function sanitizeJob(job, index, stopDuration) {
  const location = job?.location;
  if (!isCoordinate(location)) return null;
  const id = String(job?.id || `stop-${index + 1}`).slice(0, 120);
  const duration = Math.max(0, Math.min(86400, Number(job?.duration ?? stopDuration ?? 0)));
  return {
    id,
    location: [Number(location.lon), Number(location.lat)],
    duration
  };
}

function extractOrder(feature) {
  const props = feature?.properties || {};
  const ids = [];
  const seen = new Set();
  const push = (id) => {
    const value = String(id || '');
    if (!value || seen.has(value)) return;
    seen.add(value);
    ids.push(value);
  };

  (props.actions || []).forEach(action => {
    if (action?.job_id) push(action.job_id);
  });
  if (!ids.length) {
    (props.waypoints || []).forEach(waypoint => {
      (waypoint?.actions || []).forEach(action => {
        if (action?.job_id) push(action.job_id);
      });
    });
  }
  return ids;
}

async function handleOptimize(request, env, origin) {
  const body = await parseJson(request);
  if (!body) return json({ ok: false, error: 'invalid_json' }, 400, origin, env);

  const start = body.start;
  if (!isCoordinate(start)) return json({ ok: false, error: 'invalid_start' }, 400, origin, env);

  const jobsIn = Array.isArray(body.stops) ? body.stops : [];
  if (!jobsIn.length || jobsIn.length > MAX_STOPS) {
    return json({ ok: false, error: 'invalid_stops', maxStops: MAX_STOPS }, 400, origin, env);
  }

  const stopDuration = Math.max(0, Math.min(86400, Number(body.stopDurationSeconds || 0)));
  const jobs = jobsIn.map((job, index) => sanitizeJob(job, index, stopDuration)).filter(Boolean);
  if (jobs.length !== jobsIn.length) return json({ ok: false, error: 'invalid_stop_coordinate' }, 400, origin, env);

  const endForCount = body.returnToStart === true ? start : (isCoordinate(body.end) ? body.end : null);
  const coordinateCount = uniqueCoordinateCount([start, endForCount, ...jobsIn.map(job => job.location)]);
  if (coordinateCount > 300) {
    return json({ ok: false, error: 'too_many_unique_locations', maxLocations: 300, received: coordinateCount }, 400, origin, env);
  }

  const mode = sanitizeMode(body.mode);
  const agent = {
    id: 'driver-1',
    start_location: [Number(start.lon), Number(start.lat)]
  };

  if (body.returnToStart === true) {
    agent.end_location = [Number(start.lon), Number(start.lat)];
  } else if (isCoordinate(body.end)) {
    agent.end_location = [Number(body.end.lon), Number(body.end.lat)];
  }

  const plannerBody = {
    mode,
    agents: [agent],
    jobs,
    traffic: body.traffic === 'free_flow' ? 'free_flow' : 'approximated',
    type: ['balanced', 'short', 'less_maneuvers'].includes(body.type) ? body.type : 'balanced'
  };

  const url = new URL('https://api.geoapify.com/v1/routeplanner');
  url.searchParams.set('apiKey', env.GEOAPIFY_API_KEY);

  let providerResponse;
  try {
    providerResponse = await providerFetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(plannerBody)
    }, 45000);
  } catch (erro) {
    return json({ ok: false, error: erro?.name === 'AbortError' ? 'optimizer_timeout' : 'optimizer_unavailable' }, 502, origin, env);
  }

  if (!providerResponse.ok) {
    let detail = null;
    try { detail = await providerResponse.json(); } catch (_) {}
    return json({ ok: false, error: 'optimizer_error', status: providerResponse.status, detail }, 502, origin, env);
  }

  const data = await providerResponse.json();
  const feature = Array.isArray(data?.features) ? data.features[0] : null;
  if (!feature) return json({ ok: false, error: 'optimizer_empty' }, 502, origin, env);

  const props = feature.properties || {};
  const orderIds = extractOrder(feature);
  const issues = data?.properties?.issues || {};

  return json({
    ok: true,
    provider: 'geoapify-route-planner',
    orderIds,
    distance: Number(props.distance || 0),
    drivingTime: Number(props.time || 0),
    totalTime: Number(props.total_time || props.time || 0),
    issues: {
      unassignedJobs: issues.unassigned_jobs || issues.unassignedJobs || [],
      unassignedAgents: issues.unassigned_agents || issues.unassignedAgents || []
    }
  }, 200, origin, env);
}

function sanitizeRouteFeature(feature) {
  if (!feature || typeof feature !== 'object') return null;
  const props = feature.properties || {};
  return {
    type: 'Feature',
    geometry: feature.geometry || null,
    properties: {
      distance: Number(props.distance || 0),
      time: Number(props.time || 0),
      legs: Array.isArray(props.legs) ? props.legs : [],
      waypoints: Array.isArray(props.waypoints) ? props.waypoints : []
    }
  };
}

async function handleRoute(request, env, origin) {
  const body = await parseJson(request);
  if (!body) return json({ ok: false, error: 'invalid_json' }, 400, origin, env);

  const points = Array.isArray(body.points) ? body.points : [];
  if (points.length < 2 || points.length > 301 || points.some(p => !isCoordinate(p))) {
    return json({ ok: false, error: 'invalid_points' }, 400, origin, env);
  }

  const mode = sanitizeMode(body.mode);
  const providerUrl = new URL('https://api.geoapify.com/v1/routing');
  providerUrl.searchParams.set('waypoints', points.map(p => `${Number(p.lat)},${Number(p.lon)}`).join('|'));
  providerUrl.searchParams.set('mode', mode);
  providerUrl.searchParams.set('type', ['balanced', 'short', 'less_maneuvers'].includes(body.type) ? body.type : 'balanced');
  providerUrl.searchParams.set('traffic', body.traffic === 'free_flow' ? 'free_flow' : 'approximated');
  providerUrl.searchParams.set('lang', 'pt-BR');
  providerUrl.searchParams.set('details', 'instruction_details');
  providerUrl.searchParams.set('apiKey', env.GEOAPIFY_API_KEY);

  let providerResponse;
  try {
    providerResponse = await providerFetch(providerUrl.toString(), {
      headers: { 'Accept': 'application/geo+json,application/json' }
    }, 45000);
  } catch (erro) {
    return json({ ok: false, error: erro?.name === 'AbortError' ? 'route_timeout' : 'route_unavailable' }, 502, origin, env);
  }

  if (!providerResponse.ok) {
    return json({ ok: false, error: 'route_error', status: providerResponse.status }, 502, origin, env);
  }

  const data = await providerResponse.json();
  const feature = Array.isArray(data?.features) ? sanitizeRouteFeature(data.features[0]) : null;
  if (!feature || !feature.geometry) return json({ ok: false, error: 'route_empty' }, 502, origin, env);

  return json({ ok: true, provider: 'geoapify-routing', feature }, 200, origin, env);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = originAllowed(origin, env);
    const url = new URL(request.url);

    // /health pode ser aberto diretamente no navegador (sem Origin) para diagnóstico.
    // Se a chamada vier do app, o CORS continua sendo aplicado somente para origem autorizada.
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({
        ok: true,
        service: 'pacote-emato-routing',
        providerConfigured: !!env.GEOAPIFY_API_KEY
      }, 200, origin, env);
    }

    if (request.method === 'OPTIONS') {
      if (!allowed) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: corsHeaders(origin, true) });
    }

    // Todas as rotas que consomem Geoapify continuam protegidas por origem.
    if (!allowed) return json({ ok: false, error: 'origin_not_allowed' }, 403, origin, env);

    if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, origin, env);
    if (!checkRateLimit(request)) return json({ ok: false, error: 'rate_limited' }, 429, origin, env);
    if (!env.GEOAPIFY_API_KEY) return json({ ok: false, error: 'provider_not_configured' }, 503, origin, env);

    const client = request.headers.get('X-Pacote-Em-Mato-Client');
    if (!['map-v1', 'routing-v1'].includes(client)) {
      return json({ ok: false, error: 'invalid_client' }, 400, origin, env);
    }

    if (url.pathname === '/geocode') return handleGeocode(request, env, origin);
    if (url.pathname === '/optimize') return handleOptimize(request, env, origin);
    if (url.pathname === '/route') return handleRoute(request, env, origin);
    return json({ ok: false, error: 'not_found' }, 404, origin, env);
  }
};
