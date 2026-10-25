<template>
  <q-page class="page-shell">
    <section class="container narrow-container">
      <q-card flat bordered class="profile-card">
        <q-card-section>
          <q-chip color="primary" text-color="white" icon="local_shipping" label="Truck owner" />
          <h1 class="page-title">My trucks</h1>
          <p class="text-grey-7">Operate your trucks day to day, or manage the trucks you own.</p>
        </q-card-section>

        <q-tabs
          v-model="activeTab"
          dense
          align="left"
          active-color="primary"
          indicator-color="primary"
          class="truck-owner-tabs q-px-md"
          @update:model-value="onTabChange"
        >
          <q-tab name="operate" icon="play_circle" :disable="auth.isConfigured && !ownerTrucks.hasTrucks">
            <span class="row items-center no-wrap">
              Operate
              <q-badge
                v-if="ownerOrders.submittedCount"
                color="negative"
                class="q-ml-sm"
                :label="ownerOrders.submittedCount"
              />
            </span>
          </q-tab>
          <q-tab name="manage" icon="settings" label="Manage trucks" />
        </q-tabs>

        <q-separator />

        <router-view />
      </q-card>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';
import { useOwnerOrdersStore } from '../stores/ownerOrders';
import { useOwnerTrucksStore } from '../stores/ownerTrucks';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const ownerTrucks = useOwnerTrucksStore();
const ownerOrders = useOwnerOrdersStore();

const activeTab = computed({
  get() {
    return route.name === 'truck-manage' ? 'manage' : 'operate';
  },
  set(value: 'operate' | 'manage') {
    void router.push(value === 'manage' ? '/truck/manage' : '/truck/operate');
  }
});

function onTabChange(value: 'operate' | 'manage') {
  activeTab.value = value;
}

watch(
  [() => ownerTrucks.loaded, () => ownerTrucks.hasTrucks, () => route.path],
  ([loaded, hasTrucks, path]) => {
    if (!loaded) {
      return;
    }

    if (path === '/truck' || path === '/truck/') {
      void router.replace(hasTrucks ? '/truck/operate' : '/truck/manage');
      return;
    }

    if (path.startsWith('/truck/operate') && !hasTrucks) {
      void router.replace('/truck/manage');
    }
  },
  { immediate: true }
);
</script>

<style scoped>
.truck-owner-tabs :deep(.q-tab) {
  min-height: 48px;
}
</style>
