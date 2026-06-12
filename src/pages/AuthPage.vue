<template>
  <q-page class="auth-page page-shell">
    <section class="container auth-grid">
      <div class="hero-card text-white">
        <q-chip color="white" text-color="primary" icon="local_fire_department" label="Fresh routes" />
        <h1>Find the food trucks serving near you.</h1>
        <p>
          Sign in with your phone number, set up your profile, and open directly to a live map
          of nearby trucks.
        </p>
      </div>

      <q-card class="auth-card" flat bordered>
        <q-card-section>
          <div class="text-h5 text-weight-bold">Sign in</div>
          <p class="text-body2 text-grey-7 q-mt-sm">
            Use an E.164 phone number such as <strong>+15551234567</strong>.
          </p>
        </q-card-section>

        <q-banner v-if="!auth.isConfigured" rounded class="app-banner q-mx-md q-mb-md">
          Firebase is not configured yet. Copy <code>.env.example</code> to
          <code>.env.local</code> and enable Phone auth in Firebase.
        </q-banner>

        <q-form @submit.prevent="handleSubmit">
          <q-card-section class="q-gutter-md">
            <q-input
              v-model.trim="phoneNumber"
              outlined
              label="Phone number"
              autocomplete="tel"
              :disable="codeSent || submitting || !auth.isConfigured"
              :rules="[phoneRule]"
            />

            <q-input
              v-if="codeSent"
              v-model.trim="verificationCode"
              outlined
              label="Verification code"
              inputmode="numeric"
              autocomplete="one-time-code"
              :disable="submitting"
              :rules="[(value) => Boolean(value) || 'Enter the code sent to your phone']"
            />

            <div id="recaptcha-container" />
          </q-card-section>

          <q-card-actions align="right" class="q-pa-md">
            <q-btn
              unelevated
              rounded
              color="primary"
              type="submit"
              :loading="submitting"
              :disable="!auth.isConfigured"
              :label="codeSent ? 'Verify and continue' : 'Send verification code'"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { Notify } from 'quasar';
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const phoneNumber = ref('');
const verificationCode = ref('');
const codeSent = ref(false);
const submitting = ref(false);

const phoneRule = (value: string) =>
  /^\+[1-9]\d{7,14}$/.test(value) || 'Enter a phone number in E.164 format.';

async function handleSubmit() {
  submitting.value = true;

  try {
    if (!codeSent.value) {
      await auth.requestSmsCode(phoneNumber.value);
      codeSent.value = true;
      Notify.create({ type: 'positive', message: 'Verification code sent.' });
      return;
    }

    await auth.confirmSmsCode(verificationCode.value);
    Notify.create({ type: 'positive', message: 'Welcome to Go Fetch.' });

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined;
    await router.push(auth.profile ? redirect || { name: 'map' } : { name: 'profile' });
  } catch (error) {
    Notify.create({
      type: 'negative',
      message: error instanceof Error ? error.message : 'Unable to sign in.'
    });
  } finally {
    submitting.value = false;
  }
}
</script>
