#!/usr/bin/env node

import { confirm, select } from '@inquirer/prompts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runNpmScript } from './spawn-helpers.mjs';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Scripts excluded from the menu (hooks, menu runner itself). */
const EXCLUDED = new Set(['postinstall', 'menu', 'go', 'firebase:deploy']);

/**
 * Catalog of runnable scripts with help text shown below the list when highlighted.
 * Order and grouping are intentional; only scripts that exist in package.json are shown.
 */
const SCRIPT_CATALOG = [
  { type: 'separator', separator: '── Development ──' },
  {
    value: 'dev',
    description: 'Start the Quasar dev server in SPA mode at http://localhost:9000'
  },
  {
    value: 'dev:pwa',
    description: 'Start the dev server with the PWA service worker enabled'
  },

  { type: 'separator', separator: '── Build ──' },
  {
    value: 'build',
    description: 'Production PWA build (output in dist/pwa)'
  },
  {
    value: 'build:spa',
    description: 'Production SPA build without PWA/service worker (dist/spa)'
  },

  { type: 'separator', separator: '── Quality ──' },
  {
    value: 'typecheck',
    description: 'Run vue-tsc type checking with no emit'
  },

  { type: 'separator', separator: '── Deploy ──' },
  {
    value: 'deploy:production',
    description: `Full production deploy — hosting, firestore, functions, storage → go-fetch-app-2021-01`
  },
  {
    value: 'deploy',
    description: 'Interactive deployment menu — builds, Firestore, hosting, functions (↑/↓ + help text)'
  },
  {
    value: 'deploy:hosting',
    description: 'Build production PWA and deploy hosting only to go-fetch-app-2021-01'
  },

  { type: 'separator', separator: '── Firebase (direct) ──' },
  {
    value: 'firebase',
    description: 'Same as deploy — interactive deployment menu'
  },
  {
    value: 'firebase:login',
    description: 'Authenticate the Firebase CLI (one-time setup)'
  },
  {
    value: 'firebase:deploy:rules',
    description: 'Deploy Firestore + Storage rules to go-fetch-app-2021-01 (non-interactive)'
  },
  {
    value: 'firebase:deploy:firestore',
    description: 'Deploy Firestore rules and indexes to go-fetch-app-2021-01 (non-interactive)'
  },
  {
    value: 'firebase:deploy:functions',
    description: 'Build and deploy Cloud Functions to go-fetch-app-2021-01 (non-interactive)'
  },

  { type: 'separator', separator: '── Cloud Functions ──' },
  {
    value: 'functions:build',
    description: 'Compile TypeScript in functions/ to functions/lib (no deploy)'
  },
  {
    value: 'functions:build:watch',
    description: 'Watch and recompile functions/ on file changes'
  }
];

function loadPackageScripts() {
  const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
  return pkg.scripts ?? {};
}

function buildChoices(availableScripts) {
  const choices = [];

  for (const entry of SCRIPT_CATALOG) {
    if (entry.type === 'separator') {
      choices.push(entry);
      continue;
    }

    if (availableScripts[entry.value]) {
      choices.push({
        name: entry.value,
        value: entry.value,
        description: entry.description
      });
    }
  }

  // Any package.json scripts not in the catalog (future additions).
  const catalogValues = new Set(
    SCRIPT_CATALOG.filter((entry) => entry.value).map((entry) => entry.value)
  );

  const extras = Object.keys(availableScripts).filter(
    (name) => !catalogValues.has(name) && !EXCLUDED.has(name)
  );

  if (extras.length > 0) {
    choices.push({ type: 'separator', separator: '── Other ──' });
    for (const name of extras.sort()) {
      choices.push({
        name,
        value: name,
        description: availableScripts[name]
      });
    }
  }

  choices.push({ type: 'separator', separator: '──' });
  choices.push({
    name: 'Exit',
    value: '__exit__',
    description: 'Leave the script menu'
  });

  return choices;
}

function runScript(scriptName) {
  return runNpmScript(scriptName, rootDir);
}

async function main() {
  const availableScripts = loadPackageScripts();

  console.log('\nGo Fetch — interactive script runner');
  console.log('Use ↑/↓ to move, Enter to run, Ctrl+C to quit.\n');

  while (true) {
    const choices = buildChoices(availableScripts);

    const script = await select({
      message: 'Choose a script to run',
      choices,
      pageSize: 14,
      loop: false
    });

    if (script === '__exit__') {
      console.log('Bye.');
      break;
    }

    try {
      await runScript(script);
      console.log(`\n✓ Finished: npm run ${script}`);
    } catch (error) {
      console.error(`\n✗ Failed: ${error instanceof Error ? error.message : error}`);
    }

    const again = await confirm({
      message: 'Run another script?',
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
