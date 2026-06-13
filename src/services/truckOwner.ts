import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from './firebase';
import type { FoodTruck, LatLng, MenuItem, TruckOwnerInput } from '../types';
import { normalizeMenuItemCategory } from '../utils/menuItems';

function mapMenuItems(raw: unknown): MenuItem[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map((item, index): MenuItem | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const record = item as Record<string, unknown>;
      const name = typeof record.name === 'string' ? record.name.trim() : '';

      if (!name) {
        return null;
      }

      const mapped: MenuItem = {
        id: typeof record.id === 'string' ? record.id : `item-${index}`,
        name,
        description: typeof record.description === 'string' ? record.description.trim() : '',
        price: typeof record.price === 'string' ? record.price.trim() : ''
      };

      const category = normalizeMenuItemCategory(record.category);

      if (category) {
        mapped.category = category;
      }

      return mapped;
    })
    .filter((item): item is MenuItem => item !== null);
}

export function mapTruckDocument(document: QueryDocumentSnapshot<DocumentData>): FoodTruck | null {
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
    menuItems: mapMenuItems(data.menuItems),
    address: typeof data.address === 'string' ? data.address : undefined,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : undefined,
    liveTracking: data.liveTracking === true,
    location: {
      lat: rawLocation.lat,
      lng: rawLocation.lng
    }
  };
}

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }

  return db;
}

function buildTruckWriteData(uid: string, input: TruckOwnerInput) {
  const menuItems = input.menuItems
    .map((item) => {
      const mapped: Record<string, string> = {
        id: item.id,
        name: item.name.trim(),
        description: item.description?.trim() ?? '',
        price: item.price?.trim() ?? ''
      };

      const category = normalizeMenuItemCategory(item.category);

      if (category) {
        mapped.category = category;
      }

      return mapped;
    })
    .filter((item) => item.name);

  const data: Record<string, unknown> = {
    name: input.name.trim(),
    cuisine: input.cuisine.trim(),
    status: input.status,
    location: {
      lat: input.location.lat,
      lng: input.location.lng
    },
    ownerId: uid,
    menuItems,
    updatedAt: serverTimestamp()
  };

  const description = input.description?.trim();
  if (description) {
    data.description = description;
  }

  const nextStop = input.nextStop?.trim();
  if (nextStop) {
    data.nextStop = nextStop;
  }

  const menuUrl = input.menuUrl?.trim();
  if (menuUrl) {
    data.menuUrl = menuUrl;
  }

  const address = input.address?.trim();
  if (address) {
    data.address = address;
  }

  if (input.liveTracking !== undefined) {
    data.liveTracking = input.liveTracking;
  }

  return data;
}

export async function updateTruckLiveLocation(truckId: string, location: LatLng) {
  const firestore = requireDb();

  await updateDoc(doc(firestore, 'foodTrucks', truckId), {
    location: {
      lat: location.lat,
      lng: location.lng
    },
    liveTracking: true,
    locationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function setTruckLiveTracking(truckId: string, enabled: boolean) {
  const firestore = requireDb();

  await updateDoc(doc(firestore, 'foodTrucks', truckId), {
    liveTracking: enabled,
    updatedAt: serverTimestamp(),
    ...(enabled ? {} : { locationUpdatedAt: serverTimestamp() })
  });
}

export function subscribeToOwnerTrucks(uid: string, onChange: (trucks: FoodTruck[]) => void) {
  const firestore = requireDb();
  const ownerQuery = query(collection(firestore, 'foodTrucks'), where('ownerId', '==', uid));

  return onSnapshot(ownerQuery, (snapshot) => {
    const trucks = snapshot.docs
      .map(mapTruckDocument)
      .filter((truck): truck is FoodTruck => Boolean(truck))
      .sort((a, b) => a.name.localeCompare(b.name));

    onChange(trucks);
  });
}

/** @deprecated Use subscribeToOwnerTrucks */
export function subscribeToOwnerTruck(uid: string, onChange: (truck: FoodTruck | null) => void) {
  return subscribeToOwnerTrucks(uid, (trucks) => {
    onChange(trucks[0] ?? null);
  });
}

export async function deleteOwnerTruck(truckId: string) {
  const firestore = requireDb();
  await deleteDoc(doc(firestore, 'foodTrucks', truckId));
}

export async function saveOwnerTruck(
  uid: string,
  truckId: string | null,
  input: TruckOwnerInput
): Promise<string> {
  const firestore = requireDb();
  const payload = buildTruckWriteData(uid, input);

  if (truckId) {
    await setDoc(doc(firestore, 'foodTrucks', truckId), payload, { merge: true });
    return truckId;
  }

  const truckRef = doc(collection(firestore, 'foodTrucks'));
  await setDoc(truckRef, {
    ...payload,
    createdAt: serverTimestamp()
  });

  return truckRef.id;
}
