<template>
  <q-card flat bordered class="map-card">
    <q-card-section v-if="!isGoogleMapsConfigured" class="map-empty-state">
      <q-icon name="map" size="64px" color="primary" />
      <h2>Add a Google Maps API key</h2>
      <p>
        Set <code>VITE_GOOGLE_MAPS_API_KEY</code> in <code>.env.local</code> to load the live map.
        Truck locations are listed alongside this placeholder.
      </p>
    </q-card-section>
    <div ref="mapElement" class="google-map" :class="{ 'is-hidden': !isGoogleMapsConfigured }" />
  </q-card>
</template>

<script setup lang="ts">
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';
import { Notify } from 'quasar';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import { useUserLocation } from '../composables/useUserLocation';
import type { DistanceUnit, FoodTruck, LatLng } from '../types';
import { distanceBetween, formatDistance } from '../utils/distance';

const props = defineProps<{
  trucks: FoodTruck[];
  selectedTruckId?: string | null;
  distanceUnit?: DistanceUnit;
}>();

const googleMapsApiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const defaultCenter: LatLng = {
  lat: Number(import.meta.env.VITE_DEFAULT_MAP_LAT) || 39.9526,
  lng: Number(import.meta.env.VITE_DEFAULT_MAP_LNG) || -75.1652
};

const isGoogleMapsConfigured = computed(() => Boolean(googleMapsApiKey));
const mapElement = ref<HTMLDivElement | null>(null);
let map: google.maps.Map | null = null;
let infoWindow: google.maps.InfoWindow | null = null;
const markers = new Map<string, google.maps.marker.AdvancedMarkerElement>();

const { location: userLocation, start: startUserLocation, stop: stopUserLocation } =
  useUserLocation();
let userMarker: google.maps.marker.AdvancedMarkerElement | null = null;
let hasCenteredOnUser = false;

function getMapCenter() {
  return userLocation.value || props.trucks[0]?.location || defaultCenter;
}

function isSafeHttpUrl(url?: string): url is string {
  if (!url) {
    return false;
  }

  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function buildInfoContent(truck: FoodTruck) {
  const description = truck.description ? `<p>${truck.description}</p>` : '';
  const nextStop = truck.nextStop ? `<small>${truck.nextStop}</small>` : '';
  const distance = userLocation.value
    ? `<small class="truck-distance">${formatDistance(distanceBetween(userLocation.value, truck.location), props.distanceUnit ?? 'mi')}</small>`
    : '';
  const menuLink = isSafeHttpUrl(truck.menuUrl)
    ? `<a class="truck-menu-link" href="${encodeURI(truck.menuUrl)}" target="_blank" rel="noopener noreferrer">View menu</a>`
    : '';

  return `
    <div class="truck-info-window">
      <strong>${truck.name}</strong>
      <span>${truck.cuisine} · ${truck.status}</span>
      ${description}
      ${nextStop}
      ${distance}
      ${menuLink}
    </div>
  `;
}

async function initializeMap() {
  if (!isGoogleMapsConfigured.value || !mapElement.value || map) {
    return;
  }

  try {
    setOptions({ key: googleMapsApiKey, v: 'weekly' });
    const mapsLibrary = await importLibrary('maps');
    await importLibrary('marker');

    map = new mapsLibrary.Map(mapElement.value, {
      center: getMapCenter(),
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
      mapId: 'go-fetch-trucks'
    });
    infoWindow = new google.maps.InfoWindow();
    renderMarkers();
    renderUserMarker();
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to load Google Maps.'
    });
  }
}

function renderMarkers() {
  if (!map || !isGoogleMapsConfigured.value) {
    return;
  }

  const activeIds = new Set(props.trucks.map((truck) => truck.id));

  markers.forEach((marker, id) => {
    if (!activeIds.has(id)) {
      marker.map = null;
      markers.delete(id);
    }
  });

  props.trucks.forEach((truck) => {
    let marker = markers.get(truck.id);

    if (!marker) {
      const markerContent = document.createElement('div');
      markerContent.className = 'truck-marker';
      markerContent.innerHTML = '<span class="material-icons">local_shipping</span>';

      marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: truck.location,
        title: truck.name,
        content: markerContent
      });

      marker.addListener('click', () => {
        infoWindow?.setContent(buildInfoContent(truck));
        infoWindow?.open({ map, anchor: marker });
      });

      markers.set(truck.id, marker);
      return;
    }

    marker.position = truck.location;
  });

  if (props.trucks.length > 0) {
    map.setCenter(getMapCenter());
  }
}

function renderUserMarker() {
  if (!map || !userLocation.value) {
    return;
  }

  if (!userMarker) {
    const markerContent = document.createElement('div');
    markerContent.className = 'user-location-marker';
    markerContent.setAttribute('aria-label', 'Your location');

    userMarker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: userLocation.value,
      title: 'Your location',
      content: markerContent,
      zIndex: 1000
    });
    return;
  }

  userMarker.position = userLocation.value;
}

watch(
  userLocation,
  (location) => {
    if (!location) {
      return;
    }

    renderUserMarker();

    // Recenter on the user once, the first time we get a fix.
    if (!hasCenteredOnUser && map) {
      map.panTo(location);
      hasCenteredOnUser = true;
    }
  }
);

watch(
  () => props.trucks,
  () => renderMarkers(),
  { deep: true }
);

watch(
  () => props.selectedTruckId,
  (truckId) => {
    if (!truckId || !map) {
      return;
    }

    const truck = props.trucks.find((item) => item.id === truckId);
    const marker = markers.get(truckId);

    if (truck && marker) {
      map.panTo(truck.location);
      infoWindow?.setContent(buildInfoContent(truck));
      infoWindow?.open({ map, anchor: marker });
    }
  }
);

onMounted(async () => {
  startUserLocation();
  await nextTick();
  await initializeMap();
});

onUnmounted(() => {
  stopUserLocation();
});
</script>
