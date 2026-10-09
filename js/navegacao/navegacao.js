(function iniciarNavegacao(global) {
  'use strict';

  let rota = null;
  let mapa = null;
  let mapReady = false;
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
  const falasFeitas = new Set();
  let marcadoresParadasAtivos = [];
  let assinaturaMarcadoresParadas = '';

  const SOURCE_ROUTE = 'pemato-nav-route';
  const SOURCE_PROGRESS = 'pemato-nav-progress';
  const SOURCE_DRIVER = 'pemato-nav-driver';
  const SOURCE_NEXT = 'pemato-nav-next';
  const SOURCE_STOPS = 'pemato-nav-all-stops';
  const LAYER_STOPS = 'pemato-nav-stops-simple';
  const LAYER_STOPS_MULTI = 'pemato-nav-stops-multi';
  const LAYER_STOPS_ACTIVE = 'pemato-nav-stops-active';
  const LAYER_STOPS_MULTI_ACTIVE = 'pemato-nav-stops-multi-active';
  let cartaoSelecionadoId = null;
  const LAYER_ROUTE_CASE = 'pemato-nav-route-case';
  const LAYER_ROUTE = 'pemato-nav-route-layer';
  const LAYER_PROGRESS = 'pemato-nav-progress-layer';
  const LAYER_DRIVER_RING = 'pemato-nav-driver-ring';
  const LAYER_DRIVER = 'pemato-nav-driver';
  const LAYER_NEXT = 'pemato-nav-next';
  const LAYER_NEXT_TEXT = 'pemato-nav-next-label';

  function $(id) { return document.getElementById(id); }
  function cfg() { return global.PEMATO_MAP_CONFIG || {}; }
  function fc(features) { return { type: 'FeatureCollection', features: features || [] }; }

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

  function horaLocal(ts) { try { return ts ? new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) : '—'; } catch (_) { return '—'; } }

  function chaveMultiplo(p) {
    const numero = String(p?.numero || (String(p?.enderecoFonte || p?.enderecoOriginal || '').match(/\b\d+[A-Za-z]?\b/) || [''])[0] || '').toLowerCase();
    let rua = String(p?.logradouro || p?.enderecoFonte || p?.enderecoOriginal || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if (numero) rua = rua.replace(new RegExp(`\\b${numero.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b.*$`,'i'),'');
    rua = rua.replace(/\b(ap|apto|apartamento|casa|bloco|sala|loja|suite|fundos|frente)\b.*$/i,'').replace(/[^a-z0-9]+/g,' ').trim();
    return rua && numero ? `${rua}|${numero}` : '';
  }

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

  function atualizarPendentes() {
    ordemPendente = paradasPorOrdem().filter(p => !['entregue', 'concluida', 'nao_entregue'].includes(p.statusEntrega));
    if (global.appState?.navegacao) {
      global.appState.navegacao.paradaAtualId = ordemPendente[0]?.id || null;
      global.appState.navegacao.proximaParadaId = ordemPendente[0]?.id || null;
    }
  }
  function proxima() { return ordemPendente[0] || null; }
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

  function adicionarSource(id, data) { if (!mapa.getSource(id)) mapa.addSource(id, { type: 'geojson', data }); }
  function antesRotulos() { return (mapa.getStyle()?.layers || []).find(l => l.type === 'symbol')?.id; }

  function removerCamadas3D() {
    if (!mapa || !mapReady) return;
    try {
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
        const a = document.createElement('canvas');
        a.width = 56; a.height = 56;
        const c = a.getContext('2d');
        if (c) {
          c.clearRect(0,0,56,56); c.beginPath(); c.moveTo(28,3); c.lineTo(49,49); c.lineTo(28,39); c.lineTo(7,49); c.closePath();
          c.fillStyle = '#159766'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 4; c.stroke();
          mapa.addImage('pemato-driver-arrow', c.getImageData(0,0,56,56));
        }
      }
    } catch (_) {}
  }

  function garantirCamadas() {
    if (!mapa || !mapReady) return;
    adicionarSource(SOURCE_ROUTE, fc([])); adicionarSource(SOURCE_PROGRESS, fc([])); adicionarSource(SOURCE_DRIVER, fc([])); adicionarSource(SOURCE_NEXT, fc([])); adicionarSource(SOURCE_STOPS, fc([]));
    garantirImagemBalao();
    const before = antesRotulos();
    if (!mapa.getLayer(LAYER_ROUTE_CASE)) mapa.addLayer({ id:LAYER_ROUTE_CASE,type:'line',source:SOURCE_ROUTE,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':9,'line-opacity':.9}}, before);
    if (!mapa.getLayer(LAYER_ROUTE)) mapa.addLayer({ id:LAYER_ROUTE,type:'line',source:SOURCE_ROUTE,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#059669','line-width':6,'line-opacity':.92}}, before);
    if (!mapa.getLayer(LAYER_PROGRESS)) mapa.addLayer({ id:LAYER_PROGRESS,type:'line',source:SOURCE_PROGRESS,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#2563eb','line-width':6,'line-opacity':.88}}, before);
    if (!mapa.getLayer(LAYER_DRIVER_RING)) mapa.addLayer({ id:LAYER_DRIVER_RING,type:'circle',source:SOURCE_DRIVER,paint:{'circle-radius':13,'circle-color':'rgba(37,99,235,.22)'} });
    if (!mapa.getLayer(LAYER_DRIVER)) mapa.addLayer({ id:LAYER_DRIVER,type:'symbol',source:SOURCE_DRIVER,layout:{'icon-image':'pemato-driver-arrow','icon-size':1,'icon-allow-overlap':true,'icon-ignore-placement':true,'icon-rotation-alignment':'map','icon-rotate':['coalesce',['get','heading'],0]} });
    // V9: paradas são renderizadas como marcadores HTML em pílula.

    if (!mapa.getLayer(LAYER_NEXT)) mapa.addLayer({ id:LAYER_NEXT,type:'circle',source:SOURCE_NEXT,paint:{'circle-radius':15,'circle-color':'#059669','circle-stroke-color':'#fff','circle-stroke-width':3} });
    if (!mapa.getLayer(LAYER_NEXT_TEXT)) mapa.addLayer({ id:LAYER_NEXT_TEXT,type:'symbol',source:SOURCE_NEXT,layout:{'text-field':['to-string',['get','order']],'text-size':12,'text-allow-overlap':true},paint:{'text-color':'#fff'} });
  }

  function garantirMapa() {
    const container = $('mapaNavegacao');
    if (!container || mapa || !global.maplibregl) return mapa;
    try {
      mapa = new global.maplibregl.Map({ container, style: cfg().mapStyleUrl, center: cfg().initialCenter || [-46.6333,-23.5505], zoom: 15, pitch:0,bearing:0,maxPitch:0,dragRotate:false,touchPitch:false });
      mapa.touchZoomRotate?.disableRotation?.();
      mapa.on('dragstart', () => { seguirPosicao = false; atualizarBotaoFollow(); });
      const ready = () => { mapReady = true; removerCamadas3D(); garantirCamadas(); desenharRota(); atualizarFontesPontos(); };
      mapa.on('load', ready); mapa.on('style.load', ready);
      mapa.on('error', ev => { const el=$('navMapFallback'); if(el){el.textContent=ev?.error?.message ? `Mapa indisponível: ${ev.error.message}`:'Mapa indisponível.';el.style.display='flex';} });
    } catch (erro) { const el=$('navMapFallback'); if(el){el.textContent=erro?.message||'Não foi possível abrir o mapa.';el.style.display='flex';} }
    return mapa;
  }

  function setSource(id, data) { if (!mapa || !mapReady) return; garantirCamadas(); mapa.getSource(id)?.setData?.(data); }

  function geometriaVisualSegura(g){
    if(!geometriaValida(g)) return null;
    const orig=g.type==='LineString'?[g.coordinates]:g.coordinates, linhas=[];
    orig.forEach(linha=>{
      let atual=[];
      linha.forEach(coord=>{
        if(!Array.isArray(coord)||coord.length<2) return;
        if(atual.length && haversine(atual[atual.length-1],coord)>1800){ if(atual.length>=2) linhas.push(atual); atual=[]; }
        const prev=atual[atual.length-1]; if(!prev||prev[0]!==coord[0]||prev[1]!==coord[1]) atual.push(coord);
      });
      if(atual.length>=2) linhas.push(atual);
    });
    if(!linhas.length) return null;
    return linhas.length===1?{type:'LineString',coordinates:linhas[0]}:{type:'MultiLineString',coordinates:linhas};
  }
  function desenharRota() {
    if (!mapa || !mapReady) return;
    const g = geometriaVisualSegura(rota?.geometria);
    setSource(SOURCE_ROUTE, fc(g ? [{type:'Feature',properties:{},geometry:g}] : []));
  }

  function limparMarcadoresParadasHtml() {
    marcadoresParadasAtivos.forEach(marker => { try { marker.remove(); } catch (_) {} });
    marcadoresParadasAtivos = [];
    assinaturaMarcadoresParadas = '';
  }

  function dispersaoEspiralMarcador(indice) {
    if (indice <= 0) return { dLat:0, dLon:0, px:0, py:0 };
    const angulo = ((indice + 1) * 137.5) * (Math.PI / 180);
    const raioGeo = 0.00012 * Math.sqrt(indice);
    const raioPx = 25 * Math.sqrt(indice);
    return {
      dLat: raioGeo * Math.cos(angulo),
      dLon: raioGeo * Math.sin(angulo),
      px: Math.round(raioPx * Math.sin(angulo)),
      py: Math.round(raioPx * Math.cos(angulo))
    };
  }

  function criarElementoMarcadorNavegacao(feature) {
    const props = feature?.properties || {};
    const wrapper = document.createElement('div');
    wrapper.className = 'marker-parada-wrapper';
    wrapper.style.zIndex = String(Math.max(1, 10000 - Number(props.order || 0)));
    if (props.current === true || props.current === 1 || props.current === 'true') wrapper.classList.add('is-active');

    const pill = document.createElement('div');
    pill.className = 'marker-parada-pill';
    pill.setAttribute('role', 'button');
    pill.setAttribute('aria-label', Number(props.multi || 1) > 1
      ? `Parada ${props.order}, ${props.multi} pacotes`
      : `Parada ${props.order}`);

    const num = document.createElement('span');
    num.className = 'num-parada';
    num.textContent = String(props.order || '');
    pill.appendChild(num);
    if (Number(props.multi || 1) > 1) {
      const badge = document.createElement('span');
      badge.className = 'multi-badge';
      badge.textContent = `${Number(props.multi)}x`;
      pill.appendChild(badge);
    }
    wrapper.appendChild(pill);

    const elevar = () => wrapper.classList.add('is-pressed');
    const baixar = () => wrapper.classList.remove('is-pressed');
    wrapper.addEventListener('pointerdown', elevar, { passive:true });
    wrapper.addEventListener('pointerup', baixar, { passive:true });
    wrapper.addEventListener('pointercancel', baixar, { passive:true });
    wrapper.addEventListener('pointerleave', baixar, { passive:true });
    wrapper.addEventListener('click', event => {
      event.preventDefault(); event.stopPropagation();
      const id = String(props.id || '');
      if (!id) return;
      cartaoSelecionadoId = id;
      atualizarPainel();
      persistirSelecao({ motivo:'selecionar_parada_mapa' });
      const stop = paradasPorOrdem().find(s => String(s.id) === id);
      if (stop && mapa && mapReady && coordenadaValida(stop.latitude, stop.longitude)) {
        mapa.easeTo({ center:[Number(stop.longitude), Number(stop.latitude)], zoom:Math.max(mapa.getZoom(), 15.5), pitch:0, duration:300 });
      }
    });
    return wrapper;
  }

  function renderizarMarcadoresNavegacao(features) {
    if (!mapa || !mapReady || !global.maplibregl?.Marker) return;
    const novaAssinatura = JSON.stringify((features || []).map(f => [f?.properties?.id, f?.properties?.order, f?.properties?.multi, f?.properties?.current, f?.properties?.status, f?.geometry?.coordinates]));
    if (novaAssinatura === assinaturaMarcadoresParadas && marcadoresParadasAtivos.length) return;
    limparMarcadoresParadasHtml();
    assinaturaMarcadoresParadas = novaAssinatura;
    const ocupacao = Object.create(null);
    [...(features || [])].sort((a,b) => Number(a?.properties?.order || 0) - Number(b?.properties?.order || 0)).forEach(feature => {
      const coord = feature?.geometry?.coordinates;
      if (!Array.isArray(coord) || coord.length < 2) return;
      let lng = Number(coord[0]), lat = Number(coord[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const geoKey = `${lat.toFixed(4)}_${lng.toFixed(4)}`;
      const indice = ocupacao[geoKey] || 0;
      ocupacao[geoKey] = indice + 1;
      const spread = dispersaoEspiralMarcador(indice);
      lat += spread.dLat; lng += spread.dLon;
      const el = criarElementoMarcadorNavegacao(feature);
      const marker = new global.maplibregl.Marker({ element:el, anchor:'center', offset:[spread.px, spread.py] })
        .setLngLat([lng,lat]).addTo(mapa);
      marcadoresParadasAtivos.push(marker);
    });
  }

  function atualizarFontesPontos() {
    if (!mapa || !mapReady) return;
    const p = proxima();
    setSource(SOURCE_DRIVER, fc(ultimaPosicao && coordenadaValida(ultimaPosicao.lat,ultimaPosicao.lon) ? [{type:'Feature',properties:{heading:Number.isFinite(Number(ultimaPosicao.heading))?Number(ultimaPosicao.heading):0},geometry:{type:'Point',coordinates:[Number(ultimaPosicao.lon),Number(ultimaPosicao.lat)]}}] : []));
    setSource(SOURCE_NEXT, fc([])); // O destaque é feito na mesma camada numerada; evita marcador duplicado.
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
      const principal = grupo[0];
      const stop = principal.stop;
      const multi = grupo.reduce((total,item) => total + quantidadePacotesDaParada(item.stop), 0);
      const lat = Number(stop.latitude), lon = Number(stop.longitude);
      const gridLat = Math.round(lat / 0.00032);
      const gridLon = Math.round(lon / 0.00032);
      const visualKey = `${gridLat}|${gridLon}`;
      const stackIndex = ocupacaoVisual.get(visualKey) || 0;
      ocupacaoVisual.set(visualKey, stackIndex + 1);
      const ids = grupo.map(item => String(item.stop.id));
      features.push({type:'Feature',properties:{id:String(stop.id),ids:ids.join(','),order:principal.order,multi,stackIndex,status:stop.statusEntrega||'pendente',current:ids.includes(String(cartaoSelecionadoId||p?.id||''))},geometry:{type:'Point',coordinates:[lon,lat]}});
    });
    setSource(SOURCE_STOPS, fc(features));
    renderizarMarcadoresNavegacao(features);
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
    if(!vozAtiva||!texto||!vozDisponivel()||falasFeitas.has(chave)) return;
    falasFeitas.add(chave);
    try{
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

  function atualizarBotaoFollow(){ const b=$('navFollowBtn'); if(b){b.classList.toggle('active',seguirPosicao);b.title=seguirPosicao?'Acompanhando sua posição':'Voltar a acompanhar sua posição';} }
  function atualizarBotaoVoz(){ const b=$('navVoiceBtn'); if(b){b.classList.toggle('active',vozAtiva);b.textContent=vozAtiva?'Voz ativa':'Voz muda';} }

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
    add(p.observacao);
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

  function atualizarPainel() {
    atualizarPendentes(); const p=paradasPorOrdem().find(s=>String(s.id)===String(cartaoSelecionadoId)) || proxima();
    const pos=paradasPorOrdem().findIndex(s=>String(s.id)===String(p?.id));
    if($('navStopNumber')) $('navStopNumber').textContent=pos>=0?`PARADA ${String(pos+1).padStart(2,'0')}`:'SEM PARADA';
    if($('navNextAddress')) $('navNextAddress').textContent=p?.enderecoOriginal||'Nenhuma parada pendente';
    if($('navNextComplement')) $('navNextComplement').textContent=detalhesDaParada(p);
    if($('navNextPackages')) $('navNextPackages').textContent=`${p?.pacotes?.length||0} pacote(s)`;
    if($('navStopCard')) $('navStopCard').dataset.status = String(p?.statusEntrega || 'pendente');
    if(global.appState?.navegacao){global.appState.navegacao.paradaExibidaId=p?.id||null;global.appState.navegacao.proximaParadaId=proxima()?.id||null;}
    const idNota=String(p?.id||'');
    if(idNota!==ultimoIdNota){ultimoIdNota=idNota;if($('navDeliveryNote'))$('navDeliveryNote').value=String(p?.observacaoEntrega||'');}
    if($('navRemaining')) $('navRemaining').textContent=String(ordemPendente.length);
    const leg=rota?.pernas?.[0]||null;
    if($('navDistanceNext')) $('navDistanceNext').textContent=formatarDistancia(leg?.distance);
    if($('navEtaNext')) $('navEtaNext').textContent=formatarTempo(leg?.time);
    if($('navRouteTotal')) $('navRouteTotal').textContent=formatarDistancia(rota?.distanciaTotalMetros);
    if($('navRouteTime')) $('navRouteTime').textContent=formatarTempo(rota?.duracaoDirecaoSegundos);
    const duracaoRestante = Number(rota?.duracaoTotalSegundos);
    if ($('navEtaCard')) $('navEtaCard').style.display = Number.isFinite(duracaoRestante) ? 'grid' : 'none';
    if ($('navEtaTime')) $('navEtaTime').textContent = horaLocal(rota?.horarioTerminoEstimado);
    if ($('navEtaRemaining')) $('navEtaRemaining').textContent = Number.isFinite(duracaoRestante) ? `aprox. ${formatarTempo(duracaoRestante)} restantes` : 'Calculando previsão';
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
      await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true}); falasFeitas.clear(); desenharRota(); atualizarPainel(); ultimoRecalculo=Date.now(); eventosForaRota=0;
      if($('navGpsStatus')) $('navGpsStatus').textContent=motivo==='desvio'?'Rota recalculada após desvio':'Rota atualizada';
      return true;
    }catch(erro){global.notificar?.(erro?.message||'Não foi possível recalcular a rota.'); if($('navGpsStatus')) $('navGpsStatus').textContent='Não foi possível recalcular'; return false;}
    finally{if(btn){btn.disabled=false;btn.textContent=textoBtn;}}
  }

  function processarPosicao(pos) {
    ultimaPosicao={lat:Number(pos.coords.latitude),lon:Number(pos.coords.longitude),accuracy:Number(pos.coords.accuracy||0),heading:Number.isFinite(Number(pos.coords.heading))?Number(pos.coords.heading):null,at:Date.now()};
    if(!coordenadaValida(ultimaPosicao.lat,ultimaPosicao.lon)) return;
    if(global.appState?.navegacao){global.appState.navegacao.ultimaPosicao=ultimaPosicao;global.appState.navegacao.ultimaAtualizacaoEm=Date.now();}
    atualizarFontesPontos();
    if (posicaoAnterior && coordenadaValida(posicaoAnterior.lat,posicaoAnterior.lon)) {
      const trecho = haversine([posicaoAnterior.lon,posicaoAnterior.lat],[ultimaPosicao.lon,ultimaPosicao.lat]);
      if (Number.isFinite(trecho) && trecho >= 1 && trecho < 1000) rota.distanciaPercorridaMetros = Number(rota.distanciaPercorridaMetros || 0) + trecho;
    }
    posicaoAnterior = { ...ultimaPosicao };
    const nearest=nearestOnRoute(ultimaPosicao); atualizarProgressoVisual(nearest); atualizarInstrucao(nearest);
    const coords = geometriaPontos(rota?.geometria);
    if (nearest && coords.length) {
      const firstLeg = rota?.pernas?.[0] || null;
      const stepEnds = (firstLeg?.steps || []).map(st => Number(st?.to_index)).filter(Number.isFinite);
      const legEndIndex = stepEnds.length ? Math.max(...stepEnds) : Math.min(coords.length - 1, nearest.index + 1);
      const dNextRoute = distanciaAoLongo(coords, nearest.index, legEndIndex, nearest.point);
      const legDistance = Number(firstLeg?.distance || 0), legTime = Number(firstLeg?.time || 0);
      const etaNext = legDistance > 0 && legTime >= 0 && Number.isFinite(dNextRoute) ? dNextRoute * (legTime / legDistance) : null;
      if ($('navDistanceNext')) $('navDistanceNext').textContent = formatarDistancia(dNextRoute);
      if ($('navEtaNext')) $('navEtaNext').textContent = formatarTempo(etaNext);
      const dRemaining = distanciaAoLongo(coords, nearest.index, coords.length - 1, nearest.point);
      const totalDistance = Number(rota?.distanciaTotalMetros || 0), totalTime = Number(rota?.duracaoDirecaoSegundos || 0);
      const tRemaining = totalDistance > 0 && totalTime >= 0 ? dRemaining * (totalTime / totalDistance) : null;
      if ($('navRouteTotal')) $('navRouteTotal').textContent = formatarDistancia(dRemaining);
      if ($('navRouteTime')) $('navRouteTime').textContent = formatarTempo(tRemaining);
    }
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
    if(seguirPosicao&&mapa&&mapReady&&Date.now()-ultimaCentralizacao>1200){ultimaCentralizacao=Date.now();try{mapa.easeTo({center:[ultimaPosicao.lon,ultimaPosicao.lat],zoom:Math.max(mapa.getZoom(),16),bearing:Number.isFinite(Number(ultimaPosicao.heading))?Number(ultimaPosicao.heading):mapa.getBearing(),pitch:0,duration:500});}catch(_){} }
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
    rota.paradaSelecionadaId=alvo;
    rota.proximaParadaId=proxima()?.id||null;
    if(global.appState?.navegacao){global.appState.navegacao.paradaExibidaId=alvo;global.appState.navegacao.proximaParadaId=rota.proximaParadaId;}
    try{await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});}catch(e){console.warn('Não foi possível persistir a parada selecionada',e);}
    try{await global.PacoteEMatoSessao?.persistirAgora?.(Object.assign({motivo:'navegacao',paradaSelecionadaId:alvo,proximaParadaId:rota.proximaParadaId,navegacaoAtiva:true},extra||{}));}catch(_){}
  }
  function selecionarCartao(delta){
    const lista=paradasPorOrdem();if(!lista.length)return;const id=cartaoSelecionadoId||proxima()?.id;
    const indice=Math.max(0,lista.findIndex(s=>String(s.id)===String(id)));
    const alvo=lista[Math.max(0,Math.min(lista.length-1,indice+delta))];
    if(!alvo)return;cartaoSelecionadoId=alvo.id;atualizarPainel();persistirSelecao({motivo:'troca_cartao'});
    if(mapa&&mapReady&&coordenadaValida(alvo.latitude,alvo.longitude))mapa.easeTo({center:[Number(alvo.longitude),Number(alvo.latitude)],pitch:0,duration:350});
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
      const seguinte=proximaPendenteDepois(idTratado);
      cartaoSelecionadoId=seguinte?.id||null;
      rota.paradaSelecionadaId=cartaoSelecionadoId;
      rota.proximaParadaId=cartaoSelecionadoId;
      rota.duracaoParadasSegundos=ordemPendente.length*Number(rota.tempoParadaSegundos||0);
      if(Number.isFinite(Number(rota.duracaoDirecaoSegundos))){rota.duracaoTotalSegundos=Number(rota.duracaoDirecaoSegundos||0)+Number(rota.duracaoParadasSegundos||0);rota.horarioTerminoEstimado=Date.now()+rota.duracaoTotalSegundos*1000;}
      await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});
      await global.PacoteEMatoSessao?.persistirAgora?.({motivo:status==='entregue'?'parada_entregue':'parada_nao_entregue',paradaSelecionadaId:cartaoSelecionadoId,proximaParadaId:cartaoSelecionadoId,navegacaoAtiva:true});
      if($('navDeliveryNote'))$('navDeliveryNote').value=''; if($('navExtrasPanel'))$('navExtrasPanel').style.display='none'; ultimoIdNota='';
      falasFeitas.clear(); atualizarPainel(); global.PacoteEMatoHistorico?.renderizar?.(); global.PacoteEMatoAppShell?.atualizarInicio?.();
      if(ordemPendente.length){if(global.PacoteEMatoServicoRota?.endpoint?.('route'))await recalcular('proxima');else atualizarFontesPontos();}
      else{rota.status='aguardando_finalizacao';rota.conclusaoPendente=true;await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});mostrarConclusao();}
    }finally{processandoStatus=false;}
  }

  async function finalizarRota(){if(!rota)return;limparMarcadoresParadasHtml();rota.status='concluida';rota.concluidoEm=Date.now();rota.conclusaoPendente=false;await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};if($('navCompletionBackdrop'))$('navCompletionBackdrop').style.display='none';await global.PacoteEMatoRotaStore.limparRotaAtiva();global.PacoteEMatoAppShell?.abrirModulo?.('historico');}
  function revisarResultados(){if($('navCompletionBackdrop'))$('navCompletionBackdrop').style.display='none';global.PacoteEMatoAppShell?.abrirModulo?.('historico');}

  async function navegarPreferido(){
    const pref=String(global.PacoteEMatoConfiguracoes?.obter?.().navegacao||'pacote_emato');
    if(global.appState?.navegacao)global.appState.navegacao.provider=pref;
    if(pref==='waze'||pref==='google') return abrirExterno(pref);
    await persistirSelecao({motivo:'navegacao_interna',navegacaoProvider:'pacote_emato'});
    seguirPosicao=true;atualizarBotaoFollow();
    if(watchId==null)iniciarGPS();
    if($('navGpsStatus'))$('navGpsStatus').textContent='Navegação Pacote É Mato ativa';
    if(ultimaPosicao&&mapa&&mapReady)mapa.easeTo({center:[ultimaPosicao.lon,ultimaPosicao.lat],zoom:16,pitch:0,duration:350});
  }

  async function iniciar(rotaEntrada){
    rota=rotaEntrada?global.PacoteEMatoRotaStore.normalizarRota(rotaEntrada):await global.PacoteEMatoRotaStore.obterRotaAtiva(); if(!rota||!geometriaValida(rota.geometria)){global.notificar?.('Calcule uma rota válida antes de iniciar a navegação.');return;}
    atualizarPendentes();let idExterno=null;try{idExterno=sessionStorage.getItem('pemato_parada_externa');sessionStorage.removeItem('pemato_parada_externa');}catch(_){}cartaoSelecionadoId=idExterno||rota.paradaSelecionadaId||global.appState?.navegacao?.paradaExibidaId||proxima()?.id||null;posicaoAnterior=null; const pref=global.PacoteEMatoConfiguracoes?.obter?.().navegacao||'pacote_emato';
    if(global.appState?.navegacao){global.appState.navegacao.ativa=true;global.appState.navegacao.provider=pref;global.appState.navegacao.iniciadaEm=global.appState.navegacao.iniciadaEm||Date.now();global.appState.navegacao.paradaExibidaId=cartaoSelecionadoId;rota.iniciadoEm=rota.iniciadoEm||global.appState.navegacao.iniciadaEm;vozAtiva=global.appState.navegacao.vozAtiva!==false;seguirPosicao=true;global.appState.navegacao.seguirPosicao=true;}
    garantirMapa(); desenharRota(); atualizarPainel(); atualizarBotaoFollow(); atualizarBotaoVoz();
    if(pref==='pacote_emato')iniciarGPS();else if($('navGpsStatus'))$('navGpsStatus').textContent=`Navegação preferida: ${pref==='waze'?'Waze':'Google Maps'} · toque em Navegar`;
    await persistirSelecao({motivo:'abrir_navegacao',navegacaoProvider:pref});
    if(!ordemPendente.length)mostrarConclusao();
  }

  function encerrar(){if(!global.confirm('Sair da navegação? A rota e o progresso serão preservados.'))return;pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};if(global.appState?.navegacao)global.appState.navegacao.ativa=false;global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');}
  function pausar(){pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};}
  function retomar(){const agora=Date.now();if(agora-ultimoRetomar<500)return;ultimoRetomar=agora;if(rota&&global.appState?.navegacao?.ativa){garantirMapa();mapa?.resize?.();atualizarPainel();const pref=String(global.PacoteEMatoConfiguracoes?.obter?.().navegacao||'pacote_emato');if(pref==='pacote_emato'&&watchId==null)iniciarGPS();else if(pref!=='pacote_emato'&&$('navGpsStatus'))$('navGpsStatus').textContent=`Retorno ao Pacote É Mato · ${pref==='waze'?'Waze':'Google Maps'} selecionado`;persistirSelecao({motivo:'retorno_primeiro_plano',navegacaoProvider:pref});}}

  function abrirAcoesRota(){const el=$('navRouteActionsBackdrop');if(el)el.style.display='flex';}
  function fecharAcoesRota(){const el=$('navRouteActionsBackdrop');if(el)el.style.display='none';}
  async function abrirRefinoDaNavegacao(){fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>{global.PacoteEMatoRoteirizacao?.abrirRevisaoOtimizacao?.();setTimeout(()=>$('routingReviewRefineBtn')?.click?.(),80);},140);}
  async function abrirBipagemDaNavegacao(){fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.abrirEscolhaBipagem?.(),140);}
  async function exportarPdfNavegacao(){fecharAcoesRota();if(rota)await global.PacoteEMatoPDF?.exportar?.(rota);}

  function bind(){
    const swipe=$('navStopCard');let startX=0,startY=0;
    swipe?.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;startY=e.touches[0].clientY;},{passive:true});
    swipe?.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-startX,dy=e.changedTouches[0].clientY-startY;if(Math.abs(dx)>65&&Math.abs(dx)>Math.abs(dy)*1.5)selecionarCartao(dx<0?1:-1);},{passive:true});
    $('navNavigateBtn')?.addEventListener('click',navegarPreferido);
    $('navDeliveredBtn')?.addEventListener('click',()=>salvarStatusParadaAtual('entregue'));
    $('navNotDeliveredBtn')?.addEventListener('click',()=>salvarStatusParadaAtual('nao_entregue'));
    $('navMoreBtn')?.addEventListener('click',abrirAcoesRota);
    $('navRouteActionsClose')?.addEventListener('click',fecharAcoesRota);
    $('navRouteActionsBackdrop')?.addEventListener('click',e=>{if(e.target===$('navRouteActionsBackdrop'))fecharAcoesRota();});
    $('navActionImport')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>$('routingXlsxInput')?.click?.(),140);});
    $('navActionNewRoute')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.criarNovaRotaVazia?.(),140);});
    $('navActionAddStop')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.abrirEditor?.(null),140);});
    $('navActionUseBipagemRoute')?.addEventListener('click',()=>{fecharAcoesRota();global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');setTimeout(()=>global.PacoteEMatoRoteirizacao?.usarRotaLegada?.(),140);});
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
    $('navFollowBtn')?.addEventListener('click',()=>{seguirPosicao=true;if(global.appState?.navegacao)global.appState.navegacao.seguirPosicao=true;atualizarBotaoFollow();if(ultimaPosicao&&mapa&&mapReady)mapa.easeTo({center:[ultimaPosicao.lon,ultimaPosicao.lat],zoom:16,pitch:0,duration:350});});
    $('navVoiceBtn')?.addEventListener('click',()=>{vozAtiva=!vozAtiva;if(global.appState?.navegacao)global.appState.navegacao.vozAtiva=vozAtiva;if(!vozAtiva)try{global.speechSynthesis?.cancel?.();}catch(_){};atualizarBotaoVoz();});
    $('navCompletionFinishBtn')?.addEventListener('click',finalizarRota); $('navCompletionReviewBtn')?.addEventListener('click',revisarResultados);
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&global.appState?.navegacao?.ativa){if($('navGpsStatus'))$('navGpsStatus').textContent='Aplicativo em segundo plano; GPS e voz podem ser suspensos pelo navegador.';persistirSelecao({motivo:'background_navegacao'});}});
    global.addEventListener('pemato:resume',()=>{if(document.body.dataset.pematoModule==='navegacao')retomar();});
    $('navDeliveryNote')?.addEventListener('change',async()=>{const p=paradasPorOrdem().find(s=>String(s.id)===String(cartaoSelecionadoId))||proxima();if(!p||!rota)return;p.observacaoEntrega=String($('navDeliveryNote').value||'');await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  global.PacoteEMatoNavegacao=Object.freeze({iniciar,recalcular,encerrar,pausar,abrirExterno,navegarPreferido,salvarStatusParadaAtual,finalizarRota,selecionarCartao,persistirSelecao,retomar});
})(window);
