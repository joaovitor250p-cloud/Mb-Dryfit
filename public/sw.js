/* MB REFERÊNCIAS — apenas arquivos estáticos; nunca guarda respostas do Firebase. */
const VERSION = 'mb-referencias-shell-2026-11-06-mobile-recovery';
const BASE = new URL(self.registration.scope);
const SHELL = [BASE.href, new URL('index.html', BASE).href, new URL('instalar.html',BASE).href];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('mb-referencias-shell-') && key !== VERSION).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET' || new URL(req.url).origin !== BASE.origin) return;
  const url = new URL(req.url);
  if(!url.pathname.startsWith(BASE.pathname)) return;
  if(req.mode === 'navigate') {
    // HTML sempre vem da rede: nunca devolve uma página antiga apontando para JS excluído.
    // Se estiver offline, mostra instrução de reconexão em vez de carregamento infinito.
    event.respondWith(fetch(req, {cache:'no-store'}).catch(() => new Response(
      '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MB REFERÊNCIAS</title><body style="font-family:system-ui;padding:30px;max-width:450px;margin:auto"><h1>Sem conexão com o MB REFERÊNCIAS</h1><p>Ative a internet e toque abaixo para carregar a versão atualizada.</p><button style="padding:14px;border:0;border-radius:10px;background:#6756e8;color:white" onclick="location.reload()">Tentar novamente</button></body></html>',
      {status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}}
    )));
    return;
  }
  // Só faz cache de arquivos versionados do build e dos ícones. Não intercepta dados.
  if(/\/(assets|icons)\/[^/]+\.(js|css|png|webp|svg|woff2?)$/i.test(url.pathname)) {
    event.respondWith(caches.match(req).then(cached => cached || fetch(req).then(response => {
      if(response.ok) {const copy=response.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put(req,copy)));}
      return response;
    })));
  }
});
