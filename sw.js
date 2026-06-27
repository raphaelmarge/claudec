/* ============================================================
   TORQUE FITNESS — Service Worker (PWA offline)
   Estratégia NETWORK-FIRST para os arquivos do app (mesma origem):
   quando online, sempre baixa a versão mais nova (assim correções
   entram na hora); o cache serve só de reserva para uso offline.
   Chamadas externas (Supabase, CDN, fontes) passam direto pela rede.
   Suba o número da versão ao mudar a estratégia.
   ============================================================ */
const CACHE = 'torque-app-v3';
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

  // mesma origem: NETWORK-FIRST com {cache:'no-store'} — ignora o cache HTTP
  // do GitHub Pages e sempre traz a versão mais nova quando online; cai no
  // cache do SW (e em app.html na navegação) apenas quando offline.
  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(res => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(c => c || (req.mode === 'navigate' ? caches.match('./app.html') : Response.error())))
  );
});
