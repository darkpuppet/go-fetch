import type { DistanceUnit, LatLng } from '../types';

const EARTH_RADIUS_METERS = 6371000;
const METERS_PER_MILE = 1609.344;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Great-circle distance between two coordinates, in meters (haversine). */
export function distanceBetween(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);

  const h =
    sinLat * sinLat +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Human-friendly distance string in the requested unit (defaults to miles). */
export function formatDistance(meters: number, unit: DistanceUnit = 'mi'): string {
  if (unit === 'km') {
    const km = meters / 1000;

    if (km < 0.1) {
      return `${Math.round(meters)} m away`;
    }

    return `${km.toFixed(1)} km away`;
  }

  const miles = meters / METERS_PER_MILE;

  if (miles < 0.1) {
    return `${Math.round(meters * 3.28084)} ft away`;
  }

  return `${miles.toFixed(1)} mi away`;
}
