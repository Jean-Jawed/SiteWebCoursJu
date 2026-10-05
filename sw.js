// =====================
// Service worker — Cours Ju Plaine (PWA)
//
// Stratégies :
//  - Pages HTML, CSS, JS du site : réseau d'abord, cache en secours
//    (les fichiers n'ont pas de hash : on évite de servir un vieux JS avec un nouveau HTML)
//  - Icônes, polices, SDK Firebase, Leaflet, GSAP (cdnjs) : cache d'abord
//  - Photos et tuiles de carte : cache à la consultation, plafonné
//  - Vidéo, Firestore, analytics, admin : non interceptés
//
// Incrémenter CACHE_VERSION quand on modifie PRECACHE ou les stratégies.
// =====================

const CACHE_VERSION = 'v5';

const CACHES = {
    pages: `pages-${CACHE_VERSION}`,
    static: `static-${CACHE_VERSION}`,
    images: `images-${CACHE_VERSION}`,     // photos des lieux (Firebase Storage)
    media: `media-${CACHE_VERSION}`,       // images du site (trames, façades, Mag)
    tiles: `tiles-${CACHE_VERSION}`
};

const MAX_IMAGES = 50;
const MAX_MEDIA = 160;
const MAX_TILES = 300;
const NETWORK_TIMEOUT = 4000;

const PRECACHE_PAGES = [
    '/', '/lieux.html', '/quartier.html', '/contact.html', '/mag.html',
    '/en/', '/en/places.html', '/en/neighbourhood.html', '/en/contact.html', '/en/mag.html'
];

const PRECACHE_STATIC = [
    '/offline.html',
    '/en/offline.html',
    '/i18n/ui.js',
    '/manifest-en.webmanifest',
    '/style.css',
    '/pwa.js',
    '/script.js',
    '/home.js',
    '/zine.css',
    '/images/plan-quartier.svg',
    '/lieux.js',
    '/contact.js',
    '/data-loader.js',
    '/firebase-config.js',
    '/storage-helpers.js',
    '/manifest.webmanifest',
    '/favicon.ico',
    '/icons/icon.svg',
    '/icons/icon-192.png',
    'https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js',
    'https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js',
    'https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js',
    'https://www.gstatic.com/firebasejs/10.13.0/firebase-storage.js',
    'https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;700&family=Barlow:wght@400;500&display=swap',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-gesture-handling/dist/leaflet-gesture-handling.min.css',
    'https://unpkg.com/leaflet-gesture-handling'
];

// =====================
// Cycle de vie
// =====================
self.addEventListener('install', event => {
    event.waitUntil((async () => {
        // Une ressource en échec ne doit pas bloquer l'installation
        const pages = await caches.open(CACHES.pages);
        const statics = await caches.open(CACHES.static);
        await Promise.all([
            ...PRECACHE_PAGES.map(url => pages.add(url).catch(() => {})),
            ...PRECACHE_STATIC.map(url => statics.add(new Request(url, { mode: 'cors' })).catch(() => {}))
        ]);
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const keep = Object.values(CACHES);
        const names = await caches.keys();
        await Promise.all(names.filter(n => !keep.includes(n)).map(n => caches.delete(n)));
        await self.clients.claim();
    })());
});

// =====================
// Routage des requêtes
// =====================
self.addEventListener('fetch', event => {
    const req = event.request;
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const sameOrigin = url.origin === self.location.origin;

    // Admin : jamais en cache
    if (sameOrigin && url.pathname.startsWith('/admin')) return;

    if (req.mode === 'navigate') {
        event.respondWith(handlePage(req));
        return;
    }

    if (sameOrigin) {
        if (url.pathname.startsWith('/videos/')) return;
        if (url.pathname.startsWith('/images/')) {
            event.respondWith(cacheFirstLimited(req, CACHES.media, MAX_MEDIA, { cors: true }));
        } else if (url.pathname.startsWith('/icons/') || url.pathname === '/favicon.ico') {
            event.respondWith(cacheFirst(req, CACHES.static));
        } else {
            event.respondWith(networkFirst(req, CACHES.static));
        }
        return;
    }

    switch (url.hostname) {
        case 'www.gstatic.com':
            if (url.pathname.startsWith('/firebasejs/')) event.respondWith(cacheFirst(req, CACHES.static));
            return;
        case 'fonts.gstatic.com':
            event.respondWith(cacheFirst(req, CACHES.static));
            return;
        case 'cdnjs.cloudflare.com':
            // URLs versionnées (ex. gsap/3.13.0) : le contenu ne change jamais
            event.respondWith(cacheFirst(req, CACHES.static));
            return;
        case 'fonts.googleapis.com':
        case 'unpkg.com':
            event.respondWith(staleWhileRevalidate(req, CACHES.static));
            return;
        case 'firebasestorage.googleapis.com':
            // Le bucket n'envoie pas d'en-têtes CORS : réponse opaque
            event.respondWith(cacheFirstLimited(req, CACHES.images, MAX_IMAGES, { cors: false }));
            return;
    }

    if (url.hostname.endsWith('basemaps.cartocdn.com')) {
        event.respondWith(cacheFirstLimited(req, CACHES.tiles, MAX_TILES, { cors: true }));
    }
    // Tout le reste (Firestore, analytics…) passe directement par le réseau
});

// =====================
// Stratégies
// =====================

// Clé de cache d'une page : sans query string ni hash, /index.html ≡ /
function pageKey(request) {
    const url = new URL(request.url);
    const path = url.pathname === '/index.html' ? '/' : url.pathname;
    return url.origin + path;
}

async function handlePage(req) {
    const cache = await caches.open(CACHES.pages);
    const key = pageKey(req);
    const network = fetch(req).then(res => {
        if (res.ok && res.type === 'basic') cache.put(key, res.clone());
        return res;
    });

    try {
        // Réseau lent : on sert la copie en cache au bout de NETWORK_TIMEOUT
        return await Promise.race([network, timeoutFallback(() => cache.match(key))]);
    } catch (_) {
        const offline = new URL(req.url).pathname.startsWith('/en/') ? '/en/offline.html' : '/offline.html';
        return (await cache.match(key))
            || (await caches.match(offline))
            || Response.error();
    }
}

function timeoutFallback(getCached) {
    return new Promise((resolve, reject) => {
        setTimeout(async () => {
            const cached = await getCached();
            cached ? resolve(cached) : reject(new Error('timeout'));
        }, NETWORK_TIMEOUT);
    }).catch(() => new Promise(() => {})); // pas de copie : on laisse le réseau finir
}

async function networkFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
    } catch (_) {
        const cached = await cache.match(req, { ignoreSearch: true });
        if (cached) return cached;
        throw _;
    }
}

async function cacheFirst(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    if (cached) return cached;
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
}

async function staleWhileRevalidate(req, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
        if (res.ok) cache.put(req, res.clone());
        return res;
    });
    if (cached) {
        network.catch(() => {});
        return cached;
    }
    return network;
}

// Images et tuiles : les <img> font des requêtes "no-cors" dont la réponse
// est opaque, et Chrome compte chaque réponse opaque ~7 Mo dans le quota.
// Quand le serveur le permet (cors: true, ex. CARTO), on refait la requête en CORS.
async function cacheFirstLimited(req, cacheName, max, { cors }) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(req.url);
    if (cached) return cached;

    let res;
    if (cors) {
        try {
            res = await fetch(req.url, { mode: 'cors', credentials: 'omit' });
        } catch (_) {
            return fetch(req);
        }
    } else {
        res = await fetch(req);
    }
    if (res.ok || res.type === 'opaque') {
        await cache.put(req.url, res.clone());
        trimCache(cache, max);
    }
    return res;
}

async function trimCache(cache, max) {
    const keys = await cache.keys();
    if (keys.length <= max) return;
    await Promise.all(keys.slice(0, keys.length - max).map(k => cache.delete(k)));
}
