import {
  collection,
  onSnapshot,
  query,
  type DocumentData,
  type QueryDocumentSnapshot
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from './firebase';
import demoFoodTrucksData from '../data/demo-food-trucks.json';
import type { FoodTruck } from '../types';

export const demoFoodTrucks: FoodTruck[] = demoFoodTrucksData as FoodTruck[];

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
    menuUrl: typeof data.menuUrl === 'string' ? data.menuUrl : undefined,
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
