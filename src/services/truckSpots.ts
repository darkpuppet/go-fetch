import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type QueryDocumentSnapshot
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

import { db, isFirebaseConfigured, storage } from './firebase';
import type { LatLng, TruckSpot, TruckSpotInput } from '../types';

const SPOT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

function requireServices() {
  if (!isFirebaseConfigured || !db || !storage) {
    throw new Error('Firebase is not configured.');
  }

  return { firestore: db, bucket: storage };
}

function readTimestamp(value: unknown): number | undefined {
  if (value instanceof Timestamp) {
    return value.toMillis();
  }

  return undefined;
}

export function mapSpotDocument(document: QueryDocumentSnapshot<DocumentData>): TruckSpot | null {
  const data = document.data();
  const rawLocation = data.location;

  if (
    typeof data.reportedBy !== 'string' ||
    typeof data.photoUrl !== 'string' ||
    !rawLocation ||
    typeof rawLocation.lat !== 'number' ||
    typeof rawLocation.lng !== 'number'
  ) {
    return null;
  }

  return {
    id: document.id,
    location: {
      lat: rawLocation.lat,
      lng: rawLocation.lng
    },
    photoUrl: data.photoUrl,
    reportedBy: data.reportedBy,
    reporterName: typeof data.reporterName === 'string' ? data.reporterName : undefined,
    note: typeof data.note === 'string' ? data.note : undefined,
    truckName: typeof data.truckName === 'string' ? data.truckName : undefined,
    truckId: typeof data.truckId === 'string' ? data.truckId : undefined,
    cuisine: typeof data.cuisine === 'string' ? data.cuisine : undefined,
    address: typeof data.address === 'string' ? data.address : undefined,
    createdAt: readTimestamp(data.createdAt),
    expiresAt: readTimestamp(data.expiresAt)
  };
}

function isSpotActive(spot: TruckSpot, now = Date.now()) {
  return !spot.expiresAt || spot.expiresAt > now;
}

export function subscribeToTruckSpots(
  onChange: (spots: TruckSpot[]) => void,
  onError?: (error: Error) => void
) {
  if (!isFirebaseConfigured || !db) {
    onChange([]);
    return () => undefined;
  }

  const spotsQuery = query(collection(db, 'truckSpots'));

  return onSnapshot(
    spotsQuery,
    (snapshot) => {
      const spots = snapshot.docs
        .map(mapSpotDocument)
        .filter((spot): spot is TruckSpot => Boolean(spot))
        .filter((spot) => isSpotActive(spot));

      onChange(spots);
    },
    (error) => {
      onChange([]);
      onError?.(error);
    }
  );
}

function buildSpotWriteData(uid: string, input: TruckSpotInput, photoUrl: string) {
  const expiresAt = Timestamp.fromMillis(Date.now() + SPOT_TTL_MS);
  const data: Record<string, unknown> = {
    location: {
      lat: input.location.lat,
      lng: input.location.lng
    },
    photoUrl,
    reportedBy: uid,
    expiresAt,
    createdAt: serverTimestamp()
  };

  const note = input.note?.trim();
  if (note) {
    data.note = note;
  }

  const truckName = input.truckName?.trim();
  if (truckName) {
    data.truckName = truckName;
  }

  const truckId = input.truckId?.trim();
  if (truckId) {
    data.truckId = truckId;
  }

  const cuisine = input.cuisine?.trim();
  if (cuisine) {
    data.cuisine = cuisine;
  }

  const address = input.address?.trim();
  if (address) {
    data.address = address;
  }

  return data;
}

export async function createTruckSpot(
  uid: string,
  input: TruckSpotInput,
  reporterName?: string
): Promise<string> {
  if (input.photoFile.size > MAX_PHOTO_BYTES) {
    throw new Error('Photo must be 5 MB or smaller.');
  }

  if (!input.photoFile.type.startsWith('image/')) {
    throw new Error('Please choose a photo file.');
  }

  const { firestore, bucket } = requireServices();
  const spotRef = doc(collection(firestore, 'truckSpots'));
  const storageRef = ref(bucket, `truckSpots/${uid}/${spotRef.id}.jpg`);

  await uploadBytes(storageRef, input.photoFile, {
    contentType: input.photoFile.type || 'image/jpeg'
  });

  const photoUrl = await getDownloadURL(storageRef);
  const payload = buildSpotWriteData(uid, input, photoUrl);

  if (reporterName?.trim()) {
    payload.reporterName = reporterName.trim();
  }

  await setDoc(spotRef, payload);
  return spotRef.id;
}

export async function deleteTruckSpot(spotId: string) {
  const { firestore } = requireServices();
  await deleteDoc(doc(firestore, 'truckSpots', spotId));
}

export function isValidSpotLocation(location: LatLng) {
  return (
    Number.isFinite(location.lat) &&
    Number.isFinite(location.lng) &&
    location.lat >= -90 &&
    location.lat <= 90 &&
    location.lng >= -180 &&
    location.lng <= 180
  );
}

export function spotsForTruck(spots: TruckSpot[], truckId: string) {
  return spots
    .filter((spot) => spot.truckId === truckId)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
