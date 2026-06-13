import { readonly, ref } from 'vue';

import type { LatLng } from '../types';

// Shared, reference-counted geolocation watch so the map and the truck list
// observe a single browser geolocation subscription instead of one each.
const location = ref<LatLng | null>(null);
const errorCode = ref<number | null>(null);

let watchId: number | null = null;
let refCount = 0;

function start() {
  refCount += 1;

  if (watchId !== null || typeof navigator === 'undefined' || !navigator.geolocation) {
    return;
  }

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      location.value = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      errorCode.value = null;
    },
    (error) => {
      errorCode.value = error.code;
    },
    {
      enableHighAccuracy: true,
      maximumAge: 30000,
      timeout: 15000
    }
  );
}

function stop() {
  refCount = Math.max(0, refCount - 1);

  if (refCount === 0 && watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
}

export function useUserLocation() {
  return {
    location: readonly(location),
    errorCode: readonly(errorCode),
    start,
    stop
  };
}
