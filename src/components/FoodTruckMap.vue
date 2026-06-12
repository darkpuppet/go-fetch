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
import { computed, nextTick, onMounted, ref, watch } from 'vue';

import type { FoodTruck, LatLng } from '../types';

const props = defineProps<{
  trucks: FoodTruck[];
  selectedTruckId?: string | null;
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

function getMapCenter() {
  return props.trucks[0]?.location || defaultCenter;
}

function buildInfoContent(truck: FoodTruck) {
  const description = truck.description ? `<p>${truck.description}</p>` : '';
  const nextStop = truck.nextStop ? `<small>${truck.nextStop}</small>` : '';

  return `
    <div class="truck-info-window">
      <strong>${truck.name}</strong>
      <span>${truck.cuisine} · ${truck.status}</span>
      ${description}
      ${nextStop}
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
  await nextTick();
  await initializeMap();
});
</script>
