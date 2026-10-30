// Service worker – aplikace funguje i bez internetu.
// Při nové verzi stačí změnit CACHE; staré soubory se smažou.
const CACHE = 'kominictvi-v0.2.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/version.js', 'js/db.js', 'js/ui.js', 'js/settings.js', 'js/seed.js', 'js/numbering.js', 'js/lhuty.js', 'js/customers.js',
  'js/views/dnes.js', 'js/views/nastaveni.js', 'js/views/soon.js', 'js/views/zakaznici.js', 'js/views/karta.js', 'js/views/zakaznik-form.js',
  'icons/logo.png', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  // vlastní soubory aplikace: nejdřív z cache (offline), na pozadí aktualizovat
  if (url.origin === location.origin) {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(e.request, { ignoreSearch: true });
      const net = fetch(e.request).then((res) => { if (res.ok) cache.put(e.request, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }
  // písma Google: uložit pro offline
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(e.request)) || fetch(e.request).then((res) => { cache.put(e.request, res.clone()); return res; })));
  }
});
