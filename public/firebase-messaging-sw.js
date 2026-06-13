/* global importScripts, firebase, self */

// Firebase Cloud Messaging background handler.
//
// This file is served from the site root and runs in its own service worker
// context (separate from the Quasar/Workbox `sw.js`). It cannot read
// `import.meta.env`, so the Firebase config is passed as query-string params
// when the app registers this worker (see src/services/messaging.ts).

importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.14.0/firebase-messaging-compat.js');

const params = new URLSearchParams(self.location.search);

const firebaseConfig = {
  apiKey: params.get('apiKey') || undefined,
  authDomain: params.get('authDomain') || undefined,
  projectId: params.get('projectId') || undefined,
  messagingSenderId: params.get('messagingSenderId') || undefined,
  appId: params.get('appId') || undefined
};

if (firebaseConfig.projectId && firebaseConfig.messagingSenderId) {
  firebase.initializeApp(firebaseConfig);

  const messaging = firebase.messaging();

  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const title = notification.title || 'Go Fetch';
    const options = {
      body: notification.body || '',
      icon: 'icons/food-truck.svg',
      badge: 'icons/food-truck.svg',
      data: payload.data || {}
    };

    self.registration.showNotification(title, options);
  });
}

// Focus or open the app when a notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })
  );
});
