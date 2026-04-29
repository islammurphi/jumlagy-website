/**
 * Service Worker للتخزين المؤقت والعمل بدون إنترنت
 * @version 3.0.1
 */
'use strict';

// bump this value when you deploy new builds to force refresh
const CACHE_NAME = 'jamlaji-v3.0.1';
const RUNTIME_CACHE = 'jamlaji-runtime';

// الملفات التي سيتم تخزينها مؤقتاً
const PRECACHE_URLS = [
  './',
  './index.html',
  './styles.css',
  './utils.js',
  './config.js',
  './state-manager.js',
  './auth.js',
  './data-manager.js',
  './ui-renderer.js',
  './ui-components.js',
  './charts.js',
  './crm.js',
  './reports.js',
  './app.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
  'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // cache.addAll يفشل لو أي رابط فشل، فبنضيف واحد واحد
      return Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.map((name) => {
        if (name !== CACHE_NAME && name !== RUNTIME_CACHE) return caches.delete(name);
      })
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  if (url.startsWith('chrome-extension://')) return;

  // Cache First للمكتبات الخارجية
  if (
    url.includes('fonts.googleapis.com') ||
    url.includes('cdnjs.cloudflare.com') ||
    url.includes('cdn.jsdelivr.net') ||
    url.includes('gstatic.com/firebasejs')
  ) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Network First لملفات التطبيق
  event.respondWith(networkFirst(event.request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.status === 200) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response && response.status === 200) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (request.destination === 'document') return caches.match('./index.html');
    throw e;
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
  if (event.data === 'clearCaches') {
    caches.delete(CACHE_NAME);
    caches.delete(RUNTIME_CACHE);
  }
});