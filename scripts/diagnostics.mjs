#!/usr/bin/env node
/**
 * Run every file in lib/diagnostics/ as a probe.
 *
 * Each diagnostic is a TypeScript file that:
 *   - prints `[OK] <name>` to stdout on success
 *   - prints `[FAIL] <name>: <reason>` and exits non-zero on failure
 *   - is invoked via `tsx` so it has full access to the Supr lib
 *
 * We invoke each one in a child process so a single broken probe
 * does not abort the run. The final exit code is the number of
 * failed probes, clamped to 1 (a 0 exit signals "all green").
 */

import { readdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DIAG_DIR = resolve(REPO_ROOT, 'lib', 'diagnostics');

if (!existsSync(DIAG_DIR)) {
  console.error(`[FAIL] diagnostics directory missing: ${DIAG_DIR}`);
  process.exit(1);
}

const probes = readdirSync(DIAG_DIR)
  .filter((name) => name.endsWith('.ts'))
  .filter((name) => name !== 'README.md')
  .sort();

if (probes.length === 0) {
  console.log('[OK] no diagnostics to run.');
  process.exit(0);
}

let failed = 0;

for (const probe of probes) {
  const file = join(DIAG_DIR, probe);
  process.stdout.write(`[..] ${probe} ... `);
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', file],
    {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: process.env,
      timeout: 120_000,
    },
  );
  if (result.status === 0) {
    process.stdout.write('OK\n');
  } else {
    process.stdout.write(`FAIL (exit ${result.status})\n`);
    if (result.stderr) {
      process.stderr.write(result.stderr.toString());
    }
    failed += 1;
  }
}

console.log(`\n${probes.length - failed}/${probes.length} diagnostics passed.`);
process.exit(failed === 0 ? 0 : 1);
