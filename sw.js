/**
 * CardScan — Service Worker
 * Strategy: Cache-first for app shell & assets, network-first for CDN (Tesseract).
 * On first install, Tesseract WASM + language data are pre-cached so the app
 * works completely offline after the first load.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `cardscan-shell-${CACHE_VERSION}`;
const CDN_CACHE     = `cardscan-cdn-${CACHE_VERSION}`;

// App shell — always cache these on install
const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/manifest.json',
];

// Tesseract CDN assets to pre-cache (WASM core + English traineddata)
// These are large but only downloaded once; after that the app is fully offline.
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js-core@5/tesseract-core-simd-lstm.wasm.js',
  'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',
];

// ── Install: pre-cache everything ────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(SHELL_CACHE).then(cache => cache.addAll(SHELL_ASSETS)),
      caches.open(CDN_CACHE).then(cache =>
        Promise.allSettled(CDN_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Pre-cache miss:', url, err))
        ))
      ),
    ]).then(() => self.skipWaiting())
  );
});

// ── Activate: purge old caches ────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  const valid = new Set([SHELL_CACHE, CDN_CACHE]);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !valid.has(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: serve from cache, fall back to network ─────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle GET
  if (request.method !== 'GET') return;

  // CDN assets — cache-first, update in background
  if (url.hostname.includes('jsdelivr') || url.hostname.includes('projectnaptha')) {
    event.respondWith(cacheFirstWithUpdate(request, CDN_CACHE));
    return;
  }

  // Google Fonts — cache-first
  if (url.hostname.includes('fonts.googleapis') || url.hostname.includes('fonts.gstatic')) {
    event.respondWith(cacheFirstWithUpdate(request, CDN_CACHE));
    return;
  }

  // App shell — cache-first
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithUpdate(request, SHELL_CACHE));
    return;
  }
});

async function cacheFirstWithUpdate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then(response => {
      if (response && response.status === 200) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => null); // offline — fall through to cached

  return cached || fetchPromise || new Response('Offline', { status: 503 });
}
