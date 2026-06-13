import { register } from 'register-service-worker';

function notifyUpdateAvailable(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(
    new CustomEvent('go-fetch:pwa-update', {
      detail: { registration }
    })
  );
}

register(process.env.SERVICE_WORKER_FILE, {
  ready(/* registration */) {
    // Service worker is active.
  },

  registered(/* registration */) {
    // Service worker has been registered.
  },

  cached(/* registration */) {
    // Content has been cached for offline use.
  },

  updatefound(/* registration */) {
    // New content is downloading.
  },

  updated(registration) {
    notifyUpdateAvailable(registration);
  },

  offline() {
    // No internet connection; running in offline mode.
  },

  error(/* err */) {
    // console.error('Error during service worker registration:', err)
  }
});
