/* sw.js — offline-first service worker. Bump VERSION on every deploy. */
'use strict';

const VERSION = 'v1.3.0';
const CACHE = `workout-logger-${VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './app.js',
  './program.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      // tolerate individual misses (e.g. icons during development)
      Promise.allSettled(ASSETS.map(a => cache.add(a)))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // navigations: cache-first with index.html fallback (offline app shell)
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match(req).then(hit => hit ||
        fetch(req).catch(() => caches.match('./index.html')))
    );
    return;
  }

  // same-origin assets: cache-first, fall back to network (and cache the result)
  event.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return res;
      });
    })
  );
});
