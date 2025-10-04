const CACHE_NAME = 'bitgame-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.v1.4.css',
  '/src/main.js',
  '/background.js',
  '/levels.json',
  '/levels_en.json',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/not-gate-tutorial.gif',
  '/assets/or-gate-tutorial.gif',
  '/assets/and-gate-tutorial.gif',
  '/assets/junction-tutorial.gif',
  '/assets/multi-input-tutorial.gif',
  '/assets/tutorial-delete-wire.gif',
  '/assets/tutorial-place-blocks.gif',
  '/assets/tutorial-draw-wire.gif',
  '/assets/tutorial-see-info.gif',
  '/assets/tutorial-evaluate.gif'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.map(key => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    )
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => {
      return response || fetch(event.request);
    })
  );
});
