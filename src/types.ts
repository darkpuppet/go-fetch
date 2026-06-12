export type LatLng = {
  lat: number;
  lng: number;
};

export type FoodTruck = {
  id: string;
  name: string;
  cuisine: string;
  description?: string;
  status: 'Serving now' | 'On the move' | 'Closed' | string;
  nextStop?: string;
  location: LatLng;
};

export type UserProfile = {
  uid: string;
  displayName: string;
  favoriteCuisine?: string;
  homeBase?: string;
  phoneNumber?: string | null;
};

export type ProfileInput = Pick<UserProfile, 'displayName' | 'favoriteCuisine' | 'homeBase'>;
