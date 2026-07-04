<template>
  <q-list dense class="profile-menu">
    <q-item-label header>Appearance</q-item-label>
    <ThemeMenuItems />
    <q-separator />
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
</script>
