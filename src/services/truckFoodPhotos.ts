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
import type { TruckFoodPhoto, TruckFoodPhotoInput } from '../types';

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

export function mapFoodPhotoDocument(
  document: QueryDocumentSnapshot<DocumentData>
): TruckFoodPhoto | null {
  const data = document.data();

  if (
    typeof data.truckId !== 'string' ||
    typeof data.photoUrl !== 'string' ||
    typeof data.uploadedBy !== 'string'
  ) {
    return null;
  }

  return {
    id: document.id,
    truckId: data.truckId,
    photoUrl: data.photoUrl,
    uploadedBy: data.uploadedBy,
    uploaderName: typeof data.uploaderName === 'string' ? data.uploaderName : undefined,
    caption: typeof data.caption === 'string' ? data.caption : undefined,
    createdAt: readTimestamp(data.createdAt)
  };
}

export function subscribeToTruckFoodPhotos(
  onChange: (photos: TruckFoodPhoto[]) => void,
  onError?: (error: Error) => void
) {
  if (!isFirebaseConfigured || !db) {
    onChange([]);
    return () => undefined;
  }

  const photosQuery = query(collection(db, 'truckFoodPhotos'));

  return onSnapshot(
    photosQuery,
    (snapshot) => {
      const photos = snapshot.docs
        .map(mapFoodPhotoDocument)
        .filter((photo): photo is TruckFoodPhoto => Boolean(photo))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));

      onChange(photos);
    },
    (error) => {
      onChange([]);
      onError?.(error);
    }
  );
}

function buildFoodPhotoWriteData(uid: string, input: TruckFoodPhotoInput, photoUrl: string) {
  const data: Record<string, unknown> = {
    truckId: input.truckId.trim(),
    photoUrl,
    uploadedBy: uid,
    createdAt: serverTimestamp()
  };

  const caption = input.caption?.trim();
  if (caption) {
    data.caption = caption;
  }

  return data;
}

export async function createTruckFoodPhoto(
  uid: string,
  input: TruckFoodPhotoInput,
  uploaderName?: string
): Promise<string> {
  if (!input.truckId.trim()) {
    throw new Error('Choose a food truck for this photo.');
  }

  if (input.photoFile.size > MAX_PHOTO_BYTES) {
    throw new Error('Photo must be 5 MB or smaller.');
  }

  if (!input.photoFile.type.startsWith('image/')) {
    throw new Error('Please choose a photo file.');
  }

  const { firestore, bucket } = requireServices();
  const photoRef = doc(collection(firestore, 'truckFoodPhotos'));
  const storageRef = ref(bucket, `truckFoodPhotos/${uid}/${photoRef.id}.jpg`);

  await uploadBytes(storageRef, input.photoFile, {
    contentType: input.photoFile.type || 'image/jpeg'
  });

  const photoUrl = await getDownloadURL(storageRef);
  const payload = buildFoodPhotoWriteData(uid, input, photoUrl);

  if (uploaderName?.trim()) {
    payload.uploaderName = uploaderName.trim();
  }

  await setDoc(photoRef, payload);
  return photoRef.id;
}

export async function deleteTruckFoodPhoto(photoId: string) {
  const { firestore } = requireServices();
  await deleteDoc(doc(firestore, 'truckFoodPhotos', photoId));
}

export function photosForTruck<T extends { truckId: string }>(photos: T[], truckId: string) {
  return photos.filter((photo) => photo.truckId === truckId);
}
