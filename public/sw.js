const APP_VERSION = '1.4.0';
const CACHE_NAME = `wayfable-cache-${APP_VERSION}`;

// Install: no pre-caching, let runtime caching handle it
self.addEventListener('install', () => {
  // Don't auto-activate — wait for client to send SKIP_WAITING
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Listen for SKIP_WAITING from client
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Network-only for API calls (Supabase, Google, Stripe, Anthropic)
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('maps.google') ||
    url.hostname.includes('stripe.com') ||
    url.hostname.includes('anthropic.com') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/')
  ) {
    return; // Let browser handle natively (network-only)
  }

  // Cache-first for hashed assets (JS/CSS bundles from Expo — contain hash in filename)
  if (url.pathname.match(/\/static\/.*\.[a-f0-9]{8,}\.(js|css)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Cache-first for fonts and images (immutable by nature)
  if (url.pathname.match(/\.(woff2?|ttf|eot)$/) || url.pathname.match(/\.(png|jpg|jpeg|svg|ico|webp)$/)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for HTML/navigation and unhashed JS/CSS
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match('/'))
      )
  );
});
