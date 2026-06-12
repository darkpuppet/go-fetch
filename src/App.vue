<template>
  <q-layout view="lHh Lpr lFf">
    <q-header elevated class="bg-white text-slate app-header">
      <q-toolbar class="container toolbar">
        <q-avatar rounded color="primary" text-color="white" icon="local_shipping" />
        <q-toolbar-title>
          <div class="brand-title">Go Fetch</div>
          <div class="brand-subtitle">Food truck tracker</div>
        </q-toolbar-title>

        <q-btn
          v-if="auth.user"
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

import { useAuthStore } from './stores/auth';

const auth = useAuthStore();
const router = useRouter();

async function handleSignOut() {
  await auth.signOutUser();
  Notify.create({ type: 'positive', message: 'Signed out successfully.' });
  await router.push({ name: 'login' });
}
</script>
