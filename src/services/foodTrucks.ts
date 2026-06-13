import {
  collection,
  onSnapshot,
  query
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from './firebase';
import demoFoodTrucksData from '../data/demo-food-trucks.json';
import type { FoodTruck } from '../types';
import { mapTruckDocument } from './truckOwner';

export const demoFoodTrucks: FoodTruck[] = demoFoodTrucksData as FoodTruck[];

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
