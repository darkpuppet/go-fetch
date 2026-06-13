import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

import { subscribeToOwnerTrucks } from '../services/truckOwner';
import type { FoodTruck } from '../types';

const SELECTED_TRUCK_KEY = 'go-fetch:operating-truck-id';

function readStoredSelectedTruckId() {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage.getItem(SELECTED_TRUCK_KEY);
}

function writeStoredSelectedTruckId(truckId: string | null) {
  if (typeof window === 'undefined') {
    return;
  }

  if (truckId) {
    window.localStorage.setItem(SELECTED_TRUCK_KEY, truckId);
    return;
  }

  window.localStorage.removeItem(SELECTED_TRUCK_KEY);
}

export const useOwnerTrucksStore = defineStore('ownerTrucks', () => {
  const trucks = ref<FoodTruck[]>([]);
  const loaded = ref(false);
  const selectedTruckId = ref<string | null>(readStoredSelectedTruckId());

  let activeUid: string | null = null;
  let unsubscribe: (() => void) | null = null;

  const hasTrucks = computed(() => trucks.value.length > 0);

  const selectedTruck = computed(() => {
    if (!trucks.value.length) {
      return null;
    }

    const selected = trucks.value.find((truck) => truck.id === selectedTruckId.value);
    return selected ?? trucks.value[0] ?? null;
  });

  const trackingTruck = computed(() => trucks.value.find((truck) => truck.liveTracking) ?? null);

  function syncSelectedTruckId() {
    if (!trucks.value.length) {
      selectedTruckId.value = null;
      return;
    }

    if (selectedTruckId.value && trucks.value.some((truck) => truck.id === selectedTruckId.value)) {
      return;
    }

    selectedTruckId.value = trucks.value[0]?.id ?? null;
  }

  function setSelectedTruckId(truckId: string | null) {
    selectedTruckId.value = truckId;
  }

  function init(uid: string) {
    if (activeUid === uid && unsubscribe) {
      return;
    }

    reset();
    activeUid = uid;

    unsubscribe = subscribeToOwnerTrucks(uid, (nextTrucks) => {
      trucks.value = nextTrucks;
      loaded.value = true;
      syncSelectedTruckId();
    });
  }

  function reset() {
    unsubscribe?.();
    unsubscribe = null;
    activeUid = null;
    trucks.value = [];
    loaded.value = false;
    selectedTruckId.value = null;
  }

  watch(selectedTruckId, (truckId) => {
    writeStoredSelectedTruckId(truckId);
  });

  return {
    trucks,
    loaded,
    hasTrucks,
    selectedTruckId,
    selectedTruck,
    trackingTruck,
    setSelectedTruckId,
    init,
    reset
  };
});
