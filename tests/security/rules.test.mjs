import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '../..');
const PROJECT_ID = 'demo-go-fetch';
const IMAGE = {
  contentType: 'image/jpeg',
  bytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
};

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv;

function truckData(ownerId, overrides = {}) {
  return {
    name: 'Taco Cart',
    cuisine: 'Mexican',
    status: 'Closed',
    ownerId,
    location: { lat: 43.65, lng: -79.38 },
    ...overrides
  };
}

function spotData(reportedBy, overrides = {}) {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

  return {
    reportedBy,
    photoUrl: 'https://example.test/spot.jpg',
    location: { lat: 43.65, lng: -79.38 },
    expiresAt,
    ...overrides
  };
}

function feedbackThread(userId, overrides = {}) {
  return {
    userId,
    userDisplayName: 'Alice',
    lastMessage: 'Hello from the diner',
    lastMessageAt: serverTimestamp(),
    lastSenderRole: 'user',
    unreadByAdmin: true,
    unreadByUser: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides
  };
}

function firestoreOf(uid) {
  return testEnv.authenticatedContext(uid).firestore();
}

function storageOf(uid) {
  return testEnv.authenticatedContext(uid).storage();
}

function guestFirestore() {
  return testEnv.unauthenticatedContext().firestore();
}

function guestStorage() {
  return testEnv.unauthenticatedContext().storage();
}

async function seed(write) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await write(context.firestore(), context.storage());
  });
}

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: readFileSync(join(rootDir, 'firestore.rules'), 'utf8')
    },
    storage: {
      host: '127.0.0.1',
      port: 9199,
      rules: readFileSync(join(rootDir, 'storage.rules'), 'utf8')
    }
  });
});

after(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.clearStorage();
});

describe('users', { concurrency: 1 }, () => {
  it('lets a signed-in user read and write only their own profile', async () => {
    const alice = firestoreOf('alice');

    await assertSucceeds(setDoc(doc(alice, 'users/alice'), { uid: 'alice', displayName: 'Alice' }));
    await assertSucceeds(getDoc(doc(alice, 'users/alice')));
    await assertFails(getDoc(doc(alice, 'users/bob')));
    await assertFails(setDoc(doc(alice, 'users/bob'), { uid: 'bob' }));
    await assertFails(deleteDoc(doc(alice, 'users/alice')));
  });

  it('rejects unauthenticated profile access', async () => {
    await seed((db) => setDoc(doc(db, 'users/alice'), { uid: 'alice' }));

    await assertFails(getDoc(doc(guestFirestore(), 'users/alice')));
    await assertFails(setDoc(doc(guestFirestore(), 'users/alice'), { uid: 'alice' }));
  });

  it('rejects a profile create that spoofs another uid', async () => {
    await assertFails(setDoc(doc(firestoreOf('alice'), 'users/alice'), { uid: 'bob' }));
  });
});

describe('admins', { concurrency: 1 }, () => {
  it('denies client writes so diners cannot self-grant admin', async () => {
    await assertFails(setDoc(doc(firestoreOf('alice'), 'admins/alice'), { createdAt: serverTimestamp() }));
    await assertFails(deleteDoc(doc(firestoreOf('alice'), 'admins/alice')));
  });

  it('lets a user read only their own admin document', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'admins/alice'), { createdAt: new Date() });
      await setDoc(doc(db, 'admins/admin1'), { createdAt: new Date() });
    });

    await assertSucceeds(getDoc(doc(firestoreOf('alice'), 'admins/alice')));
    await assertFails(getDoc(doc(firestoreOf('alice'), 'admins/admin1')));
    await assertFails(getDoc(doc(guestFirestore(), 'admins/alice')));
  });
});

describe('foodTrucks', { concurrency: 1 }, () => {
  it('allows public reads', async () => {
    await seed((db) => setDoc(doc(db, 'foodTrucks/t1'), truckData('alice')));

    await assertSucceeds(getDoc(doc(guestFirestore(), 'foodTrucks/t1')));
  });

  it('lets an owner create, update, and delete their truck', async () => {
    const alice = firestoreOf('alice');

    await assertSucceeds(setDoc(doc(alice, 'foodTrucks/t1'), truckData('alice')));
    await assertSucceeds(
      updateDoc(doc(alice, 'foodTrucks/t1'), truckData('alice', { status: 'Serving now' }))
    );
    await assertSucceeds(deleteDoc(doc(alice, 'foodTrucks/t1')));
  });

  it('blocks ownership theft and writes by other users', async () => {
    await seed((db) => setDoc(doc(db, 'foodTrucks/t1'), truckData('alice')));

    const bob = firestoreOf('bob');
    const alice = firestoreOf('alice');

    await assertFails(setDoc(doc(alice, 'foodTrucks/t2'), truckData('bob')));
    await assertFails(updateDoc(doc(bob, 'foodTrucks/t1'), truckData('bob')));
    await assertFails(updateDoc(doc(alice, 'foodTrucks/t1'), truckData('bob')));
    await assertFails(deleteDoc(doc(bob, 'foodTrucks/t1')));
  });
});

describe('truckSpots', { concurrency: 1 }, () => {
  it('allows public reads and reporter-only create/delete', async () => {
    const alice = firestoreOf('alice');

    await assertSucceeds(setDoc(doc(alice, 'truckSpots/s1'), spotData('alice')));
    await assertSucceeds(getDoc(doc(guestFirestore(), 'truckSpots/s1')));
    await assertFails(updateDoc(doc(alice, 'truckSpots/s1'), { photoUrl: 'https://example.test/other.jpg' }));
    await assertFails(setDoc(doc(alice, 'truckSpots/s2'), spotData('bob')));
    await assertFails(deleteDoc(doc(firestoreOf('bob'), 'truckSpots/s1')));
    await assertSucceeds(deleteDoc(doc(alice, 'truckSpots/s1')));
  });
});

describe('feedbackThreads', { concurrency: 1 }, () => {
  it('lets a diner create and read only their own thread', async () => {
    const alice = firestoreOf('alice');

    await assertSucceeds(setDoc(doc(alice, 'feedbackThreads/alice'), feedbackThread('alice')));
    await assertSucceeds(getDoc(doc(alice, 'feedbackThreads/alice')));
    await assertFails(setDoc(doc(alice, 'feedbackThreads/bob'), feedbackThread('bob')));
    await assertFails(getDoc(doc(alice, 'feedbackThreads/bob')));
  });

  it('lets an admin read diner threads and denies non-admins', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'admins/admin1'), { createdAt: new Date() });
      await setDoc(doc(db, 'feedbackThreads/alice'), {
        userId: 'alice',
        userDisplayName: 'Alice',
        lastMessage: 'Help',
        lastMessageAt: new Date(),
        lastSenderRole: 'user',
        unreadByAdmin: true,
        unreadByUser: false,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    });

    await assertSucceeds(getDoc(doc(firestoreOf('admin1'), 'feedbackThreads/alice')));
    await assertFails(getDoc(doc(firestoreOf('bob'), 'feedbackThreads/alice')));
  });

  it('lets a diner post a user message but not an admin message', async () => {
    const alice = firestoreOf('alice');
    await assertSucceeds(setDoc(doc(alice, 'feedbackThreads/alice'), feedbackThread('alice')));

    await assertSucceeds(
      setDoc(doc(collection(alice, 'feedbackThreads/alice/messages')), {
        text: 'Still waiting',
        senderId: 'alice',
        senderRole: 'user',
        senderName: 'Alice',
        createdAt: serverTimestamp()
      })
    );

    await assertFails(
      setDoc(doc(collection(alice, 'feedbackThreads/alice/messages')), {
        text: 'Official reply',
        senderId: 'alice',
        senderRole: 'admin',
        senderName: 'Go Fetch',
        createdAt: serverTimestamp()
      })
    );
  });
});

describe('catchall', { concurrency: 1 }, () => {
  it('denies unknown collections', async () => {
    await assertFails(setDoc(doc(firestoreOf('alice'), 'secrets/x'), { value: 1 }));
    await assertFails(getDoc(doc(firestoreOf('alice'), 'secrets/x')));
  });
});

describe('storage', { concurrency: 1 }, () => {
  it('allows public reads and owner-only uploads under their uid path', async () => {
    const aliceRef = ref(storageOf('alice'), 'truckSpots/alice/spot1');

    await assertSucceeds(uploadBytes(aliceRef, IMAGE.bytes, { contentType: IMAGE.contentType }));
    await assertSucceeds(getBytes(ref(guestStorage(), 'truckSpots/alice/spot1')));
    await assertFails(
      uploadBytes(ref(storageOf('alice'), 'truckSpots/bob/spot1'), IMAGE.bytes, {
        contentType: IMAGE.contentType
      })
    );
    await assertFails(
      uploadBytes(ref(storageOf('alice'), 'truckSpots/alice/spot-txt'), IMAGE.bytes, {
        contentType: 'text/plain'
      })
    );
    await assertFails(deleteObject(ref(storageOf('bob'), 'truckSpots/alice/spot1')));
    await assertSucceeds(deleteObject(aliceRef));
  });

  it('allows food photo uploads only in the caller uid folder', async () => {
    const photoRef = ref(storageOf('alice'), 'truckFoodPhotos/alice/photo1');

    await assertSucceeds(uploadBytes(photoRef, IMAGE.bytes, { contentType: IMAGE.contentType }));
    await assertFails(
      uploadBytes(ref(storageOf('bob'), 'truckFoodPhotos/alice/photo1'), IMAGE.bytes, {
        contentType: IMAGE.contentType
      })
    );
  });
});
