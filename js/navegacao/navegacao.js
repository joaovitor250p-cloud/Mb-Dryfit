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
  const falasFeitas = new Set();

  const SOURCE_ROUTE = 'pemato-nav-route';
  const SOURCE_PROGRESS = 'pemato-nav-progress';
  const SOURCE_DRIVER = 'pemato-nav-driver';
  const SOURCE_NEXT = 'pemato-nav-next';
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

  function garantirCamadas() {
    if (!mapa || !mapReady) return;
    adicionarSource(SOURCE_ROUTE, fc([])); adicionarSource(SOURCE_PROGRESS, fc([])); adicionarSource(SOURCE_DRIVER, fc([])); adicionarSource(SOURCE_NEXT, fc([]));
    const before = antesRotulos();
    if (!mapa.getLayer(LAYER_ROUTE_CASE)) mapa.addLayer({ id:LAYER_ROUTE_CASE,type:'line',source:SOURCE_ROUTE,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#fff','line-width':9,'line-opacity':.9}}, before);
    if (!mapa.getLayer(LAYER_ROUTE)) mapa.addLayer({ id:LAYER_ROUTE,type:'line',source:SOURCE_ROUTE,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#059669','line-width':6,'line-opacity':.92}}, before);
    if (!mapa.getLayer(LAYER_PROGRESS)) mapa.addLayer({ id:LAYER_PROGRESS,type:'line',source:SOURCE_PROGRESS,layout:{'line-cap':'round','line-join':'round'},paint:{'line-color':'#2563eb','line-width':6,'line-opacity':.88}}, before);
    if (!mapa.getLayer(LAYER_DRIVER_RING)) mapa.addLayer({ id:LAYER_DRIVER_RING,type:'circle',source:SOURCE_DRIVER,paint:{'circle-radius':13,'circle-color':'rgba(37,99,235,.22)'} });
    if (!mapa.getLayer(LAYER_DRIVER)) mapa.addLayer({ id:LAYER_DRIVER,type:'circle',source:SOURCE_DRIVER,paint:{'circle-radius':7,'circle-color':'#2563eb','circle-stroke-color':'#fff','circle-stroke-width':3} });
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

  function desenharRota() {
    if (!mapa || !mapReady) return;
    const g = rota?.geometria;
    setSource(SOURCE_ROUTE, fc(geometriaValida(g) ? [{type:'Feature',properties:{},geometry:g}] : []));
  }

  function atualizarFontesPontos() {
    if (!mapa || !mapReady) return;
    const p = proxima();
    setSource(SOURCE_DRIVER, fc(ultimaPosicao && coordenadaValida(ultimaPosicao.lat,ultimaPosicao.lon) ? [{type:'Feature',properties:{},geometry:{type:'Point',coordinates:[Number(ultimaPosicao.lon),Number(ultimaPosicao.lat)]}}] : []));
    setSource(SOURCE_NEXT, fc(p && coordenadaValida(p.latitude,p.longitude) ? [{type:'Feature',properties:{order:Number(p.ordemOtimizada||p.ordemOriginal||1)},geometry:{type:'Point',coordinates:[Number(p.longitude),Number(p.latitude)]}}] : []));
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

  function atualizarPainel() {
    atualizarPendentes(); const p=proxima();
    if($('navNextAddress')) $('navNextAddress').textContent=p?.enderecoOriginal||'Nenhuma parada pendente';
    if($('navNextComplement')) $('navNextComplement').textContent=p?[p.bloco&&`Bloco ${p.bloco}`,p.apartamento&&`Apartamento ${p.apartamento}`,p.sala&&`Sala ${p.sala}`,p.observacao].filter(Boolean).join(' · '):'';
    if($('navNextPackages')) $('navNextPackages').textContent=`${p?.pacotes?.length||0} pacote(s)`;
    const idNota=String(p?.id||'');
    if(idNota!==ultimoIdNota){ultimoIdNota=idNota;if($('navDeliveryNote'))$('navDeliveryNote').value=String(p?.observacaoEntrega||'');}
    if($('navRemaining')) $('navRemaining').textContent=String(ordemPendente.length);
    const leg=rota?.pernas?.[0]||null;
    if($('navDistanceNext')) $('navDistanceNext').textContent=formatarDistancia(leg?.distance);
    if($('navEtaNext')) $('navEtaNext').textContent=formatarTempo(leg?.time);
    if($('navRouteTotal')) $('navRouteTotal').textContent=formatarDistancia(rota?.distanciaTotalMetros);
    if($('navRouteTime')) $('navRouteTime').textContent=formatarTempo(rota?.duracaoDirecaoSegundos);
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

  function abrirExterno(provider){const p=proxima();if(!p)return;const lat=Number(p.latitude),lon=Number(p.longitude);let url='';if(provider==='waze'&&coordenadaValida(p.latitude,p.longitude))url=`https://waze.com/ul?ll=${encodeURIComponent(lat+','+lon)}&navigate=yes`;else if(provider==='google'){const dest=coordenadaValida(p.latitude,p.longitude)?`${lat},${lon}`:(p.enderecoOriginal||'');url=`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;}if(url)global.open(url,'_blank','noopener');}

  async function salvarStatusParadaAtual(status,motivo,observacao){
    if(processandoStatus) return; const atual=proxima(); if(!rota||!atual)return; const parada=rota.paradas.find(p=>String(p.id)===String(atual.id)); if(!parada||['entregue','concluida','nao_entregue'].includes(parada.statusEntrega))return;
    processandoStatus=true; try{
      if(!['entregue','nao_entregue'].includes(status)) return;
      const motivoFinal=status==='nao_entregue'?String(motivo||'').trim():'';
      const timestamp=Date.now(); parada.statusEntrega=status; parada.statusAtualizadoEm=timestamp; parada.observacaoEntrega=String($('navDeliveryNote')?.value||'').trim();
      if(status==='entregue'){parada.motivoNaoEntrega='';parada.observacaoNaoEntrega='';parada.entregueEm=timestamp;parada.naoEntregueEm=null;}
      else {parada.motivoNaoEntrega=motivoFinal;parada.observacaoNaoEntrega=String(observacao||'').trim();parada.entregueEm=null;parada.naoEntregueEm=timestamp;}
      parada.alteradoEm=timestamp; await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});
      if($('navFailurePanel'))$('navFailurePanel').style.display='none'; if($('navFailureReason'))$('navFailureReason').value=''; if($('navFailureNote'))$('navFailureNote').value=''; if($('navDeliveryNote'))$('navDeliveryNote').value=''; if($('navExtrasPanel'))$('navExtrasPanel').style.display='none'; ultimoIdNota='';
      falasFeitas.clear(); atualizarPendentes(); atualizarPainel(); global.PacoteEMatoHistorico?.renderizar?.(); global.PacoteEMatoAppShell?.atualizarInicio?.();
      if(ordemPendente.length){if(global.PacoteEMatoServicoRota?.endpoint?.('route'))await recalcular('proxima');else atualizarFontesPontos();}
      else{rota.status='aguardando_finalizacao';rota.conclusaoPendente=true;await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});mostrarConclusao();}
    }finally{processandoStatus=false;}
  }

  async function finalizarRota(){if(!rota)return;rota.status='concluida';rota.concluidoEm=Date.now();rota.conclusaoPendente=false;await global.PacoteEMatoRotaStore.salvarRota(rota,{ativa:true});pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};if($('navCompletionBackdrop'))$('navCompletionBackdrop').style.display='none';await global.PacoteEMatoRotaStore.limparRotaAtiva();global.PacoteEMatoAppShell?.abrirModulo?.('historico');}
  function revisarResultados(){if($('navCompletionBackdrop'))$('navCompletionBackdrop').style.display='none';global.PacoteEMatoAppShell?.abrirModulo?.('historico');}
  function abrirNaoEntrega(){if(proxima()&&$('navFailurePanel'))$('navFailurePanel').style.display='grid';}
  function cancelarNaoEntrega(){if($('navFailurePanel'))$('navFailurePanel').style.display='none';}

  async function iniciar(rotaEntrada){
    rota=rotaEntrada?global.PacoteEMatoRotaStore.normalizarRota(rotaEntrada):await global.PacoteEMatoRotaStore.obterRotaAtiva(); if(!rota||!geometriaValida(rota.geometria)){global.notificar?.('Calcule uma rota válida antes de iniciar a navegação.');return;}
    atualizarPendentes(); posicaoAnterior=null; const pref=global.PacoteEMatoConfiguracoes?.obter?.().navegacao||'pacote_emato';
    if(global.appState?.navegacao){global.appState.navegacao.ativa=true;global.appState.navegacao.provider=pref;global.appState.navegacao.iniciadaEm=global.appState.navegacao.iniciadaEm||Date.now();rota.iniciadoEm=rota.iniciadoEm||global.appState.navegacao.iniciadaEm;vozAtiva=global.appState.navegacao.vozAtiva!==false;seguirPosicao=true;global.appState.navegacao.seguirPosicao=true;}
    if(pref==='waze')return abrirExterno('waze'); if(pref==='google')return abrirExterno('google');
    garantirMapa(); desenharRota(); atualizarPainel(); atualizarBotaoFollow(); atualizarBotaoVoz(); iniciarGPS();
    if(!ordemPendente.length)mostrarConclusao();
  }

  function encerrar(){if(!global.confirm('Sair da navegação? A rota e o progresso serão preservados.'))return;pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};if(global.appState?.navegacao)global.appState.navegacao.ativa=false;global.PacoteEMatoAppShell?.abrirModulo?.('inicio');}
  function pausar(){pararGPS();try{global.speechSynthesis?.cancel?.();}catch(_){};}

  function bind(){
    $('navDeliveredBtn')?.addEventListener('click',()=>salvarStatusParadaAtual('entregue'));
    $('navNotDeliveredBtn')?.addEventListener('click',abrirNaoEntrega); $('navFailureCancelBtn')?.addEventListener('click',cancelarNaoEntrega);
    $('navFailureConfirmBtn')?.addEventListener('click',()=>{const motivo=String($('navFailureReason')?.value||'').trim();salvarStatusParadaAtual('nao_entregue',motivo,$('navFailureNote')?.value||'');});
    $('navMoreBtn')?.addEventListener('click',()=>{const painel=$('navExtrasPanel');if(painel)painel.style.display=painel.style.display==='none'?'grid':'none';});
    $('navRecalculateBtn')?.addEventListener('click',()=>recalcular('manual')); $('navOpenWazeBtn')?.addEventListener('click',()=>abrirExterno('waze')); $('navOpenGoogleBtn')?.addEventListener('click',()=>abrirExterno('google')); $('navEndBtn')?.addEventListener('click',encerrar);
    $('navFollowBtn')?.addEventListener('click',()=>{seguirPosicao=true;if(global.appState?.navegacao)global.appState.navegacao.seguirPosicao=true;atualizarBotaoFollow();if(ultimaPosicao&&mapa&&mapReady)mapa.easeTo({center:[ultimaPosicao.lon,ultimaPosicao.lat],zoom:16,pitch:0,duration:350});});
    $('navVoiceBtn')?.addEventListener('click',()=>{vozAtiva=!vozAtiva;if(global.appState?.navegacao)global.appState.navegacao.vozAtiva=vozAtiva;if(!vozAtiva)try{global.speechSynthesis?.cancel?.();}catch(_){};atualizarBotaoVoz();});
    $('navCompletionFinishBtn')?.addEventListener('click',finalizarRota); $('navCompletionReviewBtn')?.addEventListener('click',revisarResultados);
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&global.appState?.navegacao?.ativa&&$('navGpsStatus'))$('navGpsStatus').textContent='Aplicativo em segundo plano; GPS e voz podem ser suspensos pelo navegador.';});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true}); else bind();
  global.PacoteEMatoNavegacao=Object.freeze({iniciar,recalcular,encerrar,pausar,abrirExterno,salvarStatusParadaAtual,finalizarRota});
})(window);
