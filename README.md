# Go Fetch

Go Fetch is a [Quasar Framework](https://quasar.dev) (Quasar CLI with Vite) + Firebase progressive web app for finding food trucks on a Google Map after phone-number sign-in.

## Features

- Firebase phone authentication with an invisible reCAPTCHA verifier.
- Profile creation stored in Firestore under `users/{uid}`.
- Authenticated landing page with a Google Map and live food truck markers.
- Firestore-backed `foodTrucks` collection with a built-in demo fallback when Firebase is not configured.
- Installable PWA build using Quasar's built-in PWA mode (Workbox).

## Project structure

This is a standard Quasar CLI project:

- `quasar.config.ts` – Quasar App config (boot files, framework plugins, build, PWA).
- `src/boot/` – app initialization run before mount (`init.ts` wires the auth/theme stores and route guards).
- `src/layouts/` – app layouts (`MainLayout.vue` holds the header).
- `src/pages/` – routed pages.
- `src/router/` – `routes.ts` and the Quasar router wrapper.
- `src/stores/` – Pinia stores plus the Pinia wrapper in `index.ts`.
- `src/css/` – `quasar.variables.scss` (brand colors) and global `app.scss`.
- `src-pwa/` – service worker registration and PWA manifest.
- `public/firebase-messaging-sw.js` – background service worker for Firebase Cloud Messaging (push).
- `functions/` – Cloud Functions (favorite-truck push notifications).
- `firestore.rules` / `firebase.json` / `firestore.indexes.json` / `.firebaserc` – Firebase CLI config and Firestore security rules.

## Getting started

Prerequisites: Node.js (an even-numbered LTS such as 22) and npm. No Python runtime, Python packages, or Python scripts are required by this application.

```bash
npm install
copy .env.example .env.local   # macOS/Linux: cp .env.example .env.local
npm run dev
```

`npm run dev` starts the Quasar dev server in SPA mode. Use `npm run dev:pwa` to develop with the service worker enabled.

Fill in `.env.local` with a Firebase web app config and a Google Maps JavaScript API key (variables keep the `VITE_` prefix and are read via `import.meta.env`). In Firebase, enable Phone authentication and add the local/dev domain to authorized domains.

### Interactive script menu

Run the project menu to pick any npm script with arrow keys (↑/↓). Help text for the highlighted option appears at the bottom of the list:

```bash
npm run menu
```

(`npm run go` is an alias for the same menu.)

## Firestore data shape

Create documents in a `foodTrucks` collection with fields like:

```json
{
  "name": "Taco Trek",
  "cuisine": "Tacos",
  "description": "Street tacos and agua frescas",
  "status": "Serving now",
  "nextStop": "Love Park until 2 PM",
  "location": {
    "lat": 39.9526,
    "lng": -75.1652
  }
}
```

User profiles are saved to `users/{uid}` with `displayName`, `favoriteCuisine`, `homeBase`, and `phoneNumber` fields.

Seed the demo trucks into Firestore (requires a service account or Application Default Credentials):

```bash
npm run seed:trucks
```

Or use **Deploy menu → Seed demo food trucks in Firestore** (`npm run deploy`). Set `FIREBASE_SERVICE_ACCOUNT_PATH` to a Firebase service account JSON file, or run `gcloud auth application-default login --project go-fetch-app-2021-01`.

Demo truck definitions live in `src/data/demo-food-trucks.json` (also used as the in-app fallback when Firestore is empty).

## Firebase Hosting

The production PWA build in `dist/pwa` is served by Firebase Hosting (SPA rewrites to `index.html`).

Deploy the hosted app:

```bash
npm run deploy:hosting
```

Or use the interactive menu:

```bash
npm run deploy
# choose "Build and deploy Firebase Hosting"
```

After deploy, open:

- **https://go-fetch-app-2021-01.web.app**
- **https://go-fetch-app-2021-01.firebaseapp.com**

Before using phone auth or Maps on the hosted URL, add those domains to **Firebase Authentication → Authorized domains** and restrict your Google Maps API key to them.

`npm run build` reads `VITE_*` variables from `.env.local` (or `.env.production` if present) at build time — set production config before deploying.

## Firestore security rules

Security rules live in `firestore.rules` and are deployed with the Firebase CLI (`firebase.json` and `.firebaserc` target the `go-fetch-app-2021-01` project). They grant:

- `users/{uid}` – a signed-in user can read and write only their own profile document.
- `foodTrucks/{id}` – public read so the map works before sign-in; client writes are denied (manage trucks via the Firebase console or the Admin SDK).
- everything else is denied.

Deploy the rules (authenticate once via the deployment menu or `npm run firebase:login`):

```bash
npm run deploy
```

This opens a cross-platform deployment menu (↑/↓ to navigate, help text at the bottom). It works on Windows, macOS, and Linux. Options include production builds, Firestore rules/indexes, Cloud Functions, and full Firebase deploy. You can also run targets directly:

```bash
npm run firebase:deploy:rules
npm run firebase:deploy:firestore
npm run firebase:deploy:functions
```

After editing `firestore.rules`, just re-run that script to publish the changes. You can also paste the file contents into **Firebase Console → Firestore Database → Rules → Publish**.

## Push notifications (Firebase Cloud Messaging)

Users choose SMS, push, and email notification preferences in their profile (stored on `users/{uid}`). Only **push** is wired up on the client; SMS and email require a backend sender (see below).

Client setup for push:

1. In **Firebase Console → Project settings → Cloud Messaging**, generate a **Web Push certificate** key pair and copy the public key.
2. Set `VITE_FIREBASE_VAPID_KEY` in `.env.local` to that key.
3. Run the app over `localhost` or HTTPS (service workers/push require a secure context).

When a user enables **Push** in their profile, the app requests notification permission, retrieves an FCM token, and stores it in `users/{uid}.fcmTokens`. The background worker `public/firebase-messaging-sw.js` (registered under FCM's dedicated scope so it coexists with the Quasar/Workbox service worker) displays notifications when the app is closed; foreground messages surface via a Quasar `Notify` toast.

### Cloud Function: favorite truck is serving

`functions/src/index.ts` defines `notifyFavoriteTruckServing`, a Firestore trigger on `foodTrucks/{truckId}`. When a truck's `status` changes **to** `"Serving now"`, it:

1. Finds users who favorited that truck (`favoriteTruckIds`) and opted into push (`notifications.push === true`).
2. Sends an FCM notification to their saved `fcmTokens`.
3. Removes stale/invalid tokens from the user's profile.

Deploy the function and its Firestore index:

```bash
npm run deploy
# choose "Build and deploy Cloud Functions" or "Deploy everything to Firebase"
```

First-time Cloud Functions deploy may require the **Blaze (pay-as-you-go) plan** and IAM permissions (`Service Account User`, `Cloud Functions Admin`) on the Firebase/Google Cloud project. If deploy fails with `iam.serviceAccounts.ActAs` denied, ask a project Owner to grant those roles or redeploy from the Firebase Console after upgrading the plan.

To test end-to-end:

1. Sign in, favorite a truck, enable **Push** in your profile, and save.
2. In Firebase Console, edit that truck's `status` from something else to `"Serving now"`.
3. You should receive a push notification on that device.

SMS and email preferences are stored but not sent yet; add Twilio/SendGrid (or Firebase extensions) in Cloud Functions when you're ready for those channels.

## Scripts

Use **`npm run menu`** for the full interactive script picker, or **`npm run deploy`** for deployment only. Direct scripts:

- `npm run menu` / `npm run go` - interactive script menu with descriptions (↑/↓, Enter to run).
- `npm run deploy` - interactive deployment menu (builds, Firestore, hosting, functions).
- `npm run deploy:hosting` - build PWA and deploy to Firebase Hosting.
- `npm run dev` - start the Quasar dev server (SPA mode).
- `npm run dev:pwa` - start the Quasar dev server with the PWA service worker enabled.
- `npm run build` - create the production PWA build (output in `dist/pwa`).
- `npm run build:spa` - create a plain SPA production build (output in `dist/spa`).
- `npm run typecheck` - run `vue-tsc` type checking.
- `npm run firebase:login` - authenticate the Firebase CLI (one-time).
- `npm run deploy` / `npm run firebase` / `npm run firebase:deploy` - interactive deployment menu.
- `npm run firebase:deploy:hosting` - deploy hosting only (run `npm run build` first).
- `npm run firebase:deploy:rules` - deploy the Firestore security rules only.
- `npm run firebase:deploy:firestore` - deploy Firestore rules and indexes.
- `npm run firebase:deploy:functions` - build and deploy Cloud Functions.
- `npm run seed:trucks` - write demo food trucks to Firestore (Admin SDK).
- `npm run firebase:deploy` - run a full Firebase deploy (everything in `firebase.json`).

Serve a production build locally with `npx quasar serve dist/pwa --history`.
