export type LatLng = {
  lat: number;
  lng: number;
};

export type DistanceUnit = 'mi' | 'km';

export type NotificationChannel = 'sms' | 'push' | 'email';

export type NotificationPreferences = {
  sms: boolean;
  push: boolean;
  email: boolean;
};

export type FoodTruck = {
  id: string;
  name: string;
  cuisine: string;
  description?: string;
  status: 'Serving now' | 'On the move' | 'Closed' | string;
  nextStop?: string;
  menuUrl?: string;
  location: LatLng;
};

export type UserProfile = {
  uid: string;
  displayName: string;
  email?: string;
  favoriteCuisine?: string;
  homeBase?: string;
  phoneNumber?: string | null;
  distanceUnit?: DistanceUnit;
  notifications?: NotificationPreferences;
  favoriteTruckIds?: string[];
  fcmTokens?: string[];
};

export type ProfileInput = Pick<
  UserProfile,
  'displayName' | 'email' | 'favoriteCuisine' | 'homeBase' | 'distanceUnit' | 'notifications'
>;
