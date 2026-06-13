#!/usr/bin/env node

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readDefaultProject() {
  const raw = readFileSync(join(rootDir, '.firebaserc'), 'utf8');
  const config = JSON.parse(raw);
  return config.projects?.default;
}

function initAdmin(projectId) {
  if (getApps().length > 0) {
    return;
  }

  const credentialPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (credentialPath && existsSync(credentialPath)) {
    const serviceAccount = JSON.parse(readFileSync(credentialPath, 'utf8'));
    initializeApp({
      credential: cert(serviceAccount),
      projectId
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    projectId
  });
}

function loadDemoTrucks() {
  const raw = readFileSync(join(rootDir, 'src/data/demo-food-trucks.json'), 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const projectId = readDefaultProject();

  if (!projectId) {
    throw new Error('No default Firebase project found in .firebaserc');
  }

  initAdmin(projectId);

  const db = getFirestore();
  const trucks = loadDemoTrucks();
  const batch = db.batch();

  for (const truck of trucks) {
    const { id, ...data } = truck;
    batch.set(db.collection('foodTrucks').doc(id), data, { merge: true });
  }

  await batch.commit();

  console.log(`Seeded ${trucks.length} demo food trucks to Firestore (${projectId}):`);
  for (const truck of trucks) {
    console.log(`  - ${truck.id}: ${truck.name}`);
  }
}

main().catch((error) => {
  console.error('\nFailed to seed food trucks.');
  console.error(error instanceof Error ? error.message : error);
  console.error(
    '\nTip: set FIREBASE_SERVICE_ACCOUNT_PATH to a Firebase service account JSON file,'
  );
  console.error('or run: gcloud auth application-default login --project <your-project-id>');
  process.exit(1);
});
