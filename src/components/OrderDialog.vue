<template>
  <q-dialog :model-value="modelValue" :persistent="submitting" @update:model-value="emit('update:modelValue', $event)">
    <q-card v-if="truck" flat bordered class="order-dialog">
      <q-card-section class="row items-start no-wrap q-gutter-md">
        <q-avatar color="primary" text-color="white" icon="shopping_bag" size="56px" />
        <div class="col">
          <div class="text-h6 text-weight-bold">Order from {{ truck.name }}</div>
          <div class="text-body2 text-grey-7">{{ truck.cuisine }} · {{ truck.status }}</div>
        </div>
        <q-btn
          flat
          round
          dense
          icon="close"
          aria-label="Close order"
          :disable="submitting"
          @click="emit('update:modelValue', false)"
        />
      </q-card-section>

      <q-separator />

      <q-card-section v-if="placed" class="order-confirmation">
        <OrderStatusPanel
          :order-number="placed.orderNumber"
          :truck-name="truck.name"
          :summary="placedSummary"
          :notified-operator="placed.notifiedOperator"
          :order-id="placed.id"
          :quoted-wait-millis="placed.quotedWaitMillis"
          :placed-at="placed.placedAt"
        />
        <q-btn
          flat
          no-caps
          color="primary"
          class="q-mt-md"
          icon="content_copy"
          label="Copy order number"
          @click="copyOrderNumber"
        />
      </q-card-section>

      <template v-else>
        <q-card-section class="q-pb-none">
          <q-banner rounded class="app-banner order-wait-banner">
            <div class="order-wait-label">Estimated wait</div>
            <WaitClock :remaining-millis="remainingWait" label="Estimated wait" />
            <div class="text-body2">{{ waitCaption }}</div>
          </q-banner>
        </q-card-section>

        <q-card-section v-if="orderingClosed" class="q-pb-none">
          <q-banner rounded class="app-banner">This truck is closed right now.</q-banner>
        </q-card-section>

        <q-card-section v-if="groupedMenu.length === 0">
          <p class="text-body2 text-grey-7 q-mb-none">
            This truck has not listed menu items yet.
          </p>
        </q-card-section>

        <q-card-section v-else class="q-gutter-md">
          <div v-for="group in groupedMenu" :key="group.category ?? 'other'">
            <div v-if="group.category" class="text-caption text-weight-bold text-grey-7 q-mb-sm">
              {{ group.category }}
            </div>
            <div class="order-items">
              <div v-for="item in group.items" :key="item.id" class="order-item">
                <div class="col">
                  <div class="text-body1 text-weight-medium">{{ item.name }}</div>
                  <div v-if="item.description" class="text-caption text-grey-7">{{ item.description }}</div>
                  <div v-if="item.price" class="text-body2 text-weight-bold order-item-price">{{ item.price }}</div>
                </div>
                <div class="order-qty">
                  <q-btn
                    round
                    dense
                    flat
                    icon="remove"
                    color="primary"
                    :aria-label="`Remove one ${item.name}`"
                    :disable="quantityFor(item.id) === 0 || submitting"
                    @click="changeQuantity(item.id, -1)"
                  />
                  <span class="order-qty-value" :aria-label="`${quantityFor(item.id)} ${item.name}`">
                    {{ quantityFor(item.id) }}
                  </span>
                  <q-btn
                    round
                    dense
                    flat
                    icon="add"
                    color="primary"
                    :aria-label="`Add one ${item.name}`"
                    :disable="quantityFor(item.id) >= MAX_ORDER_LINE_QUANTITY || submitting"
                    @click="changeQuantity(item.id, 1)"
                  />
                </div>
              </div>
            </div>
          </div>

          <q-input
            v-model="note"
            outlined
            autogrow
            label="Note for the truck (optional)"
            placeholder="No onions, extra salsa..."
            :maxlength="MAX_ORDER_NOTE_LENGTH"
            :disable="submitting"
          />

          <div v-if="tooManyLines" class="text-caption text-negative">
            An order can include up to {{ MAX_ORDER_LINES }} different items.
          </div>

          <div class="row items-center justify-between">
            <div class="text-body2 text-grey-7">
              {{ itemCount }} {{ itemCount === 1 ? 'item' : 'items' }}
            </div>
            <div v-if="totalLabel" class="text-subtitle1 text-weight-bold">{{ totalLabel }}</div>
          </div>
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps label="Cancel" :disable="submitting" @click="emit('update:modelValue', false)" />
          <q-btn
            unelevated
            rounded
            no-caps
            color="primary"
            icon="send"
            :label="submitLabel"
            :loading="submitting"
            :disable="!canSubmit"
            @click="submitOrder"
          />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import OrderStatusPanel from './OrderStatusPanel.vue';
import WaitClock from './WaitClock.vue';
import { useTickingNow } from '../composables/useTickingNow';
import { demoDefaultWaitMillis } from '../services/demoDefaultWait';
import { placeOrder, subscribeToTruckOrderStats } from '../services/orders';
import { isFirebaseConfigured } from '../services/firebase';
import { useAuthStore } from '../stores/auth';
import {
  MAX_ORDER_LINE_QUANTITY,
  MAX_ORDER_LINES,
  MAX_ORDER_NOTE_LENGTH,
  type FoodTruck,
  type PlaceOrderResult
} from '../types';
import { groupMenuItemsByCategory } from '../utils/menuItems';
import { orderTotalLabel, summarizeOrderItems } from '../utils/orders';
import { quoteWaitMillis, waitQuoteCaption, type TruckWaitStats } from '../utils/waitTime';

const props = defineProps<{
  modelValue: boolean;
  truck: FoodTruck | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const auth = useAuthStore();
const router = useRouter();
const quantities = reactive<Record<string, number>>({});
const note = ref('');
const submitting = ref(false);
const placed = ref<PlaceOrderResult | null>(null);
const placedSummary = ref('');
const stats = ref<TruckWaitStats | null>(null);
const quoteAnchor = ref(Date.now());
const now = useTickingNow();
let unsubscribeStats: (() => void) | null = null;

const orderingClosed = computed(() => props.truck?.status === 'Closed');
const groupedMenu = computed(() => groupMenuItemsByCategory(props.truck?.menuItems ?? []));

const selectedLines = computed(() =>
  (props.truck?.menuItems ?? [])
    .filter((item) => quantityFor(item.id) > 0)
    .map((item) => ({
      menuItemId: item.id,
      name: item.name,
      quantity: quantityFor(item.id),
      price: item.price ?? '',
      category: item.category ?? ''
    }))
);

const itemCount = computed(() => selectedLines.value.reduce((sum, line) => sum + line.quantity, 0));
const totalLabel = computed(() =>
  selectedLines.value.length > 0 ? orderTotalLabel(selectedLines.value) : null
);
const tooManyLines = computed(() => selectedLines.value.length > MAX_ORDER_LINES);
const needsSignIn = computed(
  () => isFirebaseConfigured && Boolean(props.truck?.ownerId) && !auth.user
);
const canSubmit = computed(
  () =>
    Boolean(props.truck) &&
    !orderingClosed.value &&
    selectedLines.value.length > 0 &&
    !tooManyLines.value &&
    !submitting.value
);
const submitLabel = computed(() => {
  if (needsSignIn.value) {
    return 'Sign in to order';
  }

  return itemCount.value > 0 ? `Place order · ${itemCount.value}` : 'Place order';
});
const customerName = computed(() => {
  const name = auth.profile?.displayName?.trim();
  return name || 'Diner';
});
const truckDefaultWait = computed(() => {
  const override = demoDefaultWaitMillis(props.truck?.id);
  return override ?? props.truck?.defaultWaitMillis;
});
const quotedWait = computed(() => quoteWaitMillis(stats.value, truckDefaultWait.value));
const remainingWait = computed(() => quoteAnchor.value + quotedWait.value - now.value);
const waitCaption = computed(() => waitQuoteCaption(stats.value, truckDefaultWait.value));

function quantityFor(id: string) {
  return quantities[id] ?? 0;
}

function changeQuantity(id: string, delta: number) {
  const next = Math.min(MAX_ORDER_LINE_QUANTITY, Math.max(0, quantityFor(id) + delta));
  quantities[id] = next;
}

function resetOrder() {
  placed.value = null;
  placedSummary.value = '';
  note.value = '';

  for (const key of Object.keys(quantities)) {
    delete quantities[key];
  }
}

async function copyOrderNumber() {
  if (!placed.value) {
    return;
  }

  try {
    await navigator.clipboard.writeText(placed.value.orderNumber);
    Notify.create({ type: 'positive', message: 'Order number copied.' });
  } catch {
    Notify.create({ type: 'info', message: placed.value.orderNumber });
  }
}

async function submitOrder() {
  if (!props.truck || !canSubmit.value) {
    return;
  }

  if (needsSignIn.value) {
    await router.push({ name: 'login', query: { redirect: '/' } });
    return;
  }

  submitting.value = true;

  try {
    const lines = selectedLines.value;
    const result = await placeOrder({
      truckId: props.truck.id,
      truckName: props.truck.name,
      ownerId: props.truck.ownerId,
      customerId: auth.user?.uid ?? '',
      customerName: customerName.value,
      items: lines,
      note: note.value,
      quotedWaitMillis: quotedWait.value
    });

    placedSummary.value = summarizeOrderItems(lines);
    placed.value = result;

    Notify.create({
      type: 'positive',
      message: result.notifiedOperator
        ? `Order ${result.orderNumber} sent to ${props.truck.name}.`
        : `Order ${result.orderNumber} placed.`
    });
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to place the order.'
    });
  } finally {
    submitting.value = false;
  }
}

function listenForStats(open: boolean, truckId: string | undefined) {
  unsubscribeStats?.();
  unsubscribeStats = null;
  stats.value = null;
  quoteAnchor.value = Date.now();

  if (!open || !truckId) {
    return;
  }

  unsubscribeStats = subscribeToTruckOrderStats(truckId, (next) => {
    stats.value = next;
  });
}

watch(quotedWait, () => {
  quoteAnchor.value = Date.now();
});

watch(
  () => [props.modelValue, props.truck?.id] as const,
  ([open, truckId], previous) => {
    if (!open || (previous !== undefined && previous[1] !== truckId)) {
      resetOrder();
    }

    listenForStats(open, truckId);
  },
  { immediate: true }
);

onUnmounted(() => {
  unsubscribeStats?.();
});
</script>

<style scoped>
.order-dialog {
  width: min(560px, 96vw);
  max-height: 90vh;
  overflow: auto;
}

.order-items {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.order-item {
  display: flex;
  align-items: center;
  gap: 12px;
}

.order-item-price {
  color: var(--q-primary);
}

.order-qty {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.order-qty-value {
  min-width: 1.5rem;
  text-align: center;
  font-weight: 700;
}

.order-confirmation {
  display: grid;
  justify-items: center;
  text-align: center;
  gap: 8px;
  padding: 28px 20px 32px;
}

.order-wait-banner {
  display: grid;
  gap: 4px;
}

.order-wait-label {
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
</style>
