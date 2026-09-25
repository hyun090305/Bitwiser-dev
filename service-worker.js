const CACHE_NAME = 'bitgame-cache-v26-blueprint-sharing';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/src/main.js?v=local-saves-1',
  '/lang.js?v=local-saves-1',
  '/gif.js',
  '/gif.worker.js',
  '/src/modules/circuitShare.js',
  '/src/modules/circuitStorage.js',
  '/src/modules/savedCircuitRecord.js',
  '/src/modules/authUI.js',
  '/background.js',
  '/levels.json',
  '/levels_en.json',
  '/stage_map.json',
  '/src/modules/stageCatalog.js',
  '/src/modules/memory20References.js',
  '/src/modules/dividerGrading.js',
  '/src/modules/circuitCost.js',
  '/src/modules/costRecords.js',
  '/src/modules/stageCircuit.js',
  '/src/modules/costUI.js',
  '/src/modules/blueprintShare.js',
  '/src/canvas/blueprintExport.js',
  '/src/modules/achievementStars.js',
  '/src/modules/costLeaderboard.js',
  '/src/modules/fullCostExperience.js',
  '/src/modules/referenceFSM.js',
  '/src/modules/circuitGrading.js',
  '/src/modules/grading.js?v=local-saves-1',
  '/src/modules/gradingResultView.js',
  '/src/modules/counterexampleTrace.js',
  '/src/canvas/tracePlayback.js',
  '/src/canvas/compiledCircuit.js',
  '/src/canvas/evaluation.js',
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
          if (key.startsWith('bitgame-cache-') && key !== CACHE_NAME) {
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
