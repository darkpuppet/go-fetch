<template>
  <q-item
    clickable
    v-close-popup
    v-ripple
    :disable="!ownerTrucks.hasTrucks"
    :to="ownerTrucks.hasTrucks ? '/truck/operate' : undefined"
    @click="handleOperate"
  >
    <q-item-section avatar>
      <q-icon name="play_circle" />
    </q-item-section>
    <q-item-section>
      <q-item-label>Operate</q-item-label>
      <q-item-label caption>Status, location, and menu</q-item-label>
    </q-item-section>
  </q-item>
  <q-item clickable v-close-popup v-ripple to="/truck/manage" @click="emitNavigate">
    <q-item-section avatar>
      <q-icon name="settings" />
    </q-item-section>
    <q-item-section>
      <q-item-label>Manage trucks</q-item-label>
      <q-item-label caption>Add or remove trucks you own</q-item-label>
    </q-item-section>
  </q-item>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';

import { useOwnerTrucksStore } from '../../stores/ownerTrucks';

const emit = defineEmits<{
  navigate: [];
}>();

const ownerTrucks = useOwnerTrucksStore();
const router = useRouter();

function emitNavigate() {
  emit('navigate');
}

async function handleOperate() {
  emitNavigate();

  if (!ownerTrucks.hasTrucks) {
    await router.push('/truck/manage');
    return;
  }

  await router.push('/truck/operate');
}
</script>
