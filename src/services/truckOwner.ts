import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from './firebase';
import type { FoodTruck, LatLng, MenuItem, TruckOwnerInput } from '../types';
import { buildPublishedMenu, normalizeMenuItemCategory } from '../utils/menuItems';
import { normalizeDefaultWaitMillis } from '../utils/waitTime';

function mapMenuItems(raw: unknown): MenuItem[] {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>).flatMap(([id, item]) => {
      if (!item || typeof item !== 'object') {
        return [];
      }

      return mapMenuItems([{ ...(item as Record<string, unknown>), id }]);
    });
  }

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
    menuItems: mapMenuItems(data.menuById ?? data.menuItems),
    address: typeof data.address === 'string' ? data.address : undefined,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : undefined,
    liveTracking: data.liveTracking === true,
    defaultWaitMillis:
      typeof data.defaultWaitMillis === 'number' && Number.isFinite(data.defaultWaitMillis)
        ? normalizeDefaultWaitMillis(data.defaultWaitMillis)
        : undefined,
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
  const published = buildPublishedMenu(input.menuItems);

  const data: Record<string, unknown> = {
    name: input.name.trim(),
    cuisine: input.cuisine.trim(),
    status: input.status,
    location: {
      lat: input.location.lat,
      lng: input.location.lng
    },
    ownerId: uid,
    menuItems: published.menuItems,
    menuById: published.menuById,
    menuItemIds: published.menuItems.map((item) => item.id),
    menuItemCount: published.menuItems.length,
    defaultWaitMillis: normalizeDefaultWaitMillis(input.defaultWaitMillis),
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

function mapMenuDocument(id: string, data: DocumentData): MenuItem | null {
  const name = typeof data.name === 'string' ? data.name.trim() : '';

  if (!name) {
    return null;
  }

  const item: MenuItem = {
    id,
    name,
    description: typeof data.description === 'string' ? data.description : '',
    price: typeof data.price === 'string' ? data.price : ''
  };
  const category = normalizeMenuItemCategory(data.category);

  if (category) {
    item.category = category;
  }

  return item;
}

function sortMenuItems(items: MenuItem[], ids: string[] | undefined) {
  if (!ids?.length) {
    return items;
  }

  const rank = new Map(ids.map((id, index) => [id, index]));

  return [...items].sort((left, right) => {
    const leftRank = rank.get(left.id) ?? ids.length;
    const rightRank = rank.get(right.id) ?? ids.length;
    return leftRank - rightRank || left.name.localeCompare(right.name);
  });
}

export function mergeTruckMenus(
  trucks: FoodTruck[],
  menus: Map<string, MenuItem[]>,
  itemOrder: Map<string, string[]> = new Map()
) {
  return trucks.map((truck) => {
    const items = menus.get(truck.id);

    if (!items) {
      return truck;
    }

    return { ...truck, menuItems: sortMenuItems(items, itemOrder.get(truck.id)) };
  });
}

function menuItemOrder(data: DocumentData) {
  const ids = data.menuItemIds;

  if (!Array.isArray(ids)) {
    return [];
  }

  return ids.filter((id): id is string => typeof id === 'string');
}

export function subscribeToPublishedMenus(
  onChange: (menus: Map<string, MenuItem[]>) => void,
  onError?: (error: Error) => void
) {
  const firestore = requireDb();

  return onSnapshot(
    query(collectionGroup(firestore, 'menu')),
    (snapshot) => {
      const menus = new Map<string, MenuItem[]>();

      for (const menuDoc of snapshot.docs) {
        const truckId = menuDoc.ref.parent.parent?.id;

        if (!truckId) {
          continue;
        }

        const item = mapMenuDocument(menuDoc.id, menuDoc.data());

        if (!item) {
          continue;
        }

        const items = menus.get(truckId) ?? [];
        items.push(item);
        menus.set(truckId, items);
      }

      onChange(menus);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToOwnerTrucks(uid: string, onChange: (trucks: FoodTruck[]) => void) {
  const firestore = requireDb();
  const ownerQuery = query(collection(firestore, 'foodTrucks'), where('ownerId', '==', uid));
  let trucks: FoodTruck[] = [];
  let menus = new Map<string, MenuItem[]>();
  let itemOrder = new Map<string, string[]>();
  let trucksReady = false;
  let menusReady = false;

  const emit = () => {
    if (!trucksReady || !menusReady) {
      return;
    }

    onChange(
      mergeTruckMenus(trucks, menus, itemOrder).sort((left, right) =>
        left.name.localeCompare(right.name)
      )
    );
  };

  const unsubscribeTrucks = onSnapshot(ownerQuery, (snapshot) => {
    itemOrder = new Map();
    trucks = snapshot.docs.flatMap((truckDoc) => {
      const truck = mapTruckDocument(truckDoc);

      if (!truck) {
        return [];
      }

      itemOrder.set(truck.id, menuItemOrder(truckDoc.data()));
      return [truck];
    });
    trucksReady = true;
    emit();
  });
  const unsubscribeMenus = subscribeToPublishedMenus((nextMenus) => {
    menus = nextMenus;
    menusReady = true;
    emit();
  }, () => {
    menusReady = true;
    emit();
  });

  return () => {
    unsubscribeTrucks();
    unsubscribeMenus();
  };
}

/** @deprecated Use subscribeToOwnerTrucks */
export function subscribeToOwnerTruck(uid: string, onChange: (truck: FoodTruck | null) => void) {
  return subscribeToOwnerTrucks(uid, (trucks) => {
    onChange(trucks[0] ?? null);
  });
}

export async function deleteOwnerTruck(truckId: string) {
  const firestore = requireDb();
  const menuSnapshot = await getDocs(collection(firestore, 'foodTrucks', truckId, 'menu'));
  const batch = writeBatch(firestore);

  for (const menuDoc of menuSnapshot.docs) {
    batch.delete(menuDoc.ref);
  }

  batch.delete(doc(firestore, 'foodTrucks', truckId));
  await batch.commit();
}

export async function saveOwnerTruck(
  uid: string,
  truckId: string | null,
  input: TruckOwnerInput
): Promise<string> {
  const firestore = requireDb();
  const published = buildPublishedMenu(input.menuItems);
  const payload = buildTruckWriteData(uid, input);
  const truckRef = truckId ? doc(firestore, 'foodTrucks', truckId) : doc(collection(firestore, 'foodTrucks'));
  const existingMenu = truckId
    ? await getDocs(collection(firestore, 'foodTrucks', truckId, 'menu'))
    : null;
  const batch = writeBatch(firestore);
  const nextIds = new Set(published.menuItems.map((item) => item.id));

  if (truckId) {
    batch.set(truckRef, payload, { merge: true });
  } else {
    batch.set(truckRef, {
      ...payload,
      createdAt: serverTimestamp()
    });
  }

  for (const item of published.menuItems) {
    batch.set(doc(firestore, 'foodTrucks', truckRef.id, 'menu', item.id), {
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category
    });
  }

  for (const menuDoc of existingMenu?.docs ?? []) {
    if (!nextIds.has(menuDoc.id)) {
      batch.delete(menuDoc.ref);
    }
  }

  await batch.commit();
  return truckRef.id;
}
