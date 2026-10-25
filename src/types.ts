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
  defaultWaitMillis?: number;
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
  defaultWaitMillis?: number;
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

export type TruckFoodPhoto = {
  id: string;
  truckId: string;
  photoUrl: string;
  uploadedBy: string;
  uploaderName?: string;
  caption?: string;
  createdAt?: number;
};

export type TruckFoodPhotoInput = {
  truckId: string;
  photoFile: File;
  caption?: string;
};

export type FeedbackSenderRole = 'user' | 'admin';

export const FEEDBACK_MAX_MESSAGE_LENGTH = 2000;
export const FEEDBACK_MAX_NAME_LENGTH = 80;

export type FeedbackThread = {
  id: string;
  userId: string;
  userDisplayName: string;
  lastMessage: string;
  lastMessageAt?: number;
  lastSenderRole: FeedbackSenderRole;
  unreadByAdmin: boolean;
  unreadByUser: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export type FeedbackMessage = {
  id: string;
  threadId: string;
  text: string;
  senderId: string;
  senderRole: FeedbackSenderRole;
  senderName: string;
  createdAt?: number;
};

export type FeedbackMessageInput = {
  threadId: string;
  uid: string;
  displayName: string;
  role: FeedbackSenderRole;
  text: string;
};

export const ORDER_STATUSES = ['submitted', 'accepted', 'ready', 'completed', 'cancelled'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const MAX_ORDER_LINES = 12;
export const MAX_ORDER_LINE_QUANTITY = 20;
export const MAX_ORDER_NOTE_LENGTH = 280;
export const ORDER_NUMBER_LENGTH = 5;

export type OrderLine = {
  menuItemId: string;
  name: string;
  quantity: number;
  price: string;
  category: string;
};

export type FoodOrder = {
  id: string;
  orderNumber: string;
  truckId: string;
  truckName: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  items: OrderLine[];
  note: string;
  status: OrderStatus;
  quotedWaitMillis?: number;
  readyAt?: number;
  completedAt?: number;
  estimatedReadyAt?: number;
  createdAt?: number;
  updatedAt?: number;
};

export type PlaceOrderInput = {
  truckId: string;
  truckName: string;
  ownerId?: string;
  customerId: string;
  customerName: string;
  items: OrderLine[];
  note: string;
  quotedWaitMillis?: number;
};

export type PlaceOrderResult = {
  id: string;
  orderNumber: string;
  notifiedOperator: boolean;
  quotedWaitMillis: number;
  placedAt: number;
};
