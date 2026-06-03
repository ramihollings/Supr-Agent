import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const AUTH_SOURCE = readFileSync(join(REPO_ROOT, 'lib/auth.ts'), 'utf8');

/**
 * Production auth fail-closed cache regression test.
 *
 * A previous version of assertProductionAuthEnvironment() used a boolean
 * `productionEnvChecked` flag that was set to `true` after the first
 * call regardless of outcome. That meant a startup failure (missing
 * APP_PASSWORD or AUTH_SECRET) could be silently masked by a later
 * successful call, or vice-versa — exactly the bug the auditor flagged.
 *
 * The fix caches the actual result object so a failed assertion stays
 * failed for the rest of the process lifetime. These tests assert that
 * the buggy pattern is gone and the correct pattern is in place.
 */

test('auth.ts does not use the old boolean productionEnvChecked flag', () => {
  assert.doesNotMatch(AUTH_SOURCE, /productionEnvChecked/);
});

test('auth.ts caches the result object in productionEnvResult', () => {
  assert.match(AUTH_SOURCE, /productionEnvResult/);
});

test('assertProductionAuthEnvironment returns the cached result on subsequent calls', () => {
  assert.match(
    AUTH_SOURCE,
    /if\s*\(\s*productionEnvResult\s*\)\s*return\s+productionEnvResult/,
  );
});

test('assertProductionAuthEnvironment short-circuits in non-production without caching', () => {
  assert.match(
    AUTH_SOURCE,
    /if\s*\(\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]\s*\)\s*return\s*\{\s*ok:\s*true\s*\}/,
  );
});

test('assertProductionAuthEnvironment assigns a failure result object on missing secrets', () => {
  // The assignment is a ternary: productionEnvResult = missing.length
  //   ? { ok: false, reason: ... }
  //   : { ok: true };
  // Greedy match is required to bridge the `?` and newline.
  assert.match(
    AUTH_SOURCE,
    /productionEnvResult\s*=[\s\S]*ok:\s*false/,
  );
});
