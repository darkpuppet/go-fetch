<template>
  <q-page class="page-shell">
    <section class="container narrow-container">
      <q-card flat bordered class="profile-card">
        <q-card-section>
          <q-chip color="primary" text-color="white" icon="photo_camera" label="Spot a truck" />
          <h1 class="page-title">Saw a truck on the street?</h1>
          <p class="text-grey-7">
            Snap a photo, tag the location, and help other diners find it. Spots stay on the map
            for 24 hours.
          </p>
        </q-card-section>

        <q-banner v-if="!isFirebaseConfigured" rounded class="app-banner q-mx-md q-mb-md">
          Firebase is not configured. Add your Firebase values to <code>.env.local</code> to share
          truck spots.
        </q-banner>

        <q-form @submit.prevent="submitSpot">
          <q-card-section class="q-gutter-md">
            <div>
              <div class="text-caption text-grey-7 q-mb-xs">Photo</div>
              <div class="spot-photo-field">
                <label
                  class="spot-photo-picker"
                  :class="{ 'spot-photo-picker--filled': photoPreviewUrl }"
                >
                  <input
                    ref="photoInputRef"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    class="spot-photo-input"
                    @change="handlePhotoChange"
                  />
                  <img
                    v-if="photoPreviewUrl"
                    :src="photoPreviewUrl"
                    alt="Selected truck photo preview"
                    class="spot-photo-preview"
                  />
                  <div v-else class="spot-photo-placeholder">
                    <q-icon name="photo_camera" size="40px" color="primary" />
                    <div class="text-body2 text-weight-medium">Take or choose a photo</div>
                    <div class="text-caption text-grey-7">Required · up to 5 MB</div>
                  </div>
                </label>
                <q-btn
                  v-if="photoPreviewUrl"
                  flat
                  no-caps
                  color="grey-7"
                  icon="refresh"
                  label="Choose another photo"
                  class="q-mt-sm"
                  @click="clearPhoto"
                />
              </div>
            </div>

            <div>
              <div class="text-caption text-grey-7 q-mb-xs">Location</div>
              <p class="text-body2 text-grey-7 q-mb-sm">
                Mark where the truck is. Start from your current location, then tap the map or
                drag the pin to adjust.
              </p>
              <TruckLocationPicker
                v-model="location"
                v-model:address="address"
                variant="spot"
                auto-locate
              />
            </div>

            <div>
              <q-select
                v-model="selectedTruck"
                :input-value="truckName"
                outlined
                use-input
                fill-input
                hide-selected
                input-debounce="150"
                clearable
                label="Truck name (optional)"
                hint="Pick a registered truck to notify the operator, or type a new name"
                :options="truckOptions"
                option-label="name"
                @filter="filterTruckOptions"
                @update:model-value="handleTruckSelect"
                @input-value="handleTruckNameInput"
              >
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section avatar>
                      <q-avatar color="primary" text-color="white" icon="local_shipping" />
                    </q-item-section>
                    <q-item-section>
                      <q-item-label>{{ scope.opt.name }}</q-item-label>
                      <q-item-label caption>{{ scope.opt.cuisine }}</q-item-label>
                    </q-item-section>
                  </q-item>
                </template>
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey-7">
                      No registered trucks match that name.
                    </q-item-section>
                  </q-item>
                </template>
              </q-select>

              <q-banner
                v-if="selectedTruck"
                dense
                rounded
                class="bg-blue-1 text-primary q-mt-sm"
              >
                {{ selectedTruck.name }} is registered in Go Fetch. The operator will be notified.
              </q-banner>
            </div>
            <q-input
              v-model.trim="cuisine"
              outlined
              label="Cuisine (optional)"
              placeholder="Tacos, BBQ, vegan..."
            />
            <q-input
              v-model.trim="note"
              outlined
              type="textarea"
              autogrow
              label="Note (optional)"
              placeholder="Line is short, cash only, special today..."
            />
          </q-card-section>

          <q-card-actions align="right" class="q-pa-md">
            <q-btn flat no-caps color="grey-7" label="Cancel" :to="{ name: 'map' }" />
            <q-btn
              type="submit"
              unelevated
              rounded
              color="primary"
              no-caps
              icon="share_location"
              label="Share spot"
              :loading="submitting"
              :disable="!canSubmit"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import TruckLocationPicker from '../components/TruckLocationPicker.vue';
import { isFirebaseConfigured } from '../services/firebase';
import { subscribeToFoodTrucks } from '../services/foodTrucks';
import { createTruckSpot, isValidSpotLocation } from '../services/truckSpots';
import { useAuthStore } from '../stores/auth';
import type { FoodTruck, LatLng } from '../types';

const defaultCenter: LatLng = {
  lat: Number(import.meta.env.VITE_DEFAULT_MAP_LAT) || 39.9526,
  lng: Number(import.meta.env.VITE_DEFAULT_MAP_LNG) || -75.1652
};

const auth = useAuthStore();
const router = useRouter();

const location = ref<LatLng>({ ...defaultCenter });
const address = ref('');
const truckName = ref('');
const selectedTruck = ref<FoodTruck | null>(null);
const registeredTrucks = ref<FoodTruck[]>([]);
const truckOptions = ref<FoodTruck[]>([]);
const cuisine = ref('');
const note = ref('');
const photoFile = ref<File | null>(null);
const photoPreviewUrl = ref<string | null>(null);
const photoInputRef = ref<HTMLInputElement | null>(null);
const submitting = ref(false);
let unsubscribeTrucks: (() => void) | undefined;

const canSubmit = computed(
  () =>
    isFirebaseConfigured &&
    Boolean(photoFile.value) &&
    isValidSpotLocation(location.value) &&
    !submitting.value
);

function revokePreviewUrl() {
  if (photoPreviewUrl.value) {
    URL.revokeObjectURL(photoPreviewUrl.value);
    photoPreviewUrl.value = null;
  }
}

function handlePhotoChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  revokePreviewUrl();
  photoFile.value = file ?? null;
  photoPreviewUrl.value = file ? URL.createObjectURL(file) : null;
}

function clearPhoto() {
  revokePreviewUrl();
  photoFile.value = null;

  if (photoInputRef.value) {
    photoInputRef.value.value = '';
  }
}

function filterTruckOptions(query: string, update: (callback: () => void) => void) {
  update(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) {
      truckOptions.value = registeredTrucks.value.slice(0, 8);
      return;
    }

    truckOptions.value = registeredTrucks.value
      .filter(
        (truck) =>
          truck.name.toLowerCase().includes(needle) || truck.cuisine.toLowerCase().includes(needle)
      )
      .slice(0, 8);
  });
}

function handleTruckSelect(truck: FoodTruck | null) {
  selectedTruck.value = truck;

  if (truck) {
    truckName.value = truck.name;
    cuisine.value = truck.cuisine;
  }
}

function handleTruckNameInput(value: string) {
  truckName.value = value;

  if (selectedTruck.value && value.trim() !== selectedTruck.value.name) {
    selectedTruck.value = null;
  }
}

async function submitSpot() {
  if (!auth.user || !photoFile.value) {
    return;
  }

  if (!isValidSpotLocation(location.value)) {
    Notify.create({ type: 'negative', message: 'Choose a valid location on the map.' });
    return;
  }

  submitting.value = true;

  try {
    await createTruckSpot(
      auth.user.uid,
      {
        location: location.value,
        photoFile: photoFile.value,
        truckId: selectedTruck.value?.id,
        truckName: (selectedTruck.value?.name ?? truckName.value) || undefined,
        cuisine: cuisine.value || selectedTruck.value?.cuisine || undefined,
        note: note.value || undefined,
        address: address.value || undefined
      },
      auth.profile?.displayName
    );

    const successMessage = selectedTruck.value
      ? `Thanks! ${selectedTruck.value.name} was spotted and the operator was notified.`
      : 'Thanks! Your truck spot is on the map.';

    Notify.create({ type: 'positive', message: successMessage });
    await router.push({ name: 'map' });
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to share this spot.'
    });
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  unsubscribeTrucks = subscribeToFoodTrucks((trucks, source) => {
    if (source === 'firestore') {
      registeredTrucks.value = trucks;
      truckOptions.value = trucks.slice(0, 8);
    }
  });
});

onUnmounted(() => {
  unsubscribeTrucks?.();
  revokePreviewUrl();
});
</script>

<style scoped>
.spot-photo-field {
  display: flex;
  flex-direction: column;
}

.spot-photo-picker {
  display: block;
  border: 2px dashed rgba(249, 115, 22, 0.35);
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  background: rgba(249, 115, 22, 0.04);
  transition: border-color 0.2s ease, background 0.2s ease;
}

.spot-photo-picker:hover {
  border-color: rgba(249, 115, 22, 0.65);
  background: rgba(249, 115, 22, 0.08);
}

.spot-photo-picker--filled {
  border-style: solid;
}

.spot-photo-input {
  display: none;
}

.spot-photo-placeholder {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 32px 20px;
  text-align: center;
}

.spot-photo-preview {
  display: block;
  width: 100%;
  max-height: 320px;
  object-fit: cover;
}
</style>
