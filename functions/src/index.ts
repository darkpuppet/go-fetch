import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';

initializeApp();

const db = getFirestore();
const messaging = getMessaging();

const SERVING_STATUS = 'Serving now';

type TruckDoc = {
  name?: string;
  status?: string;
  nextStop?: string;
};

type UserDoc = {
  fcmTokens?: string[];
};

/**
 * When a food truck transitions to "Serving now", notify users who favorited it
 * and opted into push notifications.
 */
export const notifyFavoriteTruckServing = onDocumentUpdated(
  {
    document: 'foodTrucks/{truckId}',
    // Match the Firestore database region for this project.
    region: 'northamerica-northeast2'
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

    // Only fire on the transition into "Serving now", not on every edit while serving.
    if (wasServing || !isServing) {
      return;
    }

    const truckName = typeof after.name === 'string' && after.name.trim() ? after.name.trim() : 'A food truck';
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
      const data = userDoc.data() as UserDoc;
      const tokens = Array.isArray(data.fcmTokens)
        ? data.fcmTokens.filter((token): token is string => typeof token === 'string' && token.length > 0)
        : [];

      for (const token of tokens) {
        tokenOwners.set(token, userDoc.id);
      }
    }

    const tokens = [...tokenOwners.keys()];

    if (tokens.length === 0) {
      logger.info('Subscribers found but no FCM tokens registered', { truckId, truckName });
      return;
    }

    const body = nextStop
      ? `${truckName} is serving now at ${nextStop}.`
      : `${truckName} is serving now. Open Go Fetch to see where they are.`;

    const response = await messaging.sendEachForMulticast({
      tokens,
      notification: {
        title: `${truckName} is serving now`,
        body
      },
      data: {
        truckId,
        url: '/'
      },
      webpush: {
        fcmOptions: {
          link: '/'
        }
      }
    });

    logger.info('Push notifications sent', {
      truckId,
      truckName,
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
          truckId,
          tokenIndex: index,
          code,
          message: result.error?.message
        });
      }
    });

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
);
