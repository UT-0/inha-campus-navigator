/*
 * Service worker: keeps the app usable with a weak or no signal on campus,
 * and lets it be installed on a phone's home screen.
 *
 * Strategy (kept deliberately simple):
 * - Pages (navigations): network first, so a new version shows up as soon as
 *   there is a connection; the cached page is used when offline.
 * - Everything else from this site (scripts, styles, map data, photos,
 *   icons): cache first. Built files have content hashes in their names, so a
 *   cached copy is never stale; new versions simply have new names.
 * - The web font from cdn.jsdelivr.net: served from the cache, refreshed in
 *   the background.
 * The page also sends the list of files it already loaded, so they are cached
 * right after the first visit (see registerServiceWorker in src/main.js).
 * Bump VERSION to drop old caches.
 */
const VERSION = 'v1';
const CACHE = `inha-nav-${VERSION}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './favicon.svg'];
const FONT_HOST = 'cdn.jsdelivr.net';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page lists the files it loaded before this worker took control.
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'cache-urls') return;
  const urls = event.data.urls.filter((url) => {
    const { origin, hostname } = new URL(url);
    return origin === self.location.origin || hostname === FONT_HOST;
  });
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          urls.map((url) =>
            cache
              .match(url, { ignoreVary: true })
              .then((hit) => hit || cache.add(url).catch(() => undefined)),
          ),
        ),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(() => caches.match('./index.html', { ignoreVary: true })),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  if (url.hostname === FONT_HOST) {
    event.respondWith(
      caches.open(CACHE).then((cache) =>
        cache.match(request, { ignoreVary: true }).then((hit) => {
          const refresh = fetch(request)
            .then((response) => {
              cache.put(request, response.clone());
              return response;
            })
            .catch(() => hit);
          return hit || refresh;
        }),
      ),
    );
  }
});
