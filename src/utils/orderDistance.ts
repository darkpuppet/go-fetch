import type { DistanceUnit, LatLng } from '../types';
import { distanceBetween } from './distance';

/** Smallest radius an operator can save: 0.1 km. */
export const MIN_ORDER_DISTANCE_METERS = 100;

/** Largest radius an operator can save: 50 miles. */
export const MAX_ORDER_DISTANCE_METERS = 80467;

const METERS_PER_MILE = 1609.344;
const METERS_PER_KM = 1000;

export const ORDERS_PAUSED_MESSAGE = 'This truck is not taking online orders.';
export const NEARER_TRUCK_MESSAGE = 'You need to be nearer the truck to order.';
export const CHECKING_DISTANCE_MESSAGE = 'Checking how far you are from the truck.';

export function orderDistanceBounds(unit: DistanceUnit) {
  if (unit === 'km') {
    return { min: 0.1, max: 80, suffix: 'km' };
  }

  return { min: 0.1, max: 50, suffix: 'mi' };
}

export function metersFromDistanceInput(value: number, unit: DistanceUnit) {
  const meters = unit === 'km' ? value * METERS_PER_KM : value * METERS_PER_MILE;
  return Math.round(meters);
}

export function distanceInputFromMeters(meters: number, unit: DistanceUnit) {
  const value = unit === 'km' ? meters / METERS_PER_KM : meters / METERS_PER_MILE;
  return Math.round(value * 10) / 10;
}

export function readMaxOrderDistanceMeters(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }

  const meters = Math.round(value);

  if (meters < MIN_ORDER_DISTANCE_METERS || meters > MAX_ORDER_DISTANCE_METERS) {
    return undefined;
  }

  return meters;
}

export function dinerOrderBlock(options: {
  ordersEnabled?: boolean;
  maxOrderDistanceMeters?: number;
  truckLocation?: LatLng;
  userLocation: LatLng | null;
  locationError: number | null;
}) {
  if (options.ordersEnabled === false) {
    return 'paused' as const;
  }

  if (options.maxOrderDistanceMeters == null || !options.truckLocation) {
    return null;
  }

  if (!options.userLocation) {
    return options.locationError != null ? ('too-far' as const) : ('locating' as const);
  }

  return distanceBetween(options.userLocation, options.truckLocation) > options.maxOrderDistanceMeters
    ? ('too-far' as const)
    : null;
}
