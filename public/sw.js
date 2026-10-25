/* public/sw.js — service worker écrit à la main, sans dépendance.
   Stratégies : coquille en cache d'abord, données réseau d'abord avec repli hors ligne,
   navigation avec repli sur /offline.html. Aucune réponse d'API n'est mise en cache
   au-delà de la session : le catalogue doit rester frais. */

const VERSION = 'streamtv-v3.3.0';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL = [
  '/',
  '/offline.html',
  '/css/app.css',
  '/js/app.js',
  '/js/router.js',
  '/js/api.js',
  '/js/copy.js',
  '/js/ui.js',
  '/js/prefs.js',
  '/js/player.js',
  '/js/components.js',
  '/js/views/home.js',
  '/js/views/guide.js',
  '/js/views/channel.js',
  '/js/views/favorites.js',
  '/js/views/login.js',
  '/js/views/admin.js',
  '/js/views/legal.js',
  '/js/views/error.js',
  '/js/views/error-codes.js',
  '/manifest.webmanifest',
  '/icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    // addAll échoue en bloc si une seule ressource manque : on ajoute une par une.
    await Promise.all(SHELL.map(async (url) => {
      try { await cache.add(new Request(url, { cache: 'reload' })); } catch { /* ressource facultative */ }
    }));
    await cache.add(new Request('/offline.html', { cache: 'reload' })).catch(() => {});
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => !name.startsWith(VERSION)).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting' || event.data?.type === 'skip-waiting') {
    self.skipWaiting();
  }
});

async function networkFirst(request, cacheName, { timeout = 6000 } = {}) {
  const cache = await caches.open(cacheName);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response && response.ok && request.method === 'GET') {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    clearTimeout(timer);
    const cached = await cache.match(request);
    if (cached) {
      const headers = new Headers(cached.headers);
      headers.set('X-StreamTV-Cache', 'stale');
      return new Response(await cached.blob(), { status: cached.status, headers });
    }
    throw new Error('offline');
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Les exports de fichiers et les mutations ne passent jamais par le cache.
  if (url.pathname.startsWith('/api/')) {
    if (request.headers.has('Authorization')) return;
    event.respondWith((async () => {
      try {
        return await networkFirst(request, DATA_CACHE, { timeout: 5000 });
      } catch {
        return new Response(JSON.stringify({
          error: 'Vous êtes hors ligne. Le catalogue réapparaîtra dès le retour du réseau.',
          code: 'P-09',
          requestId: 'sw-offline',
        }), { status: 503, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
      }
    })());
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(request);
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        const shell = await cache.match('/');
        if (shell) return shell;
        const offline = await cache.match('/offline.html');
        if (offline) return offline;
        return new Response('Vous êtes hors ligne.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
    return;
  }

  if (/\.(?:css|js|mjs|svg|png|jpg|jpeg|webp|woff2?|json|webmanifest)$/.test(url.pathname)
    || url.pathname.startsWith('/vendor/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE).catch(() => caches.match(request)));
  }
});
