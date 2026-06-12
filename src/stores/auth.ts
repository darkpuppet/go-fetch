import {
  type ConfirmationResult,
  RecaptchaVerifier,
  onAuthStateChanged,
  signInWithPhoneNumber,
  signOut,
  type User
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { defineStore } from 'pinia';

import { auth, db, isFirebaseConfigured } from '../services/firebase';
import type { ProfileInput, UserProfile } from '../types';

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

async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) {
    return null;
  }

  const snapshot = await getDoc(doc(db, 'users', uid));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  return {
    uid,
    displayName: typeof data.displayName === 'string' ? data.displayName : '',
    favoriteCuisine: typeof data.favoriteCuisine === 'string' ? data.favoriteCuisine : undefined,
    homeBase: typeof data.homeBase === 'string' ? data.homeBase : undefined,
    phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : null
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
      this.confirmationResult = await signInWithPhoneNumber(
        firebaseAuth,
        phoneNumber,
        recaptchaVerifier
      );
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

      const profile: UserProfile = {
        uid: firebaseAuth.currentUser.uid,
        displayName,
        favoriteCuisine: input.favoriteCuisine?.trim() || undefined,
        homeBase: input.homeBase?.trim() || undefined,
        phoneNumber: firebaseAuth.currentUser.phoneNumber
      };

      await setDoc(
        doc(db, 'users', firebaseAuth.currentUser.uid),
        {
          ...profile,
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp()
        },
        { merge: true }
      );

      this.profile = profile;
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
