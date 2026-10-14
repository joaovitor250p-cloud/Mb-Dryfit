(function(global){
'use strict';

let marcadores=[];
let cache=[];
let buscaAtual=null;

function mapa(){return global.PacoteEMatoMapa?.getMapa?.();}
function loc(){return global.PacoteEMatoLocalizacaoAtual?.ultimaValida?.();}
function limpar(){marcadores.forEach(m=>m.remove());marcadores=[];}

const BANDEIRAS={
 shell:'assets/postos/shell.png',
 petrobras:'assets/postos/petrobras.png',
 ipiranga:'assets/postos/ipiranga.png',
 ale:'assets/postos/ale.png'
};

function identificar(tags={}){
 const t=((tags.brand||'')+' '+(tags.operator||'')+' '+(tags.name||'')).toLowerCase();
 if(t.includes('shell')) return BANDEIRAS.shell;
 if(t.includes('petrobras')||t.includes('vibra')) return BANDEIRAS.petrobras;
 if(t.includes('ipiranga')) return BANDEIRAS.ipiranga;
 if(t.includes('ale')) return BANDEIRAS.ale;
 return null;
}

function criarIcone(tags){
 const img=identificar(tags);
 const el=document.createElement('div');
 el.className='pemato-posto-marker';
 if(img){
   const i=document.createElement('img');
   i.src=img;
   i.onerror=()=>{i.remove();el.textContent='⛽';};
   el.appendChild(i);
 } else {
   el.textContent='⛽';
 }
 return el;
}

async function buscar(){
 const m=mapa(), p=loc();
 if(!m||!p){
   global.notificar?.('Ative a localização para buscar postos.');
   return;
 }

 if(buscaAtual) buscaAtual.abort();
 buscaAtual=new AbortController();

 limpar();

 const chave=`${p.latitude.toFixed(3)},${p.longitude.toFixed(3)}`;
 const salvo=cache.find(c=>c.chave===chave && Date.now()-c.tempo<300000);
 if(salvo){
   render(salvo.dados);
   return;
 }

 try{
  const q=`[out:json][timeout:3];node[amenity=fuel](around:5000,${p.latitude},${p.longitude});out body;`;
  const resposta=await fetch(
    'https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q),
    {signal:buscaAtual.signal}
  );

  if(!resposta.ok) throw new Error('api');
  const dados=(await resposta.json()).elements||[];

  cache.push({chave,tempo:Date.now(),dados});
  render(dados);

  if(!dados.length) global.notificar?.('Nenhum posto encontrado próximo.');

 }catch(e){
   if(e.name!=='AbortError')
    global.notificar?.('Não foi possível carregar postos.');
 }
}

function render(dados){
 const m=mapa();
 dados.slice(0,40).forEach(post=>{
  const el=criarIcone(post.tags||{});
  const marker=new global.maplibregl.Marker({
    element:el,
    anchor:'center'
  }).setLngLat([post.lon,post.lat]).addTo(m);

  el.onclick=()=>mostrar(post);
  marcadores.push(marker);
 });
}

function mostrar(post){
 const nome=post.tags?.name||'Posto de combustível';
 const brand=post.tags?.brand||'Bandeira não identificada';

 global.notificar?.(
`${nome}
${brand}

⛽ Gasolina: preço não informado
🌱 Etanol: preço não informado
🚛 Diesel: preço não informado

Navegação:
🧭 Pacote É Mato
🚗 Waze
📍 Google Maps`
 );
}

global.PacoteEMatoPostos={buscar,limpar};
})(window);
