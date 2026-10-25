import { defineStore } from 'pinia';
import { ref } from 'vue';

import { subscribeToCustomerOrders } from '../services/orders';
import type { FoodOrder, OrderStatus } from '../types';

export const useCustomerOrdersStore = defineStore('customerOrders', () => {
  const orders = ref<FoodOrder[]>([]);
  const loaded = ref(false);
  const errorMessage = ref<string | null>(null);

  let unsubscribe: (() => void) | null = null;
  let activeUid: string | null = null;
  let primed = false;
  let onReady: ((order: FoodOrder) => void) | null = null;
  const statuses = new Map<string, OrderStatus>();

  function attach(uid: string, ready?: (order: FoodOrder) => void) {
    if (activeUid === uid && unsubscribe) {
      onReady = ready ?? onReady;
      return;
    }

    reset();
    activeUid = uid;
    onReady = ready ?? null;
    primed = false;
    statuses.clear();

    unsubscribe = subscribeToCustomerOrders(
      uid,
      (nextOrders) => {
        orders.value = nextOrders;
        loaded.value = true;
        errorMessage.value = null;

        for (const order of nextOrders) {
          const previous = statuses.get(order.id);

          if (
            primed &&
            previous &&
            previous !== 'ready' &&
            previous !== 'completed' &&
            previous !== 'cancelled' &&
            order.status === 'ready'
          ) {
            onReady?.(order);
          }

          statuses.set(order.id, order.status);
        }

        primed = true;
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
    onReady = null;
    primed = false;
    statuses.clear();
    orders.value = [];
    loaded.value = false;
    errorMessage.value = null;
  }

  return {
    orders,
    loaded,
    errorMessage,
    attach,
    reset
  };
});
