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

        <q-banner rounded dense class="app-banner q-mx-md q-mb-md">
          <template #avatar>
            <q-icon name="science" />
          </template>
          Go Fetch is in <strong>beta</strong>.
          <span v-if="betaAccepted">You've accepted the beta terms.</span>
          <q-btn
            flat
            dense
            no-caps
            size="sm"
            color="primary"
            :label="betaAccepted ? 'Review' : 'Read and accept'"
            @click="betaDialogOpen = true"
          />
        </q-banner>

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

    <q-dialog v-model="betaDialogOpen" persistent>
      <q-card class="beta-dialog">
        <q-card-section class="row items-center q-gutter-sm">
          <q-icon name="science" color="primary" size="md" />
          <div class="text-h6 text-weight-bold">Go Fetch is in beta</div>
        </q-card-section>

        <q-card-section class="q-pt-none text-body2">
          <p>
            Thanks for trying Go Fetch early. Because this is a beta product, please keep the
            following in mind before signing in:
          </p>
          <ul class="q-pl-md q-my-sm">
            <li>Features may change, break, or be removed without notice.</li>
            <li>Truck locations, hours, and menus may be inaccurate or out of date.</li>
            <li>Service may be interrupted, and data may be reset during the beta.</li>
            <li>The app is provided as-is, without guarantees of availability or accuracy.</li>
          </ul>
          <p class="q-mb-none">
            To sign in, you must acknowledge that Go Fetch is a beta product and accept these
            limitations.
          </p>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <q-checkbox
            v-model="betaCheckbox"
            label="I understand Go Fetch is a beta product and accept its limitations."
          />
        </q-card-section>

        <q-card-actions align="right" class="q-pa-md">
          <q-btn flat no-caps color="primary" label="Not now" @click="declineBeta" />
          <q-btn
            unelevated
            rounded
            no-caps
            color="primary"
            label="Accept and continue"
            :disable="!betaCheckbox"
            @click="acceptBeta"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

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

// Bump the version when the beta terms change so returning users are asked again.
const BETA_ACK_KEY = 'go-fetch:beta-ack:v1';

function readBetaAccepted() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(BETA_ACK_KEY) !== null;
}

const betaAccepted = ref(readBetaAccepted());
const betaCheckbox = ref(betaAccepted.value);
const betaDialogOpen = ref(!betaAccepted.value);

function acceptBeta() {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(BETA_ACK_KEY, new Date().toISOString());
  }
  betaAccepted.value = true;
  betaDialogOpen.value = false;
}

async function declineBeta() {
  betaDialogOpen.value = false;
  if (!betaAccepted.value) {
    await router.push({ name: 'map' });
  }
}

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
  if (!betaAccepted.value) {
    betaDialogOpen.value = true;
    return;
  }

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
.beta-dialog {
  width: 100%;
  max-width: 480px;
}

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
