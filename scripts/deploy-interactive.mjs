#!/usr/bin/env node

import { confirm, select } from '@inquirer/prompts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runNpmScript, runNpx } from './spawn-helpers.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function readDefaultProject() {
  try {
    const raw = readFileSync(join(rootDir, '.firebaserc'), 'utf8');
    const config = JSON.parse(raw);
    return config.projects?.default ?? 'unknown project';
  } catch {
    return 'unknown project';
  }
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
  'firestore:rules': {
    label: 'Deploy Firestore security rules',
    confirm: 'Deploy Firestore security rules to Firebase?',
    run: () => runNpx(['firebase', 'deploy', '--only', 'firestore:rules'], rootDir)
  },
  'firestore': {
    label: 'Deploy Firestore rules and indexes',
    confirm: 'Deploy Firestore rules and composite indexes?',
    run: () => runNpx(['firebase', 'deploy', '--only', 'firestore'], rootDir)
  },
  'functions': {
    label: 'Build and deploy Cloud Functions',
    confirm: 'Build and deploy Cloud Functions to Firebase?',
    run: async () => {
      await runNpmScript('functions:build', rootDir);
      await runNpx(['firebase', 'deploy', '--only', 'functions'], rootDir);
    }
  },
  'hosting': {
    label: 'Build and deploy Firebase Hosting',
    confirm: 'Build the production PWA and deploy to Firebase Hosting?',
    run: async () => {
      await runNpmScript('build', rootDir);
      await runNpx(['firebase', 'deploy', '--only', 'hosting'], rootDir);
    }
  },
  'firebase:all': {
    label: 'Deploy everything to Firebase',
    confirm: 'Build app + functions and deploy hosting, Firestore, and Cloud Functions?',
    run: async () => {
      await runNpmScript('build', rootDir);
      await runNpmScript('functions:build', rootDir);
      await runNpx(['firebase', 'deploy'], rootDir);
    }
  },
  'functions:build': {
    label: 'Build Cloud Functions only',
    confirm: 'Compile functions/ to functions/lib without deploying?',
    run: () => runNpmScript('functions:build', rootDir)
  },
  'firebase:login': {
    label: 'Log in to Firebase CLI',
    run: () => runNpx(['firebase', 'login'], rootDir, 'firebase login')
  },
  'seed:trucks': {
    label: 'Seed demo food trucks in Firestore',
    confirm: 'Write the 3 demo foodTrucks documents to Firestore?',
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
    value: 'firestore:rules',
    description: 'Publish firestore.rules only — fastest rules-only update'
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
    description: 'Build dist/pwa and publish the app to Firebase Hosting'
  },
  {
    value: 'firebase:all',
    description: 'Full deploy — hosting, Firestore rules/indexes, and Cloud Functions'
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
    description: 'Authenticate Firebase CLI — required once per machine/account'
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
  const project = readDefaultProject();

  console.log('\nGo Fetch — deployment menu');
  console.log(`Target project: ${project}`);
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
