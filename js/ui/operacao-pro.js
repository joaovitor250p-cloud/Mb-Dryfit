(function iniciarOperacaoPro(global){
  'use strict';
  const $=id=>document.getElementById(id);
  let buscaTimer=null, ultimaSugestao=null;

  function extrairEnderecoEObservacao(texto, geo){
    const original=String(texto||'').trim();
    const base=String(geo?.enderecoGeocodificado||geo?.enderecoOriginal||'').trim();
    const numero=String(geo?.numeroImovel||geo?.numero||'').trim();
    return {original,base,numero};
  }
  function mostrarSugestao(geo,texto){
    const box=$('routeEdit_sugestoes'); if(!box)return;
    box.replaceChildren();
    if(!geo||geo.statusGeocodificacao!=='ok'){box.style.display='none';return;}
    ultimaSugestao={geo,texto};
    const b=document.createElement('button'); b.type='button'; b.className='route-smart-suggestion';
    const st=document.createElement('strong'); st.textContent=geo.enderecoGeocodificado||geo.enderecoOriginal||texto;
    const sp=document.createElement('span'); sp.textContent=[geo.bairro,geo.cidade,geo.estado,geo.cep].filter(Boolean).join(' · ')||'Endereço localizado';
    b.append(st,sp); b.addEventListener('click',()=>aplicarSugestao(geo,texto)); box.appendChild(b); box.style.display='grid';
  }
  function aplicarSugestao(geo,texto){
    // Mantemos exatamente o texto digitado como endereço operacional. Os campos
    // estruturados servem só para geocodificação/agrupamento e continuam editáveis.
    const t=String(texto||'').trim();
    const match=t.match(/^(.+?)[,\s]+(\d+[A-Za-z]?)(?:\s+|,\s*)(.*)$/);
    if($('routeEdit_logradouro')) $('routeEdit_logradouro').value=String(geo.logradouro||match?.[1]||t).trim();
    if($('routeEdit_numero')) $('routeEdit_numero').value=String(geo.numeroImovel||geo.numero||match?.[2]||'').trim();
    if($('routeEdit_bairro')) $('routeEdit_bairro').value=geo.bairro||'';
    if($('routeEdit_cidade')) $('routeEdit_cidade').value=geo.cidade||'';
    if($('routeEdit_estado')) $('routeEdit_estado').value=geo.estado||'';
    if($('routeEdit_cep')) $('routeEdit_cep').value=geo.cep||'';
    const resto=String(match?.[3]||'').trim();
    if(resto && $('routeEdit_complemento') && !$('routeEdit_complemento').value) $('routeEdit_complemento').value=resto;
    const box=$('routeEdit_sugestoes'); if(box)box.style.display='none';
    $('routeEditAdvanced')?.removeAttribute('open');
  }
  async function buscarEndereco(){
    const input=$('routeEdit_busca'); const texto=String(input?.value||'').trim(); if(texto.length<5){const b=$('routeEdit_sugestoes');if(b)b.style.display='none';return;}
    if(!global.PacoteEMatoGeocodificacao?.endpointAtual?.())return;
    try{const geo=await global.PacoteEMatoGeocodificacao.geocodificarEnderecoLivre(texto); if(String(input?.value||'').trim()===texto)mostrarSugestao(geo,texto);}catch(_){ }
  }
  function bind(){
    const input=$('routeEdit_busca');
    input?.addEventListener('input',()=>{clearTimeout(buscaTimer);buscaTimer=setTimeout(buscarEndereco,500);});
    input?.addEventListener('keydown',e=>{if(e.key==='Enter'&&ultimaSugestao){e.preventDefault();aplicarSugestao(ultimaSugestao.geo,input.value);}});

    // Os menus de ações precisam funcionar mesmo quando Roteirização está oculta
    // e a navegação está ativa. Movemos os backdrops para o body sem recriar listeners.
    ['routingActionsBackdrop','routingBipagemChooserBackdrop','routingOptimizationReviewBackdrop'].forEach(id=>{const el=$(id);if(el&&el.parentElement!==document.body)document.body.appendChild(el);});

    // Atualiza o texto de duração no painel sem exibir métricas técnicas separadas.
    global.addEventListener('pemato:rota:salva',()=>{const rota=global.PacoteEMatoRoteirizacao?.obterRotaAtual?.();if(!rota)return;const sec=Number(rota.duracaoTotalSegundos);if(Number.isFinite(sec)&&$('routingEtaRemaining')){const min=Math.max(0,Math.round(sec/60));$('routingEtaRemaining').textContent=`aprox. ${min>=60?`${Math.floor(min/60)}h ${min%60}min`:`${min} min`} restantes`;}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})(window);