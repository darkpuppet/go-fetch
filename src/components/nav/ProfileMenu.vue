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
    <q-separator />
    <q-item-label header>Appearance</q-item-label>
    <ThemeMenuItems />
  </q-list>
</template>

<script setup lang="ts">
import ThemeMenuItems from './ThemeMenuItems.vue';
</script>
