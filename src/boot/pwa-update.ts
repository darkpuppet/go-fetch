import { defineBoot } from '#q-app/wrappers';
import { Dialog } from 'quasar';

type PwaUpdateEvent = CustomEvent<{ registration: ServiceWorkerRegistration }>;

export default defineBoot(() => {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return;
  }

  let promptOpen = false;
  let refreshing = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) {
      return;
    }

    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('go-fetch:pwa-update', (event) => {
    const { registration } = (event as PwaUpdateEvent).detail;

    if (promptOpen) {
      return;
    }

    promptOpen = true;

    Dialog.create({
      title: 'Update available',
      message: 'A new version of Go Fetch is ready. Update now to get the latest changes.',
      ok: {
        label: 'Update',
        color: 'primary',
        unelevated: true,
        rounded: true
      },
      cancel: {
        label: 'Later',
        flat: true,
        color: 'primary',
        noCaps: true
      },
      persistent: true
    })
      .onOk(() => {
        const waiting = registration.waiting;

        if (!waiting) {
          window.location.reload();
          return;
        }

        waiting.postMessage({ type: 'SKIP_WAITING' });
      })
      .onDismiss(() => {
        promptOpen = false;
      });
  });
});
