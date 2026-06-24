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

export type TruckStatus = 'Serving now' | 'On the move' | 'Closed';

export const TRUCK_STATUSES: TruckStatus[] = ['Serving now', 'On the move', 'Closed'];

export type MenuItemCategory =
  | 'Appetizers'
  | 'Mains'
  | 'Sides'
  | 'Desserts'
  | 'Drinks'
  | 'Specials';

export const MENU_ITEM_CATEGORIES: MenuItemCategory[] = [
  'Appetizers',
  'Mains',
  'Sides',
  'Desserts',
  'Drinks',
  'Specials'
];

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  price?: string;
  category?: MenuItemCategory;
};

export type FoodTruck = {
  id: string;
  name: string;
  cuisine: string;
  description?: string;
  status: TruckStatus | string;
  nextStop?: string;
  menuUrl?: string;
  menuItems?: MenuItem[];
  address?: string;
  ownerId?: string;
  location: LatLng;
  liveTracking?: boolean;
};

export type TruckOwnerInput = {
  name: string;
  cuisine: string;
  description?: string;
  status: TruckStatus;
  nextStop?: string;
  menuUrl?: string;
  menuItems: MenuItem[];
  address?: string;
  location: LatLng;
  liveTracking?: boolean;
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

export type TruckSpot = {
  id: string;
  location: LatLng;
  photoUrl: string;
  reportedBy: string;
  reporterName?: string;
  note?: string;
  truckId?: string;
  truckName?: string;
  cuisine?: string;
  address?: string;
  createdAt?: number;
  expiresAt?: number;
};

export type TruckSpotInput = {
  location: LatLng;
  photoFile: File;
  note?: string;
  truckId?: string;
  truckName?: string;
  cuisine?: string;
  address?: string;
};
