/* MB REFERÊNCIAS — apenas arquivos estáticos; nunca guarda respostas do Firebase. */
const VERSION = 'mb-referencias-shell-2026-11-05-1';
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
    // Sempre prefere a versão publicada; offline apenas a estrutura pode carregar.
    event.respondWith(fetch(req).then(response => {
      if(response.ok) {const copy=response.clone();event.waitUntil(caches.open(VERSION).then(cache=>cache.put(req,copy)));}
      return response;
    }).catch(async () => (await caches.match(req)) || (await caches.match(new URL('index.html',BASE).href)) || Response.error()));
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
