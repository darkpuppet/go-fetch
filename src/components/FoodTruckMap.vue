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
import type { DistanceUnit, FoodTruck, LatLng, MenuItem } from '../types';
import { distanceBetween, formatDistance } from '../utils/distance';
import { groupMenuItemsByCategory } from '../utils/menuItems';

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
let hasSkippedInitialTruckPan = false;

function getInitialMapCenter() {
  return userLocation.value ?? defaultCenter;
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

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function buildMenuItemHtml(item: MenuItem) {
  const description = item.description
    ? `<small>${escapeHtml(item.description)}</small>`
    : '';
  const price = item.price
    ? `<span class="truck-menu-item-price">${escapeHtml(item.price)}</span>`
    : '';

  return `<li class="truck-menu-item">
    <div class="truck-menu-item-copy">
      <strong>${escapeHtml(item.name)}</strong>
      ${description}
    </div>
    ${price}
  </li>`;
}

function buildMenuItemsHtml(truck: FoodTruck) {
  if (!truck.menuItems?.length) {
    return '';
  }

  const previewItems = truck.menuItems.slice(0, 6);
  const groups = groupMenuItemsByCategory(previewItems);
  const sections = groups
    .map((group) => {
      const heading = group.category
        ? `<div class="truck-menu-category">${escapeHtml(group.category)}</div>`
        : '';
      const items = group.items.map((item) => buildMenuItemHtml(item)).join('');

      return `${heading}<ul class="truck-menu-items">${items}</ul>`;
    })
    .join('');

  return `<div class="truck-menu-preview">${sections}</div>`;
}

function buildInfoContent(truck: FoodTruck) {
  const description = truck.description ? `<p>${escapeHtml(truck.description)}</p>` : '';
  const nextStop = truck.nextStop ? `<small>${escapeHtml(truck.nextStop)}</small>` : '';
  const liveBadge = truck.liveTracking
    ? '<span class="truck-live-badge">Live location</span>'
    : '';
  const distance = userLocation.value
    ? `<small class="truck-distance">${formatDistance(distanceBetween(userLocation.value, truck.location), props.distanceUnit ?? 'mi')}</small>`
    : '';
  const menuLink = isSafeHttpUrl(truck.menuUrl)
    ? `<a class="truck-menu-link" href="${encodeURI(truck.menuUrl)}" target="_blank" rel="noopener noreferrer">View menu</a>`
    : '';
  const menuItems = buildMenuItemsHtml(truck);

  return `
    <div class="truck-info-window">
      <strong>${escapeHtml(truck.name)}</strong>
      <span>${escapeHtml(truck.cuisine)} · ${escapeHtml(truck.status)}</span>
      ${liveBadge}
      ${description}
      ${nextStop}
      ${distance}
      ${menuItems}
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
      center: getInitialMapCenter(),
      zoom: 14,
      disableDefaultUI: true,
      zoomControl: true,
      mapId: 'go-fetch-trucks'
    });
    infoWindow = new google.maps.InfoWindow();

    if (userLocation.value) {
      hasCenteredOnUser = true;
    }

    renderMarkers();
    renderUserMarker();
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to load Google Maps.'
    });
  }
}

function applyTruckMarkerAppearance(content: HTMLElement, truck: FoodTruck) {
  content.className = truck.liveTracking ? 'truck-marker truck-marker--live' : 'truck-marker';
  content.innerHTML = '<span class="material-icons">local_shipping</span>';
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
      applyTruckMarkerAppearance(markerContent, truck);

      marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: truck.location,
        title: truck.name,
        content: markerContent
      });

      marker.addListener('click', () => {
        const currentTruck = props.trucks.find((item) => item.id === truck.id);

        if (!currentTruck) {
          return;
        }

        infoWindow?.setContent(buildInfoContent(currentTruck));
        infoWindow?.open({ map, anchor: marker });
      });

      markers.set(truck.id, marker);
      return;
    }

    const markerContent = marker.content;

    if (markerContent instanceof HTMLElement) {
      applyTruckMarkerAppearance(markerContent, truck);
    }

    marker.position = truck.location;
  });
}

function centerMapOnUser(location: LatLng) {
  if (!map) {
    return;
  }

  map.setCenter(location);
  map.setZoom(14);
  hasCenteredOnUser = true;
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

    if (!hasCenteredOnUser) {
      centerMapOnUser(location);
    }
  },
  { immediate: true }
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

    if (!hasSkippedInitialTruckPan) {
      hasSkippedInitialTruckPan = true;
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
