(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = String(window.PEMATO_ADMIN_GATEWAY_URL || '').replace(/\/+$/,'');
  let token = sessionStorage.getItem('pemato_admin_session_v1') || '';
  let ownerEmail = sessionStorage.getItem('pemato_admin_email_v1') || '';
  let usuarios = [], pagamentos = [];
  const DAY = 86400000;

  function toast(msg){ const el=$('toast'); el.textContent=msg; el.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>el.hidden=true,2600); }
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function expiry(u){ const v=u?.expiraEm??u?.fimAcesso??u?.expiration??0; if(v?.toMillis)return v.toMillis(); if(v?.seconds)return Number(v.seconds)*1000; const n=Number(v); if(Number.isFinite(n)&&n>0)return n<1e12?n*1000:n; const d=Date.parse(v||''); return Number.isFinite(d)?d:0; }
  function vitalicio(u){return u?.vitalicio===true || /vital[ií]cio/i.test(String(u?.plano||'')) || Number(u?.duracaoDias||0)>=3600;}
  function ativo(u){return !u?.bloqueado && (vitalicio(u)||expiry(u)>Date.now());}
  function status(u){if(u?.bloqueado)return 'Bloqueado'; if(vitalicio(u))return 'Vitalício'; if(ativo(u))return 'Ativo'; return 'Expirado';}
  function money(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});}
  function requireApi(){ if(!API){ $('loginError').hidden=false; $('loginError').textContent='Gateway administrativo ainda não configurado. Edite admin/config.js após publicar o Worker seguro.'; return false;} return true; }
  async function req(path,opt={}){
    if(!requireApi()) throw new Error('Gateway não configurado');
    const headers={...(opt.headers||{})}; if(token) headers.Authorization=`Bearer ${token}`; if(opt.body&&!headers['Content-Type'])headers['Content-Type']='application/json';
    const r=await fetch(`${API}${path}`,{...opt,headers,cache:'no-store'}); let d={}; try{d=await r.json();}catch(_){ }
    if(r.status===401){logout(false); throw new Error('Sessão expirada. Entre novamente.');}
    if(!r.ok||d.sucesso===false||d.ok===false)throw new Error(d.erro||d.error||`Falha (${r.status})`); return d;
  }
  async function login(email,pin){const d=await req('/session/login',{method:'POST',body:JSON.stringify({email,pin})});token=d.token;ownerEmail=d.email||email;sessionStorage.setItem('pemato_admin_session_v1',token);sessionStorage.setItem('pemato_admin_email_v1',ownerEmail);showApp();await refresh();}
  function logout(reload=true){token='';ownerEmail='';sessionStorage.removeItem('pemato_admin_session_v1');sessionStorage.removeItem('pemato_admin_email_v1');if(reload)location.reload();}
  function showApp(){ $('loginView').hidden=true;$('appView').hidden=false;$('ownerIdentity').textContent=ownerEmail; }
  function showLogin(){ $('loginView').hidden=false;$('appView').hidden=true; }

  async function refresh(){try{const [u,p]=await Promise.all([req('/api/admin/usuarios'),req('/api/admin/pagamentos')]);usuarios=Array.isArray(u.usuarios)?u.usuarios:(Array.isArray(u)?u:[]);pagamentos=Array.isArray(p.pagamentos)?p.pagamentos:[];renderAll();toast('Dados atualizados');}catch(e){toast(e.message);}}
  function renderAll(){const ativos=usuarios.filter(ativo),exp=usuarios.filter(u=>!u.bloqueado&&!ativo(u)),bloq=usuarios.filter(u=>u.bloqueado),vit=usuarios.filter(vitalicio);$('metricTotal').textContent=usuarios.length;$('metricAtivos').textContent=ativos.length;$('metricExpirados').textContent=exp.length;$('metricBloqueados').textContent=bloq.length;$('metricVitalicios').textContent=vit.length;$('metricRevenue').textContent=money(pagamentos.reduce((s,p)=>s+Number(p.valor||p.amount||0),0));renderClients();renderRecent();renderPayments();}
  function clientHtml(u){const id=String(u.whatsapp||u.id||'');const em=String(u.email||'');const st=status(u);const exp=vitalicio(u)?'Sem vencimento':(expiry(u)?new Date(expiry(u)).toLocaleDateString('pt-BR'):'Sem vencimento');return `<article class="client"><div><strong>${esc(id||em||'Conta')}</strong><span>${esc(em||'E-mail não cadastrado')}</span><small>${esc(u.plano||u.tipo||'Acesso')} · ${esc(exp)}</small><span class="badge ${u.bloqueado?'blocked':''}">${esc(st)}</span></div><div class="client-actions"><button data-client="${esc(id)}">Gerenciar</button></div></article>`;}
  function filtered(){const q=String($('clientSearch').value||'').toLowerCase().trim(),f=$('clientFilter').value;return usuarios.filter(u=>{const match=!q||`${u.whatsapp||u.id||''} ${u.email||''}`.toLowerCase().includes(q);let ok=true;if(f==='ativos')ok=ativo(u);if(f==='expirados')ok=!u.bloqueado&&!ativo(u);if(f==='bloqueados')ok=u.bloqueado===true;if(f==='vitalicios')ok=vitalicio(u);return match&&ok;});}
  function renderClients(){$('clientsList').innerHTML=filtered().map(clientHtml).join('')||'<p class="muted">Nenhuma conta encontrada.</p>';bindClientButtons($('clientsList'));}
  function renderRecent(){$('recentClients').innerHTML=usuarios.slice(0,6).map(clientHtml).join('')||'<p class="muted">Nenhuma conta encontrada.</p>';bindClientButtons($('recentClients'));}
  function renderPayments(){$('paymentsList').innerHTML=pagamentos.map(p=>`<article class="payment"><div><strong>${esc(p.whatsapp||p.email||'Pagamento')}</strong><small>${esc(p.plano||'')} · ${esc(p.data||p.createdAt||'')}</small></div><strong>${money(p.valor||p.amount)}</strong></article>`).join('')||'<p class="muted">Nenhum pagamento registrado.</p>';}
  function bindClientButtons(root){root.querySelectorAll('[data-client]').forEach(b=>b.onclick=()=>openClient(b.dataset.client));}
  function openClient(id){const u=usuarios.find(x=>String(x.whatsapp||x.id||'')===String(id));if(!u)return;$('modalTitle').textContent=u.whatsapp||u.email||'Gerenciar conta';$('modalBody').innerHTML=`<div class="modal-grid"><p class="muted">${esc(u.email||'Sem e-mail')}<br>${esc(status(u))}</p><label>Adicionar/remover dias<input id="mDays" type="number" value="30" min="-3650" max="3650"></label><div class="modal-actions"><button id="mAdjust" class="primary">Aplicar dias</button><button id="mReset" class="ghost">Resetar aparelho</button><button id="mBlock" class="ghost">${u.bloqueado?'Desbloquear':'Bloquear'}</button><button id="mDelete" class="ghost danger">Excluir conta</button></div></div>`;$('modal').hidden=false;$('mAdjust').onclick=()=>clientAction('/api/admin/ajustar-dias',{whatsapp:id,dias:Number($('mDays').value||0)});$('mReset').onclick=()=>clientAction('/api/admin/resetar-aparelho',{whatsapp:id});$('mBlock').onclick=()=>clientAction('/api/admin/bloqueio',{whatsapp:id,bloqueado:!u.bloqueado});$('mDelete').onclick=async()=>{if(!confirm('Excluir esta conta? Esta ação é sensível.'))return;await clientAction('/api/admin/excluir-usuario',{whatsapp:id});};}
  async function clientAction(path,body){try{await req(path,{method:'POST',body:JSON.stringify(body)});$('modal').hidden=true;await refresh();}catch(e){toast(e.message);}}
  function switchView(name){document.querySelectorAll('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));document.querySelectorAll('.sidebar nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$('pageTitle').textContent={dashboard:'Dashboard',clientes:'Clientes',pagamentos:'Pagamentos',comunicados:'Comunicados',seguranca:'Segurança'}[name]||name;document.querySelector('.sidebar').classList.remove('open');}

  $('loginForm').addEventListener('submit',async e=>{e.preventDefault();$('loginError').hidden=true;const btn=$('loginBtn');btn.disabled=true;try{await login($('ownerEmail').value.trim(),$('ownerPin').value.trim());$('ownerPin').value='';}catch(err){$('loginError').hidden=false;$('loginError').textContent=err.message;}finally{btn.disabled=false;}});
  $('logoutBtn').onclick=()=>logout();$('refreshBtn').onclick=refresh;$('menuBtn').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');$('modalClose').onclick=()=>$('modal').hidden=true;$('modal').onclick=e=>{if(e.target===$('modal'))$('modal').hidden=true;};
  document.querySelectorAll('.sidebar nav button').forEach(b=>b.onclick=()=>switchView(b.dataset.view));document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>switchView(b.dataset.go));$('clientSearch').oninput=renderClients;$('clientFilter').onchange=renderClients;
  $('broadcastSend').onclick=async()=>{try{await req('/api/admin/broadcast',{method:'POST',body:JSON.stringify({texto:$('broadcastText').value.trim(),duracaoHoras:Number($('broadcastHours').value)})});toast('Comunicado publicado');}catch(e){toast(e.message);}};
  $('broadcastClear').onclick=async()=>{try{await req('/api/admin/broadcast',{method:'POST',body:JSON.stringify({texto:'',duracaoHoras:0,apagar:true})});$('broadcastText').value='';toast('Comunicado removido');}catch(e){toast(e.message);}};

  (async()=>{if(!token){showLogin();return;}try{if(!requireApi())return;const d=await req('/session/check');ownerEmail=d.email||ownerEmail;showApp();await refresh();}catch(_){showLogin();}})();
})();
