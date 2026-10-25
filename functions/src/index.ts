import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

import {
  buildTruckOrderStats,
  queueEstimateMillis,
  shouldRewriteEstimate,
  STATS_ORDER_WINDOW,
  type WaitSampleOrder
} from './waitTime';

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

const SERVING_STATUS = 'Serving now';
const FUNCTIONS_REGION = 'northamerica-northeast2';

type TruckDoc = {
  name?: string;
  status?: string;
  nextStop?: string;
  ownerId?: string;
};

type UserDoc = {
  fcmTokens?: string[];
  notifications?: {
    push?: boolean;
  };
};

type SpotDoc = {
  truckId?: string;
  truckName?: string;
  reporterName?: string;
  address?: string;
};

function readTokens(data: UserDoc | undefined) {
  return Array.isArray(data?.fcmTokens)
    ? data.fcmTokens.filter((token): token is string => typeof token === 'string' && token.length > 0)
    : [];
}

async function removeStaleTokens(tokenOwners: Map<string, string>, invalidTokens: Set<string>) {
  if (invalidTokens.size === 0) {
    return;
  }

  const removalsByUser = new Map<string, string[]>();

  for (const token of invalidTokens) {
    const uid = tokenOwners.get(token);

    if (!uid) {
      continue;
    }

    const current = removalsByUser.get(uid) ?? [];
    current.push(token);
    removalsByUser.set(uid, current);
  }

  await Promise.all(
    [...removalsByUser.entries()].map(([uid, staleTokens]) =>
      db
        .doc(`users/${uid}`)
        .update({
          fcmTokens: FieldValue.arrayRemove(...staleTokens),
          updatedAt: FieldValue.serverTimestamp()
        })
        .catch((error) => {
          logger.warn('Failed to remove stale FCM tokens', { uid, error });
        })
    )
  );
}

async function sendPushNotifications(options: {
  tokens: string[];
  tokenOwners: Map<string, string>;
  title: string;
  body: string;
  data: Record<string, string>;
  link: string;
  logContext: Record<string, unknown>;
}) {
  const { tokens, tokenOwners, title, body, data, link, logContext } = options;

  if (tokens.length === 0) {
    logger.info('No FCM tokens to notify', logContext);
    return;
  }

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
    webpush: {
      fcmOptions: {
        link
      }
    }
  });

  logger.info('Push notifications sent', {
    ...logContext,
    successCount: response.successCount,
    failureCount: response.failureCount
  });

  const invalidTokens = new Set<string>();

  response.responses.forEach((result, index) => {
    if (result.success) {
      return;
    }

    const code = result.error?.code;

    if (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    ) {
      invalidTokens.add(tokens[index]!);
    } else {
      logger.warn('FCM send failed', {
        ...logContext,
        tokenIndex: index,
        code,
        message: result.error?.message
      });
    }
  });

  await removeStaleTokens(tokenOwners, invalidTokens);
}

/**
 * When a food truck transitions to "Serving now", notify users who favorited it
 * and opted into push notifications.
 */
export const notifyFavoriteTruckServing = onDocumentUpdated(
  {
    document: 'foodTrucks/{truckId}',
    region: FUNCTIONS_REGION
  },
  async (event) => {
    const before = event.data?.before.data() as TruckDoc | undefined;
    const after = event.data?.after.data() as TruckDoc | undefined;

    if (!before || !after) {
      return;
    }

    const truckId = event.params.truckId;
    const wasServing = before.status === SERVING_STATUS;
    const isServing = after.status === SERVING_STATUS;

    if (wasServing || !isServing) {
      return;
    }

    const truckName =
      typeof after.name === 'string' && after.name.trim() ? after.name.trim() : 'A food truck';
    const nextStop = typeof after.nextStop === 'string' ? after.nextStop.trim() : '';

    const usersSnap = await db
      .collection('users')
      .where('favoriteTruckIds', 'array-contains', truckId)
      .where('notifications.push', '==', true)
      .get();

    if (usersSnap.empty) {
      logger.info('No subscribers for truck', { truckId, truckName });
      return;
    }

    const tokenOwners = new Map<string, string>();

    for (const userDoc of usersSnap.docs) {
      for (const token of readTokens(userDoc.data() as UserDoc)) {
        tokenOwners.set(token, userDoc.id);
      }
    }

    const tokens = [...tokenOwners.keys()];
    const body = nextStop
      ? `${truckName} is serving now at ${nextStop}.`
      : `${truckName} is serving now. Open Go Fetch to see where they are.`;

    await sendPushNotifications({
      tokens,
      tokenOwners,
      title: `${truckName} is serving now`,
      body,
      data: { truckId, url: '/' },
      link: '/',
      logContext: { truckId, truckName }
    });
  }
);

/**
 * When a diner spots a registered truck, notify the truck owner.
 */
export const notifyOwnerTruckSpotted = onDocumentCreated(
  {
    document: 'truckSpots/{spotId}',
    region: FUNCTIONS_REGION
  },
  async (event) => {
    const spot = event.data?.data() as SpotDoc | undefined;

    if (!spot) {
      return;
    }

    const truckId = typeof spot.truckId === 'string' ? spot.truckId.trim() : '';

    if (!truckId) {
      return;
    }

    const truckSnap = await db.doc(`foodTrucks/${truckId}`).get();

    if (!truckSnap.exists) {
      logger.warn('Spot references missing truck', { truckId, spotId: event.params.spotId });
      return;
    }

    const truck = truckSnap.data() as TruckDoc;
    const ownerId = typeof truck.ownerId === 'string' ? truck.ownerId : '';

    if (!ownerId) {
      logger.warn('Truck has no owner for spot notification', { truckId, spotId: event.params.spotId });
      return;
    }

    const ownerSnap = await db.doc(`users/${ownerId}`).get();

    if (!ownerSnap.exists) {
      logger.warn('Truck owner profile missing', { ownerId, truckId, spotId: event.params.spotId });
      return;
    }

    const owner = ownerSnap.data() as UserDoc;
    const tokens = readTokens(owner);

    if (tokens.length === 0) {
      logger.info('Owner has no FCM tokens registered', { ownerId, truckId, spotId: event.params.spotId });
      return;
    }

    const truckName =
      (typeof spot.truckName === 'string' && spot.truckName.trim()) ||
      (typeof truck.name === 'string' && truck.name.trim()) ||
      'Your truck';
    const reporterName =
      typeof spot.reporterName === 'string' && spot.reporterName.trim()
        ? spot.reporterName.trim()
        : 'Someone';
    const address = typeof spot.address === 'string' ? spot.address.trim() : '';
    const body = address
      ? `${reporterName} spotted ${truckName} near ${address}.`
      : `${reporterName} spotted ${truckName} on the street. Open Go Fetch to see the location.`;

    const tokenOwners = new Map(tokens.map((token) => [token, ownerId]));

    await sendPushNotifications({
      tokens,
      tokenOwners,
      title: `${truckName} was spotted`,
      body,
      data: {
        truckId,
        spotId: event.params.spotId,
        url: '/truck/operate'
      },
      link: '/truck/operate',
      logContext: { ownerId, truckId, spotId: event.params.spotId }
    });
  }
);

/**
 * When a diner or admin posts in a feedback thread, notify the other side.
 */
export const notifyFeedbackMessage = onDocumentCreated(
  {
    document: 'feedbackThreads/{threadId}/messages/{messageId}',
    region: FUNCTIONS_REGION
  },
  async (event) => {
    const message = event.data?.data() as
      | {
          text?: string;
          senderId?: string;
          senderRole?: string;
          senderName?: string;
        }
      | undefined;

    if (!message) {
      return;
    }

    const threadId = event.params.threadId;
    const senderId = typeof message.senderId === 'string' ? message.senderId : '';
    const senderRole = message.senderRole === 'admin' ? 'admin' : 'user';
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    const preview = text.length > 140 ? `${text.slice(0, 137)}...` : text;
    const senderName =
      typeof message.senderName === 'string' && message.senderName.trim()
        ? message.senderName.trim()
        : senderRole === 'admin'
          ? 'Go Fetch'
          : 'A diner';

    if (senderRole === 'admin') {
      if (!senderId || senderId === threadId) {
        return;
      }

      const userSnap = await db.doc(`users/${threadId}`).get();

      if (!userSnap.exists) {
        logger.info('Feedback reply has no diner profile to notify', { threadId });
        return;
      }

      const user = userSnap.data() as UserDoc;

      if (user.notifications?.push !== true) {
        return;
      }

      const tokens = readTokens(user);

      if (tokens.length === 0) {
        return;
      }

      const tokenOwners = new Map(tokens.map((token) => [token, threadId]));

      await sendPushNotifications({
        tokens,
        tokenOwners,
        title: 'Go Fetch replied',
        body: preview || 'You have a new reply in your feedback chat.',
        data: {
          threadId,
          url: '/feedback'
        },
        link: '/feedback',
        logContext: { threadId, senderRole }
      });
      return;
    }

    const adminsSnap = await db.collection('admins').get();

    if (adminsSnap.empty) {
      logger.info('No admins to notify for feedback', { threadId });
      return;
    }

    const tokenOwners = new Map<string, string>();

    await Promise.all(
      adminsSnap.docs.map(async (adminDoc) => {
        if (adminDoc.id === senderId) {
          return;
        }

        const profileSnap = await db.doc(`users/${adminDoc.id}`).get();

        if (!profileSnap.exists) {
          return;
        }

        const profile = profileSnap.data() as UserDoc;

        if (profile.notifications?.push !== true) {
          return;
        }

        for (const token of readTokens(profile)) {
          tokenOwners.set(token, adminDoc.id);
        }
      })
    );

    const tokens = [...tokenOwners.keys()];

    await sendPushNotifications({
      tokens,
      tokenOwners,
      title: `${senderName} sent feedback`,
      body: preview || 'Open the inbox to read the new message.',
      data: {
        threadId,
        url: '/admin/feedback'
      },
      link: '/admin/feedback',
      logContext: { threadId, senderRole }
    });
  }
);

type OrderLineDoc = {
  name?: string;
  quantity?: number;
};

type OrderDoc = {
  orderNumber?: string;
  truckId?: string;
  truckName?: string;
  ownerId?: string;
  customerId?: string;
  customerName?: string;
  items?: OrderLineDoc[];
  note?: string;
  status?: string;
  createdAt?: Timestamp;
  readyAt?: Timestamp;
  completedAt?: Timestamp;
  updatedAt?: Timestamp;
  estimatedReadyAt?: Timestamp;
};

function timestampMillis(value: unknown) {
  return value instanceof Timestamp ? value.toMillis() : undefined;
}

function sameOrderMilestone(before: OrderDoc, after: OrderDoc) {
  return before.status === after.status
    && timestampMillis(before.readyAt) === timestampMillis(after.readyAt)
    && timestampMillis(before.completedAt) === timestampMillis(after.completedAt);
}

function summarizeOrderItems(items: OrderLineDoc[] | undefined) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'a new order';
  }

  const parts = items.slice(0, 3).map((item) => {
    const name = typeof item.name === 'string' && item.name.trim() ? item.name.trim() : 'item';
    const quantity = typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1;
    return `${quantity}× ${name}`;
  });
  const extra = items.length > 3 ? ` +${items.length - 3} more` : '';

  return `${parts.join(', ')}${extra}`;
}

/**
 * When a diner places an order, notify the truck owner.
 */
export const notifyOwnerNewOrder = onDocumentCreated(
  {
    document: 'orders/{orderId}',
    region: FUNCTIONS_REGION
  },
  async (event) => {
    const snapshot = event.data;

    if (!snapshot) {
      return;
    }

    const order = snapshot.data() as OrderDoc;

    const orderId = event.params.orderId;
    const ownerId = typeof order.ownerId === 'string' ? order.ownerId : '';
    const customerId = typeof order.customerId === 'string' ? order.customerId : '';

    if (!ownerId) {
      logger.warn('Order is missing an owner', { orderId });
      return;
    }

    if (ownerId === customerId) {
      logger.info('Skipping order push for an order placed by the owner', { orderId, ownerId });
      return;
    }

    const ownerSnap = await db.doc(`users/${ownerId}`).get();

    if (!ownerSnap.exists) {
      logger.warn('Truck owner profile missing for order', { ownerId, orderId });
      return;
    }

    const tokens = readTokens(ownerSnap.data() as UserDoc);

    if (tokens.length === 0) {
      logger.info('Owner has no FCM tokens for order', { ownerId, orderId });
      return;
    }

    const truckName =
      typeof order.truckName === 'string' && order.truckName.trim()
        ? order.truckName.trim()
        : 'your truck';
    const orderNumber =
      typeof order.orderNumber === 'string' && order.orderNumber.trim()
        ? order.orderNumber.trim()
        : orderId;
    const customerName =
      typeof order.customerName === 'string' && order.customerName.trim()
        ? order.customerName.trim()
        : 'A diner';
    const note = typeof order.note === 'string' ? order.note.trim() : '';
    const linesSnap = await snapshot.ref.collection('items').get();
    const summary = summarizeOrderItems(
      linesSnap.docs.map((line) => line.data() as OrderLineDoc)
    );
    const body = note
      ? `${customerName} ordered ${summary} from ${truckName}. Note: ${note}`
      : `${customerName} ordered ${summary} from ${truckName}.`;
    const truckId = typeof order.truckId === 'string' ? order.truckId : '';
    const tokenOwners = new Map(tokens.map((token) => [token, ownerId]));

    await sendPushNotifications({
      tokens,
      tokenOwners,
      title: `New order ${orderNumber}`,
      body,
      data: {
        type: 'order',
        orderId,
        truckId,
        orderNumber,
        url: '/truck/operate'
      },
      link: '/truck/operate',
      logContext: { ownerId, orderId, orderNumber }
    });
  }
);

/**
 * When the operator marks an order ready, notify the diner.
 */
export const notifyCustomerOrderReady = onDocumentUpdated(
  {
    document: 'orders/{orderId}',
    region: FUNCTIONS_REGION
  },
  async (event) => {
    const before = event.data?.before.data() as OrderDoc | undefined;
    const after = event.data?.after.data() as OrderDoc | undefined;

    if (!before || !after || before.status === 'ready' || after.status !== 'ready') {
      return;
    }

    const orderId = event.params.orderId;
    const customerId = typeof after.customerId === 'string' ? after.customerId : '';
    const ownerId = typeof after.ownerId === 'string' ? after.ownerId : '';

    if (!customerId || customerId === ownerId) {
      logger.info('Skipping ready push', { orderId, customerId, ownerId });
      return;
    }

    const customerSnap = await db.doc(`users/${customerId}`).get();
    const tokens = readTokens(customerSnap.data() as UserDoc | undefined);

    if (tokens.length === 0) {
      logger.info('Customer has no FCM tokens for ready order', { customerId, orderId });
      return;
    }

    const truckName =
      typeof after.truckName === 'string' && after.truckName.trim()
        ? after.truckName.trim()
        : 'The truck';
    const orderNumber =
      typeof after.orderNumber === 'string' && after.orderNumber.trim()
        ? after.orderNumber.trim()
        : orderId;
    const tokenOwners = new Map(tokens.map((token) => [token, customerId]));

    await sendPushNotifications({
      tokens,
      tokenOwners,
      title: `Order ${orderNumber} is ready`,
      body: `${truckName} marked your order ready for pickup.`,
      data: {
        type: 'order-ready',
        orderId,
        orderNumber,
        url: '/'
      },
      link: '/',
      logContext: { customerId, orderId, orderNumber }
    });
  }
);

/**
 * Recompute the public wait for a truck from its latest orders.
 * Estimate-only writes are ignored so this trigger does not loop.
 */
export const syncTruckOrderWait = onDocumentWritten(
  {
    document: 'orders/{orderId}',
    region: FUNCTIONS_REGION
  },
  async (event) => {
    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;
    const before = beforeSnap?.exists ? (beforeSnap.data() as OrderDoc) : undefined;
    const after = afterSnap?.exists ? (afterSnap.data() as OrderDoc) : undefined;

    if (before && after && sameOrderMilestone(before, after)) {
      return;
    }

    const source = after ?? before;
    const truckId = typeof source?.truckId === 'string' ? source.truckId : '';

    if (!truckId) {
      return;
    }

    const ordersSnap = await db
      .collection('orders')
      .where('truckId', '==', truckId)
      .orderBy('createdAt', 'desc')
      .limit(STATS_ORDER_WINDOW)
      .get();
    const orders: WaitSampleOrder[] = ordersSnap.docs.map((orderDoc) => {
      const data = orderDoc.data() as OrderDoc;

      return {
        id: orderDoc.id,
        status: typeof data.status === 'string' ? data.status : '',
        createdAt: timestampMillis(data.createdAt),
        readyAt: timestampMillis(data.readyAt),
        completedAt: timestampMillis(data.completedAt),
        updatedAt: timestampMillis(data.updatedAt),
        estimatedReadyAt: timestampMillis(data.estimatedReadyAt)
      };
    });
    const stats = buildTruckOrderStats(truckId, orders);
    const now = Date.now();
    const active = orders
      .filter((order) => order.status === 'submitted' || order.status === 'accepted')
      .sort(
        (left, right) =>
          (left.createdAt ?? Number.MAX_SAFE_INTEGER) - (right.createdAt ?? Number.MAX_SAFE_INTEGER)
      );
    const batch = db.batch();

    batch.set(db.doc(`truckOrderStats/${truckId}`), {
      ...stats,
      updatedAt: FieldValue.serverTimestamp()
    });

    active.forEach((order, index) => {
      const nextEstimate = queueEstimateMillis(now, stats.averageReadyMillis, index + 1);

      if (!shouldRewriteEstimate(order.estimatedReadyAt, nextEstimate)) {
        return;
      }

      batch.update(db.doc(`orders/${order.id}`), {
        estimatedReadyAt: Timestamp.fromMillis(nextEstimate),
        updatedAt: FieldValue.serverTimestamp()
      });
    });

    await batch.commit();
    logger.info('Refreshed truck wait', {
      truckId,
      ordersCreated: stats.ordersCreated,
      activeOrderCount: stats.activeOrderCount,
      averageReadyMillis: stats.averageReadyMillis
    });
  }
);
