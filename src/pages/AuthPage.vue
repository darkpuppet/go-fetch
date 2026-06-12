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
            Pick your country and enter your phone number. We'll text you a verification code.
          </p>
        </q-card-section>

        <q-banner v-if="!auth.isConfigured" rounded class="app-banner q-mx-md q-mb-md">
          Firebase is not configured yet. Copy <code>.env.example</code> to
          <code>.env.local</code> and enable Phone auth in Firebase.
        </q-banner>

        <q-form @submit.prevent="handleSubmit">
          <q-card-section class="q-gutter-md">
            <div class="row q-col-gutter-sm items-start">
              <q-select
                v-model="country"
                :options="countryOptions"
                option-value="iso"
                option-label="short"
                emit-value
                map-options
                outlined
                use-input
                fill-input
                hide-selected
                input-debounce="0"
                label="Country"
                :disable="codeSent || submitting"
                class="col-auto country-select"
                @filter="filterCountries"
                @focus="onCountryFocus"
                @update:model-value="onCountryChange"
              >
                <template #option="scope">
                  <q-item v-bind="scope.itemProps">
                    <q-item-section>
                      <q-item-label>{{ scope.opt.label }}</q-item-label>
                    </q-item-section>
                    <q-item-section side>+{{ scope.opt.code }}</q-item-section>
                  </q-item>
                </template>
                <template #no-option>
                  <q-item>
                    <q-item-section class="text-grey">No matches</q-item-section>
                  </q-item>
                </template>
              </q-select>

              <q-input
                v-model="nationalNumber"
                outlined
                label="Phone number"
                inputmode="tel"
                autocomplete="tel-national"
                class="col"
                :disable="codeSent || submitting"
                :rules="[phoneRule]"
                @update:model-value="onPhoneInput"
              />
            </div>

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
          </q-card-section>

          <q-card-actions align="between" class="q-pa-md">
            <q-btn
              flat
              no-caps
              color="primary"
              label="Cancel"
              :disable="submitting"
              @click="handleCancel"
            />
            <q-btn
              unelevated
              rounded
              color="primary"
              type="submit"
              :loading="submitting"
              :label="codeSent ? 'Verify and continue' : 'Send verification code'"
            />
          </q-card-actions>
        </q-form>
      </q-card>
    </section>

    <Teleport to="body">
      <div id="recaptcha-container" />
    </Teleport>
  </q-page>
</template>

<script setup lang="ts">
import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumber,
  type CountryCode
} from 'libphonenumber-js';
import { Notify } from 'quasar';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '../stores/auth';

type CountryOption = {
  iso: CountryCode;
  name: string;
  code: string;
  label: string;
  short: string;
};

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const verificationCode = ref('');
const codeSent = ref(false);
const submitting = ref(false);

const regionNames =
  typeof Intl !== 'undefined' && 'DisplayNames' in Intl
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

const allCountries: CountryOption[] = getCountries()
  .map((iso) => {
    const name = regionNames?.of(iso) || iso;
    const code = getCountryCallingCode(iso);
    return { iso, name, code, label: name, short: `${iso} +${code}` };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const country = ref<CountryCode>(
  allCountries.some((c) => c.iso === 'US') ? 'US' : (allCountries[0]?.iso ?? 'US')
);
const countryOptions = ref<CountryOption[]>(allCountries);
const nationalNumber = ref('');

const selectedShort = computed(() => {
  const selected = allCountries.find((c) => c.iso === country.value);
  return selected ? selected.short : country.value;
});

function filterCountries(search: string, update: (cb: () => void) => void) {
  const needle = search.trim().toLowerCase();
  // When the field is focused it is pre-filled with the selected value
  // (e.g. "US +1"); treat that as "no filter" so the full list shows.
  const isPrefilled = needle === selectedShort.value.toLowerCase();

  update(() => {
    countryOptions.value =
      !needle || isPrefilled
        ? allCountries
        : allCountries.filter(
            (c) =>
              c.name.toLowerCase().includes(needle) ||
              c.iso.toLowerCase().includes(needle) ||
              `+${c.code}`.includes(needle)
          );
  });
}

function onCountryFocus(event: Event) {
  // Select the pre-filled text so the first keystroke starts a fresh search.
  (event.target as HTMLInputElement | null)?.select?.();
}

function onPhoneInput(value: string | number | null) {
  nationalNumber.value = new AsYouType(country.value).input(String(value ?? ''));
}

function onCountryChange() {
  if (nationalNumber.value) {
    nationalNumber.value = new AsYouType(country.value).input(nationalNumber.value);
  }
}

const phoneRule = (value: string) =>
  isValidPhoneNumber(value ?? '', country.value) || 'Enter a valid phone number for the selected country.';

async function handleSubmit() {
  submitting.value = true;

  try {
    if (!codeSent.value) {
      const e164 = parsePhoneNumber(nationalNumber.value, country.value).number;
      await auth.requestSmsCode(e164);
      codeSent.value = true;
      Notify.create({ type: 'positive', message: 'Verification code sent.' });
      return;
    }

    await auth.confirmSmsCode(verificationCode.value);
    Notify.create({ type: 'positive', message: 'Welcome to Go Fetch.' });

    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : undefined;
    await router.push(auth.profile ? redirect || { name: 'map' } : { name: 'profile' });
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : '';

    console.error('[auth] sign-in failed', code || error, error);

    Notify.create({
      type: 'negative',
      message: friendlyAuthError(code, error),
      caption: code || undefined,
      timeout: 6000
    });
  } finally {
    submitting.value = false;
  }
}

function friendlyAuthError(code: string, error: unknown): string {
  switch (code) {
    case 'auth/too-many-requests':
      return 'Too many attempts from this device/number. Wait a while, or add this number as a test number in Firebase (Authentication → Sign-in method → Phone).';
    case 'auth/invalid-app-credential':
    case 'auth/missing-app-credential':
      return 'reCAPTCHA verification was rejected. Make sure this exact origin is in Firebase Authorized domains and reload.';
    case 'auth/captcha-check-failed':
      return 'reCAPTCHA check failed. Open the app via an authorized domain (e.g. http://localhost:9000) and reload.';
    case 'auth/operation-not-allowed': {
      const message = error instanceof Error ? error.message : '';
      if (/region/i.test(message)) {
        return "SMS to this country is blocked by the project's SMS region policy. Enable the country in Firebase → Authentication → Settings → SMS Region Policy.";
      }
      return 'Phone sign-in is disabled. Enable it in Firebase → Authentication → Sign-in method → Phone.';
    }
    case 'auth/invalid-phone-number':
      return 'That phone number is not valid for the selected country.';
    case 'auth/quota-exceeded':
      return 'The daily SMS quota for this project is exhausted. Use a Firebase test phone number instead.';
    default:
      return error instanceof Error ? error.message : 'Unable to sign in.';
  }
}

async function handleCancel() {
  await router.push({ name: 'map' });
}
</script>

<style scoped>
.country-select {
  width: 120px;
  min-width: 120px;
  max-width: 120px;
}

/* The invisible reCAPTCHA badge is fixed to the bottom-right of the viewport.
   Reserve scrollable space below the form so the buttons can be scrolled up
   clear of the badge and stay interactive. */
.auth-page {
  padding-bottom: 120px;
}
</style>
