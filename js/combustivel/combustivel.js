(function iniciarCombustivelPacoteEMato(global) {
  'use strict';

  const SOURCE = 'pemato-fuel-stations';
  const LAYER = 'pemato-fuel-symbols';
  const DEFAULT_RADIUS = 8000;
  const OVERPASS_ENDPOINTS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter'
  ];
  const BRAND_RULES = [
    { re: /petrobras|br distribuidora|posto br|vibra/i, code: 'BR', name: 'Petrobras / BR' },
    { re: /ipiranga/i, code: 'IP', name: 'Ipiranga' },
    { re: /shell|ra[ií]zen/i, code: 'SH', name: 'Shell' },
    { re: /\bale\b|ale combust/i, code: 'ALE', name: 'ALE' },
    { re: /esso/i, code: 'ES', name: 'Esso' },
    { re: /texaco/i, code: 'TX', name: 'Texaco' }
  ];

  let selecionado = null;
  let mapaVinculado = null;
  let eventosVinculados = false;

  function $(id) { return document.getElementById(id); }
  function estado() {
    const s = global.appState || (global.appState = {});
    if (!s.combustivel || typeof s.combustivel !== 'object') s.combustivel = {};
    Object.assign(s.combustivel, {
      visivel: s.combustivel.visivel === true,
      carregando: s.combustivel.carregando === true,
      postos: Array.isArray(s.combustivel.postos) ? s.combustivel.postos : [],
      raioMetros: Number(s.combustivel.raioMetros || DEFAULT_RADIUS),
      ultimaPosicao: s.combustivel.ultimaPosicao || null,
      atualizadoEm: s.combustivel.atualizadoEm || null,
      postoSelecionadoId: s.combustivel.postoSelecionadoId || null,
      erro: s.combustivel.erro || null
    });
    return s.combustivel;
  }
  function escapar(v) { return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function numero(v) { const n=Number(v); return Number.isFinite(n)?n:null; }
  function rad(v) { return Number(v) * Math.PI / 180; }
  function distanciaMetros(a,b) {
    const R=6371000, dLat=rad(b.lat-a.lat), dLon=rad(b.lon-a.lon), la1=rad(a.lat), la2=rad(b.lat);
    const h=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
  }
  function formatarDistancia(m) { if(!Number.isFinite(Number(m)))return '—'; const n=Number(m); return n<1000?`${Math.max(1,Math.round(n))} m`:`${(n/1000).toFixed(n<10000?1:0).replace('.',',')} km`; }
  function formatarPreco(valor) {
    if (valor == null || valor === '') return '';
    let texto=String(valor).trim();
    if (!texto) return '';
    const achou=texto.match(/(?:R\$\s*)?(\d+[\.,]\d{2,3})/i);
    if (achou) return `R$ ${achou[1].replace('.',',')}`;
    return texto.length<=18?texto:'';
  }
  function regraMarca(tags) {
    const bruto=[tags.brand,tags.operator,tags.name].filter(Boolean).join(' ');
    const regra=BRAND_RULES.find(r=>r.re.test(bruto));
    if(regra)return regra;
    const nome=String(tags.brand||tags.operator||'').trim();
    if(nome) return {code:nome.replace(/[^A-Za-zÀ-ÿ0-9]/g,'').slice(0,3).toUpperCase()||'P',name:nome};
    return {code:'⛽',name:'Sem bandeira informada'};
  }
  function endereco(tags) {
    const rua=tags['addr:street']||tags['addr:road']||'';
    const num=tags['addr:housenumber']||'';
    const bairro=tags['addr:suburb']||tags['addr:neighbourhood']||'';
    const cidade=tags['addr:city']||'';
    return [[rua,num].filter(Boolean).join(', '),bairro,cidade].filter(Boolean).join(' · ');
  }
  function extrairPrecos(tags) {
    const candidatos=[
      ['Gasolina', tags['fuel:gasoline:price']||tags['fuel:octane_95:price']||tags['price:gasoline']||tags['price:octane_95']],
      ['Gasolina aditivada', tags['fuel:octane_98:price']||tags['price:octane_98']],
      ['Etanol', tags['fuel:ethanol:price']||tags['fuel:e85:price']||tags['price:ethanol']],
      ['Diesel', tags['fuel:diesel:price']||tags['price:diesel']],
      ['GNV', tags['fuel:cng:price']||tags['price:cng']]
    ];
    const lista=candidatos.map(([tipo,v])=>({tipo,preco:formatarPreco(v)})).filter(x=>x.preco);
    if(!lista.length && tags.price) { const p=formatarPreco(tags.price); if(p) lista.push({tipo:'Preço informado',preco:p}); }
    return lista;
  }
  function normalizarElemento(el,pos) {
    const tags=el.tags||{}, lat=numero(el.lat??el.center?.lat), lon=numero(el.lon??el.center?.lon);
    if(lat==null||lon==null)return null;
    const marca=regraMarca(tags), precos=extrairPrecos(tags), dist=distanciaMetros(pos,{lat,lon});
    const nome=String(tags.name||tags.brand||tags.operator||'Posto de combustível').trim();
    const destaque=precos[0]?.preco||'';
    return {
      id:`${el.type||'node'}-${el.id}`, osmId:el.id, lat,lon,nome,marca:marca.name,marcaCodigo:marca.code,
      endereco:endereco(tags), distanciaMetros:dist, precos, precoDestaque:destaque,
      label:[formatarDistancia(dist),destaque].filter(Boolean).join(' · '), tags
    };
  }
  function featureCollection(postos) {
    return {type:'FeatureCollection',features:(postos||[]).map(p=>({type:'Feature',id:p.id,geometry:{type:'Point',coordinates:[p.lon,p.lat]},properties:{id:p.id,nome:p.nome,marca:p.marca,icon:`pemato-fuel-${sanitizarCodigo(p.marcaCodigo)}`,label:p.label,distancia:p.distanciaMetros,preco:p.precoDestaque||''}}))};
  }
  function sanitizarCodigo(c){return String(c||'P').replace(/[^A-Za-z0-9_-]/g,'_').slice(0,8)||'P';}
  function criarIcone(mapa,codigoOriginal) {
    const code=sanitizarCodigo(codigoOriginal), nome=`pemato-fuel-${code}`;
    if(mapa.hasImage?.(nome))return nome;
    const ratio=Math.max(2,Math.min(3,Number(global.devicePixelRatio||2))), w=56,h=66;
    const canvas=document.createElement('canvas'); canvas.width=w*ratio;canvas.height=h*ratio;
    const c=canvas.getContext('2d'); if(!c)return '';
    c.scale(ratio,ratio); c.clearRect(0,0,w,h);
    c.beginPath(); c.arc(28,27,22,0,Math.PI*2); c.fillStyle='#ffffff';c.fill();c.lineWidth=3;c.strokeStyle='#111827';c.stroke();
    c.beginPath(); c.moveTo(21,49);c.lineTo(28,62);c.lineTo(35,49);c.closePath();c.fillStyle='#111827';c.fill();
    const texto=String(codigoOriginal||'P').slice(0,3).toUpperCase();
    if(texto==='⛽'){
      c.fillStyle='#111827';c.fillRect(20,17,14,20);c.strokeStyle='#111827';c.lineWidth=2;c.strokeRect(20,17,14,20);c.fillStyle='#fff';c.fillRect(23,20,8,6);c.beginPath();c.moveTo(34,21);c.lineTo(39,25);c.lineTo(39,35);c.stroke();
    }else{
      c.fillStyle='#111827';c.font=`900 ${texto.length>2?11:13}px system-ui,sans-serif`;c.textAlign='center';c.textBaseline='middle';c.fillText(texto,28,27);
    }
    try{mapa.addImage(nome,c.getImageData(0,0,canvas.width,canvas.height),{pixelRatio:ratio});}catch(_){return '';}
    return nome;
  }
  function garantirCamada() {
    const mapa=global.PacoteEMatoMapa?.getMapa?.(); if(!mapa)return false;
    mapaVinculado=mapa;
    try {
      if(!mapa.isStyleLoaded?.())return false;
      const st=estado();
      [...new Set(st.postos.map(p=>p.marcaCodigo))].forEach(c=>criarIcone(mapa,c));
      if(!mapa.getSource(SOURCE)) mapa.addSource(SOURCE,{type:'geojson',data:featureCollection([])});
      if(!mapa.getLayer(LAYER)) mapa.addLayer({
        id:LAYER,type:'symbol',source:SOURCE,
        layout:{
          'visibility':st.visivel?'visible':'none','icon-image':['get','icon'],'icon-size':['interpolate',['linear'],['zoom'],11,.58,14,.78,17,.92],
          'icon-anchor':'bottom','icon-allow-overlap':true,'icon-ignore-placement':true,
          'text-field':['get','label'],'text-size':['interpolate',['linear'],['zoom'],11,10,16,12],'text-offset':[0,1.05],'text-anchor':'top',
          'text-allow-overlap':false,'text-optional':true,'text-padding':4
        },
        paint:{'text-color':'#111827','text-halo-color':'rgba(255,255,255,.96)','text-halo-width':2,'text-halo-blur':.5}
      });
      const src=mapa.getSource(SOURCE); if(src?.setData)src.setData(featureCollection(st.postos));
      mapa.setLayoutProperty(LAYER,'visibility',st.visivel?'visible':'none');
      vincularEventosMapa(mapa);
      return true;
    } catch(e){console.warn('Pacote É Mato: camada de combustível indisponível.',e);return false;}
  }
  function vincularEventosMapa(mapa){
    if(eventosVinculados && mapaVinculado===mapa)return;
    try{
      mapa.on('click',LAYER,e=>{const id=e?.features?.[0]?.properties?.id;if(id)abrirPosto(id);});
      mapa.on('mouseenter',LAYER,()=>{try{mapa.getCanvas().style.cursor='pointer';}catch(_){}});
      mapa.on('mouseleave',LAYER,()=>{try{mapa.getCanvas().style.cursor='';}catch(_){}});
      eventosVinculados=true; mapaVinculado=mapa;
    }catch(_){eventosVinculados=false;}
  }
  async function obterPosicao(){
    const p=await global.PacoteEMatoLocalizacaoAtual?.obter?.({forcar:true});
    const lat=numero(p?.lat),lon=numero(p?.lon); if(lat==null||lon==null)throw new Error('Não foi possível obter sua localização.');
    return {lat,lon};
  }
  function queryOverpass(pos,raio){return `[out:json][timeout:18];(node["amenity"="fuel"](around:${Math.round(raio)},${pos.lat},${pos.lon});way["amenity"="fuel"](around:${Math.round(raio)},${pos.lat},${pos.lon});relation["amenity"="fuel"](around:${Math.round(raio)},${pos.lat},${pos.lon}););out center tags;`;}
  async function buscarViaWorker(pos,raio){
    const base=String(global.PEMATO_MAP_CONFIG?.workerBaseUrl||'').replace(/\/+$/,'');
    if(!base)throw new Error('Worker não configurado');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),16000);
    try{
      const r=await fetch(`${base}/fuel`,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-Pacote-Em-Mato-Client':'map-v1'},body:JSON.stringify({lat:pos.lat,lon:pos.lon,radius:raio}),signal:controller.signal});
      if(!r.ok)throw new Error(`Worker HTTP ${r.status}`);
      const data=await r.json();
      if(!data?.ok||!Array.isArray(data.elements))throw new Error('Resposta inválida do serviço de postos');
      return data.elements;
    }finally{clearTimeout(timer);}
  }
  async function buscarOverpassDireto(pos,raio){
    const corpo=queryOverpass(pos,raio); let ultimoErro=null;
    for(const endpoint of OVERPASS_ENDPOINTS){
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),16000);
      try{
        // GET evita o preflight CORS que falha em alguns WebViews/Android ao usar POST direto no Overpass.
        const url=`${endpoint}?data=${encodeURIComponent(corpo)}`;
        const r=await fetch(url,{method:'GET',headers:{'Accept':'application/json'},signal:controller.signal,cache:'no-store'});
        if(!r.ok)throw new Error(`HTTP ${r.status}`);
        const data=await r.json(); if(!Array.isArray(data.elements))throw new Error('Resposta inválida'); return data.elements;
      }catch(e){ultimoErro=e;}finally{clearTimeout(timer);}
    }
    throw ultimoErro||new Error('Serviço público de postos indisponível');
  }
  async function buscarOverpass(pos,raio){
    let erroWorker=null;
    try{return await buscarViaWorker(pos,raio);}catch(e){erroWorker=e;}
    try{return await buscarOverpassDireto(pos,raio);}catch(e){
      console.warn('Pacote É Mato: falha ao consultar postos.',{worker:erroWorker?.message,direto:e?.message});
      throw new Error('Não foi possível consultar os postos agora. Verifique a conexão e tente novamente.');
    }
  }
  function deduplicar(postos){
    const vistos=new Set(); return postos.filter(p=>{const k=`${p.nome.toLowerCase()}|${p.lat.toFixed(5)}|${p.lon.toFixed(5)}`;if(vistos.has(k))return false;vistos.add(k);return true;});
  }
  function atualizarBotao(){
    const st=estado(),b=$('routingFuelBtn'); if(b){b.classList.toggle('active',st.visivel);b.classList.toggle('is-loading',st.carregando);b.title=st.visivel?'Ocultar postos de combustível':'Combustível perto de mim';}
    const sb=$('sidebarFuelBtn'); if(sb)sb.classList.toggle('active',st.visivel);
  }
  async function carregar(opcoes){
    const st=estado(); if(st.carregando)return st.postos;
    st.carregando=true;st.erro=null;atualizarBotao();
    try{
      const pos=await obterPosicao(); st.ultimaPosicao=pos;
      const elementos=await buscarOverpass(pos,st.raioMetros||DEFAULT_RADIUS);
      st.postos=deduplicar(elementos.map(el=>normalizarElemento(el,pos)).filter(Boolean)).sort((a,b)=>a.distanciaMetros-b.distanciaMetros).slice(0,80);
      st.atualizadoEm=Date.now(); garantirCamada();
      if(opcoes?.centralizar!==false){const mapa=global.PacoteEMatoMapa?.getMapa?.();try{mapa?.easeTo?.({center:[pos.lon,pos.lat],zoom:Math.max(13.5,mapa.getZoom()),duration:420});}catch(_){}}
      if(!st.postos.length)global.notificar?.('Nenhum posto foi encontrado no raio pesquisado.');
      return st.postos;
    }catch(e){st.erro=e?.message||String(e);global.notificar?.(`Não foi possível carregar os postos: ${st.erro}`);return [];}finally{st.carregando=false;atualizarBotao();}
  }
  async function ativar(opcoes){
    const st=estado();st.visivel=true;atualizarBotao();
    global.PacoteEMatoMapa?.renderizar?.();
    if(!garantirCamada())setTimeout(garantirCamada,350);
    const expirou=!st.atualizadoEm||Date.now()-st.atualizadoEm>5*60*1000;
    if(!st.postos.length||expirou||opcoes?.recarregar)await carregar({centralizar:opcoes?.centralizar!==false});
    else garantirCamada();
  }
  function desativar(){const st=estado();st.visivel=false;atualizarBotao();garantirCamada();fecharModal();}
  async function alternar(){const st=estado();if(st.visivel)desativar();else await ativar({centralizar:true});}
  function abrirPosto(id){
    const st=estado(),p=st.postos.find(x=>String(x.id)===String(id));if(!p)return;selecionado=p;st.postoSelecionadoId=p.id;
    $('fuelStationTitle').textContent=p.nome;$('fuelStationBrand').textContent=p.marca||'';$('fuelStationDistance').textContent=formatarDistancia(p.distanciaMetros);
    $('fuelStationPrice').textContent=p.precoDestaque||'Não informado';$('fuelStationAddress').textContent=p.endereco||'Endereço não informado pela fonte pública.';
    const badge=$('fuelStationBrandBadge');if(badge)badge.textContent=p.marcaCodigo||'⛽';
    const prices=$('fuelStationPrices');if(prices)prices.innerHTML=p.precos.length?p.precos.map(x=>`<div class="fuel-price-row"><span>${escapar(x.tipo)}</span><strong>${escapar(x.preco)}</strong></div>`).join(''):'';
    const modal=$('fuelStationModal');if(modal){modal.style.display='flex';modal.setAttribute('aria-hidden','false');}
  }
  function fecharModal(){const modal=$('fuelStationModal');if(modal){modal.style.display='none';modal.setAttribute('aria-hidden','true');}selecionado=null;}
  function abrirNavegador(tipo){if(!selecionado)return;const coord=`${selecionado.lat},${selecionado.lon}`;const url=tipo==='waze'?`https://www.waze.com/ul?ll=${encodeURIComponent(coord)}&navigate=yes`:`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(coord)}&travelmode=driving`;global.open(url,'_blank','noopener');}
  async function abrirPeloMenu(){
    try{await global.PacoteEMatoAppShell?.abrirModulo?.('roteirizacao');}catch(_){}
    await ativar({centralizar:true});
  }
  function bind(){
    $('routingFuelBtn')?.addEventListener('click',alternar);$('sidebarFuelBtn')?.addEventListener('click',abrirPeloMenu);
    $('fuelStationClose')?.addEventListener('click',fecharModal);$('fuelStationModal')?.addEventListener('click',e=>{if(e.target===e.currentTarget)fecharModal();});
    $('fuelStationWaze')?.addEventListener('click',()=>abrirNavegador('waze'));$('fuelStationMaps')?.addEventListener('click',()=>abrirNavegador('maps'));
    document.addEventListener('keydown',e=>{if(e.key==='Escape')fecharModal();});
    global.addEventListener('pemato:localizacao-atual',()=>{if(estado().visivel&&estado().postos.length)garantirCamada();});
    const tentar=()=>{const mapa=global.PacoteEMatoMapa?.getMapa?.();if(!mapa)return;try{mapa.on('style.load',()=>setTimeout(garantirCamada,80));}catch(_){}if(estado().visivel)setTimeout(garantirCamada,120);};
    setTimeout(tentar,500);atualizarBotao();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  global.PacoteEMatoCombustivel=Object.freeze({ativar,desativar,alternar,carregar,abrirPosto,fecharModal,abrirNavegador,garantirCamada});
})(window);
