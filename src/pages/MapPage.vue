<template>
  <q-page class="map-page page-shell">
    <section class="container map-grid">
      <div class="map-sidebar">
        <h1 class="page-title">Feeling Hungry?{{ auth.profile?.displayName ? ` ${auth.profile.displayName}` : '' }}</h1>
        <p class="text-grey-7">
          Find trucks serving nearby and check where they are headed next.
        </p>

        <q-input
          v-model.trim="searchTerm"
          outlined
          clearable
          debounce="200"
          class="truck-search q-mt-md"
          placeholder="Search trucks, tacos, BBQ..."
          aria-label="Search food trucks"
        >
          <template #prepend>
            <q-icon name="search" />
          </template>
        </q-input>

        <q-banner v-if="dataSource === 'demo'" rounded class="app-banner q-my-md">
          Showing demo trucks. Add Firebase config and food truck documents to see live data.
        </q-banner>

        <q-btn
          v-if="auth.user"
          unelevated
          rounded
          no-caps
          color="primary"
          icon="photo_camera"
          label="Spot a truck"
          class="q-mt-md full-width"
          to="/spot"
        />
        <q-btn
          v-else
          outline
          rounded
          no-caps
          color="primary"
          icon="photo_camera"
          label="Sign in to spot trucks"
          class="q-mt-md full-width"
          to="/login"
        />

        <div v-if="rankedSpots.length" class="q-mt-lg">
          <div class="text-subtitle2 text-weight-bold q-mb-sm">Recent spots nearby</div>
          <q-list bordered separator class="rounded-borders spot-list">
            <q-item
              v-for="{ spot, distanceLabel } in rankedSpots"
              :key="spot.id"
              clickable
              @click="selectedSpotId = spot.id"
            >
              <q-item-section avatar>
                <q-avatar rounded>
                  <img :src="spot.photoUrl" :alt="spot.truckName || 'Spotted truck'" />
                </q-avatar>
              </q-item-section>
              <q-item-section>
                <q-item-label class="text-weight-bold">
                  {{ spot.truckName || 'Spotted truck' }}
                </q-item-label>
                <q-item-label caption>
                  {{ spot.cuisine || 'Community spot' }}
                  <span v-if="spot.reporterName"> · {{ spot.reporterName }}</span>
                </q-item-label>
                <q-item-label v-if="spot.note" caption>{{ spot.note }}</q-item-label>
              </q-item-section>
              <q-item-section v-if="distanceLabel" side>
                <q-chip
                  dense
                  square
                  color="secondary"
                  text-color="white"
                  icon="near_me"
                  :label="distanceLabel"
                />
              </q-item-section>
            </q-item>
          </q-list>
        </div>

      </div>

      <FoodTruckMap
        class="map-panel"
        :trucks="filteredTrucks"
        :spots="spots"
        :selected-truck-id="selectedTruckId"
        :selected-spot-id="selectedSpotId"
        :distance-unit="distanceUnit"
      />

      <q-list bordered separator class="truck-list rounded-borders">
        <q-item
          v-for="{ truck, distanceLabel } in rankedTrucks"
          :key="truck.id"
          clickable
          @click="selectedTruckId = truck.id"
        >
          <q-item-section avatar>
            <q-avatar color="primary" text-color="white" icon="restaurant" />
          </q-item-section>
          <q-item-section>
            <div class="row items-center no-wrap truck-name-row">
              <q-item-label class="text-weight-bold col">{{ truck.name }}</q-item-label>
              <q-btn
                v-if="auth.user"
                flat
                round
                dense
                size="sm"
                class="truck-favorite-btn"
                :icon="isFavorite(truck.id) ? 'favorite' : 'favorite_border'"
                :color="isFavorite(truck.id) ? 'red' : 'grey-6'"
                :aria-label="isFavorite(truck.id) ? 'Remove favorite' : 'Add favorite'"
                @click.stop="toggleFavorite(truck.id)"
              />
            </div>
            <q-item-label caption>
              {{ truck.cuisine }} · {{ truck.status }}
              <q-chip
                v-if="truck.liveTracking"
                dense
                size="sm"
                class="q-ml-xs"
                color="positive"
                text-color="white"
                icon="my_location"
                label="Live"
              />
            </q-item-label>
            <q-item-label v-if="truck.nextStop" caption>{{ truck.nextStop }}</q-item-label>
            <div v-if="truck.menuItems?.length" class="truck-menu-preview q-mt-xs">
              <div
                v-for="group in groupMenuItemsByCategory(truck.menuItems)"
                :key="group.category ?? 'other'"
                class="truck-menu-preview-group"
              >
                <div v-if="group.category" class="text-caption text-weight-bold text-grey-7">
                  {{ group.category }}
                </div>
                <div
                  v-for="item in group.items"
                  :key="item.id"
                  class="truck-menu-preview-item row no-wrap items-start"
                >
                  <div class="col">
                    <div class="text-body2 text-weight-medium">{{ item.name }}</div>
                    <div v-if="item.description" class="text-caption text-grey-7">
                      {{ item.description }}
                    </div>
                  </div>
                  <div v-if="item.price" class="truck-menu-preview-price text-body2 text-weight-bold">
                    {{ item.price }}
                  </div>
                </div>
              </div>
            </div>
          </q-item-section>
          <q-item-section
            v-if="distanceLabel || truck.menuUrl"
            side
            class="truck-aside self-stretch column items-end"
          >
            <q-chip
              v-if="distanceLabel"
              dense
              square
              color="primary"
              text-color="white"
              icon="near_me"
              :label="distanceLabel"
            />
            <a
              v-if="truck.menuUrl"
              class="truck-menu-link truck-menu-link--corner"
              :href="truck.menuUrl"
              target="_blank"
              rel="noopener noreferrer"
              @click.stop
            >
              <q-icon name="restaurant_menu" size="16px" class="q-mr-xs" />View menu
            </a>
          </q-item-section>
        </q-item>

        <q-item v-if="rankedTrucks.length === 0">
          <q-item-section avatar>
            <q-avatar color="grey-3" text-color="grey-7" icon="search_off" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-bold">No trucks found</q-item-label>
            <q-item-label caption>Try a truck name, cuisine, or menu keyword.</q-item-label>
          </q-item-section>
        </q-item>
      </q-list>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';

import FoodTruckMap from '../components/FoodTruckMap.vue';
import { useUserLocation } from '../composables/useUserLocation';
import { subscribeToFoodTrucks } from '../services/foodTrucks';
import { subscribeToTruckSpots } from '../services/truckSpots';
import { useAuthStore } from '../stores/auth';
import type { FoodTruck, TruckSpot } from '../types';
import { distanceBetween, formatDistance } from '../utils/distance';
import { groupMenuItemsByCategory } from '../utils/menuItems';

const auth = useAuthStore();
const { location: userLocation, start: startUserLocation, stop: stopUserLocation } =
  useUserLocation();
const trucks = ref<FoodTruck[]>([]);
const spots = ref<TruckSpot[]>([]);
const selectedTruckId = ref<string | null>(null);
const selectedSpotId = ref<string | null>(null);
const dataSource = ref<'firestore' | 'demo'>('demo');
const searchTerm = ref('');
let unsubscribeTrucks: (() => void) | undefined;
let unsubscribeSpots: (() => void) | undefined;

const filteredTrucks = computed(() => {
  const normalizedSearch = searchTerm.value.toLowerCase().trim();

  if (!normalizedSearch) {
    return trucks.value;
  }

  return trucks.value.filter((truck) =>
    [
      truck.name,
      truck.cuisine,
      truck.description,
      truck.status,
      truck.nextStop,
      ...(truck.menuItems?.flatMap((item) => [item.name, item.description, item.price, item.category]) ??
        [])
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedSearch))
  );
});

const distanceUnit = computed(() => auth.profile?.distanceUnit ?? 'mi');

function isFavorite(truckId: string) {
  return auth.profile?.favoriteTruckIds?.includes(truckId) ?? false;
}

async function toggleFavorite(truckId: string) {
  try {
    await auth.toggleFavoriteTruck(truckId);
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to update favorites.'
    });
  }
}

const rankedTrucks = computed(() => {
  const origin = userLocation.value;

  const list = filteredTrucks.value.map((truck) => ({
    truck,
    distanceLabel: origin
      ? formatDistance(distanceBetween(origin, truck.location), distanceUnit.value)
      : null,
    distanceMeters: origin ? distanceBetween(origin, truck.location) : null
  }));

  if (origin) {
    list.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  }

  return list;
});

const rankedSpots = computed(() => {
  const origin = userLocation.value;

  const list = spots.value.map((spot) => ({
    spot,
    distanceLabel: origin
      ? formatDistance(distanceBetween(origin, spot.location), distanceUnit.value)
      : null,
    distanceMeters: origin ? distanceBetween(origin, spot.location) : null
  }));

  if (origin) {
    list.sort((a, b) => (a.distanceMeters ?? Infinity) - (b.distanceMeters ?? Infinity));
  }

  return list.slice(0, 5);
});

watch(filteredTrucks, (nextTrucks) => {
  if (nextTrucks.some((truck) => truck.id === selectedTruckId.value)) {
    return;
  }

  selectedTruckId.value = nextTrucks[0]?.id || null;
});

onMounted(() => {
  startUserLocation();
  unsubscribeTrucks = subscribeToFoodTrucks(
    (nextTrucks, source) => {
      trucks.value = nextTrucks;
      dataSource.value = source;
      selectedTruckId.value = selectedTruckId.value || nextTrucks[0]?.id || null;
    },
    (error) => {
      Notify.create({ type: 'warning', message: `Using demo trucks: ${error.message}` });
    }
  );
  unsubscribeSpots = subscribeToTruckSpots(
    (nextSpots) => {
      spots.value = nextSpots;
    },
    (error) => {
      Notify.create({ type: 'warning', message: `Unable to load truck spots: ${error.message}` });
    }
  );
});

onUnmounted(() => {
  unsubscribeTrucks?.();
  unsubscribeSpots?.();
  stopUserLocation();
});
</script>

<style scoped>
.truck-name-row {
  gap: 4px;
}

.truck-name-row .col {
  min-width: 0;
}

.truck-favorite-btn {
  flex-shrink: 0;
}

.truck-menu-preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.truck-menu-preview-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.truck-menu-preview-item {
  gap: 8px;
}

.truck-menu-preview-price {
  color: var(--q-primary);
  white-space: nowrap;
}
</style>
