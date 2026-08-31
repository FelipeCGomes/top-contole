const CACHE = 'stop-gastos-v12';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './firebase-config.js',
  './firebase-sync.js',
  './defaults.json',
  './manifest.webmanifest',
  './favicon.svg'
];

try {
  importScripts('./firebase-config.js');
  const config = self.STOP_GASTOS_FIREBASE_CONFIG || {};
  const configured = ['apiKey','authDomain','projectId','messagingSenderId','appId']
    .every(key => String(config[key] || '').trim());

  if (configured) {
    importScripts(
      'https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js',
      'https://www.gstatic.com/firebasejs/12.18.0/firebase-messaging-compat.js'
    );

    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage(payload => {
      const notification = payload.notification || {};
      const data = payload.data || {};
      const title = notification.title || data.title || 'Stop Gastos';
      const options = {
        body: notification.body || data.body || 'Você tem uma atualização financeira.',
        icon: './favicon.svg',
        badge: './favicon.svg',
        tag: data.tag || 'stop-gastos-finance',
        data: { url: data.url || './' }
      };
      self.registration.showNotification(title, options);
    });
  }
} catch (error) {
  // O PWA continua funcionando normalmente mesmo antes do Firebase ser configurado.
}

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(target) : undefined;
    })
  );
});

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.all(CORE.map(url => fetch(url, {cache:'reload'}).then(response => {
        if (response && response.ok) return cache.put(url, response.clone());
      }).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, {cache:'no-store'}).then(response => {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') return caches.match('./index.html');
      return Response.error();
    })
  );
});
