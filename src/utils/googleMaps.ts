import { setOptions } from '@googlemaps/js-api-loader';

import type { LatLng } from '../types';

let optionsConfigured = false;

export function getGoogleMapsApiKey() {
  return import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
}

export function isGoogleMapsConfigured() {
  return Boolean(getGoogleMapsApiKey());
}

export function getDefaultMapCenter(): LatLng {
  return {
    lat: Number(import.meta.env.VITE_DEFAULT_MAP_LAT) || 39.9526,
    lng: Number(import.meta.env.VITE_DEFAULT_MAP_LNG) || -75.1652
  };
}

export function ensureGoogleMapsOptions() {
  const apiKey = getGoogleMapsApiKey();

  if (!apiKey || optionsConfigured) {
    return;
  }

  setOptions({ key: apiKey, v: 'weekly' });
  optionsConfigured = true;
}

export function readLatLng(
  value: google.maps.LatLng | google.maps.LatLngLiteral | null | undefined
): LatLng | null {
  if (!value) {
    return null;
  }

  const lat = typeof value.lat === 'function' ? value.lat() : value.lat;
  const lng = typeof value.lng === 'function' ? value.lng() : value.lng;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  return { lat, lng };
}
