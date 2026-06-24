#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  FIREBASE_PROJECT_ID,
  PRODUCTION_DEPLOY_TARGETS,
  buildFirebaseDeployArgs
} from './firebase-deploy-config.mjs';
import { runNpmScript, runNpx } from './spawn-helpers.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED_VITE_VARS = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_VAPID_KEY',
  'VITE_GOOGLE_MAPS_API_KEY'
];

function loadEnvFile(filename) {
  const path = join(rootDir, filename);

  if (!existsSync(path)) {
    return {};
  }

  const values = {};

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/u)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function assertProductionBuildEnv() {
  const envFiles = ['.env.production.local', '.env.production', '.env.local', '.env'];
  const merged = {};

  for (const filename of envFiles) {
    Object.assign(merged, loadEnvFile(filename));
  }

  const missing = REQUIRED_VITE_VARS.filter((key) => !merged[key]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Missing production build env vars: ${missing.join(', ')}. ` +
        'Copy .env.example to .env.local and fill in values before deploying.'
    );
  }

  if (merged.VITE_FIREBASE_PROJECT_ID !== FIREBASE_PROJECT_ID) {
    throw new Error(
      `VITE_FIREBASE_PROJECT_ID is "${merged.VITE_FIREBASE_PROJECT_ID}" but deploy target is ` +
        `"${FIREBASE_PROJECT_ID}". GitHub Actions and local deploys must use the same Firebase project.`
    );
  }
}

async function deployFirebase({ only, nonInteractive }) {
  const args = buildFirebaseDeployArgs({ only, nonInteractive });
  await runNpx(args, rootDir, `firebase deploy --project ${FIREBASE_PROJECT_ID}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      production: {
        type: 'boolean',
        short: 'p',
        default: false
      },
      only: {
        type: 'string'
      },
      'skip-build': {
        type: 'boolean',
        default: false
      },
      'skip-functions-build': {
        type: 'boolean',
        default: false
      },
      'non-interactive': {
        type: 'boolean',
        default: false
      },
      help: {
        type: 'boolean',
        short: 'h',
        default: false
      }
    },
    allowPositionals: false
  });

  if (values.help) {
    console.log(`Usage: node scripts/firebase-deploy.mjs [options]

Deploy to Firebase project ${FIREBASE_PROJECT_ID} using the same targets as GitHub Actions.

Options:
  --production, -p          Build app + functions, then deploy ${PRODUCTION_DEPLOY_TARGETS.join(',')}
  --only <targets>          Comma-separated Firebase deploy targets (e.g. hosting,firestore:rules)
  --skip-build              Skip "npm run build" (CI uses this after its build step)
  --skip-functions-build    Skip "npm run functions:build"
  --non-interactive         Pass --non-interactive to firebase-tools (required in CI)
  --help, -h                Show this help
`);
    return;
  }

  const only = values.production ? PRODUCTION_DEPLOY_TARGETS : values.only;
  const shouldBuild = values.production && !values['skip-build'];
  const shouldBuildFunctions =
    values.production && !values['skip-functions-build'] && PRODUCTION_DEPLOY_TARGETS.includes('functions');

  if (!only) {
    throw new Error('Pass --production or --only <targets>. Run with --help for usage.');
  }

  if (shouldBuild) {
    assertProductionBuildEnv();
    await runNpmScript('build', rootDir);
  }

  if (shouldBuildFunctions) {
    await runNpmScript('functions:build', rootDir);
  }

  await deployFirebase({
    only,
    nonInteractive: values['non-interactive']
  });
}

main().catch((error) => {
  console.error(`\n✗ ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
