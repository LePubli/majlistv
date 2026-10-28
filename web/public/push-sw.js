/* Étape 40 — service worker des notifications dans le navigateur (Web Push).
 * Il ne fait que deux choses : afficher la notification reçue, et ouvrir la bonne page au clic.
 * Il n'intercepte aucune requête et ne garde rien en mémoire (le service worker du site installable, sw.js, est indépendant).
 * Portée dédiée (/push-scope/) : il ne contrôle aucune page. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  const title = String(d.title || 'Mejliss TV').slice(0, 120);
  event.waitUntil(self.registration.showNotification(title, {
    body: String(d.body || '').slice(0, 300),
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: String(d.kind || 'info'),
    renotify: true,
    data: { path: typeof d.path === 'string' && d.path.startsWith('/') && !d.path.startsWith('//') ? d.path : '/' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.path) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (new URL(c.url).origin === self.location.origin && 'focus' in c) {
        try { if ('navigate' in c) await c.navigate(url); } catch { /* navigation refusée : on ouvre une fenêtre */ }
        return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
