import {
  collection,
  onSnapshot,
  query
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from './firebase';
import demoFoodTrucksData from '../data/demo-food-trucks.json';
import type { FoodTruck, MenuItem } from '../types';
import { mapTruckDocument, mergeTruckMenus, subscribeToPublishedMenus } from './truckOwner';

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
  let trucks: FoodTruck[] = [];
  let menus = new Map<string, MenuItem[]>();
  let itemOrder = new Map<string, string[]>();
  let trucksReady = false;
  let menusReady = false;

  const emit = () => {
    if (!trucksReady || !menusReady) {
      return;
    }

    const merged = mergeTruckMenus(trucks, menus, itemOrder);
    onChange(merged.length > 0 ? merged : demoFoodTrucks, merged.length > 0 ? 'firestore' : 'demo');
  };

  const unsubscribeTrucks = onSnapshot(
    trucksQuery,
    (snapshot) => {
      itemOrder = new Map(
        snapshot.docs.map((truckDoc) => [
          truckDoc.id,
          Array.isArray(truckDoc.data().menuItemIds)
            ? truckDoc.data().menuItemIds.filter((id: unknown): id is string => typeof id === 'string')
            : []
        ])
      );
      trucks = snapshot.docs
        .map(mapTruckDocument)
        .filter((truck): truck is FoodTruck => Boolean(truck));
      trucksReady = true;
      emit();
    },
    (error) => {
      onChange(demoFoodTrucks, 'demo');
      onError?.(error);
    }
  );
  const unsubscribeMenus = subscribeToPublishedMenus(
    (nextMenus) => {
      menus = nextMenus;
      menusReady = true;
      emit();
    },
    () => {
      menusReady = true;
      emit();
    }
  );

  return () => {
    unsubscribeTrucks();
    unsubscribeMenus();
  };
}
