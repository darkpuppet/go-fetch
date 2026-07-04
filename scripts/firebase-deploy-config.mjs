import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Must match .firebaserc default and GitHub Actions projectId. */
export const FIREBASE_PROJECT_ID = 'go-fetch-app-2021-01';

/**
 * Production deploy targets shared by:
 * - .github/workflows/firebase-hosting-merge.yml
 * - npm run deploy:production
 * - deploy menu "Deploy production (matches CI)"
 *
 * Requires Firebase Storage to be enabled once in the Firebase Console
 * (Project settings → Storage → Get started). CI cannot provision the bucket;
 * it deploys storage.rules and bakes VITE_FIREBASE_STORAGE_BUCKET into the PWA build.
 */
export const PRODUCTION_DEPLOY_TARGETS = ['hosting', 'firestore', 'functions', 'storage'];

export const FIREBASE_CLI_ARGS = ['-y', 'firebase-tools@latest'];

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

export function readFirebaseProjectId() {
  try {
    const raw = readFileSync(join(rootDir, '.firebaserc'), 'utf8');
    const config = JSON.parse(raw);
    return config.projects?.default ?? FIREBASE_PROJECT_ID;
  } catch {
    return FIREBASE_PROJECT_ID;
  }
}

export function assertProjectAlignment() {
  const firebasercProject = readFirebaseProjectId();

  if (firebasercProject !== FIREBASE_PROJECT_ID) {
    throw new Error(
      `.firebaserc default project (${firebasercProject}) does not match ` +
        `scripts/firebase-deploy-config.mjs (${FIREBASE_PROJECT_ID}). ` +
        'Update one of them so local deploys and GitHub Actions stay aligned.'
    );
  }
}

export function buildFirebaseDeployArgs({
  only,
  nonInteractive = false
} = {}) {
  assertProjectAlignment();

  const args = [
    ...FIREBASE_CLI_ARGS,
    'deploy',
    '--project',
    FIREBASE_PROJECT_ID
  ];

  if (only) {
    const targets = Array.isArray(only) ? only.join(',') : only;
    args.push('--only', targets);
  }

  if (nonInteractive) {
    args.push('--non-interactive');
  }

  return args;
}
