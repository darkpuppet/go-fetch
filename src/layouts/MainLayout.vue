<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="app-header">
      <q-toolbar class="container toolbar">
        <q-avatar rounded color="primary" text-color="white" icon="local_shipping" />
        <q-toolbar-title>
          <div class="brand-title">Go Fetch</div>
          <div class="brand-subtitle">Food truck tracker</div>
        </q-toolbar-title>

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
import { useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';
import { useThemeStore, type ThemePreference } from '../stores/theme';

const auth = useAuthStore();
const theme = useThemeStore();
const router = useRouter();

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
