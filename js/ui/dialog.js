(function iniciarDialogoPacoteEMato(global){
  'use strict';
  let ativo=null;
  function normalizar(opcoes){
    if(typeof opcoes==='string') return {titulo:'Confirmar ação',mensagem:opcoes};
    return opcoes||{};
  }
  function fechar(valor){
    if(!ativo)return;
    const {el,resolve}=ativo; ativo=null;
    try{el.remove();}catch(_){}
    resolve(valor);
  }
  function confirmar(opcoes){
    const o=normalizar(opcoes);
    if(ativo) fechar(false);
    return new Promise(resolve=>{
      const back=document.createElement('div'); back.className='pemato-dialog-backdrop'; back.dataset.single='false';
      back.innerHTML=`<section class="pemato-dialog-card" role="dialog" aria-modal="true"><header class="pemato-dialog-head"><img src="icon-192.png" alt=""><div><span class="pemato-dialog-kicker">PACOTE É MATO</span><h3 class="pemato-dialog-title"></h3></div></header><p class="pemato-dialog-message"></p><footer class="pemato-dialog-actions"><button class="pemato-dialog-cancel" type="button"></button><button class="pemato-dialog-confirm" type="button"></button></footer></section>`;
      back.querySelector('.pemato-dialog-title').textContent=o.titulo||'Confirmar ação';
      back.querySelector('.pemato-dialog-message').textContent=o.mensagem||'';
      const cancelar=back.querySelector('.pemato-dialog-cancel'), ok=back.querySelector('.pemato-dialog-confirm');
      cancelar.textContent=o.cancelar||'Cancelar'; ok.textContent=o.confirmar||'Confirmar';
      if(o.perigo===true) ok.classList.add('is-danger');
      cancelar.addEventListener('click',()=>fechar(false)); ok.addEventListener('click',()=>fechar(true));
      back.addEventListener('click',e=>{if(e.target===back)fechar(false)});
      const key=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',key);fechar(false)}}; document.addEventListener('keydown',key);
      ativo={el:back,resolve}; document.body.appendChild(back); setTimeout(()=>ok.focus(),0);
    });
  }
  function avisar(opcoes){
    const o=normalizar(opcoes);
    return new Promise(resolve=>{
      if(ativo) fechar(false);
      const back=document.createElement('div'); back.className='pemato-dialog-backdrop'; back.dataset.single='true';
      back.innerHTML=`<section class="pemato-dialog-card" role="alertdialog" aria-modal="true"><header class="pemato-dialog-head"><img src="icon-192.png" alt=""><div><span class="pemato-dialog-kicker">PACOTE É MATO</span><h3 class="pemato-dialog-title"></h3></div></header><p class="pemato-dialog-message"></p><footer class="pemato-dialog-actions"><button class="pemato-dialog-cancel" type="button"></button><button class="pemato-dialog-confirm" type="button"></button></footer></section>`;
      back.querySelector('.pemato-dialog-title').textContent=o.titulo||'Aviso'; back.querySelector('.pemato-dialog-message').textContent=o.mensagem||'';
      const ok=back.querySelector('.pemato-dialog-confirm'); ok.textContent=o.confirmar||'Entendi'; ok.addEventListener('click',()=>fechar(true));
      ativo={el:back,resolve}; document.body.appendChild(back); setTimeout(()=>ok.focus(),0);
    });
  }
  global.PacoteEMatoDialog=Object.freeze({confirmar,avisar});
})(window);
