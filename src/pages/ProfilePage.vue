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
import { reactive, watchEffect, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const router = useRouter();
const saving = ref(false);
const form = reactive({
  displayName: '',
  favoriteCuisine: '',
  homeBase: ''
});

watchEffect(() => {
  if (auth.profile) {
    form.displayName = auth.profile.displayName;
    form.favoriteCuisine = auth.profile.favoriteCuisine || '';
    form.homeBase = auth.profile.homeBase || '';
  }
});

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
