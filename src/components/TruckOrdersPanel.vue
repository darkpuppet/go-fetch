<template>
  <div class="q-gutter-md">
    <div class="row items-center no-wrap">
      <div class="text-subtitle1 text-weight-bold col">Orders</div>
      <q-badge
        v-if="submittedCount"
        color="negative"
        :label="`${submittedCount} new`"
      />
    </div>

    <q-banner v-if="ownerOrders.errorMessage" rounded class="app-banner">
      Unable to load orders. {{ ownerOrders.errorMessage }}
    </q-banner>

    <q-banner v-else-if="otherSubmittedCount" rounded class="app-banner">
      {{ otherSubmittedLabel }} for your other trucks. Switch trucks to view them.
    </q-banner>

    <p v-if="truckOrders.length === 0" class="text-body2 text-grey-7 q-mb-none">
      No orders for {{ truck.name }} yet. New orders show up here and notify you.
    </p>

    <div v-else class="order-list">
      <q-card
        v-for="order in truckOrders"
        :key="order.id"
        flat
        bordered
        class="incoming-order"
        :class="{ 'incoming-order--new': order.status === 'submitted' }"
      >
        <q-card-section class="q-gutter-sm">
          <div class="row items-start no-wrap">
            <div class="col">
              <div class="incoming-order-number">{{ order.orderNumber }}</div>
              <div class="text-body2">
                {{ order.customerName }}
                <span v-if="formatOrderTime(order.createdAt)" class="text-grey-7">
                  · {{ formatOrderTime(order.createdAt) }}
                </span>
              </div>
            </div>
            <q-chip dense :color="statusColor(order.status)" text-color="white" :label="orderStatusLabel(order.status)" />
          </div>

          <div class="text-body2">{{ summarizeOrderItems(order.items) }}</div>
          <div v-if="orderTotalLabel(order.items)" class="text-body2 text-weight-bold">
            {{ orderTotalLabel(order.items) }}
          </div>
          <div v-if="order.note" class="text-body2 text-grey-7">Note: {{ order.note }}</div>

          <div v-if="nextAction(order.status) || order.status === 'submitted' || order.status === 'accepted'" class="row q-gutter-sm">
            <q-btn
              v-if="nextAction(order.status)"
              unelevated
              rounded
              no-caps
              color="primary"
              :label="nextAction(order.status)?.label"
              :loading="updatingId === order.id"
              @click="applyNext(order)"
            />
            <q-btn
              v-if="order.status === 'submitted' || order.status === 'accepted'"
              flat
              no-caps
              color="negative"
              label="Cancel"
              :disable="updatingId === order.id"
              @click="setStatus(order, 'cancelled')"
            />
          </div>
        </q-card-section>
      </q-card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, ref } from 'vue';

import { updateOrderStatus } from '../services/orders';
import { useOwnerOrdersStore } from '../stores/ownerOrders';
import type { FoodOrder, FoodTruck, OrderStatus } from '../types';
import { formatOrderTime, orderStatusLabel, orderTotalLabel, summarizeOrderItems } from '../utils/orders';

const props = defineProps<{
  truck: FoodTruck;
}>();

const ownerOrders = useOwnerOrdersStore();
const updatingId = ref<string | null>(null);

const truckOrders = computed(() =>
  ownerOrders.orders.filter((order) => order.truckId === props.truck.id)
);

const submittedCount = computed(
  () => truckOrders.value.filter((order) => order.status === 'submitted').length
);

const otherSubmittedCount = computed(
  () =>
    ownerOrders.orders.filter(
      (order) => order.status === 'submitted' && order.truckId !== props.truck.id
    ).length
);

const otherSubmittedLabel = computed(() => {
  const count = otherSubmittedCount.value;
  return `${count} new ${count === 1 ? 'order' : 'orders'}`;
});

function statusColor(status: OrderStatus) {
  if (status === 'submitted') {
    return 'negative';
  }

  if (status === 'ready' || status === 'accepted') {
    return 'positive';
  }

  return 'grey-7';
}

function nextAction(status: OrderStatus): { label: string; status: OrderStatus } | null {
  if (status === 'submitted') {
    return { label: 'Accept', status: 'accepted' };
  }

  if (status === 'accepted') {
    return { label: 'Mark ready', status: 'ready' };
  }

  if (status === 'ready') {
    return { label: 'Complete', status: 'completed' };
  }

  return null;
}

function applyNext(order: FoodOrder) {
  const action = nextAction(order.status);

  if (!action) {
    return;
  }

  void setStatus(order, action.status);
}

async function setStatus(order: FoodOrder, status: OrderStatus) {
  updatingId.value = order.id;

  try {
    await updateOrderStatus(order.id, status);
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to update the order.'
    });
  } finally {
    updatingId.value = null;
  }
}
</script>

<style scoped>
.order-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 440px;
  overflow: auto;
}

.incoming-order {
  border-radius: 16px;
}

.incoming-order--new {
  border-color: rgba(220, 38, 38, 0.45);
}

.incoming-order-number {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: 0.12em;
}
</style>
