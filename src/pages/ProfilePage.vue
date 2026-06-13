<template>
  <q-page class="page-shell">
    <section class="container narrow-container">
      <q-card flat bordered class="profile-card">
        <q-card-section>
          <q-chip color="primary" text-color="white" icon="person" label="Your profile" />
          <h1 class="page-title">Tell trucks and diners who you are.</h1>
          <p class="text-grey-7">
            Your profile is saved in Firebase and lets Go Fetch personalize the truck list.
          </p>
        </q-card-section>

        <q-form @submit.prevent="saveProfile">
          <q-card-section class="q-gutter-md">
            <q-input
              v-model.trim="form.displayName"
              outlined
              label="Display name"
              autocomplete="name"
              :rules="[(value) => Boolean(value) || 'Display name is required']"
            />
            <q-input
              v-model.trim="form.email"
              outlined
              label="Email"
              type="text"
              inputmode="email"
              autocomplete="email"
              placeholder="you@example.com"
              :rules="[emailRule]"
            />
            <q-input
              v-model.trim="form.favoriteCuisine"
              outlined
              label="Favorite cuisine"
              placeholder="Tacos, BBQ, vegan bowls..."
            />
            <q-input
              v-model.trim="form.homeBase"
              outlined
              label="Home base"
              placeholder="Neighborhood or city"
            />

            <div>
              <div class="text-caption text-grey-7 q-mb-xs">Distance units</div>
              <q-btn-toggle
                v-model="form.distanceUnit"
                no-caps
                spread
                unelevated
                toggle-color="primary"
                color="grey-3"
                text-color="grey-8"
                :options="[
                  { label: 'Miles', value: 'mi' },
                  { label: 'Kilometers', value: 'km' }
                ]"
              />
            </div>

            <div>
              <div class="text-caption text-grey-7 q-mb-xs">Notifications</div>
              <q-list bordered class="rounded-borders">
                <q-item>
                  <q-item-section>
                    <q-item-label>SMS</q-item-label>
                    <q-item-label caption>
                      {{ phoneNumber ? `Texts to ${phoneNumber}` : 'No phone number on file' }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-toggle
                      v-model="form.notifications.sms"
                      color="primary"
                      :disable="!phoneNumber"
                    />
                  </q-item-section>
                </q-item>

                <q-separator />

                <q-item>
                  <q-item-section>
                    <q-item-label>Push</q-item-label>
                    <q-item-label caption>Alerts in this browser or installed app</q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-toggle
                      v-model="form.notifications.push"
                      color="primary"
                      @update:model-value="onPushToggle"
                    />
                  </q-item-section>
                </q-item>

                <q-separator />

                <q-item>
                  <q-item-section>
                    <q-item-label>Email</q-item-label>
                    <q-item-label caption>
                      {{ form.email ? `Sent to ${form.email}` : 'Add an email above to enable' }}
                    </q-item-label>
                  </q-item-section>
                  <q-item-section side>
                    <q-toggle
                      v-model="form.notifications.email"
                      color="primary"
                      :disable="!form.email"
                    />
                  </q-item-section>
                </q-item>
              </q-list>
            </div>
          </q-card-section>

          <q-card-actions align="between" class="q-pa-md">
            <q-btn flat no-caps color="accent" icon="map" label="Back to map" :to="auth.profile ? '/' : undefined" />
            <q-btn unelevated rounded color="primary" type="submit" :loading="saving" label="Save profile" />
          </q-card-actions>
        </q-form>
      </q-card>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import {
  disablePushNotifications,
  enablePushNotifications,
  isPushConfigured
} from '../services/messaging';
import { useAuthStore } from '../stores/auth';
import type { DistanceUnit, NotificationPreferences } from '../types';

type ProfileForm = {
  displayName: string;
  email: string;
  favoriteCuisine: string;
  homeBase: string;
  distanceUnit: DistanceUnit;
  notifications: NotificationPreferences;
};

const auth = useAuthStore();
const router = useRouter();
const saving = ref(false);
const form = reactive<ProfileForm>({
  displayName: '',
  email: '',
  favoriteCuisine: '',
  homeBase: '',
  distanceUnit: 'mi',
  notifications: { sms: false, push: false, email: false }
});

const phoneNumber = computed(() => auth.profile?.phoneNumber || auth.user?.phoneNumber || '');

const emailRule = (value: string) => {
  if (!form.notifications.email) {
    return true;
  }

  const trimmed = (value ?? '').trim();

  if (!trimmed) {
    return 'Email is required when email notifications are enabled.';
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) || 'Enter a valid email address.';
};

function syncFormFromProfile() {
  const profile = auth.profile;

  if (!profile) {
    return;
  }

  form.displayName = profile.displayName;
  form.email = profile.email || '';
  form.favoriteCuisine = profile.favoriteCuisine || '';
  form.homeBase = profile.homeBase || '';
  form.distanceUnit = profile.distanceUnit || 'mi';
  form.notifications = {
    sms: profile.notifications?.sms ?? false,
    push: profile.notifications?.push ?? false,
    email: profile.notifications?.email ?? false
  };
}

watch(
  () => auth.profile,
  (profile, previousProfile) => {
    if (!profile) {
      return;
    }

    // Sync when the profile first loads or the signed-in user changes — not on
    // every partial update (e.g. saving an FCM token while editing the form).
    if (!previousProfile || previousProfile.uid !== profile.uid) {
      syncFormFromProfile();
    }
  },
  { immediate: true }
);

// Email notifications need an address; turn the channel off if it is cleared.
watch(
  () => form.email,
  (email) => {
    if (!email) {
      form.notifications.email = false;
    }
  }
);

const pushToken = ref<string | null>(null);

async function onPushToggle(enabled: boolean) {
  if (!enabled) {
    try {
      await disablePushNotifications();

      if (pushToken.value) {
        await auth.removePushToken(pushToken.value);
        pushToken.value = null;
      }

      await auth.setNotificationChannel('push', false);
    } catch {
      // Best-effort cleanup; the preference is still saved as off.
    }
    return;
  }

  if (!isPushConfigured) {
    form.notifications.push = false;
    Notify.create({
      type: 'warning',
      message: 'Push notifications are not configured yet (missing VAPID key).'
    });
    return;
  }

  try {
    const token = await enablePushNotifications();

    if (!token) {
      form.notifications.push = false;
      Notify.create({
        type: 'warning',
        message: 'Allow notifications in your browser settings to receive push alerts.'
      });
      return;
    }

    pushToken.value = token;
    await auth.savePushToken(token);
    form.notifications.push = true;
    Notify.create({ type: 'positive', message: 'Push notifications enabled on this device.' });
  } catch (error) {
    form.notifications.push = false;
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to enable push notifications.'
    });
  }
}

async function saveProfile() {
  saving.value = true;

  try {
    await auth.saveProfile(form);
    Notify.create({ type: 'positive', message: 'Profile saved.' });
    await router.push({ name: 'map' });
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to save profile.'
    });
  } finally {
    saving.value = false;
  }
}
</script>
