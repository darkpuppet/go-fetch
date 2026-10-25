import { ref } from 'vue';

import { normalizeDefaultWaitMillis } from '../utils/waitTime';
import { isFirebaseConfigured } from './firebase';

const STORAGE_KEY = 'go-fetch:demo-default-wait';

function readStoredOverrides() {
  if (typeof window === 'undefined') {
    return {} as Record<string, number>;
  }

  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as unknown;

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {} as Record<string, number>;
    }

    const next: Record<string, number> = {};

    for (const [truckId, value] of Object.entries(raw)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        next[truckId] = normalizeDefaultWaitMillis(value);
      }
    }

    return next;
  } catch {
    return {} as Record<string, number>;
  }
}

const overrides = ref(readStoredOverrides());

export function demoDefaultWaitMillis(truckId: string | undefined) {
  if (!truckId || isFirebaseConfigured) {
    return undefined;
  }

  return overrides.value[truckId];
}

export function setDemoDefaultWait(truckId: string, millis: number) {
  const normalized = normalizeDefaultWaitMillis(millis);
  overrides.value = { ...overrides.value, [truckId]: normalized };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value));
  return normalized;
}
