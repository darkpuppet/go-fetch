import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import { subscribeToOwnerOrders } from '../services/orders';
import type { FoodOrder } from '../types';

export const useOwnerOrdersStore = defineStore('ownerOrders', () => {
  const orders = ref<FoodOrder[]>([]);
  const loaded = ref(false);
  const errorMessage = ref<string | null>(null);

  let unsubscribe: (() => void) | null = null;
  let activeUid: string | null = null;
  let primed = false;
  let onIncoming: ((order: FoodOrder) => void) | null = null;
  const knownIds = new Set<string>();

  const submittedCount = computed(
    () => orders.value.filter((order) => order.status === 'submitted').length
  );

  function attach(uid: string, incoming?: (order: FoodOrder) => void) {
    if (activeUid === uid && unsubscribe) {
      onIncoming = incoming ?? onIncoming;
      return;
    }

    reset();
    activeUid = uid;
    onIncoming = incoming ?? null;
    primed = false;
    knownIds.clear();

    unsubscribe = subscribeToOwnerOrders(
      uid,
      (nextOrders, added) => {
        orders.value = nextOrders;
        loaded.value = true;
        errorMessage.value = null;

        if (!primed) {
          primed = true;

          for (const order of nextOrders) {
            knownIds.add(order.id);
          }

          return;
        }

        for (const order of added) {
          if (knownIds.has(order.id)) {
            continue;
          }

          knownIds.add(order.id);
          onIncoming?.(order);
        }
      },
      (error) => {
        errorMessage.value = error.message;
        loaded.value = true;
      }
    );
  }

  function reset() {
    unsubscribe?.();
    unsubscribe = null;
    activeUid = null;
    onIncoming = null;
    primed = false;
    knownIds.clear();
    orders.value = [];
    loaded.value = false;
    errorMessage.value = null;
  }

  return {
    orders,
    loaded,
    errorMessage,
    submittedCount,
    attach,
    reset
  };
});
