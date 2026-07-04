<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="app-header">
      <q-toolbar class="container toolbar">
        <q-avatar rounded color="primary" text-color="white" icon="local_shipping" />
        <q-toolbar-title class="toolbar-brand">
          <div class="brand-title">Go Fetch</div>
          <div class="brand-subtitle gt-xs">Food truck tracker</div>
        </q-toolbar-title>

        <LiveLocationPill v-if="auth.user" class="toolbar-live-pill" />

        <div v-if="auth.user" class="toolbar-actions gt-sm">
          <q-btn-dropdown
            class="profile-button"
            flat
            no-caps
            color="accent"
            icon="local_shipping"
            label="My truck"
          >
            <q-list dense>
              <TruckOwnerMenu />
            </q-list>
          </q-btn-dropdown>

          <q-btn-dropdown
            class="profile-button"
            flat
            no-caps
            color="accent"
            icon="account_circle"
            :label="auth.profile?.displayName || 'Profile'"
            aria-label="Profile menu"
          >
            <ProfileMenu />
          </q-btn-dropdown>

          <q-btn
            flat
            round
            color="negative"
            icon="logout"
            aria-label="Sign out"
            @click="handleSignOut"
          />
        </div>

        <div v-if="!auth.user" class="toolbar-actions gt-sm">
          <q-btn-dropdown
            class="profile-button"
            flat
            no-caps
            color="accent"
            icon="account_circle"
            label="Account"
            aria-label="Account menu"
          >
            <GuestMenu />
          </q-btn-dropdown>
        </div>

        <q-btn
          class="lt-sm mobile-menu-button"
          flat
          round
          dense
          icon="menu"
          aria-label="Open menu"
          @click="mobileMenuOpen = true"
        />
      </q-toolbar>
    </q-header>

    <q-drawer
      v-model="mobileMenuOpen"
      side="right"
      overlay
      bordered
      class="mobile-nav-drawer"
      :width="280"
    >
      <q-scroll-area class="mobile-nav-scroll">
        <q-list class="mobile-nav-list">
          <template v-if="auth.user">
            <q-item-label header>My truck</q-item-label>
            <TruckOwnerMenu @navigate="closeMobileMenu" />

            <q-separator spaced />

            <q-item-label header>Account</q-item-label>
            <q-item clickable v-ripple to="/profile" @click="closeMobileMenu">
              <q-item-section avatar>
                <q-icon name="person" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Profile</q-item-label>
                <q-item-label caption>Account and notification settings</q-item-label>
              </q-item-section>
            </q-item>

            <q-separator spaced />

            <q-item-label header>Appearance</q-item-label>
            <ThemeMenuItems @select="closeMobileMenu" />

            <q-separator spaced />

            <q-item clickable v-ripple @click="handleMobileSignOut">
              <q-item-section avatar>
                <q-icon name="logout" color="negative" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Sign out</q-item-label>
              </q-item-section>
            </q-item>
          </template>

          <template v-else>
            <q-item-label header>Appearance</q-item-label>
            <ThemeMenuItems @select="closeMobileMenu" />

            <q-separator spaced />

            <q-item clickable v-ripple to="/login" @click="closeMobileMenu">
              <q-item-section avatar>
                <q-icon name="login" />
              </q-item-section>
              <q-item-section>
                <q-item-label>Sign in</q-item-label>
              </q-item-section>
            </q-item>
          </template>
        </q-list>
      </q-scroll-area>
    </q-drawer>

    <q-page-container>
      <router-view />
    </q-page-container>
  </q-layout>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import LiveLocationPill from '../components/LiveLocationPill.vue';
import GuestMenu from '../components/nav/GuestMenu.vue';
import ProfileMenu from '../components/nav/ProfileMenu.vue';
import ThemeMenuItems from '../components/nav/ThemeMenuItems.vue';
import TruckOwnerMenu from '../components/nav/TruckOwnerMenu.vue';
import { useAuthStore } from '../stores/auth';
import { useOwnerTrucksStore } from '../stores/ownerTrucks';
import { useTruckLiveTrackingStore } from '../stores/truckLiveTracking';

const auth = useAuthStore();
const ownerTrucks = useOwnerTrucksStore();
const liveTracking = useTruckLiveTrackingStore();
const router = useRouter();
const mobileMenuOpen = ref(false);

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

function closeMobileMenu() {
  mobileMenuOpen.value = false;
}

async function handleSignOut() {
  await auth.signOutUser();
  Notify.create({ type: 'positive', message: 'Signed out successfully.' });
  await router.push({ name: 'login' });
}

async function handleMobileSignOut() {
  closeMobileMenu();
  await handleSignOut();
}
</script>
