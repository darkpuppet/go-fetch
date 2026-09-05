<template>
  <q-list dense class="profile-menu">
    <q-item-label header>Appearance</q-item-label>
    <ThemeMenuItems />
    <q-separator />
    <q-item clickable v-close-popup to="/feedback">
      <q-item-section avatar>
        <q-icon name="forum" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Send feedback</q-item-label>
        <q-item-label caption>Chat with Go Fetch after you sign in</q-item-label>
      </q-item-section>
    </q-item>
    <q-item v-if="!isFirebaseConfigured" clickable v-close-popup to="/admin/feedback">
      <q-item-section avatar>
        <q-icon name="inbox" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Feedback inbox</q-item-label>
        <q-item-label caption>Local admin preview</q-item-label>
      </q-item-section>
    </q-item>
    <q-item clickable v-close-popup to="/login">
      <q-item-section avatar>
        <q-icon name="login" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Sign in</q-item-label>
      </q-item-section>
    </q-item>
  </q-list>
</template>

<script setup lang="ts">
import ThemeMenuItems from './ThemeMenuItems.vue';
import { isFirebaseConfigured } from '../../services/firebase';
</script>
