# Go Fetch

Go Fetch is a Quasar + Firebase progressive web app for finding food trucks on a Google Map after phone-number sign-in.

## Features

- Firebase phone authentication with an invisible reCAPTCHA verifier.
- Profile creation stored in Firestore under `users/{uid}`.
- Authenticated landing page with a Google Map and live food truck markers.
- Firestore-backed `foodTrucks` collection with a built-in demo fallback when Firebase is not configured.
- Installable PWA build using `vite-plugin-pwa`.

## Getting started

Prerequisites: Node.js and npm. No Python runtime, Python packages, or Python scripts are required by this application.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Fill in `.env.local` with a Firebase web app config and a Google Maps JavaScript API key. In Firebase, enable Phone authentication and add the local/dev domain to authorized domains.

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

- `npm run dev` - start the local Vite dev server.
- `npm run build` - type-check and create the production PWA build.
- `npm run preview` - preview the production build.
