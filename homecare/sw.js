/* ============================================================
   CuidarJá — Service Worker (PWA offline)
   Estratégia NETWORK-FIRST para os arquivos do app (mesma origem):
   online, sempre baixa a versão mais nova; o cache serve de reserva
   para uso offline. Fontes/CDN passam direto pela rede.
   ============================================================ */
const CACHE = 'cuidarja-v1';
const SHELL = [
  './index.html',
  './app.css',
  './app.js',
  './icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
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
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // fontes/CDN: rede direta
  e.respondWith(
    fetch(req, { cache: 'no-store' })
      .then(res => {
        if (res && res.status === 200) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req).then(c => c || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())))
  );
});
