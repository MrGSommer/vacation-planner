const APP_VERSION = '1.4.0';
const CACHE_NAME = `wayfable-cache-${APP_VERSION}`;

// Install: skip waiting immediately so the new SW activates on detection
self.addEventListener('install', () => {
  self.skipWaiting();
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

// Legacy: listen for SKIP_WAITING from client (fallback if skipWaiting in install fails)
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Push notification received
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'WayFable';
  const options = {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: data.url || '/' },
    tag: data.tag || 'wayfable-notification',
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click — open the app at the right URL
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

// Fetch strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // Network-only for API calls (Supabase, Google, Stripe, Anthropic) and version check
  if (
    url.hostname.includes('supabase') ||
    url.hostname.includes('googleapis.com') ||
    url.hostname.includes('maps.google') ||
    url.hostname.includes('stripe.com') ||
    url.hostname.includes('anthropic.com') ||
    url.pathname.startsWith('/rest/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname === '/version.json'
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
