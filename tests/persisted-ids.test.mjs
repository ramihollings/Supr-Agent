import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const ACTIONS_SOURCE = readFileSync(join(REPO_ROOT, 'app/actions.ts'), 'utf8');
const BUDGET_SOURCE = readFileSync(join(REPO_ROOT, 'lib/services/budget-engine.ts'), 'utf8');
const DB_SOURCE = readFileSync(join(REPO_ROOT, 'lib/db.ts'), 'utf8');

/**
 * Regression test: no persisted primary key is derived from Date.now().
 *
 * `Date.now()` returns the same value for any two calls in the same
 * millisecond, so using it as a primary key suffix means concurrent
 * writers (two skill saves, two mission copies, two budget incidents)
 * collide on the unique constraint and one of them fails. UUIDs from
 * `crypto.randomUUID()` are collision-free in practice.
 *
 * `Date.now()` IS fine for time math (deadlines, expiry windows,
 * "stale if older than X" checks); this test only flags it being
 * interpolated into a primary-key string.
 */

function countIdOccurrences(source, pattern) {
  // Count template-literal ID patterns: `${prefix}-${Date.now()}` and
  // backtick ``prefix-${Date.now()}`` forms.
  return (source.match(pattern) || []).length;
}

test('app/actions.ts no longer uses Date.now() for persisted primary keys', () => {
  // The audit listed these prefixes: sk-, cr-, mem-, art-, ver-, m-,
  // task-, phase-. None should appear with Date.now() anymore.
  for (const prefix of ['sk-', 'cr-', 'mem-', 'art-', 'ver-', 'm-', 'task-', 'phase-']) {
    const re = new RegExp(`\\\`${prefix}\\\\\\$\\{Date\\.now\\(\\)\\}|${prefix}-\\\\\\$\\{Date\\.now\\(\\)\\}`);
    // The file might still have Date.now() in a comment or a time-math
    // expression; we only flag it in a template-literal interpolation
    // adjacent to the prefix.
    const match = ACTIONS_SOURCE.match(new RegExp(`\\\`${prefix}[^\\\`]*Date\\.now\\(\\)`));
    assert.equal(match, null, `app/actions.ts still uses Date.now() in a primary key starting with ${prefix}: ${match?.[0]}`);
  }
});

test('lib/services/budget-engine.ts no longer uses Date.now() for persisted primary keys', () => {
  for (const prefix of ['inc-hard-', 'inc-soft-', 'evt-budget-']) {
    const match = BUDGET_SOURCE.match(new RegExp(`\\\`${prefix}[^\\\`]*Date\\.now\\(\\)`));
    assert.equal(match, null, `budget-engine.ts still uses Date.now() in a primary key starting with ${prefix}: ${match?.[0]}`);
  }
});

test('app/actions.ts has a centralized newId() helper using crypto.randomUUID()', () => {
  assert.match(ACTIONS_SOURCE, /function newId\(prefix: string\)/);
  assert.match(ACTIONS_SOURCE, /crypto\.randomUUID\(\)/);
});

test('lib/db.ts uses newId() helper instead of Date.now() for IDs', () => {
  assert.match(DB_SOURCE, /function newId\(prefix: string\)/);
  // The audit's listed prefixes for db.ts were all replaced.
  for (const prefix of ['f-', 'art-', 'av-', 'mem-', 'm-', 'art-brief-', 'art-check-']) {
    const match = DB_SOURCE.match(new RegExp(`\\\`${prefix}[^\\\`]*Date\\.now\\(\\)`));
    assert.equal(match, null, `lib/db.ts still uses Date.now() in a primary key starting with ${prefix}: ${match?.[0]}`);
  }
});

test('time-math uses of Date.now() are still allowed', () => {
  // Date.now() for deadlines, expiry windows, and "stale" calculations
  // is fine — those are not primary keys.
  assert.match(ACTIONS_SOURCE, /new Date\(Date\.now\(\) \+/);
  assert.match(ACTIONS_SOURCE, /Date\.now\(\) - 1000 \* 60 \* 60 \* 24 \* 30/);
  assert.match(ACTIONS_SOURCE, /const now = Date\.now\(\)/);
});
