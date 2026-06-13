import {
  type ConfirmationResult,
  RecaptchaVerifier,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut,
  type User
} from 'firebase/auth';
import { arrayRemove, arrayUnion, deleteField, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { defineStore } from 'pinia';

import { auth, db, isFirebaseConfigured } from '../services/firebase';
import type { NotificationChannel, ProfileInput, UserProfile } from '../types';

type AuthState = {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  confirmationResult: ConfirmationResult | null;
};

let initPromise: Promise<void> | null = null;
let recaptchaVerifier: RecaptchaVerifier | null = null;

function requireFirebaseAuth() {
  if (!isFirebaseConfigured || !auth) {
    throw new Error('Firebase is not configured. Add your Firebase web app values to .env.local.');
  }

  return auth;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Firestore rejects `undefined`; omit empty optional fields or delete cleared ones. */
function optionalStringField(nextValue: string | undefined, previousValue: string | undefined) {
  if (nextValue) {
    return nextValue;
  }

  if (previousValue) {
    return deleteField();
  }

  return undefined;
}

function buildUserProfileWriteData(profile: UserProfile, previous: UserProfile | null) {
  const data: Record<string, unknown> = {
    uid: profile.uid,
    displayName: profile.displayName,
    distanceUnit: profile.distanceUnit ?? 'mi',
    notifications: profile.notifications ?? { sms: false, push: false, email: false },
    favoriteTruckIds: profile.favoriteTruckIds ?? [],
    fcmTokens: profile.fcmTokens ?? [],
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };

  const email = optionalStringField(profile.email, previous?.email);
  if (email !== undefined) {
    data.email = email;
  }

  const favoriteCuisine = optionalStringField(profile.favoriteCuisine, previous?.favoriteCuisine);
  if (favoriteCuisine !== undefined) {
    data.favoriteCuisine = favoriteCuisine;
  }

  const homeBase = optionalStringField(profile.homeBase, previous?.homeBase);
  if (homeBase !== undefined) {
    data.homeBase = homeBase;
  }

  if (profile.phoneNumber) {
    data.phoneNumber = profile.phoneNumber;
  }

  return data;
}

async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) {
    return null;
  }

  const snapshot = await getDoc(doc(db, 'users', uid));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  const rawNotifications = (data.notifications ?? {}) as Record<string, unknown>;

  return {
    uid,
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    email: typeof data.email === 'string' ? data.email : undefined,
    favoriteCuisine: typeof data.favoriteCuisine === 'string' ? data.favoriteCuisine : undefined,
    homeBase: typeof data.homeBase === 'string' ? data.homeBase : undefined,
    phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : null,
    distanceUnit: data.distanceUnit === 'km' ? 'km' : 'mi',
    notifications: {
      sms: rawNotifications.sms === true,
      push: rawNotifications.push === true,
      email: rawNotifications.email === true
    },
    favoriteTruckIds: Array.isArray(data.favoriteTruckIds)
      ? data.favoriteTruckIds.filter((id): id is string => typeof id === 'string')
      : [],
    fcmTokens: Array.isArray(data.fcmTokens)
      ? data.fcmTokens.filter((token): token is string => typeof token === 'string')
      : []
  };
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    profile: null,
    loading: true,
    error: null,
    confirmationResult: null
  }),
  getters: {
    isConfigured: () => isFirebaseConfigured,
    isAuthenticated: (state) => Boolean(state.user)
  },
  actions: {
    init() {
      if (initPromise) {
        return initPromise;
      }

      if (!isFirebaseConfigured || !auth) {
        this.loading = false;
        initPromise = Promise.resolve();
        return initPromise;
      }

      const firebaseAuth = auth;
      this.loading = true;
      initPromise = new Promise((resolve) => {
        onAuthStateChanged(
          firebaseAuth,
          async (user) => {
            this.user = user;
            this.profile = user ? await getUserProfile(user.uid) : null;
            this.loading = false;
            resolve();
          },
          (error) => {
            this.error = error.message;
            this.loading = false;
            resolve();
          }
        );
      });

      return initPromise;
    },
    async requestSmsCode(phoneNumber: string) {
      const firebaseAuth = requireFirebaseAuth();

      if (!recaptchaVerifier) {
        recaptchaVerifier = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', {
          size: 'invisible'
        });
      }

      this.error = null;

      try {
        this.confirmationResult = await signInWithPhoneNumber(
          firebaseAuth,
          phoneNumber,
          recaptchaVerifier
        );
      } catch (error) {
        // Reset the verifier so the next attempt starts from a clean reCAPTCHA
        // state. Reusing a verifier after a failure (rate limit, disabled
        // provider, captcha check) leaves it stuck and later clicks do nothing.
        recaptchaVerifier.clear();
        recaptchaVerifier = null;
        throw error;
      }
    },
    async confirmSmsCode(code: string) {
      if (!this.confirmationResult) {
        throw new Error('Request a verification code before signing in.');
      }

      this.error = null;
      const credential = await this.confirmationResult.confirm(code);
      this.user = credential.user;
      this.profile = await getUserProfile(credential.user.uid);
      this.confirmationResult = null;
    },
    async saveProfile(input: ProfileInput) {
      const firebaseAuth = requireFirebaseAuth();

      if (!db || !firebaseAuth.currentUser) {
        throw new Error('You must be signed in before creating a profile.');
      }

      const displayName = input.displayName.trim();
      if (!displayName) {
        throw new Error('Display name is required.');
      }

      const email = input.email?.trim() || undefined;
      const wantsEmailNotifications = input.notifications?.email === true;

      if (wantsEmailNotifications) {
        if (!email) {
          throw new Error('Add an email address to enable email notifications.');
        }

        if (!isValidEmail(email)) {
          throw new Error('Enter a valid email address for email notifications.');
        }
      }

      const profile: UserProfile = {
        uid: firebaseAuth.currentUser.uid,
        displayName,
        email,
        favoriteCuisine: input.favoriteCuisine?.trim() || undefined,
        homeBase: input.homeBase?.trim() || undefined,
        phoneNumber: firebaseAuth.currentUser.phoneNumber,
        distanceUnit: input.distanceUnit === 'km' ? 'km' : 'mi',
        notifications: {
          sms: input.notifications?.sms === true,
          push: input.notifications?.push === true,
          email: wantsEmailNotifications && Boolean(email)
        },
        favoriteTruckIds: this.profile?.favoriteTruckIds ?? [],
        fcmTokens: this.profile?.fcmTokens ?? []
      };

      await setDoc(
        doc(db, 'users', firebaseAuth.currentUser.uid),
        buildUserProfileWriteData(profile, this.profile),
        { merge: true }
      );

      this.profile = profile;
    },
    async toggleFavoriteTruck(truckId: string) {
      const firebaseAuth = requireFirebaseAuth();

      if (!db || !firebaseAuth.currentUser) {
        throw new Error('You must be signed in to favorite a truck.');
      }

      const current = this.profile?.favoriteTruckIds ?? [];
      const nextFavorites = current.includes(truckId)
        ? current.filter((id) => id !== truckId)
        : [...current, truckId];

      await setDoc(
        doc(db, 'users', firebaseAuth.currentUser.uid),
        {
          favoriteTruckIds: nextFavorites,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      if (this.profile) {
        this.profile = { ...this.profile, favoriteTruckIds: nextFavorites };
      }
    },
    async setNotificationChannel(channel: NotificationChannel, enabled: boolean) {
      const firebaseAuth = requireFirebaseAuth();

      if (!db || !firebaseAuth.currentUser) {
        throw new Error('You must be signed in to update notification preferences.');
      }

      const current = this.profile?.notifications ?? { sms: false, push: false, email: false };
      const notifications = { ...current, [channel]: enabled };

      await setDoc(
        doc(db, 'users', firebaseAuth.currentUser.uid),
        {
          notifications,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      if (this.profile) {
        this.profile = { ...this.profile, notifications };
      }
    },
    async savePushToken(token: string) {
      const firebaseAuth = requireFirebaseAuth();

      if (!db || !firebaseAuth.currentUser) {
        throw new Error('You must be signed in to enable push notifications.');
      }

      const current = this.profile?.notifications ?? { sms: false, push: false, email: false };
      const notifications = { ...current, push: true };

      await setDoc(
        doc(db, 'users', firebaseAuth.currentUser.uid),
        {
          fcmTokens: arrayUnion(token),
          notifications,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      if (this.profile) {
        const currentTokens = this.profile.fcmTokens ?? [];
        this.profile = {
          ...this.profile,
          notifications,
          fcmTokens: currentTokens.includes(token) ? currentTokens : [...currentTokens, token]
        };
      }
    },
    async removePushToken(token: string) {
      const firebaseAuth = requireFirebaseAuth();

      if (!db || !firebaseAuth.currentUser) {
        return;
      }

      await setDoc(
        doc(db, 'users', firebaseAuth.currentUser.uid),
        {
          fcmTokens: arrayRemove(token),
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );

      if (this.profile) {
        this.profile = {
          ...this.profile,
          fcmTokens: (this.profile.fcmTokens ?? []).filter((value) => value !== token)
        };
      }
    },
    async signOutUser() {
      if (auth) {
        await signOut(auth);
      }

      this.user = null;
      this.profile = null;
      this.confirmationResult = null;
    }
  }
});
