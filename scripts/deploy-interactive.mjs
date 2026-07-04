#!/usr/bin/env node

import { confirm, select } from '@inquirer/prompts';

import {
  FIREBASE_PROJECT_ID,
  PRODUCTION_DEPLOY_TARGETS,
  buildFirebaseDeployArgs
} from './firebase-deploy-config.mjs';
import { runNpmScript, runNpx } from './spawn-helpers.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function deployOnly(only, label) {
  return () =>
    runNpx(buildFirebaseDeployArgs({ only }), rootDir, `firebase deploy --project ${FIREBASE_PROJECT_ID}`);
}

/** @type {Record<string, { label: string; confirm?: string; run: () => Promise<void> }>} */
const DEPLOY_ACTIONS = {
  'build:pwa': {
    label: 'Build production PWA',
    confirm: 'Build the production PWA to dist/pwa?',
    run: () => runNpmScript('build', rootDir)
  },
  'build:spa': {
    label: 'Build production SPA',
    confirm: 'Build the production SPA to dist/spa?',
    run: () => runNpmScript('build:spa', rootDir)
  },
  'production': {
    label: 'Deploy production (matches GitHub Actions)',
    confirm:
      `Build app + functions and deploy ${PRODUCTION_DEPLOY_TARGETS.join(', ')} to ${FIREBASE_PROJECT_ID}?`,
    run: () => runNpmScript('deploy:production', rootDir)
  },
  'firestore:rules': {
    label: 'Deploy Firestore security rules',
    confirm: `Deploy Firestore security rules to ${FIREBASE_PROJECT_ID}?`,
    run: deployOnly('firestore:rules')
  },
  'storage:rules': {
    label: 'Deploy Storage security rules',
    confirm: `Deploy Firebase Storage security rules to ${FIREBASE_PROJECT_ID}?`,
    run: deployOnly('storage')
  },
  'rules:all': {
    label: 'Deploy Firestore and Storage rules',
    confirm: `Deploy Firestore and Storage security rules to ${FIREBASE_PROJECT_ID}?`,
    run: deployOnly('firestore:rules,storage')
  },
  firestore: {
    label: 'Deploy Firestore rules and indexes',
    confirm: `Deploy Firestore rules and composite indexes to ${FIREBASE_PROJECT_ID}?`,
    run: deployOnly('firestore')
  },
  functions: {
    label: 'Build and deploy Cloud Functions',
    confirm: `Build and deploy Cloud Functions to ${FIREBASE_PROJECT_ID}?`,
    run: async () => {
      await runNpmScript('functions:build', rootDir);
      await deployOnly('functions')();
    }
  },
  hosting: {
    label: 'Build and deploy Firebase Hosting only',
    confirm: `Build the production PWA and deploy hosting only to ${FIREBASE_PROJECT_ID}?`,
    run: async () => {
      await runNpmScript('build', rootDir);
      await deployOnly('hosting')();
    }
  },
  'functions:build': {
    label: 'Build Cloud Functions only',
    confirm: 'Compile functions/ to functions/lib without deploying?',
    run: () => runNpmScript('functions:build', rootDir)
  },
  'firebase:login': {
    label: 'Log in to Firebase CLI',
    run: () =>
      runNpx(
        ['-y', 'firebase-tools@latest', 'login', '--project', FIREBASE_PROJECT_ID],
        rootDir,
        `firebase login --project ${FIREBASE_PROJECT_ID}`
      )
  },
  'seed:trucks': {
    label: 'Seed demo food trucks in Firestore',
    confirm: `Write the 3 demo foodTrucks documents to Firestore in ${FIREBASE_PROJECT_ID}?`,
    run: () => runNpmScript('seed:trucks', rootDir)
  }
};

const DEPLOY_MENU = [
  { type: 'separator', separator: '── App build ──' },
  {
    value: 'build:pwa',
    description: 'Production PWA build with service worker (output: dist/pwa)'
  },
  {
    value: 'build:spa',
    description: 'Production SPA build without PWA (output: dist/spa)'
  },

  { type: 'separator', separator: '── Firebase ──' },
  {
    value: 'production',
    description: `Same as CI merge to main — ${PRODUCTION_DEPLOY_TARGETS.join(', ')} → ${FIREBASE_PROJECT_ID}`
  },
  {
    value: 'firestore:rules',
    description: 'Publish firestore.rules only'
  },
  {
    value: 'storage:rules',
    description: 'Publish storage.rules for truck spot photo uploads'
  },
  {
    value: 'rules:all',
    description: 'Publish Firestore and Storage rules'
  },
  {
    value: 'firestore',
    description: 'Publish security rules and Firestore composite indexes'
  },
  {
    value: 'functions',
    description: 'Compile TypeScript and deploy notifyFavoriteTruckServing'
  },
  {
    value: 'hosting',
    description: 'Build dist/pwa and publish hosting only (partial deploy)'
  },

  { type: 'separator', separator: '── Tools ──' },
  {
    value: 'functions:build',
    description: 'Compile functions/ locally without deploying (verify before deploy)'
  },
  {
    value: 'seed:trucks',
    description: 'Create/update the 3 demo trucks in the foodTrucks collection'
  },
  {
    value: 'firebase:login',
    description: `Authenticate Firebase CLI for ${FIREBASE_PROJECT_ID}`
  }
];

function buildChoices() {
  const choices = DEPLOY_MENU.filter(
    (entry) => entry.type === 'separator' || DEPLOY_ACTIONS[entry.value]
  ).map((entry) => {
    if (entry.type === 'separator') {
      return entry;
    }

    return {
      name: DEPLOY_ACTIONS[entry.value].label,
      value: entry.value,
      description: entry.description
    };
  });

  choices.push({ type: 'separator', separator: '──' });
  choices.push({
    name: 'Exit',
    value: '__exit__',
    description: 'Leave the deployment menu'
  });

  return choices;
}

async function runDeployment(actionKey) {
  const action = DEPLOY_ACTIONS[actionKey];

  if (action.confirm) {
    const approved = await confirm({
      message: action.confirm,
      default: false
    });

    if (!approved) {
      console.log('Skipped.');
      return false;
    }
  }

  await action.run();
  console.log(`\n✓ ${action.label} completed.`);
  return true;
}

async function main() {
  console.log('\nGo Fetch — deployment menu');
  console.log(`Target project: ${FIREBASE_PROJECT_ID}`);
  console.log('Use ↑/↓ to move, Enter to select, Ctrl+C to quit.\n');

  while (true) {
    const choice = await select({
      message: 'Choose a deployment action',
      choices: buildChoices(),
      pageSize: 14,
      loop: false
    });

    if (choice === '__exit__') {
      console.log('Bye.');
      break;
    }

    try {
      await runDeployment(choice);
    } catch (error) {
      console.error(`\n✗ Failed: ${error instanceof Error ? error.message : error}`);
    }

    const again = await confirm({
      message: 'Run another deployment action?',
      default: true
    });

    if (!again) {
      console.log('Bye.');
      break;
    }

    console.log('');
  }
}

main().catch((error) => {
  if (error?.name === 'ExitPromptError') {
    console.log('\nBye.');
    process.exit(0);
  }

  console.error(error);
  process.exit(1);
});
