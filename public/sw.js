// Cache first so the app opens instantly; a new version installs in the background
// and waits until the app asks it to take over ("Update ready").
// The server rewrites the CACHE line with a hash of the app's files on startup.
const CACHE = 'bdgg-dev';
const STATIC = [
  './manifest.webmanifest',
  './icons/favicon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const page = await fetch('./', { cache: 'reload' });
    if (!page.ok) throw new Error('index ' + page.status);
    const html = await page.clone().text();
    const assets = [...html.matchAll(/(?:href|src|content)="((?:app\.(?:css|js)\?v=|vendor\/hls-)[^"]+)"/g)].map((m) => './' + m[1]);
    await cache.put('./', page);
    await cache.addAll([...new Set([...assets, ...STATIC])]);
    // Workers from before this version used numbered caches and never wait;
    // take over right away so those installs move to the new update flow.
    const keys = await caches.keys();
    if (keys.some((k) => /^bdgg-v\d+$/.test(k))) self.skipWaiting();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok && url.pathname !== '/sw.js') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || Response.error())))
  );
});
