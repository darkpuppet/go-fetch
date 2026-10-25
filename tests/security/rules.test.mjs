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
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch
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

function publishedMenu(items) {
  const menuItems = items.map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description ?? '',
    price: item.price ?? '',
    category: item.category ?? ''
  }));
  const menuById = {};

  for (const item of menuItems) {
    menuById[item.id] = {
      name: item.name,
      description: item.description,
      price: item.price,
      category: item.category
    };
  }

  return { menuItems, menuById };
}

function tacoMenu() {
  return publishedMenu([{ id: 'taco', name: 'Al pastor', price: '$4', category: 'Mains' }]);
}

function menuItemData(item) {
  return {
    name: item.name,
    description: item.description ?? '',
    price: item.price ?? '',
    category: item.category ?? ''
  };
}

function publishMenu(db, truckId, ownerId, items) {
  const menu = publishedMenu(items);
  const batch = writeBatch(db);

  batch.set(
    doc(db, `foodTrucks/${truckId}`),
    truckData(ownerId, {
      ...menu,
      menuItemIds: items.map((item) => item.id),
      menuItemCount: items.length
    })
  );

  for (const item of items) {
    batch.set(doc(db, `foodTrucks/${truckId}/menu/${item.id}`), menuItemData(item));
  }

  return batch.commit();
}

function orderLine(customerId, ownerId, orderId = 'o1', overrides = {}) {
  return {
    orderId,
    menuItemId: 'taco',
    name: 'Al pastor',
    quantity: 2,
    price: '$4',
    category: 'Mains',
    ownerId,
    customerId,
    ...overrides
  };
}

function orderData(customerId, ownerId, overrides = {}) {
  return {
    orderNumber: 'K7M4P',
    truckId: 't1',
    truckName: 'Taco Cart',
    ownerId,
    customerId,
    customerName: 'Alice',
    note: '',
    status: 'submitted',
    quotedWaitMillis: 480000,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides
  };
}

function statsData(truckId, overrides = {}) {
  return {
    truckId,
    ordersCreated: 4,
    ordersReady: 2,
    ordersCompleted: 1,
    totalReadyMillis: 960000,
    totalCompletionMillis: 600000,
    activeOrderCount: 1,
    averageReadyMillis: 480000,
    updatedAt: serverTimestamp(),
    ...overrides
  };
}

function placeOrder(db, orderId, customerId, ownerId, lines) {
  const batch = writeBatch(db);
  batch.set(doc(db, `orders/${orderId}`), orderData(customerId, ownerId));
  lines.forEach((line, index) => {
    batch.set(doc(db, `orders/${orderId}/items/line${index}`), line);
  });
  return batch.commit();
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

  it('rejects extra profile fields, oversized names, and createdAt changes', async () => {
    const alice = firestoreOf('alice');

    await assertSucceeds(
      setDoc(doc(alice, 'users/alice'), {
        uid: 'alice',
        displayName: 'Alice',
        distanceUnit: 'km',
        notifications: { sms: false, push: true, email: false },
        favoriteTruckIds: ['demo-taco-trek'],
        fcmTokens: ['token-1'],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(setDoc(doc(alice, 'users/alice'), { uid: 'alice', displayName: 'Alice', role: 'admin' }));
    await assertFails(setDoc(doc(alice, 'users/alice'), { uid: 'alice', displayName: 'A'.repeat(81) }));
    await assertFails(
      updateDoc(doc(alice, 'users/alice'), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      setDoc(
        doc(alice, 'users/alice'),
        {
          favoriteTruckIds: Array.from({ length: 40 }, (_, index) => `t${index}`),
          fcmTokens: Array.from({ length: 20 }, (_, index) => `tok${index}`),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
    );
    await assertFails(
      setDoc(
        doc(alice, 'users/alice'),
        {
          favoriteTruckIds: Array.from({ length: 41 }, (_, index) => `t${index}`),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
    );
    await assertFails(
      setDoc(
        doc(alice, 'users/alice'),
        { fcmTokens: Array.from({ length: 21 }, (_, index) => `tok${index}`), updatedAt: serverTimestamp() },
        { merge: true }
      )
    );
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

  it('lets the owner set a default wait of 2 to 45 whole minutes', async () => {
    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertSucceeds(
      setDoc(doc(alice, 'foodTrucks/t1'), truckData('alice', { defaultWaitMillis: 12 * 60 * 1000 }))
    );
    await assertSucceeds(
      updateDoc(doc(alice, 'foodTrucks/t1'), { defaultWaitMillis: 20 * 60 * 1000 })
    );
    await assertFails(updateDoc(doc(alice, 'foodTrucks/t1'), { defaultWaitMillis: 60 * 1000 }));
    await assertFails(updateDoc(doc(alice, 'foodTrucks/t1'), { defaultWaitMillis: 46 * 60 * 1000 }));
    await assertFails(updateDoc(doc(alice, 'foodTrucks/t1'), { defaultWaitMillis: 12.5 * 60 * 1000 }));
    await assertFails(updateDoc(doc(bob, 'foodTrucks/t1'), { defaultWaitMillis: 15 * 60 * 1000 }));
  });

  it('lets the owner turn online orders on or off and set a maximum distance', async () => {
    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertSucceeds(
      setDoc(
        doc(alice, 'foodTrucks/t1'),
        truckData('alice', { ordersEnabled: true, maxOrderDistanceMeters: 500 })
      )
    );
    await assertSucceeds(
      updateDoc(doc(alice, 'foodTrucks/t1'), { ordersEnabled: false, maxOrderDistanceMeters: 80467 })
    );
    await assertSucceeds(updateDoc(doc(alice, 'foodTrucks/t1'), { maxOrderDistanceMeters: deleteField() }));
    await assertSucceeds(updateDoc(doc(alice, 'foodTrucks/t1'), { ordersEnabled: true, maxOrderDistanceMeters: 100 }));
    await assertFails(updateDoc(doc(alice, 'foodTrucks/t1'), { ordersEnabled: 'no' }));
    await assertFails(updateDoc(doc(alice, 'foodTrucks/t1'), { maxOrderDistanceMeters: 99 }));
    await assertFails(updateDoc(doc(alice, 'foodTrucks/t1'), { maxOrderDistanceMeters: 80468 }));
    await assertFails(updateDoc(doc(alice, 'foodTrucks/t1'), { maxOrderDistanceMeters: 500.4 }));
    await assertFails(updateDoc(doc(bob, 'foodTrucks/t1'), { ordersEnabled: false }));
  });

  it('lets an owner create, update, and delete their truck', async () => {
    const alice = firestoreOf('alice');

    await assertSucceeds(setDoc(doc(alice, 'foodTrucks/t1'), truckData('alice')));
    await assertSucceeds(
      updateDoc(doc(alice, 'foodTrucks/t1'), truckData('alice', { status: 'Serving now' }))
    );
    await assertSucceeds(deleteDoc(doc(alice, 'foodTrucks/t1')));
  });

  it('keeps the orderable catalog aligned with the published menu', async () => {
    const alice = firestoreOf('alice');
    const menu = tacoMenu();
    const item = { id: 'taco', name: 'Al pastor', price: '$4', category: 'Mains' };

    await assertSucceeds(publishMenu(alice, 't1', 'alice', [item]));
    await assertSucceeds(setDoc(doc(alice, 'foodTrucks/t2'), truckData('alice', menu)));
    await assertFails(
      setDoc(doc(alice, 'foodTrucks/t1/menu/taco'), {
        name: 'A'.repeat(81),
        description: '',
        price: '$4',
        category: 'Mains'
      })
    );
    await assertFails(
      setDoc(doc(firestoreOf('bob'), 'foodTrucks/t1/menu/secret'), {
        name: 'Secret',
        description: '',
        price: '$4',
        category: 'Mains'
      })
    );

    const forty = Array.from({ length: 40 }, (_, index) => ({
      id: `item-${index}`,
      name: `Item ${index}`,
      price: '$1',
      category: 'Mains'
    }));
    const fortyOne = forty.concat({ id: 'item-40', name: 'Item 40', price: '$1', category: 'Mains' });

    await assertFails(publishMenu(alice, 't3', 'alice', fortyOne));
    await assertSucceeds(publishMenu(alice, 't4', 'alice', forty));
    await assertFails(
      setDoc(doc(alice, 'foodTrucks/t4/menu/extra'), {
        name: 'Extra',
        description: '',
        price: '$1',
        category: 'Mains'
      })
    );

    await seed((db) => setDoc(doc(db, 'foodTrucks/legacy'), truckData('alice', tacoMenu())));
    await assertSucceeds(
      updateDoc(doc(alice, 'foodTrucks/legacy'), { status: 'Serving now' })
    );
    await assertSucceeds(
      updateDoc(doc(alice, 'foodTrucks/legacy'), {
        menuById: menu.menuById,
        menuItems: menu.menuItems
      })
    );
    await assertFails(
      updateDoc(doc(firestoreOf('bob'), 'foodTrucks/legacy'), {
        menuById: menu.menuById,
        menuItems: menu.menuItems
      })
    );
    await assertFails(deleteDoc(doc(alice, 'foodTrucks/t1/menu/taco')));
    const dropItem = writeBatch(alice);
    dropItem.update(doc(alice, 'foodTrucks/t1'), { menuItemIds: [], menuItemCount: 0 });
    dropItem.delete(doc(alice, 'foodTrucks/t1/menu/taco'));
    await assertSucceeds(dropItem.commit());
    const removeTruck = writeBatch(alice);
    removeTruck.delete(doc(alice, 'foodTrucks/t4/menu/item-0'));
    removeTruck.delete(doc(alice, 'foodTrucks/t4'));
    await assertSucceeds(removeTruck.commit());
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
    await assertFails(
      setDoc(doc(alice, 'truckSpots/huge'), spotData('alice', { note: 'n'.repeat(501) }))
    );
    await assertFails(
      setDoc(
        doc(alice, 'truckSpots/forever'),
        spotData('alice', { expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) })
      )
    );
    await assertFails(setDoc(doc(alice, 'truckSpots/extra'), spotData('alice', { evil: true })));
  });
});

describe('truckFoodPhotos', { concurrency: 1 }, () => {
  it('lets the uploader create a bounded photo for an existing truck', async () => {
    const alice = firestoreOf('alice');

    await assertSucceeds(setDoc(doc(alice, 'foodTrucks/t1'), truckData('alice')));
    await assertSucceeds(
      setDoc(doc(alice, 'truckFoodPhotos/p1'), {
        truckId: 't1',
        photoUrl: 'https://example.test/taco.jpg',
        uploadedBy: 'alice',
        caption: 'Al pastor',
        createdAt: serverTimestamp()
      })
    );
    await assertSucceeds(getDoc(doc(guestFirestore(), 'truckFoodPhotos/p1')));
    await assertFails(
      setDoc(doc(alice, 'truckFoodPhotos/p2'), {
        truckId: 't1',
        photoUrl: 'https://example.test/taco.jpg',
        uploadedBy: 'alice',
        caption: 'x'.repeat(281)
      })
    );
    await assertFails(
      setDoc(doc(firestoreOf('bob'), 'truckFoodPhotos/p3'), {
        truckId: 't1',
        photoUrl: 'https://example.test/taco.jpg',
        uploadedBy: 'alice'
      })
    );
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

describe('orders', { concurrency: 1 }, () => {
  it('lets a diner order from an existing truck and keeps the order private', async () => {
    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertSucceeds(
      publishMenu(alice, 't1', 'alice', [{ id: 'taco', name: 'Al pastor', price: '$4', category: 'Mains' }])
    );
    await assertSucceeds(placeOrder(bob, 'o1', 'bob', 'alice', [orderLine('bob', 'alice')]));

    await assertSucceeds(getDoc(doc(bob, 'orders/o1')));
    await assertSucceeds(getDoc(doc(alice, 'orders/o1')));
    await assertSucceeds(getDoc(doc(bob, 'orders/o1/items/line0')));
    await assertSucceeds(getDoc(doc(alice, 'orders/o1/items/line0')));
    await assertFails(getDoc(doc(firestoreOf('carol'), 'orders/o1')));
    await assertFails(getDoc(doc(guestFirestore(), 'orders/o1/items/line0')));
    await assertFails(setDoc(doc(guestFirestore(), 'orders/o2'), orderData('bob', 'alice')));
    await assertFails(setDoc(doc(bob, 'orders/o1/items/later'), orderLine('bob', 'alice')));
  });

  it('rejects a new order when the truck has turned online ordering off', async () => {
    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertSucceeds(
      publishMenu(alice, 't1', 'alice', [{ id: 'taco', name: 'Al pastor', price: '$4', category: 'Mains' }])
    );
    await assertSucceeds(updateDoc(doc(alice, 'foodTrucks/t1'), { ordersEnabled: false }));
    await assertFails(placeOrder(bob, 'paused', 'bob', 'alice', [orderLine('bob', 'alice', 'paused')]));
    await assertSucceeds(updateDoc(doc(alice, 'foodTrucks/t1'), { ordersEnabled: true }));
    await assertSucceeds(placeOrder(bob, 'open', 'bob', 'alice', [orderLine('bob', 'alice', 'open')]));
  });

  it('rejects spoofed owners, missing trucks, and invalid order data', async () => {
    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertSucceeds(
      publishMenu(alice, 't1', 'alice', [{ id: 'taco', name: 'Al pastor', price: '$4', category: 'Mains' }])
    );

    await assertFails(setDoc(doc(bob, 'orders/spoof-owner'), orderData('bob', 'bob')));
    await assertFails(setDoc(doc(bob, 'orders/spoof-name'), orderData('bob', 'alice', { truckName: 'Not Taco Cart' })));
    await assertFails(setDoc(doc(bob, 'orders/missing-truck'), orderData('bob', 'alice', { truckId: 'missing' })));
    await assertFails(setDoc(doc(bob, 'orders/bad-number'), orderData('bob', 'alice', { orderNumber: 'I0O1A' })));
    await assertFails(setDoc(doc(bob, 'orders/extra'), orderData('bob', 'alice', { paid: true })));
    await assertFails(setDoc(doc(alice, 'orders/as-bob'), orderData('bob', 'alice')));
    await assertFails(
      placeOrder(bob, 'bad-line', 'bob', 'alice', [orderLine('bob', 'alice', 'bad-line', { quantity: 0 })])
    );

    const manyLines = Array.from({ length: 12 }, (_, index) =>
      orderLine('bob', 'alice', 'full', {
        menuItemId: `item-${index}`,
        name: `Item ${index}`,
        quantity: 1
      })
    );

    await assertSucceeds(
      publishMenu(
        alice,
        't1',
        'alice',
        manyLines.map((line) => ({
          id: line.menuItemId,
          name: line.name,
          price: line.price,
          category: line.category
        }))
      )
    );
    await assertSucceeds(placeOrder(bob, 'full', 'bob', 'alice', manyLines));
  });

  it('lets the owner update status only', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'foodTrucks/t1'), truckData('alice'));
      await setDoc(doc(db, 'orders/o1'), {
        ...orderData('bob', 'alice', {
          createdAt: new Date(),
          updatedAt: new Date()
        })
      });
    });

    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertSucceeds(
      updateDoc(doc(alice, 'orders/o1'), {
        status: 'accepted',
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(bob, 'orders/o1'), {
        status: 'cancelled',
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(alice, 'orders/o1'), {
        note: 'changed',
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(alice, 'orders/o1'), {
        status: 'ready',
        note: 'changed too',
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(setDoc(doc(alice, 'orders/o1/items/owner-line'), orderLine('bob', 'alice')));
    await assertFails(deleteDoc(doc(alice, 'orders/o1')));
    await assertFails(deleteDoc(doc(bob, 'orders/o1')));
  });

  it('lets the owner list their orders and blocks unconstrained reads', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'orders/o1'), {
        ...orderData('bob', 'alice', {
          createdAt: new Date(),
          updatedAt: new Date()
        })
      });
    });

    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertSucceeds(
      getDocs(query(collection(alice, 'orders'), where('ownerId', '==', 'alice'), orderBy('createdAt', 'desc')))
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(alice, 'orders'),
          where('ownerId', '==', 'alice'),
          where('truckId', '==', 't1'),
          orderBy('createdAt', 'desc')
        )
      )
    );
    await assertSucceeds(
      getDocs(query(collection(bob, 'orders'), where('customerId', '==', 'bob'), orderBy('createdAt', 'desc')))
    );
    await assertSucceeds(getDocs(query(collection(bob, 'orders'), where('customerId', '==', 'bob'))));
    await assertFails(
      getDocs(query(collection(bob, 'orders'), where('ownerId', '==', 'alice'), orderBy('createdAt', 'desc')))
    );
    await assertFails(getDocs(collection(alice, 'orders')));
  });

  it('lets the owner list order lines and keeps other diners out', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'orders/o1'), {
        ...orderData('bob', 'alice', {
          createdAt: new Date(),
          updatedAt: new Date()
        })
      });
      await setDoc(doc(db, 'orders/o1/items/line0'), orderLine('bob', 'alice'));
    });

    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');
    const carol = firestoreOf('carol');

    await assertSucceeds(
      getDocs(query(collectionGroup(alice, 'items'), where('ownerId', '==', 'alice')))
    );
    await assertSucceeds(
      getDocs(query(collectionGroup(bob, 'items'), where('customerId', '==', 'bob')))
    );
    await assertFails(
      getDocs(query(collectionGroup(carol, 'items'), where('ownerId', '==', 'alice')))
    );
    await assertFails(getDocs(collectionGroup(alice, 'items')));
    await assertFails(getDocs(query(collectionGroup(guestFirestore(), 'items'), where('ownerId', '==', 'alice'))));
  });

  it('lets the owner mark an order ready and complete it, and set the wait', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'foodTrucks/t1'), truckData('alice'));
      await setDoc(doc(db, 'orders/o1'), {
        ...orderData('bob', 'alice', {
          createdAt: new Date(),
          updatedAt: new Date()
        })
      });
    });

    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');
    const missingQuote = orderData('bob', 'alice');
    delete missingQuote.quotedWaitMillis;

    await assertFails(setDoc(doc(bob, 'orders/no-quote'), missingQuote));
    await assertFails(setDoc(doc(bob, 'orders/short-quote'), orderData('bob', 'alice', { quotedWaitMillis: 1000 })));
    await assertFails(
      setDoc(doc(bob, 'orders/with-ready'), orderData('bob', 'alice', { readyAt: serverTimestamp() }))
    );
    await assertFails(
      updateDoc(doc(alice, 'orders/o1'), {
        status: 'ready',
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(alice, 'orders/o1'), {
        estimatedReadyAt: new Date(Date.now() + 5 * 60 * 1000),
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(bob, 'orders/o1'), {
        estimatedReadyAt: new Date(Date.now() + 5 * 60 * 1000),
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(alice, 'orders/o1'), {
        estimatedReadyAt: new Date(Date.now() - 10 * 60 * 1000),
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(alice, 'orders/o1'), {
        estimatedReadyAt: new Date(Date.now() + 7 * 60 * 60 * 1000),
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(alice, 'orders/o1'), {
        status: 'ready',
        readyAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(alice, 'orders/o1'), {
        estimatedReadyAt: new Date(Date.now() + 5 * 60 * 1000),
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(bob, 'orders/o1'), {
        status: 'ready',
        readyAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    );
    await assertSucceeds(
      updateDoc(doc(alice, 'orders/o1'), {
        status: 'completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    );
    await assertFails(
      updateDoc(doc(alice, 'orders/o1'), {
        quotedWaitMillis: 120000,
        updatedAt: serverTimestamp()
      })
    );
  });

  it('rejects an order line that is not on the published menu', async () => {
    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertSucceeds(
      publishMenu(alice, 't1', 'alice', [{ id: 'taco', name: 'Al pastor', price: '$4', category: 'Mains' }])
    );
    await assertFails(
      placeOrder(bob, 'wrong-price', 'bob', 'alice', [
        orderLine('bob', 'alice', 'wrong-price', { price: '$1' })
      ])
    );
    await assertFails(
      placeOrder(bob, 'unknown', 'bob', 'alice', [
        orderLine('bob', 'alice', 'unknown', { menuItemId: 'nachos', name: 'Nachos' })
      ])
    );
  });

  it('publishes wait stats for anyone to read and blocks client writes', async () => {
    await seed(async (db) => {
      await setDoc(doc(db, 'foodTrucks/t1'), truckData('alice'));
      await setDoc(doc(db, 'truckOrderStats/t1'), {
        ...statsData('t1', { updatedAt: new Date() })
      });
    });

    const alice = firestoreOf('alice');
    const bob = firestoreOf('bob');

    await assertFails(setDoc(doc(alice, 'truckOrderStats/t1'), statsData('t1')));
    await assertFails(setDoc(doc(bob, 'truckOrderStats/t1'), statsData('t1')));
    await assertFails(setDoc(doc(guestFirestore(), 'truckOrderStats/t1'), statsData('t1')));
    await assertFails(setDoc(doc(alice, 'truckOrderStats/missing'), statsData('missing')));
    await assertSucceeds(getDoc(doc(guestFirestore(), 'truckOrderStats/t1')));
    await assertSucceeds(getDoc(doc(bob, 'truckOrderStats/t1')));
    await assertFails(deleteDoc(doc(alice, 'truckOrderStats/t1')));
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
