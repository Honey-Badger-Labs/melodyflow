/* MelodyFlow service worker — network-first, offline-capable.
   Online, every file comes fresh from the server, so a deploy reaches an
   installed app on its next launch. Offline, the last copy seen is served.
   CACHE only needs a bump to drop files that no longer exist. */
const CACHE = 'melodyflow-v7';
// How long to wait on a slow network before falling back to the cached copy.
const NETWORK_TIMEOUT_MS = 4000;
const ASSETS = [
  './',
  './index.html',
  './instruments.js',
  './fretboard.js',
  './fretboard-view.js',
  './practice.js',
  './manifest.webmanifest',
  './icon.svg',
  './icon-maskable.svg',
  './icon-192.png',
  './icon-maskable-512.png',
  './apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(networkFirst(req));
});

/* Revalidate with the server (no-cache skips the browser's HTTP cache, so a
   deploy is not hidden behind GitHub Pages' ten-minute max-age), keep what
   comes back, and fall back to the cache when offline or too slow. */
async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req, { cache: 'no-cache' }).then(res => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise(resolve => setTimeout(resolve, NETWORK_TIMEOUT_MS));
  try {
    const res = await Promise.race([network, timeout]);
    if (res) return res;
  } catch { /* offline: fall through to the cache */ }
  const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
  if (hit) return hit;
  if (req.mode === 'navigate') {
    const shell = await cache.match('./index.html');
    if (shell) return shell;
  }
  return network; // nothing cached: wait for the network after all
}
