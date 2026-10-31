// Service worker – aplikace funguje i bez internetu.
// Při nové verzi stačí změnit CACHE; staré soubory se smažou.
const CACHE = 'kominictvi-v0.8.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/app.js', 'js/version.js', 'js/db.js', 'js/ui.js', 'js/settings.js', 'js/seed.js', 'js/numbering.js', 'js/lhuty.js', 'js/customers.js', 'js/catalog.js', 'js/payment.js', 'js/visit.js', 'js/pdf.js', 'js/signature.js', 'js/share.js', 'js/protocol.js', 'js/texts.js', 'js/smsqueue.js', 'js/planning.js', 'js/termin.js', 'js/mapy.js', 'js/finance.js', 'js/google.js', 'js/ai.js', 'js/backup.js', 'js/lock.js', 'js/sync.js', 'js/weather.js', 'apps-script/Code.gs',
  'js/views/dnes.js', 'js/views/nastaveni.js', 'js/views/soon.js', 'js/views/zakaznici.js', 'js/views/karta.js', 'js/views/zakaznik-form.js', 'js/views/navsteva.js', 'js/views/poptavky.js', 'js/views/kalendar.js', 'js/views/mapa.js', 'js/views/historie.js', 'js/views/finance.js', 'js/views/nabidka.js',
  'vendor/pdf.mjs', 'vendor/qrcode.mjs', 'vendor/leaflet.mjs', 'vendor/leaflet.css',
  'fonts/SourceSans3-Regular.ttf', 'fonts/SourceSans3-SemiBold.ttf', 'fonts/SourceSans3-Bold.ttf', 'fonts/Oswald-SemiBold.ttf',
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
  // vlastní soubory aplikace: s internetem vždy nejnovější verze, bez internetu z cache
  if (url.origin === location.origin) {
    e.respondWith(caches.open(CACHE).then(async (cache) => {
      try {
        const res = await fetch(e.request, { cache: 'no-cache' });
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      } catch {
        return (await cache.match(e.request, { ignoreSearch: true })) || (await cache.match('index.html'));
      }
    }));
    return;
  }
  // písma Google: uložit pro offline
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(CACHE).then(async (cache) => (await cache.match(e.request)) || fetch(e.request).then((res) => { cache.put(e.request, res.clone()); return res; })));
  }
});
