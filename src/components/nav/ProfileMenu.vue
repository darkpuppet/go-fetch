<template>
  <q-list dense class="profile-menu">
    <q-item clickable v-close-popup to="/profile">
      <q-item-section avatar>
        <q-icon name="person" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Profile</q-item-label>
        <q-item-label caption>Account and notification settings</q-item-label>
      </q-item-section>
    </q-item>
    <q-item clickable v-close-popup to="/feedback">
      <q-item-section avatar>
        <q-icon name="forum" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Feedback</q-item-label>
        <q-item-label caption>Chat with Go Fetch</q-item-label>
      </q-item-section>
      <q-item-section v-if="feedback.userUnreadCount" side>
        <q-badge rounded color="primary" :label="feedback.userUnreadCount" />
      </q-item-section>
    </q-item>
    <q-item v-if="auth.isAdmin" clickable v-close-popup to="/admin/feedback">
      <q-item-section avatar>
        <q-icon name="inbox" />
      </q-item-section>
      <q-item-section>
        <q-item-label>Feedback inbox</q-item-label>
        <q-item-label caption>Read and reply to every thread</q-item-label>
      </q-item-section>
      <q-item-section v-if="feedback.adminUnreadCount" side>
        <q-badge rounded color="primary" :label="feedback.adminUnreadCount" />
      </q-item-section>
    </q-item>
    <q-separator />
    <q-item-label header>Appearance</q-item-label>
    <ThemeMenuItems />
  </q-list>
</template>

<script setup lang="ts">
import ThemeMenuItems from './ThemeMenuItems.vue';
import { useAuthStore } from '../../stores/auth';
import { useFeedbackStore } from '../../stores/feedback';

const auth = useAuthStore();
const feedback = useFeedbackStore();
</script>
