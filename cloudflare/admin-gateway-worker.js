const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX = 5;
const API_WINDOW_MS = 60 * 1000;
const API_MAX = 120;
const MAX_BODY = 32 * 1024;
const SESSION_TTL_SEC = 30 * 60;
const loginBuckets = new Map();
const apiBuckets = new Map();
let upstreamToken = '';
let upstreamTokenAt = 0;

const ALLOWED = new Map([
  ['/api/admin/usuarios', ['GET']],
  ['/api/admin/pagamentos', ['GET']],
  ['/api/admin/ajustar-dias', ['POST']],
  ['/api/admin/resetar-aparelho', ['POST']],
  ['/api/admin/bloqueio', ['POST']],
  ['/api/admin/excluir-usuario', ['POST']],
  ['/api/admin/liberar-acesso', ['POST']],
  ['/api/admin/alterar-email', ['POST']],
  ['/api/admin/alterar-senha', ['POST']],
  ['/api/admin/broadcast', ['POST']]
]);
function headers(origin,env){const ok=origin&&origin===env.ADMIN_ORIGIN;const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Permissions-Policy':'geolocation=(), camera=(), microphone=()','Cross-Origin-Resource-Policy':'same-site','Vary':'Origin'};if(ok){h['Access-Control-Allow-Origin']=origin;h['Access-Control-Allow-Headers']='Content-Type, Authorization';h['Access-Control-Allow-Methods']='GET, POST, OPTIONS';h['Access-Control-Max-Age']='600';}return h;}
function out(data,status,origin,env,extra={}){return new Response(JSON.stringify(data),{status,headers:{...headers(origin,env),...extra}});}
function bucket(map,key,windowMs,max){const n=Date.now(),b=map.get(key);if(!b||n-b.start>=windowMs){map.set(key,{start:n,count:1});return true;}b.count++;return b.count<=max;}
function ip(req){return req.headers.get('CF-Connecting-IP')||'unknown';}
function b64u(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function b64ud(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
async function hmac(text,secret){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);return new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(text)));}
async function issue(email,env){const payload=b64u(new TextEncoder().encode(JSON.stringify({sub:email,role:'owner',exp:Math.floor(Date.now()/1000)+SESSION_TTL_SEC,nonce:crypto.randomUUID()})));const sig=b64u(await hmac(payload,env.SESSION_SECRET));return `${payload}.${sig}`;}
async function verify(token,env){try{const [p,s]=String(token||'').split('.');if(!p||!s)return null;const expected=await hmac(p,env.SESSION_SECRET),got=b64ud(s);if(expected.length!==got.length)return null;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected[i]^got[i];if(diff)return null;const data=JSON.parse(new TextDecoder().decode(b64ud(p)));if(data.role!=='owner'||Number(data.exp)<=Date.now()/1000)return null;return data;}catch(_){return null;}}
async function hash(v){const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(v)));return b64u(new Uint8Array(d));}
async function equalSecret(a,b){const [x,y]=await Promise.all([hash(a),hash(b)]);if(x.length!==y.length)return false;let d=0;for(let i=0;i<x.length;i++)d|=x.charCodeAt(i)^y.charCodeAt(i);return d===0;}
async function body(req){const len=Number(req.headers.get('Content-Length')||0);if(len>MAX_BODY)throw new Error('body_too_large');const text=await req.text();if(text.length>MAX_BODY)throw new Error('body_too_large');return text?JSON.parse(text):{};}
async function getUpstreamToken(env,force=false){if(!force&&upstreamToken&&Date.now()-upstreamTokenAt<8*60*1000)return upstreamToken;const r=await fetch(`${env.UPSTREAM_ADMIN_URL.replace(/\/$/,'')}/admin/login`,{method:'POST',headers:{'Content-Type':'application/json','X-Pemato-Admin-Gateway':env.GATEWAY_SHARED_SECRET},body:JSON.stringify({senha:env.UPSTREAM_ADMIN_PASSWORD})});const d=await r.json().catch(()=>({}));if(!r.ok||!d.adminToken)throw new Error('upstream_auth_failed');upstreamToken=d.adminToken;upstreamTokenAt=Date.now();return upstreamToken;}
async function proxy(req,path,env,origin){const methods=ALLOWED.get(path);if(!methods||!methods.includes(req.method))return out({ok:false,error:'not_allowed'},405,origin,env);const upstreamPath=path.replace(/^\/api/,'');let raw='';if(req.method==='POST'){try{raw=JSON.stringify(await body(req));}catch(e){return out({ok:false,error:e.message==='body_too_large'?'body_too_large':'invalid_json'},400,origin,env);}}for(let attempt=0;attempt<2;attempt++){let tok;try{tok=await getUpstreamToken(env,attempt===1);}catch(_){return out({ok:false,error:'admin_backend_unavailable'},502,origin,env);}const r=await fetch(`${env.UPSTREAM_ADMIN_URL.replace(/\/$/,'')}${upstreamPath}`,{method:req.method,headers:{'Authorization':`Bearer ${tok}`,'Content-Type':'application/json','X-Pemato-Admin-Gateway':env.GATEWAY_SHARED_SECRET},body:req.method==='POST'?raw:undefined});if(r.status===401&&attempt===0)continue;const text=await r.text();let d={};try{d=JSON.parse(text);}catch(_){d={sucesso:false,erro:'invalid_upstream_response'};}return out(d,r.status,origin,env);}return out({ok:false,error:'admin_backend_unavailable'},502,origin,env);}
export default {async fetch(req,env){const origin=req.headers.get('Origin')||'';if(req.method==='OPTIONS'){if(origin!==env.ADMIN_ORIGIN)return out({ok:false,error:'origin_denied'},403,origin,env);return new Response(null,{status:204,headers:headers(origin,env)});}if(origin!==env.ADMIN_ORIGIN)return out({ok:false,error:'origin_denied'},403,origin,env);const url=new URL(req.url);if(url.pathname==='/session/login'&&req.method==='POST'){if(!bucket(loginBuckets,ip(req),LOGIN_WINDOW_MS,LOGIN_MAX))return out({ok:false,error:'Muitas tentativas. Aguarde 15 minutos.'},429,origin,env,{'Retry-After':'900'});let d;try{d=await body(req);}catch(_){return out({ok:false,error:'invalid_request'},400,origin,env);}const email=String(d.email||'').trim().toLowerCase(),pin=String(d.pin||'').trim();if(!/^\S+@\S+\.\S+$/.test(email)||pin.length<6||pin.length>12)return out({ok:false,error:'Credenciais inválidas.'},400,origin,env);const okEmail=await equalSecret(email,String(env.OWNER_EMAIL||'').trim().toLowerCase()),okPin=await equalSecret(pin,String(env.OWNER_PIN||''));if(!okEmail||!okPin){await new Promise(r=>setTimeout(r,350));return out({ok:false,error:'E-mail ou PIN incorreto.'},401,origin,env);}const token=await issue(email,env);return out({ok:true,token,email,expiresIn:SESSION_TTL_SEC},200,origin,env);}const auth=req.headers.get('Authorization')||'';const session=await verify(auth.startsWith('Bearer ')?auth.slice(7):'',env);if(!session)return out({ok:false,error:'unauthorized'},401,origin,env);if(!bucket(apiBuckets,`${ip(req)}:${session.sub}`,API_WINDOW_MS,API_MAX))return out({ok:false,error:'rate_limited'},429,origin,env,{'Retry-After':'60'});if(url.pathname==='/session/check'&&req.method==='GET')return out({ok:true,email:session.sub,role:session.role},200,origin,env);return proxy(req,url.pathname,env,origin);}};
