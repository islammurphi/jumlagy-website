/**
 * Service Worker للتخزين المؤقت والعمل بدون إنترنت
 * @version 3.0.0
 */
'use strict';

const CACHE_NAME = 'jamlaji-v3.0.0';
const RUNTIME_CACHE = 'jamlaji-runtime';

// الملفات التي سيتم تخزينها مؤقتاً
const PRECACHE_URLS = [
    './',
    './index.html',
    './css/styles.css',
    './js/utils.js',
    './js/config.js',
    './js/state-manager.js',
    './js/auth.js',
    './js/data-manager.js',
    './js/ui-renderer.js',
    './js/ui-components.js',
    './js/charts.js',
    './js/crm.js',
    './js/reports.js',
    './js/app.js',
    './manifest.json',
    './assets/icons/icon-192.png',
    './assets/icons/icon-512.png',
    'https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://cdn.sheetjs.com/xlsx-0.20.2/package/dist/xlsx.full.min.js'
];

/**
 * تثبيت Service Worker
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Precaching files...');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => {
                console.log('[SW] Installation complete');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Installation failed:', error);
            })
    );
});

/**
 * تفعيل Service Worker
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    
    // حذف الكاش القديم
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[SW] Activation complete');
                return self.clients.claim();
            })
    );
});

/**
 * استراتيجية: Network First مع fallback للكاش
 */
self.addEventListener('fetch', (event) => {
    // تجاهل طلبات API و chrome-extension
    if (
        event.request.url.includes('/api/') ||
        event.request.url.startsWith('chrome-extension://')
    ) {
        return;
    }

    // استراتيجية مختلفة حسب نوع الملف
    if (event.request.url.includes('fonts.googleapis.com') ||
        event.request.url.includes('cdnjs.cloudflare.com') ||
        event.request.url.includes('cdn.jsdelivr.net')) {
        // Cache First للمكتبات الخارجية
        event.respondWith(cacheFirst(event.request));
    } else {
        // Network First لملفات التطبيق
        event.respondWith(networkFirst(event.request));
    }
});

/**
 * استراتيجية Cache First
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    if (cached) {
        return cached;
    }
    
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        // إرجاع صفحة offline إذا فشل التحميل
        if (request.destination === 'document') {
            return caches.match('./index.html');
        }
        throw error;
    }
}

/**
 * استراتيجية Network First
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (response && response.status === 200) {
            const cache = await caches.open(RUNTIME_CACHE);
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        const cached = await caches.match(request);
        if (cached) {
            return cached;
        }
        
        // للصفحات، إرجاع index.html
        if (request.destination === 'document') {
            return caches.match('./index.html');
        }
        
        throw error;
    }
}

/**
 * التعامل مع الرسائل من التطبيق
 */
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
    
    if (event.data === 'clearCaches') {
        caches.delete(CACHE_NAME);
        caches.delete(RUNTIME_CACHE);
    }
});

/**
 * إشعارات Push (اختياري)
 */
self.addEventListener('push', (event) => {
    const options = {
        body: event.data?.text() || 'تحديث جديد من جملجي',
        icon: './assets/icons/icon-192.png',
        badge: './assets/icons/icon-72.png',
        dir: 'rtl',
        lang: 'ar',
        vibrate: [200, 100, 200],
        tag: 'jamlaji-notification'
    };
    
    event.waitUntil(
        self.registration.showNotification('جملجي ERB', options)
    );
});