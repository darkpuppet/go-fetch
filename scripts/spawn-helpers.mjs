import { spawn } from 'node:child_process';

/**
 * Cross-platform process runner. On Windows, npm/npx are .cmd shims and must run
 * with shell enabled — otherwise Node throws spawn EINVAL.
 */
export function runCommand(command, args, { cwd, label } = {}) {
  return new Promise((resolve, reject) => {
    if (label) {
      console.log(`\n→ ${label}\n`);
    }

    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: true,
      env: process.env
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
      }
    });
  });
}

export function runNpmScript(script, cwd) {
  return runCommand('npm', ['run', script], {
    cwd,
    label: `npm run ${script}`
  });
}

export function runNpx(args, cwd, label) {
  return runCommand('npx', args, {
    cwd,
    label: label ?? `npx ${args.join(' ')}`
  });
}
