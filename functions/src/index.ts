import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

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
