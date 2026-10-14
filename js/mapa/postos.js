(function(global){
'use strict';
let marcadores=[];
let ativo=false;
let cache=[];
const ICONS={shell:'🟨',petrobras:'🟩',ipiranga:'🟧',ale:'🟦',default:'⛽'};
function mapa(){return global.PacoteEMatoMapa?.getMapa?.();}
function loc(){return global.PacoteEMatoLocalizacaoAtual?.ultimaValida?.();}
function limpar(){marcadores.forEach(m=>m.remove());marcadores=[];}
function marca(brand){const b=(brand||'').toLowerCase(); if(b.includes('shell'))return ICONS.shell;if(b.includes('petro'))return ICONS.petrobras;if(b.includes('ipir'))return ICONS.ipiranga;if(b.includes('ale'))return ICONS.ale;return ICONS.default;}
async function buscar(){
 const m=mapa(), p=loc(); if(!m||!p){global.notificar?.('Ative a localização para buscar postos.');return;}
 limpar();
 try{
 const q=`[out:json][timeout:5];(node[amenity=fuel](around:5000,${p.latitude},${p.longitude}););out body;`;
 const r=await fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q));
 const d=await r.json(); cache=d.elements||[];
 cache.slice(0,40).forEach(x=>{
  const el=document.createElement('div'); el.className='pemato-posto-marker'; el.textContent=marca(x.tags?.brand||x.tags?.name);
  const mk=new global.maplibregl.Marker({element:el}).setLngLat([x.lon,x.lat]).addTo(m); marcadores.push(mk);
  el.onclick=()=>mostrar(x);
 });
 }catch(e){global.notificar?.('Não foi possível buscar postos agora.');}
}
function mostrar(x){
 const nome=x.tags?.name||'Posto de combustível';
 global.notificar?.(`${nome}\nPreços: não informado\nNavegação disponível pelo Pacote É Mato, Waze e Maps.`);
}
global.PacoteEMatoPostos={buscar,limpar};
})(window);
