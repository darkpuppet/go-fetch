<template>
  <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
    <q-card v-if="truck" flat bordered class="truck-detail-dialog">
      <q-card-section class="row items-start no-wrap q-gutter-md">
        <q-avatar color="primary" text-color="white" icon="local_shipping" size="56px" />
        <div class="col">
          <div class="text-h6 text-weight-bold">{{ truck.name }}</div>
          <div class="text-body2 text-grey-7">
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
          </div>
          <div v-if="truck.nextStop" class="text-caption text-grey-7 q-mt-xs">{{ truck.nextStop }}</div>
          <div v-if="truck.description" class="text-body2 q-mt-sm">{{ truck.description }}</div>
          <a
            v-if="menuUrl"
            class="truck-menu-link q-mt-sm"
            :href="menuUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <q-icon name="restaurant_menu" size="16px" class="q-mr-xs" />View menu
          </a>
        </div>
        <q-btn flat round dense icon="close" aria-label="Close" @click="emit('update:modelValue', false)" />
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Street sightings</div>
        <p v-if="truckSightings.length === 0" class="text-body2 text-grey-7 q-mb-none">
          No recent sightings linked to this truck yet.
        </p>
        <div v-else class="photo-grid">
          <button
            v-for="spot in truckSightings"
            :key="spot.id"
            type="button"
            class="photo-grid-item"
            @click="openPreview(spot.photoUrl, spotCaption(spot), 'Street sighting')"
          >
            <img :src="spot.photoUrl" :alt="spotCaption(spot)" loading="lazy" />
            <span class="photo-grid-badge">Sighting</span>
          </button>
        </div>
      </q-card-section>

      <q-separator />

      <q-card-section>
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Food photos</div>
        <p v-if="truckFoodPhotos.length === 0" class="text-body2 text-grey-7 q-mb-none">
          No food photos yet. Be the first to share what you ordered.
        </p>
        <div v-else class="photo-grid">
          <button
            v-for="photo in truckFoodPhotos"
            :key="photo.id"
            type="button"
            class="photo-grid-item"
            @click="openPreview(photo.photoUrl, foodCaption(photo), 'Food photo')"
          >
            <img :src="photo.photoUrl" :alt="foodCaption(photo)" loading="lazy" />
            <span class="photo-grid-badge photo-grid-badge--food">Food</span>
          </button>
        </div>
      </q-card-section>

      <q-separator v-if="canUpload" />

      <q-card-section v-if="canUpload">
        <div class="text-subtitle2 text-weight-bold q-mb-sm">Share your meal</div>
        <p class="text-body2 text-grey-7 q-mb-md">
          Ate here recently? Upload a photo of your food for other diners.
        </p>

        <div class="food-upload-field">
          <label class="food-upload-picker" :class="{ 'food-upload-picker--filled': uploadPreviewUrl }">
            <input
              ref="uploadInputRef"
              type="file"
              accept="image/*"
              class="food-upload-input"
              @change="handleUploadChange"
            />
            <img
              v-if="uploadPreviewUrl"
              :src="uploadPreviewUrl"
              alt="Selected food photo preview"
              class="food-upload-preview"
            />
            <div v-else class="food-upload-placeholder">
              <q-icon name="add_a_photo" size="32px" color="primary" />
              <div class="text-body2">Choose a food photo</div>
            </div>
          </label>
        </div>

        <q-input
          v-model.trim="uploadCaption"
          outlined
          class="q-mt-md"
          label="Caption (optional)"
          placeholder="Best tacos in town..."
        />

        <q-btn
          unelevated
          rounded
          no-caps
          color="primary"
          icon="cloud_upload"
          label="Upload food photo"
          class="q-mt-md full-width"
          :loading="uploading"
          :disable="!uploadFile || uploading"
          @click="submitFoodPhoto"
        />
      </q-card-section>

      <q-card-section v-else-if="!auth.user" class="text-body2 text-grey-7">
        <router-link to="/login">Sign in</router-link> to share a food photo from this truck.
      </q-card-section>
    </q-card>
  </q-dialog>

  <q-dialog v-model="previewOpen">
    <q-card v-if="previewPhoto" flat class="photo-preview-card">
      <q-img :src="previewPhoto.url" :alt="previewPhoto.caption" fit="contain" />
      <q-card-section>
        <q-chip dense color="primary" text-color="white" :label="previewPhoto.label" />
        <div v-if="previewPhoto.caption" class="text-body2 q-mt-sm">{{ previewPhoto.caption }}</div>
      </q-card-section>
      <q-card-actions align="right">
        <q-btn flat no-caps label="Close" @click="previewOpen = false" />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, onUnmounted, ref, watch } from 'vue';

import { photosForTruck, createTruckFoodPhoto } from '../services/truckFoodPhotos';
import { spotsForTruck } from '../services/truckSpots';
import { useAuthStore } from '../stores/auth';
import type { FoodTruck, TruckFoodPhoto, TruckSpot } from '../types';

const props = defineProps<{
  modelValue: boolean;
  truck: FoodTruck | null;
  spots: TruckSpot[];
  foodPhotos: TruckFoodPhoto[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const auth = useAuthStore();

const uploadFile = ref<File | null>(null);
const uploadPreviewUrl = ref<string | null>(null);
const uploadCaption = ref('');
const uploadInputRef = ref<HTMLInputElement | null>(null);
const uploading = ref(false);
const previewOpen = ref(false);
const previewPhoto = ref<{ url: string; caption: string; label: string } | null>(null);

const truckSightings = computed(() =>
  props.truck ? spotsForTruck(props.spots, props.truck.id) : []
);

const truckFoodPhotos = computed(() =>
  props.truck ? photosForTruck(props.foodPhotos, props.truck.id) : []
);

const canUpload = computed(() => Boolean(auth.user && props.truck && auth.isConfigured));

const menuUrl = computed(() => {
  const url = props.truck?.menuUrl?.trim();

  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
});

function spotCaption(spot: TruckSpot) {
  return spot.note || spot.address || spot.reporterName || 'Street sighting';
}

function foodCaption(photo: TruckFoodPhoto) {
  return photo.caption || photo.uploaderName || 'Food photo';
}

function openPreview(url: string, caption: string, label: string) {
  previewPhoto.value = { url, caption, label };
  previewOpen.value = true;
}

function revokeUploadPreview() {
  if (uploadPreviewUrl.value) {
    URL.revokeObjectURL(uploadPreviewUrl.value);
    uploadPreviewUrl.value = null;
  }
}

function resetUploadForm() {
  revokeUploadPreview();
  uploadFile.value = null;
  uploadCaption.value = '';

  if (uploadInputRef.value) {
    uploadInputRef.value.value = '';
  }
}

function handleUploadChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];

  revokeUploadPreview();
  uploadFile.value = file ?? null;
  uploadPreviewUrl.value = file ? URL.createObjectURL(file) : null;
}

async function submitFoodPhoto() {
  if (!auth.user || !props.truck || !uploadFile.value) {
    return;
  }

  uploading.value = true;

  try {
    await createTruckFoodPhoto(
      auth.user.uid,
      {
        truckId: props.truck.id,
        photoFile: uploadFile.value,
        caption: uploadCaption.value || undefined
      },
      auth.profile?.displayName
    );

    Notify.create({ type: 'positive', message: 'Food photo uploaded. Thanks for sharing!' });
    resetUploadForm();
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to upload food photo.'
    });
  } finally {
    uploading.value = false;
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (!open) {
      resetUploadForm();
      previewOpen.value = false;
    }
  }
);

onUnmounted(() => {
  revokeUploadPreview();
});
</script>

<style scoped>
.truck-detail-dialog {
  width: min(640px, 96vw);
  max-height: 90vh;
  overflow: auto;
}

.photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 10px;
}

.photo-grid-item {
  position: relative;
  padding: 0;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  aspect-ratio: 1;
  background: rgba(15, 23, 42, 0.06);
}

.photo-grid-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.photo-grid-badge {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.88);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.photo-grid-badge--food {
  background: rgba(249, 115, 22, 0.92);
}

.food-upload-field {
  display: flex;
}

.food-upload-picker {
  display: block;
  width: 100%;
  border: 2px dashed rgba(249, 115, 22, 0.35);
  border-radius: 14px;
  overflow: hidden;
  cursor: pointer;
  background: rgba(249, 115, 22, 0.04);
}

.food-upload-picker--filled {
  border-style: solid;
}

.food-upload-input {
  display: none;
}

.food-upload-placeholder {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 24px 16px;
  text-align: center;
}

.food-upload-preview {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: cover;
}

.photo-preview-card {
  width: min(720px, 96vw);
  max-height: 90vh;
}
</style>
