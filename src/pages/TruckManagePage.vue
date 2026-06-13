<template>
  <div>
    <q-banner v-if="!auth.isConfigured" rounded class="app-banner q-ma-md">
      Firebase is not configured. Copy <code>.env.example</code> to <code>.env.local</code> first.
    </q-banner>

    <q-card-section v-if="ownerTrucks.trucks.length" class="q-gutter-sm">
      <div class="text-subtitle1 text-weight-bold">Your trucks</div>

      <q-list bordered separator class="rounded-borders">
        <q-item v-for="truck in ownerTrucks.trucks" :key="truck.id">
          <q-item-section avatar>
            <q-avatar color="primary" text-color="white" icon="local_shipping" />
          </q-item-section>
          <q-item-section>
            <q-item-label class="text-weight-bold">{{ truck.name }}</q-item-label>
            <q-item-label caption>{{ truck.cuisine }} · {{ truck.status }}</q-item-label>
          </q-item-section>
          <q-item-section side>
            <div class="row q-gutter-xs">
              <q-btn
                flat
                dense
                no-caps
                color="primary"
                label="Edit"
                @click="startEdit(truck)"
              />
              <q-btn
                flat
                dense
                round
                color="negative"
                icon="delete"
                aria-label="Remove truck"
                :loading="deletingTruckId === truck.id"
                @click="confirmDelete(truck)"
              />
            </div>
          </q-item-section>
        </q-item>
      </q-list>
    </q-card-section>

    <q-form @submit.prevent="saveTruck">
      <q-card-section class="q-gutter-md">
        <div class="text-subtitle1 text-weight-bold">
          {{ editingTruckId ? 'Edit truck' : 'Add a truck' }}
        </div>
        <p class="text-caption text-grey-7 q-mt-none">
          Register truck details here. Use Operate to set status, location, and menu while serving.
        </p>

        <q-input
          v-model.trim="form.name"
          outlined
          label="Truck name"
          :rules="[(value) => Boolean(value) || 'Truck name is required']"
        />
        <q-input
          v-model.trim="form.cuisine"
          outlined
          label="Cuisine"
          placeholder="Tacos, BBQ, pizza..."
          :rules="[(value) => Boolean(value) || 'Cuisine is required']"
        />
        <q-input
          v-model.trim="form.description"
          outlined
          type="textarea"
          autogrow
          label="Description"
          placeholder="What makes your truck special?"
        />

        <div v-if="!editingTruckId" class="text-subtitle1 text-weight-bold q-pt-sm">Starting location</div>
        <TruckLocationPicker
          v-if="!editingTruckId"
          v-model="form.location"
          v-model:address="form.address"
        />
      </q-card-section>

      <q-card-actions align="between" class="q-pa-md">
        <q-btn
          v-if="editingTruckId"
          flat
          no-caps
          color="grey-7"
          label="Cancel edit"
          @click="resetForm"
        />
        <q-btn v-else flat no-caps color="primary" icon="map" label="Back to map" to="/" />
        <q-btn
          unelevated
          rounded
          color="primary"
          type="submit"
          :loading="saving"
          :label="editingTruckId ? 'Save truck' : 'Add truck'"
        />
      </q-card-actions>
    </q-form>
  </div>
</template>

<script setup lang="ts">
import { Dialog, Notify } from 'quasar';
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import TruckLocationPicker from '../components/TruckLocationPicker.vue';
import { deleteOwnerTruck, saveOwnerTruck } from '../services/truckOwner';
import { useAuthStore } from '../stores/auth';
import { useOwnerTrucksStore } from '../stores/ownerTrucks';
import { useTruckLiveTrackingStore } from '../stores/truckLiveTracking';
import type { FoodTruck, TruckOwnerInput, TruckStatus } from '../types';
import { getDefaultMapCenter } from '../utils/googleMaps';

const auth = useAuthStore();
const ownerTrucks = useOwnerTrucksStore();
const liveTracking = useTruckLiveTrackingStore();
const router = useRouter();

const saving = ref(false);
const deletingTruckId = ref<string | null>(null);
const editingTruckId = ref<string | null>(null);

const defaultCenter = getDefaultMapCenter();

const form = reactive({
  name: '',
  cuisine: '',
  description: '',
  address: '',
  location: {
    lat: defaultCenter.lat,
    lng: defaultCenter.lng
  }
});

function resetForm() {
  editingTruckId.value = null;
  form.name = '';
  form.cuisine = '';
  form.description = '';
  form.address = '';
  form.location = { ...defaultCenter };
}

function startEdit(truck: FoodTruck) {
  editingTruckId.value = truck.id;
  form.name = truck.name;
  form.cuisine = truck.cuisine;
  form.description = truck.description || '';
  form.address = truck.address || '';
  form.location = { ...truck.location };
}

function confirmDelete(truck: FoodTruck) {
  Dialog.create({
    title: 'Remove truck?',
    message: `Remove ${truck.name} from Go Fetch? This cannot be undone.`,
    cancel: true,
    persistent: true
  }).onOk(() => {
    void removeTruck(truck);
  });
}

async function removeTruck(truck: FoodTruck) {
  deletingTruckId.value = truck.id;

  try {
    if (liveTracking.isTrackingTruck(truck.id)) {
      await liveTracking.setTracking(truck.id, false);
    }

    await deleteOwnerTruck(truck.id);

    if (editingTruckId.value === truck.id) {
      resetForm();
    }

    Notify.create({
      type: 'positive',
      message: `${truck.name} removed.`
    });

    if (!ownerTrucks.hasTrucks) {
      await router.replace('/truck/manage');
    }
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to remove truck.'
    });
  } finally {
    deletingTruckId.value = null;
  }
}

async function saveTruck() {
  if (!auth.user) {
    return;
  }

  saving.value = true;

  try {
    const existingTruck = editingTruckId.value
      ? ownerTrucks.trucks.find((truck) => truck.id === editingTruckId.value)
      : null;

    const input: TruckOwnerInput = {
      name: form.name,
      cuisine: form.cuisine,
      description: form.description || undefined,
      status: (existingTruck?.status ?? 'Serving now') as TruckStatus,
      nextStop: existingTruck?.nextStop,
      menuUrl: existingTruck?.menuUrl,
      address: form.address || existingTruck?.address,
      menuItems: existingTruck?.menuItems ?? [],
      location: existingTruck?.location ?? {
        lat: form.location.lat,
        lng: form.location.lng
      },
      liveTracking: existingTruck?.liveTracking
    };

    const truckId = await saveOwnerTruck(auth.user.uid, editingTruckId.value, input);

    if (!editingTruckId.value) {
      ownerTrucks.setSelectedTruckId(truckId);
      resetForm();
      Notify.create({
        type: 'positive',
        message: 'Truck added. Switch to Operate to start serving.'
      });
      await router.push('/truck/operate');
      return;
    }

    Notify.create({
      type: 'positive',
      message: 'Truck updated.'
    });
    resetForm();
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to save truck.'
    });
  } finally {
    saving.value = false;
  }
}
</script>
