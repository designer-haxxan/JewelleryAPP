/* Service worker — Zewar POS. Bump VERSION on every release. */
const APP_ID  = 'zewarpos';
const VERSION = `${APP_ID}-v1.0.0`;
const isOwnCache = (k) => k.startsWith(`${APP_ID}-`) || /^(disterp|saleapp)-v/.test(k);

const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
  './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './js/app.js', './js/config.js',
  './js/core/settings.js', './js/core/ui.js', './js/core/utils.js', './js/core/views.js',
  './js/db/idb.js', './js/db/schema.js',
  './js/modules/dashboard.js', './js/modules/pos.js', './js/modules/products.js',
  './js/modules/customers.js', './js/modules/sales.js', './js/modules/settings.js',
  './js/printer/escpos.js', './js/printer/printer.js', './js/printer/raster.js', './js/printer/receipt.js',
  './js/scanner/scanner.js',
  './js/services/catalog.js',
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js',
];

async function cacheCdn(cache) {
  for (const url of CDN) {
    try {
      const res = await fetch(url, { mode: 'cors', credentials: 'omit', cache: 'reload' });
      if (!res.ok) continue;
      await cache.put(url, res.clone());
      if (url.endsWith('.css')) {
        const css = await res.text();
        for (const m of css.matchAll(/url\(["']?([^"')]+\.woff2?[^"')]*)["']?\)/g)) {
          const fontUrl = new URL(m[1], url).href;
          try { const f = await fetch(fontUrl, { mode: 'cors', credentials: 'omit' }); if (f.ok) await cache.put(fontUrl, f); } catch {}
        }
      }
    } catch {}
  }
}

async function precache() {
  const cache = await caches.open(VERSION);
  await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
  await cacheCdn(cache);
  try { await cache.add(new Request('./fonts/jameel-noori-nastaleeq.woff', { cache: 'reload' })); } catch {}
}

self.addEventListener('install',  (e) => e.waitUntil(precache().then(() => self.skipWaiting())));
self.addEventListener('message',  (e) => { if (e.data?.type === 'ENSURE_CACHE') e.waitUntil(caches.has(VERSION).then((ok) => { if (!ok) return precache(); })); });
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== VERSION && isOwnCache(k)) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith((async () => {
      const cached = await caches.match('./index.html', { cacheName: VERSION });
      return cached || fetch(req).catch(() => new Response('Offline', { status: 503 }));
    })());
    return;
  }
  const sameOrigin = url.origin === self.location.origin;
  const isCdn = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !isCdn) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const cached = await cache.match(req, { ignoreSearch: sameOrigin });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && (res.type === 'basic' || res.type === 'cors')) cache.put(req, res.clone());
      return res;
    } catch { return new Response('', { status: 504, statusText: 'Offline' }); }
  })());
});
