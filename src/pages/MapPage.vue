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

      </div>

      <FoodTruckMap class="map-panel" :trucks="filteredTrucks" :selected-truck-id="selectedTruckId" />

      <q-list bordered separator class="truck-list rounded-borders">
        <q-item
          v-for="truck in filteredTrucks"
          :key="truck.id"
          clickable
          @click="selectedTruckId = truck.id"
        >
          <q-item-section avatar>
            <q-avatar color="primary" text-color="white" icon="restaurant" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-bold">{{ truck.name }}</q-item-label>
            <q-item-label caption>{{ truck.cuisine }} · {{ truck.status }}</q-item-label>
            <q-item-label v-if="truck.nextStop" caption>{{ truck.nextStop }}</q-item-label>
          </q-item-section>
        </q-item>

        <q-item v-if="filteredTrucks.length === 0">
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
import { subscribeToFoodTrucks } from '../services/foodTrucks';
import { useAuthStore } from '../stores/auth';
import type { FoodTruck } from '../types';

const auth = useAuthStore();
const trucks = ref<FoodTruck[]>([]);
const selectedTruckId = ref<string | null>(null);
const dataSource = ref<'firestore' | 'demo'>('demo');
const searchTerm = ref('');
let unsubscribe: (() => void) | undefined;

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
      truck.nextStop
    ]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(normalizedSearch))
  );
});

watch(filteredTrucks, (nextTrucks) => {
  if (nextTrucks.some((truck) => truck.id === selectedTruckId.value)) {
    return;
  }

  selectedTruckId.value = nextTrucks[0]?.id || null;
});

onMounted(() => {
  unsubscribe = subscribeToFoodTrucks(
    (nextTrucks, source) => {
      trucks.value = nextTrucks;
      dataSource.value = source;
      selectedTruckId.value = selectedTruckId.value || nextTrucks[0]?.id || null;
    },
    (error) => {
      Notify.create({ type: 'warning', message: `Using demo trucks: ${error.message}` });
    }
  );
});

onUnmounted(() => {
  unsubscribe?.();
});
</script>
