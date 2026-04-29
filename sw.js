const CACHE = 'nyt100-v7';
const TILE_CACHE = 'nyt100-tiles';

const SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './data/restaurants.json',
  './images/placeholder.svg',
  './icons/icon-192.svg',
  './icons/icon-512.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './vendor/leaflet/leaflet.min.js',
  './vendor/leaflet/leaflet.min.css'
];

function lngToX(lng, z) {
  return Math.floor((lng + 180) / 360 * Math.pow(2, z));
}
function latToY(lat, z) {
  const rad = lat * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * Math.pow(2, z));
}
function tileUrl(z, x, y) {
  return `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`;
}

async function seedNYCTiles() {
  const cache = await caches.open(TILE_CACHE);
  const bbox = { minLat: 40.47, maxLat: 40.93, minLng: -74.27, maxLng: -73.68 };
  const urls = [];
  for (const z of [11, 12, 13]) {
    const minX = lngToX(bbox.minLng, z);
    const maxX = lngToX(bbox.maxLng, z);
    const minY = latToY(bbox.maxLat, z); // higher lat = smaller y
    const maxY = latToY(bbox.minLat, z);
    for (let x = minX; x <= maxX; x++)
      for (let y = minY; y <= maxY; y++)
        urls.push(tileUrl(z, x, y));
  }
  for (let i = 0; i < urls.length; i += 8) {
    await Promise.allSettled(
      urls.slice(i, i + 8).map(async url => {
        if (await cache.match(url)) return;
        try {
          const res = await fetch(url);
          if (res.ok) await cache.put(url, res);
        } catch (_) {}
      })
    );
  }
}

self.addEventListener('install', e => {
  // Keep SW alive until shell is cached AND tile seeding completes
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
  e.waitUntil(seedNYCTiles());
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE && k !== TILE_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  if (url.hostname.endsWith('basemaps.cartocdn.com')) {
    e.respondWith(
      caches.open(TILE_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        if (cached) return cached;
        // Force CORS mode so the response is cacheable (not opaque)
        const res = await fetch(new Request(e.request.url, { mode: 'cors' }));
        if (res && res.ok) cache.put(e.request, res.clone());
        return res;
      }).catch(() => new Response('', { status: 408 }))
    );
    return;
  }

  // Cache-first for shell assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      });
    })
  );
});
