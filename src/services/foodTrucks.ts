import {
  collection,
  onSnapshot,
  query,
  type DocumentData,
  type QueryDocumentSnapshot
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from './firebase';
import type { FoodTruck } from '../types';

export const demoFoodTrucks: FoodTruck[] = [
  {
    id: 'demo-taco-trek',
    name: 'Taco Trek',
    cuisine: 'Tacos',
    description: 'Street tacos, aguas frescas, and loaded nachos.',
    status: 'Serving now',
    nextStop: 'Love Park until 2 PM',
    location: { lat: 39.9526, lng: -75.1652 }
  },
  {
    id: 'demo-curry-cruiser',
    name: 'Curry Cruiser',
    cuisine: 'Indian',
    description: 'Butter chicken bowls and vegan chana masala.',
    status: 'Serving now',
    nextStop: 'City Hall west entrance',
    location: { lat: 39.9538, lng: -75.1635 }
  },
  {
    id: 'demo-sweet-wheels',
    name: 'Sweet Wheels',
    cuisine: 'Dessert',
    description: 'Ice cream sandwiches and espresso floats.',
    status: 'On the move',
    nextStop: 'Rittenhouse Square at 4 PM',
    location: { lat: 39.9496, lng: -75.1718 }
  }
];

function mapTruckDocument(document: QueryDocumentSnapshot<DocumentData>): FoodTruck | null {
  const data = document.data();
  const rawLocation = data.location;

  if (
    typeof data.name !== 'string' ||
    typeof data.cuisine !== 'string' ||
    !rawLocation ||
    typeof rawLocation.lat !== 'number' ||
    typeof rawLocation.lng !== 'number'
  ) {
    return null;
  }

  return {
    id: document.id,
    name: data.name,
    cuisine: data.cuisine,
    description: typeof data.description === 'string' ? data.description : undefined,
    status: typeof data.status === 'string' ? data.status : 'Serving now',
    nextStop: typeof data.nextStop === 'string' ? data.nextStop : undefined,
    location: {
      lat: rawLocation.lat,
      lng: rawLocation.lng
    }
  };
}

export function subscribeToFoodTrucks(
  onChange: (trucks: FoodTruck[], source: 'firestore' | 'demo') => void,
  onError?: (error: Error) => void
) {
  if (!isFirebaseConfigured || !db) {
    onChange(demoFoodTrucks, 'demo');
    return () => undefined;
  }

  const trucksQuery = query(collection(db, 'foodTrucks'));

  return onSnapshot(
    trucksQuery,
    (snapshot) => {
      const trucks = snapshot.docs
        .map(mapTruckDocument)
        .filter((truck): truck is FoodTruck => Boolean(truck));

      onChange(trucks.length > 0 ? trucks : demoFoodTrucks, trucks.length > 0 ? 'firestore' : 'demo');
    },
    (error) => {
      onChange(demoFoodTrucks, 'demo');
      onError?.(error);
    }
  );
}
