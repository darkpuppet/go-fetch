<template>
  <div class="truck-location-picker">
    <q-banner v-if="readonly" rounded dense class="bg-blue-1 text-primary q-mb-sm">
      Live location sharing is updating this pin from your device GPS.
    </q-banner>

    <q-banner v-if="!isConfigured" rounded dense class="app-banner q-mb-sm">
      Add <code>VITE_GOOGLE_MAPS_API_KEY</code> to enable the map and address lookup.
      You can still mark the truck with your current GPS location below.
    </q-banner>

    <div v-if="showAddressSearch && !spotVariant" class="row q-col-gutter-sm items-start">
      <q-input
        ref="addressInputRef"
        v-model="addressQuery"
        outlined
        class="col"
        label="Street address"
        placeholder="123 Market St, Philadelphia, PA"
        hint="Choose a suggestion or verify your address"
        :loading="geocoding"
        :readonly="readonly"
        :disable="readonly"
        @keyup.enter.prevent="verifyAddress"
      />
      <q-btn
        v-if="isConfigured"
        outline
        no-caps
        color="primary"
        class="verify-address-btn"
        label="Verify"
        :loading="geocoding"
        :disable="readonly"
        @click="verifyAddress"
      />
    </div>

    <div
      v-if="isConfigured && showAddressSearch && !spotVariant && addressQuery"
      class="row items-center q-gutter-xs q-mt-xs"
    >
      <q-icon
        :name="addressVerified ? 'check_circle' : 'info'"
        :color="addressVerified ? 'positive' : 'grey-6'"
        size="18px"
      />
      <span class="text-caption" :class="addressVerified ? 'text-positive' : 'text-grey-7'">
        {{
          addressVerified
            ? 'Address matched on Google Maps.'
            : 'Pick a suggestion, verify, or drop a pin on the map.'
        }}
      </span>
    </div>

    <div v-if="!readonly && spotVariant" class="row q-col-gutter-sm q-mb-sm">
      <q-btn
        unelevated
        no-caps
        color="primary"
        icon="my_location"
        label="Use my current location"
        class="col"
        :loading="locating"
        @click="useCurrentLocation"
      />
    </div>

    <div
      v-if="isConfigured"
      ref="mapElement"
      class="location-picker-map"
      :class="{ 'q-mt-md': !spotVariant }"
      aria-label="Map to choose truck location"
    />

    <div v-if="isConfigured && !readonly" class="text-caption text-grey-7 q-mt-sm">
      {{ mapHint }}
    </div>

    <div v-if="!isConfigured && !readonly" class="text-caption text-grey-7 q-mt-sm">
      {{ gpsOnlyHint }}
    </div>

    <div v-if="showAddressSearch && spotVariant" class="row q-col-gutter-sm items-start q-mt-md">
      <q-input
        ref="addressInputRef"
        v-model="addressQuery"
        outlined
        class="col"
        label="Street address (optional)"
        placeholder="123 Market St, Philadelphia, PA"
        hint="Search an address or rely on the map pin above"
        :loading="geocoding"
        :readonly="readonly"
        :disable="readonly"
        @keyup.enter.prevent="verifyAddress"
      />
      <q-btn
        v-if="isConfigured"
        outline
        no-caps
        color="primary"
        class="verify-address-btn"
        label="Verify"
        :loading="geocoding"
        :disable="readonly"
        @click="verifyAddress"
      />
    </div>

    <div
      v-if="isConfigured && showAddressSearch && spotVariant && addressQuery"
      class="row items-center q-gutter-xs q-mt-xs"
    >
      <q-icon
        :name="addressVerified ? 'check_circle' : 'info'"
        :color="addressVerified ? 'positive' : 'grey-6'"
        size="18px"
      />
      <span class="text-caption" :class="addressVerified ? 'text-positive' : 'text-grey-7'">
        {{
          addressVerified
            ? 'Address matched on Google Maps.'
            : 'Pick a suggestion, verify, or drop a pin on the map.'
        }}
      </span>
    </div>

    <q-btn
      v-if="!readonly && !spotVariant"
      flat
      no-caps
      color="primary"
      icon="my_location"
      label="Use my current location"
      class="q-mt-sm"
      :loading="locating"
      @click="useCurrentLocation"
    />
  </div>
</template>

<script setup lang="ts">
import { importLibrary } from '@googlemaps/js-api-loader';
import { Notify } from 'quasar';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import { useUserLocation } from '../composables/useUserLocation';
import type { LatLng } from '../types';
import {
  ensureGoogleMapsOptions,
  isGoogleMapsConfigured,
  readLatLng
} from '../utils/googleMaps';

const props = withDefaults(
  defineProps<{
    modelValue: LatLng;
    address?: string;
    readonly?: boolean;
    variant?: 'operate' | 'spot';
    autoLocate?: boolean;
    showAddressSearch?: boolean;
  }>(),
  {
    variant: 'operate',
    autoLocate: false,
    showAddressSearch: true
  }
);

const emit = defineEmits<{
  'update:modelValue': [value: LatLng];
  'update:address': [value: string];
}>();

const spotVariant = computed(() => props.variant === 'spot');
const mapHint = computed(() =>
  spotVariant.value
    ? 'Tap the map or drag the pin to mark exactly where the truck is.'
    : 'Click the map or drag the pin to fine-tune where you will be serving.'
);
const gpsOnlyHint = computed(() =>
  spotVariant.value
    ? 'Use your current location above, then add a photo and share the spot.'
    : 'Use your current GPS location below.'
);

const isConfigured = computed(() => isGoogleMapsConfigured());
const addressInputRef = ref<{ $el: HTMLElement } | null>(null);
const mapElement = ref<HTMLDivElement | null>(null);
const addressQuery = ref(props.address ?? '');
const addressVerified = ref(Boolean(props.address?.trim()));
const geocoding = ref(false);
const locating = ref(false);
const hasManualPlacement = ref(false);

const { location: userLocation, start: startUserLocation, stop: stopUserLocation } =
  useUserLocation();

let map: google.maps.Map | null = null;
let marker: google.maps.marker.AdvancedMarkerElement | null = null;
let userMarker: google.maps.marker.AdvancedMarkerElement | null = null;
let autocomplete: google.maps.places.Autocomplete | null = null;
let geocoder: google.maps.Geocoder | null = null;
let mapClickListener: google.maps.MapsEventListener | null = null;
let markerDragListener: google.maps.MapsEventListener | null = null;
let autocompleteListener: google.maps.MapsEventListener | null = null;

function setMapInteractivity(enabled: boolean) {
  if (marker) {
    marker.gmpDraggable = enabled;
  }

  if (!map) {
    return;
  }

  map.setOptions({ draggable: enabled, gestureHandling: enabled ? 'auto' : 'none' });
}

function bindMapInteractions() {
  if (!map || !marker || props.readonly) {
    return;
  }

  markerDragListener?.remove();
  mapClickListener?.remove();

  markerDragListener = marker.addListener('dragend', () => {
    const location = readLatLng(marker?.position ?? null);

    if (location) {
      setMarkerPosition(location, { manual: true });
    }
  });

  mapClickListener = map.addListener('click', (event) => {
    const location = readLatLng(event.latLng ?? null);

    if (location) {
      setMarkerPosition(location, { manual: true });
    }
  });
}

function emitLocation(location: LatLng) {
  emit('update:modelValue', location);
}

function emitAddress(value: string, verified: boolean) {
  addressQuery.value = value;
  addressVerified.value = verified;
  emit('update:address', value);
}

async function reverseGeocode(location: LatLng) {
  if (!geocoder) {
    return;
  }

  try {
    const { results } = await geocoder.geocode({ location });
    const formatted = results[0]?.formatted_address;

    if (formatted) {
      emitAddress(formatted, true);
    }
  } catch {
    addressVerified.value = false;
  }
}

function setMarkerPosition(
  location: LatLng,
  options?: { reverseGeocode?: boolean; manual?: boolean }
) {
  if (props.readonly) {
    return;
  }

  if (options?.manual) {
    hasManualPlacement.value = true;
  }

  if (marker) {
    marker.position = location;
  }

  map?.panTo(location);
  emitLocation(location);

  if (options?.reverseGeocode !== false) {
    void reverseGeocode(location);
  }
}

function renderUserMarker() {
  if (!map || !userLocation.value || props.readonly) {
    if (userMarker) {
      userMarker.map = null;
      userMarker = null;
    }
    return;
  }

  if (!userMarker) {
    const markerContent = document.createElement('div');
    markerContent.className = 'location-picker-user-marker';
    markerContent.setAttribute('aria-label', 'Your location');

    userMarker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: userLocation.value,
      content: markerContent,
      zIndex: 500
    });
    return;
  }

  userMarker.position = userLocation.value;
}

async function applyAutoLocate() {
  if (!props.autoLocate || props.readonly || hasManualPlacement.value) {
    return;
  }

  startUserLocation();

  if (userLocation.value) {
    setMarkerPosition(userLocation.value);
    renderUserMarker();
    return;
  }

  await new Promise<void>((resolve) => {
    const stop = watch(
      userLocation,
      (location) => {
        if (!location || hasManualPlacement.value) {
          return;
        }

        setMarkerPosition(location);
        renderUserMarker();
        stop();
        resolve();
      },
      { immediate: true }
    );

    window.setTimeout(() => {
      stop();
      resolve();
    }, 15000);
  });
}

function setupAutocomplete() {
  const inputEl = addressInputRef.value?.$el.querySelector('input');

  if (!inputEl || autocomplete) {
    return;
  }

  autocomplete = new google.maps.places.Autocomplete(inputEl, {
    fields: ['formatted_address', 'geometry', 'place_id'],
    types: ['geocode']
  });

  autocompleteListener = autocomplete.addListener('place_changed', () => {
    const place = autocomplete?.getPlace();
    const location = readLatLng(place?.geometry?.location ?? null);

    if (!location) {
      addressVerified.value = false;
      return;
    }

    emitAddress(place?.formatted_address ?? addressQuery.value, true);
    setMarkerPosition(location, { reverseGeocode: false });
  });
}

async function initializeMap() {
  if (!isConfigured.value || !mapElement.value || map) {
    return;
  }

  try {
    ensureGoogleMapsOptions();
    const mapsLibrary = await importLibrary('maps');
    await importLibrary('marker');
    await importLibrary('places');
    const { Geocoder } = await importLibrary('geocoding');
    geocoder = new Geocoder();

    map = new mapsLibrary.Map(mapElement.value, {
      center: props.modelValue,
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
      mapId: 'go-fetch-location-picker',
      clickableIcons: false
    });

    const markerContent = document.createElement('div');
    markerContent.className = 'location-picker-marker';
    markerContent.innerHTML = '<span class="material-icons">location_on</span>';

    marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: props.modelValue,
      gmpDraggable: !props.readonly,
      content: markerContent
    });

    setMapInteractivity(!props.readonly);
    bindMapInteractions();

    await nextTick();
    setupAutocomplete();

    if (spotVariant.value || props.autoLocate) {
      startUserLocation();
      renderUserMarker();
    }

    if (!props.address?.trim() && !props.autoLocate) {
      void reverseGeocode(props.modelValue);
    }

    if (props.autoLocate) {
      await applyAutoLocate();
    }
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to load Google Maps.'
    });
  }
}

async function verifyAddress() {
  const query = addressQuery.value.trim();

  if (!query) {
    addressVerified.value = false;
    return;
  }

  if (!geocoder) {
    addressVerified.value = false;
    return;
  }

  geocoding.value = true;

  try {
    const { results } = await geocoder.geocode({ address: query });
    const result = results[0];
    const location = readLatLng(result?.geometry?.location ?? null);

    if (!location) {
      addressVerified.value = false;
      Notify.create({
        type: 'warning',
        message: 'Could not find that address on Google Maps.'
      });
      return;
    }

    emitAddress(result?.formatted_address ?? query, true);
    setMarkerPosition(location, { reverseGeocode: false });
  } catch (error) {
    addressVerified.value = false;
    Notify.create({
      type: 'warning',
      message: error instanceof Error ? error.message : 'Could not verify that address.'
    });
  } finally {
    geocoding.value = false;
  }
}

async function useCurrentLocation() {
  locating.value = true;
  hasManualPlacement.value = false;

  try {
    startUserLocation();

    const resolveLocation = (): LatLng | null => userLocation.value;

    if (resolveLocation()) {
      setMarkerPosition(resolveLocation()!);
      renderUserMarker();
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const stop = watch(
        userLocation,
        (location) => {
          if (!location) {
            return;
          }

          setMarkerPosition(location);
          renderUserMarker();
          stop();
          resolve();
        },
        { immediate: true }
      );

      window.setTimeout(() => {
        stop();
        reject(new Error('Could not determine your location.'));
      }, 15000);
    });
  } catch (error) {
    Notify.create({
      type: 'warning',
      message: error instanceof Error ? error.message : 'Could not determine your location.'
    });
  } finally {
    locating.value = false;
  }
}

watch(
  () => props.readonly,
  (readonly) => {
    setMapInteractivity(!readonly);

    if (readonly) {
      markerDragListener?.remove();
      mapClickListener?.remove();
      markerDragListener = null;
      mapClickListener = null;
      return;
    }

    bindMapInteractions();
  }
);

watch(
  () => props.modelValue,
  (location) => {
    if (!marker) {
      return;
    }

    const current = readLatLng(marker.position ?? null);

    if (current?.lat === location.lat && current?.lng === location.lng) {
      return;
    }

    marker.position = location;
    map?.panTo(location);
  },
  { deep: true }
);

watch(
  () => props.address,
  (value) => {
    if (value === undefined || value === addressQuery.value) {
      return;
    }

    addressQuery.value = value;
    addressVerified.value = Boolean(value.trim());
  }
);

watch(addressQuery, (value) => {
  emit('update:address', value.trim());

  if (!value.trim()) {
    addressVerified.value = false;
  }
});

watch(
  userLocation,
  (location) => {
    renderUserMarker();

    if (!location || !map || props.readonly || hasManualPlacement.value || !props.autoLocate) {
      return;
    }

    setMarkerPosition(location);
  },
  { immediate: true }
);

onMounted(async () => {
  if (spotVariant.value || props.autoLocate) {
    startUserLocation();
  }

  await nextTick();
  await initializeMap();
});

onUnmounted(() => {
  mapClickListener?.remove();
  markerDragListener?.remove();
  autocompleteListener?.remove();
  autocomplete = null;
  userMarker = null;
  marker = null;
  map = null;
  geocoder = null;
  stopUserLocation();
});
</script>

<style scoped>
.location-picker-map {
  width: 100%;
  height: 320px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid rgba(15, 23, 42, 0.08);
}

.verify-address-btn {
  margin-top: 8px;
}

:global(.location-picker-marker) {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: #fff7ed;
  border: 2px solid #f97316;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
  color: #ea580c;
  cursor: grab;
}

:global(.location-picker-marker .material-icons) {
  font-size: 24px;
}

:global(.location-picker-user-marker) {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: #2563eb;
  border: 3px solid #ffffff;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.28);
}

:global(.pac-container) {
  z-index: 6000;
}
</style>
