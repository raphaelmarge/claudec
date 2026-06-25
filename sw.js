/* ============================================================
   TORQUE FITNESS — Service Worker (PWA offline)
   Faz cache do "app shell" para abrir e montar orçamento sem
   internet. Chamadas externas (Supabase, CDN, fontes) passam
   direto pela rede — o app cai no localStorage quando offline.
   Suba o número da versão ao mudar arquivos do shell.
   ============================================================ */
const CACHE = 'torque-app-v1';
const SHELL = [
  './app.html',
  './css/styles.css',
  './js/config.js',
  './js/cloud.js',
  './js/products.js',
  './js/secure.js',
  './js/app.js',
  './assets/logo-torque.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './app.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                      // não mexe em POST/auth
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;       // Supabase/CDN/fontes: rede direta

  // mesma origem: stale-while-revalidate, com fallback p/ app.html na navegação
  e.respondWith(
    caches.match(req).then(cached => {
      const network = fetch(req)
        .then(res => {
          if (res && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || (req.mode === 'navigate' ? caches.match('./app.html') : Response.error()));
      return cached || network;
    })
  );
});
