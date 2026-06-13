import { getApp } from 'firebase/app';
import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type MessagePayload,
  type Messaging
} from 'firebase/messaging';

import { firebaseConfig, isFirebaseConfigured } from './firebase';

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/** True when both Firebase and a Web Push VAPID key are configured. */
export const isPushConfigured = Boolean(isFirebaseConfigured && vapidKey);

let messagingPromise: Promise<Messaging | null> | null = null;

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!isPushConfigured) {
    return null;
  }

  if (!messagingPromise) {
    messagingPromise = isSupported().then((supported) =>
      supported ? getMessaging(getApp()) : null
    );
  }

  return messagingPromise;
}

/**
 * Registers the dedicated FCM background service worker. The Firebase config is
 * passed via query string because the worker runs in its own context and cannot
 * read `import.meta.env`.
 */
async function registerMessagingServiceWorker(): Promise<ServiceWorkerRegistration> {
  const params = new URLSearchParams({
    apiKey: firebaseConfig.apiKey ?? '',
    authDomain: firebaseConfig.authDomain ?? '',
    projectId: firebaseConfig.projectId ?? '',
    messagingSenderId: firebaseConfig.messagingSenderId ?? '',
    appId: firebaseConfig.appId ?? ''
  });

  // Use FCM's dedicated scope so this worker coexists with the Quasar/Workbox
  // service worker (which owns the root `/` scope) instead of replacing it.
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params.toString()}`, {
    scope: '/firebase-cloud-messaging-push-scope'
  });
}

/**
 * Requests notification permission and returns an FCM registration token, or
 * `null` if push is unavailable / permission is not granted.
 */
export async function enablePushNotifications(): Promise<string | null> {
  if (!isPushConfigured) {
    throw new Error('Push notifications are not configured. Add VITE_FIREBASE_VAPID_KEY to .env.local.');
  }

  const messaging = await getMessagingInstance();

  if (!messaging) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    return null;
  }

  const serviceWorkerRegistration = await registerMessagingServiceWorker();

  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration
  });

  return token || null;
}

/** Deletes the current FCM token so this device stops receiving pushes. */
export async function disablePushNotifications(): Promise<void> {
  const messaging = await getMessagingInstance();

  if (!messaging) {
    return;
  }

  try {
    await deleteToken(messaging);
  } catch {
    // Token may already be gone; ignore.
  }
}

/** Subscribes to messages received while the app is in the foreground. */
export async function onForegroundMessage(
  handler: (payload: MessagePayload) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance();

  if (!messaging) {
    return () => undefined;
  }

  return onMessage(messaging, handler);
}
