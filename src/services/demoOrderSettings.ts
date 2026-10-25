import { ref } from 'vue';

import type { FoodTruck } from '../types';
import { readMaxOrderDistanceMeters } from '../utils/orderDistance';
import { isFirebaseConfigured } from './firebase';

const STORAGE_KEY = 'go-fetch:demo-order-settings';

export type DemoOrderSettings = {
  ordersEnabled: boolean;
  maxOrderDistanceMeters?: number;
};

function readStoredOverrides() {
  if (typeof window === 'undefined') {
    return {} as Record<string, DemoOrderSettings>;
  }

  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as unknown;

    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return {} as Record<string, DemoOrderSettings>;
    }

    const next: Record<string, DemoOrderSettings> = {};

    for (const [truckId, value] of Object.entries(raw)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        continue;
      }

      const record = value as Record<string, unknown>;
      const settings: DemoOrderSettings = {
        ordersEnabled: record.ordersEnabled !== false
      };
      const meters = readMaxOrderDistanceMeters(record.maxOrderDistanceMeters);

      if (meters != null) {
        settings.maxOrderDistanceMeters = meters;
      }

      next[truckId] = settings;
    }

    return next;
  } catch {
    return {} as Record<string, DemoOrderSettings>;
  }
}

const overrides = ref(readStoredOverrides());

export function demoOrderSettings(truckId: string | undefined) {
  if (!truckId || isFirebaseConfigured) {
    return undefined;
  }

  return overrides.value[truckId];
}

export function setDemoOrderSettings(
  truckId: string,
  settings: { ordersEnabled: boolean; maxOrderDistanceMeters?: number | null }
) {
  const next: DemoOrderSettings = {
    ordersEnabled: settings.ordersEnabled !== false
  };
  const meters = readMaxOrderDistanceMeters(settings.maxOrderDistanceMeters);

  if (meters != null) {
    next.maxOrderDistanceMeters = meters;
  }

  overrides.value = { ...overrides.value, [truckId]: next };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides.value));
  return next;
}

/** Demo overrides win while Firebase is off. Otherwise the truck document is the source. */
export function effectiveOrderSettings(
  truck: Pick<FoodTruck, 'id' | 'ordersEnabled' | 'maxOrderDistanceMeters'> | null | undefined
) {
  const demo = demoOrderSettings(truck?.id);

  if (demo) {
    return demo;
  }

  return {
    ordersEnabled: truck?.ordersEnabled,
    maxOrderDistanceMeters: truck?.maxOrderDistanceMeters
  };
}
