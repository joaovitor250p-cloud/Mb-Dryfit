(function iniciarAreaBipagem(global){
  'use strict';
  const $=id=>document.getElementById(id);
  const K_SOUND='pemato_bipagem_som';
  const K_VOICE='pemato_bipagem_voz';
  function bool(key,def=true){try{const v=localStorage.getItem(key);return v==null?def:v==='1';}catch(_){return def;}}
  function setBool(key,v){try{localStorage.setItem(key,v?'1':'0');}catch(_){}}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function dataCurta(item){return item?.data||'Data não registrada';}
  function renderHistorico(){
    const host=$('bipagemHistoryList'); if(!host)return;
    let hist=[]; try{hist=JSON.parse(localStorage.getItem('historico_rotas_usuario')||'[]');}catch(_){}
    hist=Array.isArray(hist)?hist:[];
    if(!hist.length){host.innerHTML='<div class="bipagem-history-empty"><strong>Nenhuma bipagem registrada ainda</strong><span>Quando você carregar uma rota na Bipagem, ela aparecerá aqui.</span></div>';return;}
    host.innerHTML=hist.map(item=>{
      const total=Number(item?.pacotes||0), bip=Number(item?.bipados||0), pct=total?Math.min(100,Math.round(bip/total*100)):0;
      const concluida=item?.status==='concluida';
      return `<article class="bipagem-history-card"><div class="bipagem-history-top"><div><span>${concluida?'CONCLUÍDA':'EM ANDAMENTO'}</span><strong>${esc(item?.nome||'Bipagem')}</strong></div><time>${esc(dataCurta(item))}</time></div><div class="bipagem-history-metrics"><div><strong>${bip}/${total}</strong><small>Bipados</small></div><div><strong>${Number(item?.paradas||0)}</strong><small>Paradas</small></div><div><strong>${Number(item?.paradasMultiplas||0)}</strong><small>Múltiplas</small></div></div><div class="bipagem-history-progress"><i style="width:${pct}%"></i></div><small class="bipagem-history-percent">${pct}% conferido</small></article>`;
    }).join('');
  }
  function abrir(view){
    const scanner=$('bipagemScannerView'), hist=$('bipagemHistoryView'), cfg=$('bipagemConfigView');
    if(scanner)scanner.style.display=view==='scanner'?'':'none';
    if(hist)hist.style.display=view==='historico'?'':'none';
    if(cfg)cfg.style.display=view==='config'?'':'none';
    document.querySelectorAll('[data-bipagem-view]').forEach(b=>b.classList.toggle('active',b.dataset.bipagemView===view));
    if(view==='historico')renderHistorico();
    if(view==='config')renderConfig();
  }
  function renderConfig(){const s=$('bipagemSoundToggle'),v=$('bipagemVoiceToggle');if(s)s.checked=bool(K_SOUND,true);if(v)v.checked=bool(K_VOICE,true);}
  function bind(){
    document.querySelectorAll('[data-bipagem-view]').forEach(b=>b.addEventListener('click',()=>abrir(b.dataset.bipagemView)));
    $('bipagemHistoryRefresh')?.addEventListener('click',renderHistorico);
    $('bipagemSoundToggle')?.addEventListener('change',e=>setBool(K_SOUND,e.currentTarget.checked));
    $('bipagemVoiceToggle')?.addEventListener('change',e=>setBool(K_VOICE,e.currentTarget.checked));
    global.addEventListener('pemato:bipagem:abrir',()=>abrir('scanner'));
    abrir('scanner');
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
  global.PacoteEMatoBipagemArea=Object.freeze({abrir,renderHistorico,somAtivo:()=>bool(K_SOUND,true),vozAtiva:()=>bool(K_VOICE,true)});
})(window);
