/* CrysTrack service worker: public offline fallback plus signed-in push.
   NEVER cache authenticated API, finance, task, owner or Next.js HTML data. */
const CACHE_PREFIX = 'crystrack-public-offline-';
const SHELL_CACHE = CACHE_PREFIX + 'v1';
const OFFLINE_PAGE = '/offline.html';

function safeAppPath(value) {
  if (typeof value !== 'string' || !value.startsWith('/') ||
      value.startsWith('//') || value.includes('\\') || value.length > 1024) return '/';
  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin ||
        url.username || url.password ||
        url.pathname === '/sw.js' || url.pathname === '/offline.html' ||
        url.pathname === '/api' || url.pathname.startsWith('/api/') ||
        url.pathname === '/_next' || url.pathname.startsWith('/_next/')) return '/';
    return url.pathname + url.search + url.hash;
  } catch {
    return '/';
  }
}

self.addEventListener('install', event => {
  // Failing to fetch this generic public page leaves the previous SW intact.
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.add(OFFLINE_PAGE))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== SHELL_CACHE)
        .map(key => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  // Never intercept API, unsafe methods, other origins or the fallback itself.
  if (url.origin !== self.location.origin || url.pathname === OFFLINE_PAGE ||
      url.pathname === '/api' || url.pathname.startsWith('/api/')) return;
  event.respondWith(
    fetch(request).catch(async () =>
      (await caches.match(OFFLINE_PAGE)) ||
      new Response('Offline. Reconnect to load CrysTrack.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
      })),
  );
});

self.addEventListener('push', event => {
  let value = {};
  try { value = event.data ? event.data.json() : {}; }
  catch { value = {}; }
  const data = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const title = typeof data.title === 'string' ? data.title.slice(0, 120) : 'CrysTrack reminder';
  const options = {
    body: typeof data.body === 'string' ? data.body.slice(0, 300) : 'You have something that needs your attention.',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: typeof data.tag === 'string' ? data.tag.slice(0, 120) : 'crystrack-' + Date.now(),
    renotify: Boolean(data.renotify),
    data: { url: safeAppPath(data.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  // Revalidate even if notification was created by an older worker version.
  const target = new URL(safeAppPath(event.notification.data?.url), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
      for (const client of clients) {
        if ('focus' in client) {
          if ('navigate' in client) await client.navigate(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});
