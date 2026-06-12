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

## Getting started

Prerequisites: Node.js (an even-numbered LTS such as 22) and npm. No Python runtime, Python packages, or Python scripts are required by this application.

```bash
npm install
copy .env.example .env.local   # macOS/Linux: cp .env.example .env.local
npm run dev
```

`npm run dev` starts the Quasar dev server in SPA mode. Use `npm run dev:pwa` to develop with the service worker enabled.

Fill in `.env.local` with a Firebase web app config and a Google Maps JavaScript API key (variables keep the `VITE_` prefix and are read via `import.meta.env`). In Firebase, enable Phone authentication and add the local/dev domain to authorized domains.

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

## Scripts

- `npm run dev` - start the Quasar dev server (SPA mode).
- `npm run dev:pwa` - start the Quasar dev server with the PWA service worker enabled.
- `npm run build` - create the production PWA build (output in `dist/pwa`).
- `npm run build:spa` - create a plain SPA production build (output in `dist/spa`).
- `npm run typecheck` - run `vue-tsc` type checking.

Serve a production build locally with `npx quasar serve dist/pwa --history`.
