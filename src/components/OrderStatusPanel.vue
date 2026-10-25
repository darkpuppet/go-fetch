<template>
  <div class="order-status">
    <q-icon :name="iconName" :color="iconColor" size="56px" />
    <div class="text-subtitle1 text-weight-bold">Order status</div>
    <div class="order-number">{{ orderNumber }}</div>
    <q-chip dense :color="chipColor" text-color="white" :label="statusLabel" />
    <div v-if="showClock" class="order-wait-clock" :aria-label="`Approximate wait ${clock}`">{{ clock }}</div>
    <p class="text-body2 q-mb-none">{{ message }}</p>
    <div v-if="summary" class="text-body2 text-grey-7">{{ summary }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';

import { useTickingNow } from '../composables/useTickingNow';
import { subscribeToOrder } from '../services/orders';
import type { FoodOrder, OrderStatus } from '../types';
import { orderStatusLabel } from '../utils/orders';
import { formatWaitClock } from '../utils/waitTime';

const props = defineProps<{
  orderNumber: string;
  truckName: string;
  summary: string;
  notifiedOperator: boolean;
  orderId: string;
  quotedWaitMillis: number;
  placedAt: number;
}>();

const now = useTickingNow();
const live = ref<FoodOrder | null>(null);
let unsubscribe: (() => void) | null = null;

const status = computed<OrderStatus>(() => live.value?.status ?? 'submitted');
const statusLabel = computed(() => orderStatusLabel(status.value));
const showClock = computed(() => status.value === 'submitted' || status.value === 'accepted');
const targetAt = computed(() => {
  if (live.value?.estimatedReadyAt) {
    return live.value.estimatedReadyAt;
  }

  if (live.value?.createdAt && live.value.quotedWaitMillis) {
    return live.value.createdAt + live.value.quotedWaitMillis;
  }

  return props.placedAt + props.quotedWaitMillis;
});
const clock = computed(() => formatWaitClock(targetAt.value - now.value));
const iconName = computed(() => {
  if (status.value === 'ready') {
    return 'notifications_active';
  }

  if (status.value === 'completed') {
    return 'task_alt';
  }

  if (status.value === 'cancelled') {
    return 'cancel';
  }

  return 'schedule';
});
const iconColor = computed(() => {
  if (status.value === 'cancelled') {
    return 'negative';
  }

  if (status.value === 'ready' || status.value === 'completed') {
    return 'positive';
  }

  return 'primary';
});
const chipColor = computed(() => {
  if (status.value === 'cancelled') {
    return 'grey-7';
  }

  if (status.value === 'ready' || status.value === 'completed' || status.value === 'accepted') {
    return 'positive';
  }

  return 'primary';
});
const message = computed(() => {
  if (status.value === 'ready') {
    return `${props.truckName} marked your order ready. Show this number when you pick it up.`;
  }

  if (status.value === 'completed') {
    return 'This order is complete. Thanks for ordering.';
  }

  if (status.value === 'cancelled') {
    return `${props.truckName} cancelled this order.`;
  }

  if (!props.notifiedOperator) {
    return 'Approximate wait for this preview. A live order keeps updating until the truck marks it ready.';
  }

  if (live.value?.estimatedReadyAt) {
    return `Approximate wait, updating from ${props.truckName}'s current queue.`;
  }

  return `Approximate wait. ${props.truckName} will refresh this as the queue moves.`;
});

function listen(orderId: string) {
  unsubscribe?.();
  unsubscribe = null;
  live.value = null;

  if (!props.notifiedOperator || orderId.startsWith('preview-')) {
    return;
  }

  unsubscribe = subscribeToOrder(orderId, (order) => {
    live.value = order;
  });
}

watch(() => props.orderId, listen, { immediate: true });

onUnmounted(() => {
  unsubscribe?.();
});
</script>

<style scoped>
.order-status {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 8px;
}

.order-number {
  font-size: 2.5rem;
  font-weight: 800;
  letter-spacing: 0.18em;
  color: var(--q-primary);
}

.order-wait-clock {
  font-size: 2.75rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
  line-height: 1;
}
</style>
