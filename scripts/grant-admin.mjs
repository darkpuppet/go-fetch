#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cert, getApps, initializeApp, applicationDefault } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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

function parseArgs(argv) {
  const args = argv.filter((value) => value !== '--');
  const revoke = args.includes('--revoke');
  const uid = args.find((value) => !value.startsWith('-'));

  return { revoke, uid };
}

async function main() {
  const { revoke, uid } = parseArgs(process.argv.slice(2));

  if (!uid) {
    throw new Error('Usage: npm run grant-admin -- <firebase-uid> [--revoke]');
  }

  const projectId = readDefaultProject();

  if (!projectId) {
    throw new Error('No default Firebase project found in .firebaserc');
  }

  initAdmin(projectId);

  const db = getFirestore();
  const adminRef = db.collection('admins').doc(uid);

  if (revoke) {
    await adminRef.delete();
    console.log(`Revoked admin access for ${uid} in ${projectId}.`);
    return;
  }

  await adminRef.set(
    {
      createdAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  console.log(`Granted admin access to ${uid} in ${projectId}.`);
  console.log('That account can now open /admin/feedback and reply to every diner thread.');
}

main().catch((error) => {
  console.error('\nFailed to update admin access.');
  console.error(error instanceof Error ? error.message : error);
  console.error(
    '\nTip: set FIREBASE_SERVICE_ACCOUNT_PATH to a Firebase service account JSON file,'
  );
  console.error('or run: gcloud auth application-default login --project <your-project-id>');
  process.exit(1);
});
