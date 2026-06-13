<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="app-header">
      <q-toolbar class="container toolbar">
        <q-avatar rounded color="primary" text-color="white" icon="local_shipping" />
        <q-toolbar-title>
          <div class="brand-title">Go Fetch</div>
          <div class="brand-subtitle">Food truck tracker</div>
        </q-toolbar-title>

        <LiveLocationPill v-if="auth.user" />

        <q-btn-dropdown
          class="theme-button"
          flat
          round
          color="accent"
          :icon="theme.icon"
          aria-label="Theme preference"
          auto-close
        >
          <q-list dense class="theme-menu">
            <q-item
              v-for="option in themeOptions"
              :key="option.value"
              clickable
              :active="theme.preference === option.value"
              active-class="theme-menu-active"
              @click="theme.setPreference(option.value)"
            >
              <q-item-section avatar>
                <q-icon :name="option.icon" />
              </q-item-section>
              <q-item-section>
                <q-item-label>{{ option.label }}</q-item-label>
                <q-item-label caption>{{ option.caption }}</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>

        <q-btn-dropdown
          v-if="auth.user"
          class="profile-button"
          flat
          no-caps
          color="accent"
          icon="local_shipping"
          label="My truck"
        >
          <q-list dense>
            <q-item
              clickable
              v-close-popup
              :disable="!ownerTrucks.hasTrucks"
              :to="ownerTrucks.hasTrucks ? '/truck/operate' : undefined"
              @click="goToOperate"
            >
              <q-item-section avatar>
                <q-icon name="play_circle" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Operate</q-item-label>
                <q-item-label caption>Status, location, and menu</q-item-label>
              </q-item-section>
            </q-item>
            <q-item clickable v-close-popup to="/truck/manage">
              <q-item-section avatar>
                <q-icon name="settings" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Manage trucks</q-item-label>
                <q-item-label caption>Add or remove trucks you own</q-item-label>
              </q-item-section>
            </q-item>
          </q-list>
        </q-btn-dropdown>
        <q-btn
          v-if="auth.user"
          class="profile-button"
          flat
          no-caps
          color="accent"
          icon="account_circle"
          :label="auth.profile?.displayName || 'Profile'"
          to="/profile"
        />
        <q-btn
          v-if="auth.user"
          flat
          round
          color="negative"
          icon="logout"
          aria-label="Sign out"
          @click="handleSignOut"
        />
        <q-btn
          v-if="!auth.user"
          class="profile-button"
          flat
          no-caps
          color="accent"
          icon="login"
          label="Sign in"
          to="/login"
        />
      </q-toolbar>
    </q-header>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { watch } from 'vue';
import { useRouter } from 'vue-router';

import LiveLocationPill from '../components/LiveLocationPill.vue';
import { useAuthStore } from '../stores/auth';
import { useOwnerTrucksStore } from '../stores/ownerTrucks';
import { useTruckLiveTrackingStore } from '../stores/truckLiveTracking';
import { useThemeStore, type ThemePreference } from '../stores/theme';

const auth = useAuthStore();
const theme = useThemeStore();
const ownerTrucks = useOwnerTrucksStore();
const liveTracking = useTruckLiveTrackingStore();
const router = useRouter();

watch(
  () => auth.user?.uid,
  (uid) => {
    if (uid) {
      ownerTrucks.init(uid);
      liveTracking.attach();
      return;
    }

    ownerTrucks.reset();
    liveTracking.reset();
  },
  { immediate: true }
);

async function goToOperate() {
  if (!ownerTrucks.hasTrucks) {
    await router.push('/truck/manage');
    return;
  }

  await router.push('/truck/operate');
}

const themeOptions: Array<{
  value: ThemePreference;
  label: string;
  caption: string;
  icon: string;
}> = [
  {
    value: 'system',
    label: 'System',
    caption: 'Use browser preference',
    icon: 'contrast'
  },
  {
    value: 'light',
    label: 'Light',
    caption: 'Always use light mode',
    icon: 'light_mode'
  },
  {
    value: 'dark',
    label: 'Dark',
    caption: 'Always use dark mode',
    icon: 'dark_mode'
  }
];

async function handleSignOut() {
  await auth.signOutUser();
  Notify.create({ type: 'positive', message: 'Signed out successfully.' });
  await router.push({ name: 'login' });
}
</script>
