<template>
  <div>
    <q-banner v-if="!auth.isConfigured" rounded class="app-banner q-ma-md">
      Firebase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> first.
      These settings are saved on this device so diners can see them.
    </q-banner>

    <q-form v-if="!auth.isConfigured" class="q-px-md q-pb-md" @submit.prevent="saveDemoWait">
      <q-select
        :model-value="demoTruckId"
        outlined
        emit-value
        map-options
        label="Truck"
        class="q-mb-md"
        :options="demoTruckOptions"
        @update:model-value="selectDemoTruck"
      />
      <div class="text-subtitle1 text-weight-bold">Online orders</div>
      <q-toggle v-model="demoOrdersEnabled" label="Accept online orders" />
      <p class="text-body2 text-grey-7">
        Turn this off when the truck should stop taking new online orders.
      </p>
      <q-input
        v-model.number="demoMaxDistance"
        outlined
        clearable
        type="number"
        inputmode="decimal"
        label="Maximum order distance"
        :suffix="distanceBounds.suffix"
        :min="distanceBounds.min"
        :max="distanceBounds.max"
        step="0.1"
        :rules="[maxDistanceRule]"
        hint="Leave blank for no limit. Diners farther away cannot order."
        class="q-mb-md"
      />
      <div class="text-subtitle1 text-weight-bold">Default wait</div>
      <p class="text-body2 text-grey-7">
        Diners see this until the truck has finished orders. After that, the estimate uses the average time to mark an order ready.
      </p>
      <q-input
        v-model.number="demoWaitMinutes"
        outlined
        type="number"
        inputmode="numeric"
        label="Default wait"
        suffix="min"
        :min="MIN_DEFAULT_WAIT_MINUTES"
        :max="MAX_DEFAULT_WAIT_MINUTES"
        :rules="[defaultWaitRule]"
        hint="2 to 45 minutes."
      />
      <q-btn
        unelevated
        rounded
        no-caps
        color="primary"
        type="submit"
        class="q-mt-md"
        label="Save settings"
      />
    </q-form>

    <q-form v-else @submit.prevent="saveChanges">
      <q-card-section class="q-gutter-md">
        <div v-if="ownerTrucks.trucks.length > 1">
          <div class="text-subtitle1 text-weight-bold">Which truck?</div>
          <q-select
            :model-value="ownerTrucks.selectedTruckId"
            outlined
            emit-value
            map-options
            label="Truck to operate"
            :options="truckOptions"
            @update:model-value="ownerTrucks.setSelectedTruckId"
          />
        </div>

        <div v-else-if="selectedTruck" class="text-subtitle1 text-weight-bold">
          {{ selectedTruck.name }}
          <span class="text-caption text-grey-7"> · {{ selectedTruck.cuisine }}</span>
        </div>

        <template v-if="selectedTruck">
          <TruckOrdersPanel :truck="selectedTruck" />

          <q-separator />

          <div>
            <div class="text-caption text-grey-7 q-mb-xs">Status</div>
            <q-btn-toggle
              v-model="form.status"
              no-caps
              spread
              unelevated
              toggle-color="primary"
              color="grey-3"
              text-color="grey-8"
              :options="statusOptions"
            />
          </div>

          <q-input
            v-model.number="form.defaultWaitMinutes"
            outlined
            type="number"
            inputmode="numeric"
            label="Default wait"
            suffix="min"
            :min="MIN_DEFAULT_WAIT_MINUTES"
            :max="MAX_DEFAULT_WAIT_MINUTES"
            hint="Diners see this until the truck has finished orders. After that, the estimate uses the average time to mark an order ready."
            :rules="[defaultWaitRule]"
          />

          <div>
            <div class="text-subtitle1 text-weight-bold">Online orders</div>
            <q-toggle v-model="form.ordersEnabled" label="Accept online orders" />
            <div class="text-caption text-grey-7 q-mb-sm">
              Turn this off when the truck should stop taking new online orders.
            </div>
            <q-input
              v-model.number="form.maxDistance"
              outlined
              clearable
              type="number"
              inputmode="decimal"
              label="Maximum order distance"
              :suffix="distanceBounds.suffix"
              :min="distanceBounds.min"
              :max="distanceBounds.max"
              step="0.1"
              :rules="[maxDistanceRule]"
              hint="Leave blank for no limit. Diners farther away cannot order."
            />
          </div>

          <q-input
            v-model.trim="form.nextStop"
            outlined
            label="Next stop / location note"
            maxlength="200"
            placeholder="Love Park until 2 PM"
          />

          <div class="text-subtitle1 text-weight-bold q-pt-sm">Location</div>

          <TruckLocationPicker
            v-model="form.location"
            v-model:address="form.address"
            :readonly="liveTrackingEnabled"
            @update:model-value="onManualLocationChange"
          />

          <q-card flat bordered class="live-tracking-card q-mt-sm">
            <q-card-section class="row items-center no-wrap q-col-gutter-md">
              <div class="col">
                <div class="text-subtitle2">Share live location</div>
                <div class="text-caption text-grey-7">
                  Broadcast this device's GPS for {{ selectedTruck.name }} while you use Go Fetch.
                </div>
              </div>
              <q-toggle
                :model-value="liveTrackingEnabled"
                :disable="liveTrackingBusy"
                @update:model-value="onLiveTrackingToggle"
              />
            </q-card-section>

            <q-banner
              v-if="liveTrackingEnabled"
              dense
              rounded
              class="bg-positive text-white q-mx-md q-mb-md"
            >
              Live location is on for this truck. You can leave this page — sharing continues until you turn it off.
            </q-banner>

            <q-banner
              v-if="liveTrackingError"
              dense
              rounded
              class="app-banner q-mx-md q-mb-md"
            >
              {{ liveTrackingError }}
            </q-banner>
          </q-card>

          <div class="text-subtitle1 text-weight-bold q-pt-sm">
            Menu <span class="text-caption text-grey-7">(optional)</span>
          </div>

          <q-input
            v-model.trim="form.menuUrl"
            outlined
            label="Menu link (optional)"
            maxlength="500"
            type="url"
            placeholder="https://example.com/menu"
            :rules="[menuUrlRule]"
          />

          <div class="text-caption text-grey-7">
            Share a menu link, list items below, or leave this section blank.
          </div>

          <div v-if="form.menuItems.length" class="menu-items-table-wrap">
            <q-markup-table flat bordered wrap-cells class="menu-items-table">
              <thead>
                <tr>
                  <th class="menu-category-col">Category</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th class="menu-price-col">Price</th>
                  <th class="menu-actions-col" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, index) in form.menuItems" :key="item.id">
                  <td class="menu-category-col">
                    <q-select
                      v-model="item.category"
                      dense
                      outlined
                      hide-bottom-space
                      label="Category"
                      stack-label
                      clearable
                      emit-value
                      map-options
                      :options="menuCategoryOptions"
                    />
                  </td>
                  <td>
                    <q-input
                      v-model.trim="item.name"
                      dense
                      outlined
                      hide-bottom-space
                      label="Name"
                      stack-label
                      maxlength="80"
                    />
                  </td>
                  <td>
                    <q-input
                      v-model.trim="item.description"
                      dense
                      outlined
                      hide-bottom-space
                      label="Description"
                      stack-label
                      autogrow
                      maxlength="280"
                    />
                  </td>
                  <td class="menu-price-col">
                    <q-input
                      v-model.trim="item.price"
                      dense
                      outlined
                      hide-bottom-space
                      label="Price"
                      stack-label
                      placeholder="$12"
                      inputmode="decimal"
                      maxlength="24"
                    />
                  </td>
                  <td class="menu-actions-col">
                    <q-btn
                      flat
                      round
                      dense
                      color="negative"
                      icon="delete"
                      aria-label="Remove menu item"
                      @click="removeMenuItem(index)"
                    />
                  </td>
                </tr>
              </tbody>
            </q-markup-table>
          </div>

          <q-btn
            flat
            no-caps
            color="primary"
            icon="add"
            label="Add menu item"
            :disable="form.menuItems.length >= MAX_MENU_ITEMS"
            @click="addMenuItem"
          />
          <div v-if="form.menuItems.length >= MAX_MENU_ITEMS" class="text-caption text-grey-7">
            A menu can include up to {{ MAX_MENU_ITEMS }} items.
          </div>
        </template>
      </q-card-section>

      <q-card-actions v-if="selectedTruck" align="between" class="q-pa-md">
        <q-btn flat no-caps color="primary" icon="map" label="Back to map" to="/" />
        <q-btn
          unelevated
          rounded
          color="primary"
          type="submit"
          :loading="saving"
          label="Save changes"
        />
      </q-card-actions>
    </q-form>
  </div>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, reactive, ref, watch } from 'vue';

import TruckLocationPicker from '../components/TruckLocationPicker.vue';
import TruckOrdersPanel from '../components/TruckOrdersPanel.vue';
import { demoFoodTrucks } from '../services/foodTrucks';
import { demoDefaultWaitMillis, setDemoDefaultWait } from '../services/demoDefaultWait';
import { demoOrderSettings, setDemoOrderSettings } from '../services/demoOrderSettings';
import { syncTruckWaitEstimates } from '../services/orders';
import { saveOwnerTruck } from '../services/truckOwner';
import { useAuthStore } from '../stores/auth';
import { useOwnerTrucksStore } from '../stores/ownerTrucks';
import { useTruckLiveTrackingStore } from '../stores/truckLiveTracking';
import {
  MENU_ITEM_CATEGORIES,
  TRUCK_STATUSES,
  type FoodTruck,
  type LatLng,
  type MenuItem,
  type TruckOwnerInput,
  type TruckStatus
} from '../types';
import { getDefaultMapCenter } from '../utils/googleMaps';
import { MAX_MENU_ITEMS } from '../utils/menuItems';
import {
  distanceInputFromMeters,
  metersFromDistanceInput,
  orderDistanceBounds,
  readMaxOrderDistanceMeters
} from '../utils/orderDistance';
import {
  MAX_DEFAULT_WAIT_MINUTES,
  MIN_DEFAULT_WAIT_MINUTES,
  normalizeDefaultWaitMillis
} from '../utils/waitTime';

const auth = useAuthStore();
const ownerTrucks = useOwnerTrucksStore();
const liveTracking = useTruckLiveTrackingStore();

const saving = ref(false);
let syncedTruckId: string | null = null;
let syncingLiveTracking = false;

const selectedTruck = computed(() => ownerTrucks.selectedTruck);
const truckOptions = computed(() =>
  ownerTrucks.trucks.map((truck) => ({
    label: `${truck.name} · ${truck.cuisine}`,
    value: truck.id
  }))
);

const liveTrackingEnabled = computed(() =>
  selectedTruck.value ? liveTracking.isTrackingTruck(selectedTruck.value.id) : false
);
const liveTrackingBusy = computed(() => liveTracking.isUpdating);
const liveTrackingError = computed(() => liveTracking.errorMessage);

const defaultCenter = getDefaultMapCenter();
const statusOptions = TRUCK_STATUSES.map((status) => ({ label: status, value: status }));
const menuCategoryOptions = MENU_ITEM_CATEGORIES.map((category) => ({
  label: category,
  value: category
}));

const form = reactive({
  status: 'Serving now' as TruckStatus,
  nextStop: '',
  menuUrl: '',
  address: '',
  defaultWaitMinutes: 8,
  ordersEnabled: true,
  maxDistance: null as number | null,
  menuItems: [] as MenuItem[],
  location: {
    lat: defaultCenter.lat,
    lng: defaultCenter.lng
  }
});
const distanceUnit = computed(() => (auth.profile?.distanceUnit === 'km' ? 'km' : 'mi'));
const distanceBounds = computed(() => orderDistanceBounds(distanceUnit.value));
const demoTruckId = ref(demoFoodTrucks[0]?.id ?? '');
const demoWaitMinutes = ref(8);
const demoOrdersEnabled = ref(true);
const demoMaxDistance = ref<number | null>(null);

const demoTruckOptions = computed(() =>
  demoFoodTrucks.map((truck) => ({
    label: `${truck.name} · ${truck.cuisine}`,
    value: truck.id
  }))
);

function waitMinutesFor(truckId: string, stored: number | undefined) {
  const override = demoDefaultWaitMillis(truckId);
  return Math.round(normalizeDefaultWaitMillis(override ?? stored) / 60000);
}

function maxDistanceRule(value: number | string | null) {
  if (value === '' || value === null || value === undefined) {
    return true;
  }

  const text = String(value).trim();
  const bounds = distanceBounds.value;

  if (!/^\d+(\.\d)?$/.test(text)) {
    return `Enter a distance from ${bounds.min} to ${bounds.max} ${bounds.suffix}, or leave it blank.`;
  }

  const parsed = Number(text);

  if (parsed < bounds.min || parsed > bounds.max) {
    return `Enter a distance from ${bounds.min} to ${bounds.max} ${bounds.suffix}, or leave it blank.`;
  }

  const meters = metersFromDistanceInput(parsed, distanceUnit.value);

  if (!readMaxOrderDistanceMeters(meters)) {
    return `Enter a distance from ${bounds.min} to ${bounds.max} ${bounds.suffix}, or leave it blank.`;
  }

  return true;
}

function metersForDistanceInput(value: number | string | null) {
  if (maxDistanceRule(value) !== true || value === '' || value === null || value === undefined) {
    return null;
  }

  return metersFromDistanceInput(Number(value), distanceUnit.value);
}

function defaultWaitRule(value: number | string | null) {
  const minutes = typeof value === 'number' ? value : Number(value);

  if (!Number.isInteger(minutes) || minutes < MIN_DEFAULT_WAIT_MINUTES || minutes > MAX_DEFAULT_WAIT_MINUTES) {
    return `Enter a whole number from ${MIN_DEFAULT_WAIT_MINUTES} to ${MAX_DEFAULT_WAIT_MINUTES}.`;
  }

  return true;
}

function applyDemoTruck(truckId: string) {
  const truck = demoFoodTrucks.find((item) => item.id === truckId);
  const settings = demoOrderSettings(truckId);

  demoTruckId.value = truckId;
  demoWaitMinutes.value = waitMinutesFor(truckId, truck?.defaultWaitMillis);
  demoOrdersEnabled.value = settings ? settings.ordersEnabled : true;
  demoMaxDistance.value =
    settings?.maxOrderDistanceMeters != null
      ? distanceInputFromMeters(settings.maxOrderDistanceMeters, distanceUnit.value)
      : null;
}

function selectDemoTruck(truckId: string | null) {
  if (!truckId) {
    return;
  }

  applyDemoTruck(truckId);
}

function saveDemoWait() {
  const truck = demoFoodTrucks.find((item) => item.id === demoTruckId.value);

  if (!truck || defaultWaitRule(demoWaitMinutes.value) !== true || maxDistanceRule(demoMaxDistance.value) !== true) {
    return;
  }

  setDemoDefaultWait(truck.id, demoWaitMinutes.value * 60000);
  setDemoOrderSettings(truck.id, {
    ordersEnabled: demoOrdersEnabled.value,
    maxOrderDistanceMeters: metersForDistanceInput(demoMaxDistance.value)
  });

  const distance = metersForDistanceInput(demoMaxDistance.value);
  const distanceLabel =
    distance == null
      ? 'with no distance limit'
      : `within ${distanceInputFromMeters(distance, distanceUnit.value)} ${distanceBounds.value.suffix}`;

  Notify.create({
    type: 'positive',
    message: demoOrdersEnabled.value
      ? `${truck.name} is taking online orders ${distanceLabel}.`
      : `${truck.name} is not taking online orders.`
  });
}

applyDemoTruck(demoTruckId.value);

const menuUrlRule = (value: string) => {
  if (!value) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' || 'Enter a valid http(s) URL.';
  } catch {
    return 'Enter a valid http(s) URL.';
  }
};

function syncFormFromTruck(truck: FoodTruck) {
  form.status = (TRUCK_STATUSES.includes(truck.status as TruckStatus)
    ? truck.status
    : 'Serving now') as TruckStatus;
  form.defaultWaitMinutes = Math.round(normalizeDefaultWaitMillis(truck.defaultWaitMillis) / 60000);
  form.ordersEnabled = truck.ordersEnabled !== false;
  form.maxDistance =
    truck.maxOrderDistanceMeters != null
      ? distanceInputFromMeters(truck.maxOrderDistanceMeters, distanceUnit.value)
      : null;
  form.nextStop = truck.nextStop || '';
  form.menuUrl = truck.menuUrl || '';
  form.address = truck.address || '';
  form.menuItems =
    truck.menuItems?.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? '',
      price: item.price ?? '',
      category: item.category
    })) ?? [];
  form.location = { ...truck.location };
}

function createMenuItem(): MenuItem {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    price: ''
  };
}

function addMenuItem() {
  form.menuItems.push(createMenuItem());
}

function removeMenuItem(index: number) {
  form.menuItems.splice(index, 1);
}

async function disableLiveTracking(message?: string) {
  if (!liveTrackingEnabled.value || !selectedTruck.value) {
    return;
  }

  syncingLiveTracking = true;

  try {
    await liveTracking.setTracking(selectedTruck.value.id, false);
  } catch (error) {
    Notify.create({
      type: 'warning',
      message: error instanceof Error ? error.message : 'Unable to stop live location sharing.'
    });
  } finally {
    syncingLiveTracking = false;
  }

  if (message) {
    Notify.create({ type: 'info', message });
  }
}

async function onLiveTrackingToggle(enabled: boolean) {
  if (!selectedTruck.value) {
    return;
  }

  try {
    await liveTracking.setTracking(selectedTruck.value.id, enabled);

    Notify.create({
      type: 'positive',
      message: enabled ? 'Live location sharing is on.' : 'Live location sharing is off.'
    });
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to update live location sharing.'
    });
  }
}

function onManualLocationChange(location: LatLng) {
  form.location = { ...location };

  if (liveTrackingEnabled.value && !syncingLiveTracking) {
    void disableLiveTracking('Manual location set. Live sharing turned off.');
  }
}

async function saveChanges() {
  if (!auth.user || !selectedTruck.value) {
    return;
  }

  const minutes = Number(form.defaultWaitMinutes);

  if (defaultWaitRule(minutes) !== true || maxDistanceRule(form.maxDistance) !== true) {
    return;
  }

  saving.value = true;

  try {
    const truck = selectedTruck.value;
    const input: TruckOwnerInput = {
      name: truck.name,
      cuisine: truck.cuisine,
      description: truck.description,
      status: form.status,
      nextStop: form.nextStop || undefined,
      menuUrl: form.menuUrl || undefined,
      address: form.address || undefined,
      menuItems: form.menuItems
        .filter((item) => item.name.trim())
        .map((item) => ({
          id: item.id,
          name: item.name.trim(),
          description: item.description.trim(),
          price: item.price.trim(),
          category: item.category
        })),
      location: {
        lat: form.location.lat,
        lng: form.location.lng
      },
      liveTracking: liveTrackingEnabled.value,
      defaultWaitMillis: minutes * 60000,
      ordersEnabled: form.ordersEnabled,
      maxOrderDistanceMeters: metersForDistanceInput(form.maxDistance)
    };

    await saveOwnerTruck(auth.user.uid, truck.id, input);
    await syncTruckWaitEstimates(auth.user.uid, truck.id);

    Notify.create({
      type: 'positive',
      message: 'Truck updated.'
    });
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to save truck.'
    });
  } finally {
    saving.value = false;
  }
}

watch(
  selectedTruck,
  (truck) => {
    if (!truck) {
      syncedTruckId = null;
      return;
    }

    const shouldSyncForm = syncedTruckId !== truck.id;
    syncedTruckId = truck.id;

    if (shouldSyncForm) {
      syncFormFromTruck(truck);
    } else if (truck.liveTracking) {
      form.location = { ...truck.location };
    }
  },
  { immediate: true }
);

watch(
  () => liveTracking.lastLocation,
  (location) => {
    if (location && liveTrackingEnabled.value) {
      form.location = { ...location };
    }
  }
);
</script>

<style scoped>
.menu-items-table-wrap {
  overflow-x: auto;
}

.menu-items-table {
  min-width: 720px;
}

.menu-category-col {
  width: 150px;
  min-width: 150px;
}

.menu-items-table th,
.menu-items-table td {
  vertical-align: top;
}

.menu-price-col {
  width: 120px;
  min-width: 120px;
}

.menu-actions-col {
  width: 48px;
  min-width: 48px;
  text-align: center;
}

.live-tracking-card {
  border-radius: 16px;
}
</style>
