# Go Fetch

Go Fetch is a [Quasar Framework](https://quasar.dev) (Quasar CLI with Vite) + Firebase progressive web app for finding food trucks on a Google Map after phone-number sign-in.

## Features

- Firebase phone authentication with an invisible reCAPTCHA verifier.
- Profile creation stored in Firestore under `users/{uid}`.
- Authenticated landing page with a Google Map and live food truck markers.
- Feedback chat: diners send messages from `/feedback`; admins read and reply to every thread at `/admin/feedback`.
- Menu orders: a diner selects a truck, orders from its menu, and receives an order number. The truck operator is notified and can view the order while operating the truck.
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

## Feedback chat

Signed-in diners open **Feedback** from the floating chat button (bottom-right), the profile menu, or `/feedback` to start or continue a private thread. The floating button is hidden for guests and while a feedback page is already open. Admins open **Feedback inbox** to see every thread, unread badges, and reply in the same conversation.

Grant inbox access by writing an `admins/{uid}` document. Client apps cannot create that document.

```bash
npm run grant-admin -- YOUR_FIREBASE_UID
npm run grant-admin -- YOUR_FIREBASE_UID --revoke
```

Your Firebase uid is in **Firebase Console → Authentication** (or the signed-in session). After granting, sign out and back in so the app reloads admin status. Deploy the updated Firestore rules before using the chat in production.

When Firebase is not configured locally, `/feedback` and `/admin/feedback` show a demo conversation so the UI can be previewed without phone auth.

## Ordering

Selecting a truck on the map or in the list opens its details, including an **Order** button. The order screen lists that truck's menu items so the diner can choose quantities and an optional note. While they fill that in, the screen shows an estimated wait from `truckOrderStats/{truckId}`: how many recent orders were created, how many are still in progress, and the average time until orders were marked ready (or completed, when a ready time is not stored yet). The clock ticks every second and shows minutes and seconds. A truck with no finished orders uses the default wait from **Operate**, or about 8 minutes when the operator has not set one. On that same screen the operator can turn online ordering off, and can set the farthest a diner may be from the truck. A diner outside that distance sees that they need to be nearer the truck to order. Leaving the distance blank means there is no limit.

Submitting a live order saves `orders/{orderId}` and opens an order status screen with an order number such as `K7M4P`. The approximate wait keeps updating from the order's `estimatedReadyAt` as the queue moves. When the operator marks the order ready, that screen switches to a pickup message, the diner gets an in-app alert, and `notifyCustomerOrderReady` sends a push if they have a token.

The truck owner gets an in-app alert while Go Fetch is open, and a push notification when they have enabled push. Open **My truck → Operate** to set the default wait, turn online ordering on or off, set a maximum order distance, see the order, then accept it, mark it ready, or complete it. Marking ready stores `readyAt`, and completing stores `completedAt`. `syncTruckOrderWait` recomputes the public wait from the latest orders. Orders for a demo truck that is not saved in Firestore stay on the device and show an order number plus a local countdown without notifying an operator.

`notifyOwnerNewOrder` is the Cloud Function on `orders/{orderId}`. Deploy functions after this change so operators and diners receive push notifications when the app is closed.

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

- `users/{uid}` – a signed-in user can read and write only their own profile. Fields are allow-listed, scalar strings are length-capped, and favorite and push-token lists are count-capped. Deletes are denied.
- `foodTrucks/{id}` – public read so the map works before sign-in. Only the owner can write, and only known fields. Each menu item is also stored at `foodTrucks/{id}/menu/{itemId}` with a capped name, description, price, and category. A truck has at most 40 menu items. `ordersEnabled` is an optional boolean, and `maxOrderDistanceMeters` is an optional integer from 100 to 80467. A new order is denied when online ordering is off.
- `truckSpots/{id}` and `truckFoodPhotos/{id}` – public read. The signed-in reporter or uploader can create and delete their own document. Updates are denied. Notes, captions, and photo URLs are length-capped.
- `truckOrderStats/{truckId}` – public read of wait totals. Clients cannot write this document.
- `admins/{uid}` – a signed-in user can read only their own admin document; client writes are denied. Create this document with the Admin SDK (`npm run grant-admin -- <uid>`) or in the Firebase console.
- `feedbackThreads/{uid}` and `feedbackThreads/{uid}/messages/{id}` – a diner can read and write only their own thread; admins can read every thread and reply. Messages are immutable after create.
- `orders/{orderId}` – the diner who placed the order and that truck's owner can read it. A signed-in diner can create an order only for an existing truck, and only in their own name. The owner can update the status. Deletes are denied.
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

`notifyFeedbackMessage` also sends push when a diner posts in `/feedback` (to admins who enabled push) or when an admin replies (to that diner).

`notifyOwnerNewOrder` sends a push to the truck owner when a diner creates an order. The owner still sees the order in **Operate** when push is off, as long as the app is open.

`notifyCustomerOrderReady` sends a push to the diner when that order's status changes to ready. `syncTruckOrderWait` refreshes `truckOrderStats/{truckId}` and each open order's estimated ready time from the latest 40 orders. Clients cannot write that stats document. Deploy the new Firestore indexes with the functions. An order line is accepted only when its name, price, and category match the truck's published menu.

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
- `npm run grant-admin -- <uid>` - create `admins/{uid}` so that account can open the feedback inbox (`--revoke` removes it).
- `npm run firebase:deploy` - run a full Firebase deploy (everything in `firebase.json`).

Serve a production build locally with `npx quasar serve dist/pwa --history`.
