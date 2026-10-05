// Cache first so the app opens instantly; a new version installs in the background
// and waits until the app asks it to take over ("Update ready").
// The server fills in CACHE (a hash of the app's files) and ASSETS (the page and
// every content-hashed file it uses) on startup.
const CACHE = 'bdgg-dev';
const ASSETS = [];

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })));
    })(),
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname === '/healthz' || url.pathname === '/sw.js') return;
  if (req.mode === 'navigate') {
    e.respondWith(caches.match('./').then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req)
          .then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || Response.error())),
    ),
  );
});

// "Destiny is live" (web push from the server, see server.js). A tap opens
// the app on the stream: an open window is told the hash, else one is opened.
self.addEventListener('push', (e) => {
  let data = {};
  try {
    data = e.data ? e.data.json() : {};
  } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title || 'DGG Remix', {
      body: data.body || '',
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      tag: data.tag || 'live',
      renotify: true,
      data: { url: data.url || './' },
    }),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = String((e.notification.data && e.notification.data.url) || './');
  const hash = target.startsWith('#') ? target : '';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const win = list[0];
      if (win) {
        if (hash) win.postMessage({ type: 'open', hash });
        return win.focus();
      }
      return self.clients.openWindow(new URL(hash ? './' + hash : target, self.location.href).href);
    }),
  );
});
