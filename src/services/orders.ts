import {
  collection,
  collectionGroup,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type DocumentSnapshot,
  type QueryDocumentSnapshot
} from 'firebase/firestore';

import { db, isFirebaseConfigured } from './firebase';
import {
  MAX_ORDER_LINE_QUANTITY,
  MAX_ORDER_LINES,
  MAX_ORDER_NOTE_LENGTH,
  type FoodOrder,
  type OrderLine,
  type OrderStatus,
  type PlaceOrderInput,
  type PlaceOrderResult
} from '../types';
import { createOrderNumber, isOrderStatus } from '../utils/orders';
import {
  buildTruckOrderStats,
  clampDuration,
  DEFAULT_READY_MILLIS,
  MAX_QUOTE_MILLIS,
  MIN_QUOTE_MILLIS,
  queueEstimateMillis,
  shouldRewriteEstimate,
  STATS_ORDER_WINDOW,
  type TruckWaitStats
} from '../utils/waitTime';

const MAX_NAME_LENGTH = 80;
const MAX_TRUCK_NAME_LENGTH = 120;
const MAX_PRICE_LENGTH = 24;
const MAX_CATEGORY_LENGTH = 40;
const MAX_MENU_ITEM_ID_LENGTH = 80;

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured.');
  }

  return db;
}

function readMillis(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toMillis' in value &&
    typeof value.toMillis === 'function'
  ) {
    const millis = value.toMillis();
    return typeof millis === 'number' ? millis : undefined;
  }

  return undefined;
}

function mapOrderLine(raw: unknown): OrderLine | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const name = typeof record.name === 'string' ? record.name.trim() : '';
  const menuItemId = typeof record.menuItemId === 'string' ? record.menuItemId.trim() : '';
  const quantity = record.quantity;

  if (!name || !menuItemId || typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1) {
    return null;
  }

  return {
    menuItemId,
    name,
    quantity,
    price: typeof record.price === 'string' ? record.price : '',
    category: typeof record.category === 'string' ? record.category : ''
  };
}

function readInt(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined;
}

export function mapOrderDocument(document: DocumentSnapshot<DocumentData>): FoodOrder | null {
  if (!document.exists()) {
    return null;
  }

  const data = document.data();
  const status = isOrderStatus(data.status) ? data.status : null;
  const items = Array.isArray(data.items)
    ? data.items.map(mapOrderLine).filter((item): item is OrderLine => item !== null)
    : [];

  if (
    typeof data.orderNumber !== 'string' ||
    typeof data.truckId !== 'string' ||
    typeof data.truckName !== 'string' ||
    typeof data.ownerId !== 'string' ||
    typeof data.customerId !== 'string' ||
    typeof data.customerName !== 'string' ||
    !status
  ) {
    return null;
  }

  return {
    id: document.id,
    orderNumber: data.orderNumber,
    truckId: data.truckId,
    truckName: data.truckName,
    ownerId: data.ownerId,
    customerId: data.customerId,
    customerName: data.customerName,
    items,
    note: typeof data.note === 'string' ? data.note : '',
    status,
    quotedWaitMillis: readInt(data.quotedWaitMillis),
    readyAt: readMillis(data.readyAt),
    completedAt: readMillis(data.completedAt),
    estimatedReadyAt: readMillis(data.estimatedReadyAt),
    createdAt: readMillis(data.createdAt),
    updatedAt: readMillis(data.updatedAt)
  };
}

export function mapTruckWaitStats(document: DocumentSnapshot<DocumentData>): TruckWaitStats | null {
  if (!document.exists()) {
    return null;
  }

  const data = document.data();
  const ordersCreated = readInt(data.ordersCreated);
  const ordersReady = readInt(data.ordersReady);
  const ordersCompleted = readInt(data.ordersCompleted);
  const totalReadyMillis = readInt(data.totalReadyMillis);
  const totalCompletionMillis = readInt(data.totalCompletionMillis);
  const activeOrderCount = readInt(data.activeOrderCount);
  const averageReadyMillis = readInt(data.averageReadyMillis);

  if (
    ordersCreated == null ||
    ordersReady == null ||
    ordersCompleted == null ||
    totalReadyMillis == null ||
    totalCompletionMillis == null ||
    activeOrderCount == null ||
    averageReadyMillis == null
  ) {
    return null;
  }

  return {
    truckId: document.id,
    ordersCreated,
    ordersReady,
    ordersCompleted,
    totalReadyMillis,
    totalCompletionMillis,
    activeOrderCount,
    averageReadyMillis,
    updatedAt: readMillis(data.updatedAt)
  };
}

function mapStoredOrderLine(document: QueryDocumentSnapshot<DocumentData>): { orderId: string; line: OrderLine } | null {
  const line = mapOrderLine(document.data());
  const orderId = document.ref.parent.parent?.id;

  if (!line || !orderId) {
    return null;
  }

  return { orderId, line };
}

function buildOrderItems(items: OrderLine[]): OrderLine[] {
  if (items.length === 0) {
    throw new Error('Choose at least one menu item.');
  }

  if (items.length > MAX_ORDER_LINES) {
    throw new Error(`An order can include up to ${MAX_ORDER_LINES} menu items.`);
  }

  return items.map((item) => {
    const name = item.name.trim().slice(0, MAX_NAME_LENGTH);
    const menuItemId = item.menuItemId.trim().slice(0, MAX_MENU_ITEM_ID_LENGTH);
    const quantity = Math.round(item.quantity);

    if (!name || !menuItemId) {
      throw new Error('Each menu item needs a name.');
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ORDER_LINE_QUANTITY) {
      throw new Error(`Choose between 1 and ${MAX_ORDER_LINE_QUANTITY} of each item.`);
    }

    return {
      menuItemId,
      name,
      quantity,
      price: item.price.trim().slice(0, MAX_PRICE_LENGTH),
      category: item.category.trim().slice(0, MAX_CATEGORY_LENGTH)
    };
  });
}

function toOrderError(error: unknown, fallback: string) {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'permission-denied'
  ) {
    return new Error('This truck is not accepting orders right now.');
  }

  return error instanceof Error ? error : new Error(fallback);
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  const items = buildOrderItems(input.items);
  const orderNumber = createOrderNumber();
  const truckName = input.truckName.trim();
  const customerName = input.customerName.trim().slice(0, MAX_NAME_LENGTH) || 'Diner';
  const note = input.note.trim().slice(0, MAX_ORDER_NOTE_LENGTH);
  const ownerId = input.ownerId;
  const customerId = input.customerId;
  const quotedWaitMillis = clampDuration(
    input.quotedWaitMillis ?? DEFAULT_READY_MILLIS,
    MIN_QUOTE_MILLIS,
    MAX_QUOTE_MILLIS
  );
  const placedAt = Date.now();
  const live = Boolean(isFirebaseConfigured && db && ownerId && customerId);

  if (!live || !ownerId) {
    return {
      id: `preview-${orderNumber}`,
      orderNumber,
      notifiedOperator: false,
      quotedWaitMillis,
      placedAt
    };
  }

  if (truckName.length === 0 || truckName.length > MAX_TRUCK_NAME_LENGTH) {
    throw new Error('This truck cannot take orders right now.');
  }

  try {
    const firestore = requireDb();
    const orderRef = doc(collection(firestore, 'orders'));
    const batch = writeBatch(firestore);

    batch.set(orderRef, {
      orderNumber,
      truckId: input.truckId,
      truckName,
      ownerId,
      customerId,
      customerName,
      note,
      status: 'submitted' satisfies OrderStatus,
      quotedWaitMillis,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    items.forEach((item) => {
      batch.set(doc(collection(orderRef, 'items')), {
        orderId: orderRef.id,
        menuItemId: item.menuItemId,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        category: item.category,
        ownerId,
        customerId
      });
    });

    await batch.commit();

    return {
      id: orderRef.id,
      orderNumber,
      notifiedOperator: true,
      quotedWaitMillis,
      placedAt
    };
  } catch (error) {
    throw toOrderError(error, 'Unable to place the order.');
  }
}

export async function updateOrderStatus(orderId: string, status: OrderStatus) {
  try {
    const patch: Record<string, unknown> = {
      status,
      updatedAt: serverTimestamp()
    };

    if (status === 'ready') {
      patch.readyAt = serverTimestamp();
    }

    if (status === 'completed') {
      patch.completedAt = serverTimestamp();
    }

    await updateDoc(doc(requireDb(), 'orders', orderId), patch);
  } catch (error) {
    throw toOrderError(error, 'Unable to update the order.');
  }
}

export async function syncTruckWaitEstimates(ownerId: string, truckId: string) {
  if (!isFirebaseConfigured || !db || !ownerId || !truckId) {
    return;
  }

  const firestore = db;
  const snapshot = await getDocs(
    query(
      collection(firestore, 'orders'),
      where('ownerId', '==', ownerId),
      where('truckId', '==', truckId),
      orderBy('createdAt', 'desc'),
      limit(STATS_ORDER_WINDOW)
    )
  );
  const orders = snapshot.docs
    .map(mapOrderDocument)
    .filter((order): order is FoodOrder => order !== null);
  const stats = buildTruckOrderStats(truckId, orders);
  const now = Date.now();
  const active = orders
    .filter((order) => order.status === 'submitted' || order.status === 'accepted')
    .sort(
      (left, right) =>
        (left.createdAt ?? Number.MAX_SAFE_INTEGER) - (right.createdAt ?? Number.MAX_SAFE_INTEGER)
    );
  const batch = writeBatch(firestore);
  let writes = 0;

  active.forEach((order, index) => {
    const nextEstimate = queueEstimateMillis(now, stats.averageReadyMillis, index + 1);

    if (!shouldRewriteEstimate(order.estimatedReadyAt, nextEstimate)) {
      return;
    }

    batch.update(doc(firestore, 'orders', order.id), {
      estimatedReadyAt: Timestamp.fromMillis(nextEstimate),
      updatedAt: serverTimestamp()
    });
    writes += 1;
  });

  if (writes > 0) {
    await batch.commit();
  }
}

export function subscribeToTruckOrderStats(
  truckId: string,
  onChange: (stats: TruckWaitStats | null) => void,
  onError?: (error: Error) => void
) {
  if (!isFirebaseConfigured || !db || !truckId) {
    onChange(null);
    return () => undefined;
  }

  return onSnapshot(
    doc(db, 'truckOrderStats', truckId),
    (snapshot) => {
      onChange(mapTruckWaitStats(snapshot));
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToOrder(
  orderId: string,
  onChange: (order: FoodOrder | null) => void,
  onError?: (error: Error) => void
) {
  if (!isFirebaseConfigured || !db || !orderId) {
    onChange(null);
    return () => undefined;
  }

  return onSnapshot(
    doc(db, 'orders', orderId),
    (snapshot) => {
      onChange(mapOrderDocument(snapshot));
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToCustomerOrders(
  customerId: string,
  onChange: (orders: FoodOrder[]) => void,
  onError?: (error: Error) => void
) {
  if (!isFirebaseConfigured || !db) {
    onChange([]);
    return () => undefined;
  }

  const ordersQuery = query(
    collection(db, 'orders'),
    where('customerId', '==', customerId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  return onSnapshot(
    ordersQuery,
    (snapshot) => {
      onChange(
        snapshot.docs
          .map(mapOrderDocument)
          .filter((order): order is FoodOrder => order !== null)
      );
    },
    (error) => {
      onError?.(error);
    }
  );
}

export function subscribeToOwnerOrders(
  ownerId: string,
  onChange: (orders: FoodOrder[], added: FoodOrder[]) => void,
  onError?: (error: Error) => void
) {
  if (!isFirebaseConfigured || !db) {
    onChange([], []);
    return () => undefined;
  }

  const firestore = db;
  const ordersQuery = query(
    collection(firestore, 'orders'),
    where('ownerId', '==', ownerId),
    orderBy('createdAt', 'desc'),
    limit(40)
  );
  const linesQuery = query(collectionGroup(firestore, 'items'), where('ownerId', '==', ownerId));

  let orders: FoodOrder[] = [];
  let linesByOrder = new Map<string, OrderLine[]>();
  let sawOrders = false;
  let sawLines = false;

  const publish = (added: FoodOrder[]) => {
    if (!sawOrders || !sawLines) {
      return;
    }

    onChange(
      orders.map((order) => ({
        ...order,
        items: linesByOrder.get(order.id) ?? []
      })),
      added.map((order) => ({
        ...order,
        items: linesByOrder.get(order.id) ?? []
      }))
    );
  };

  const unsubscribeOrders = onSnapshot(
    ordersQuery,
    (snapshot) => {
      orders = snapshot.docs
        .map(mapOrderDocument)
        .filter((order): order is FoodOrder => order !== null);
      const first = !sawOrders;
      sawOrders = true;
      const added = first
        ? []
        : snapshot
            .docChanges()
            .filter((change) => change.type === 'added')
            .map((change) => mapOrderDocument(change.doc))
            .filter((order): order is FoodOrder => order !== null);

      publish(added);
    },
    (error) => {
      onError?.(error);
    }
  );

  const unsubscribeLines = onSnapshot(
    linesQuery,
    (snapshot) => {
      const nextLines = new Map<string, OrderLine[]>();

      for (const lineDocument of snapshot.docs) {
        const stored = mapStoredOrderLine(lineDocument);

        if (!stored) {
          continue;
        }

        const bucket = nextLines.get(stored.orderId) ?? [];
        bucket.push(stored.line);
        nextLines.set(stored.orderId, bucket);
      }

      linesByOrder = nextLines;
      sawLines = true;
      publish([]);
    },
    (error) => {
      onError?.(error);
    }
  );

  return () => {
    unsubscribeOrders();
    unsubscribeLines();
  };
}
