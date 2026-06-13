import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { setTruckLiveTracking, updateTruckLiveLocation } from '../services/truckOwner';
import { useOwnerTrucksStore } from './ownerTrucks';
import type { LatLng } from '../types';
import { distanceBetween } from '../utils/distance';

const MIN_INTERVAL_MS = 30_000;
const MIN_DISTANCE_METERS = 40;

export const useTruckLiveTrackingStore = defineStore('truckLiveTracking', () => {
  const ownerTrucks = useOwnerTrucksStore();

  const isUpdating = ref(false);
  const errorMessage = ref<string | null>(null);
  const lastLocation = ref<LatLng | null>(null);

  let watchId: number | null = null;
  let lastSentAt = 0;
  let lastSentLocation: LatLng | null = null;
  let pendingWrite = false;
  let attached = false;

  const trackingTruck = computed(() => ownerTrucks.trackingTruck);
  const isSharing = computed(() => Boolean(trackingTruck.value));
  const truckId = computed(() => trackingTruck.value?.id ?? null);
  const truckName = computed(() => trackingTruck.value?.name ?? 'Your truck');

  function clearWatch() {
    if (watchId !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function shouldPublish(location: LatLng) {
    const elapsed = Date.now() - lastSentAt;

    if (elapsed < MIN_INTERVAL_MS) {
      if (lastSentLocation && distanceBetween(lastSentLocation, location) < MIN_DISTANCE_METERS) {
        return false;
      }
    }

    return true;
  }

  async function publishLocation(location: LatLng) {
    if (!truckId.value || pendingWrite) {
      return;
    }

    pendingWrite = true;
    isUpdating.value = true;
    errorMessage.value = null;

    try {
      await updateTruckLiveLocation(truckId.value, location);
      lastSentAt = Date.now();
      lastSentLocation = location;
      lastLocation.value = location;
    } catch (error) {
      errorMessage.value =
        error instanceof Error ? error.message : 'Unable to update live location.';
    } finally {
      pendingWrite = false;
      isUpdating.value = false;
    }
  }

  function publishCurrentPosition() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      errorMessage.value = 'Geolocation is not available on this device.';
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        void publishLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (error) => {
        errorMessage.value = error.message || 'Unable to read your current location.';
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 20_000
      }
    );
  }

  function startWatch() {
    if (watchId !== null) {
      return;
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      errorMessage.value = 'Geolocation is not available on this device.';
      return;
    }

    publishCurrentPosition();

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude
        };

        if (shouldPublish(location)) {
          void publishLocation(location);
        }
      },
      (error) => {
        errorMessage.value = error.message || 'Unable to track your location.';
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 20_000
      }
    );
  }

  function stopWatch() {
    clearWatch();
  }

  function syncWatchFromTrackingState() {
    if (trackingTruck.value) {
      startWatch();
      return;
    }

    stopWatch();
  }

  function attach() {
    if (attached) {
      syncWatchFromTrackingState();
      return;
    }

    attached = true;

    watch(
      trackingTruck,
      () => {
        syncWatchFromTrackingState();
      },
      { immediate: true }
    );
  }

  function reset() {
    stopWatch();
    isUpdating.value = false;
    errorMessage.value = null;
    lastLocation.value = null;
    lastSentAt = 0;
    lastSentLocation = null;
    pendingWrite = false;
  }

  async function setTracking(targetTruckId: string, enabled: boolean) {
    if (enabled) {
      for (const truck of ownerTrucks.trucks) {
        if (truck.liveTracking && truck.id !== targetTruckId) {
          await setTruckLiveTracking(truck.id, false);
        }
      }
    }

    await setTruckLiveTracking(targetTruckId, enabled);

    if (enabled) {
      startWatch();
      return;
    }

    stopWatch();
  }

  async function disableTracking() {
    if (!truckId.value) {
      stopWatch();
      return;
    }

    await setTracking(truckId.value, false);
  }

  function isTrackingTruck(truckIdToCheck: string) {
    return trackingTruck.value?.id === truckIdToCheck;
  }

  return {
    isSharing,
    isUpdating,
    errorMessage,
    lastLocation,
    truckName,
    attach,
    reset,
    setTracking,
    disableTracking,
    isTrackingTruck
  };
});
