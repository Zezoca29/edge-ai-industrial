// Service worker do PWA. Tres responsabilidades: mostrar a notificacao que
// chega por push, abrir a lista ao clicar nela, e responder com uma pagina de
// fallback quando a rede falha. O handler de fetch nao e enfeite: sem ele o
// Chrome nao oferece a instalacao, e sem instalacao o iOS nao entrega push.

const CACHE = 'gondola-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(OFFLINE_URL))
  );
});

self.addEventListener('push', (event) => {
  let data = { title: 'Gôndola', body: 'Novo alerta', url: '/dashboard/alerts' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch (e) {
    // Payload nao-JSON: mantem o texto padrao em vez de engolir o aviso.
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url },
      tag: 'gondola-alert'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard/alerts';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
