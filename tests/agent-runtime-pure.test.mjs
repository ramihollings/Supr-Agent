import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(__dirname, '..', 'lib', 'runtime', 'agent-runtime-pure.ts'),
  'utf8',
);

test('agent-runtime-pure.ts exposes the expected public surface', () => {
  for (const symbol of [
    'parseModelToolResponse',
    'hasCompletionEvidence',
    'hasMeaningfulToolOutput',
    'mergeEvidence',
    'inferProviderRole',
    'withRuntimeTimeout',
    'DEFAULT_RUNTIME_BUDGET',
  ]) {
    assert.match(
      source,
      new RegExp(`\\b${symbol}\\b`),
      `expected ${symbol} to be exported`,
    );
  }
});

test('parseModelToolResponse handles all five protocol types', () => {
  const body = source.match(
    /export function parseModelToolResponse[\s\S]*?\n\}/,
  )?.[0] || '';
  // Empty string fast path: must early-return invalid.
  assert.match(body, /!raw\.trim\(\)/);
  // All five types must appear as branches in the parser.
  for (const type of ['tool_call', 'final', 'needs_approval', 'message', 'invalid']) {
    assert.match(body, new RegExp(`['"]${type}['"]`), `expected branch for type ${type}`);
  }
  // tool_call branch must require toolName and arguments.
  assert.match(body, /parsed\.toolName/);
  assert.match(body, /parsed\.arguments/);
  // final branch must require a summary (and capture evidence).
  assert.match(body, /parsed\.summary/);
  // needs_approval branch must require a reason.
  assert.match(body, /parsed\.reason/);
  // message branch must require content.
  assert.match(body, /parsed\.content/);
  // Non-JSON payload falls through to the catch block.
  assert.match(body, /catch/);
});

test('hasCompletionEvidence enforces the hard evidence rule', () => {
  const body = source.match(
    /export function hasCompletionEvidence[\s\S]*?\n\}/,
  )?.[0] || '';
  // Falsy guard: undefined / null evidence must short-circuit to false.
  assert.match(body, /!\s*evidence\s*\)\s*return\s*false/);
  // Use Object.values(...).some(...) to check at least one category has entries.
  assert.match(body, /Object\.values\(evidence\)\.some\(/);
  // Per-category check must verify it's an array with length > 0.
  assert.match(body, /Array\.isArray\(values\)/);
  assert.match(body, /values\.length\s*>\s*0/);
});

test('hasMeaningfulToolOutput rejects empty containers', () => {
  const body = source.match(
    /export function hasMeaningfulToolOutput[\s\S]*?\n\}/,
  )?.[0] || '';
  // null / undefined rejection.
  assert.match(body, /output\s*===\s*null/);
  assert.match(body, /output\s*===\s*undefined/);
  // String branch: trim, then reject empty / '[]' / '{}'.
  assert.match(body, /typeof output\s*===\s*['"]string['"]/);
  assert.match(body, /output\.trim\(\)/);
  assert.match(body, /trimmed\s*===\s*['"]\[]['"]/);
  assert.match(body, /trimmed\s*===\s*['"]\{\}['"]/);
  // Array branch: must require length > 0.
  assert.match(body, /Array\.isArray\(output\)/);
  assert.match(body, /output\.length\s*>\s*0/);
  // Object branch: must require at least one key.
  assert.match(body, /Object\.keys\(output/);
});

test('mergeEvidence dedupes and appends', () => {
  const body = source.match(
    /export function mergeEvidence[\s\S]*?\n\}/,
  )?.[0] || '';
  // Default for `next` must be `{}` so the function can be called with one arg.
  assert.match(body, /next:\s*Record<string,\s*string\[\]>\s*=\s*\{\}/);
  // Must dedupe via new Set.
  assert.match(body, /new Set\(/);
  // Must spread the current and incoming values into the Set.
  assert.match(body, /\[\.\.\.\(current\[/);
  assert.match(body, /\.\.\.\(Array\.isArray\(values\)/);
  // Mutates `current` in place (no `return`).
  assert.doesNotMatch(body, /return\s+current\b/);
});

test('inferProviderRole maps capabilities to the right roles', () => {
  const body = source.match(
    /export function inferProviderRole[\s\S]*?\n\}/,
  )?.[0] || '';
  // 'web' capability -> research.
  assert.match(body, /capability\.includes\(['"]web['"]\)/);
  assert.match(body, /return\s+['"]research['"]/);
  // 'workspace' or 'execute' capability -> code.
  assert.match(body, /capability\.includes\(['"]workspace['"]\)/);
  assert.match(body, /capability\.includes\(['"]execute['"]\)/);
  assert.match(body, /return\s+['"]code['"]/);
  // 'skill' capability OR /reflection|learn/i intent -> reflection.
  assert.match(body, /capability\.includes\(['"]skill['"]\)/);
  assert.match(body, /\/reflection\|learn\/i/);
  assert.match(body, /return\s+['"]reflection['"]/);
  // Default fallback -> supr.
  assert.match(body, /return\s+['"]supr['"]/);
});

test('withRuntimeTimeout races against a deadline', () => {
  const body = source.match(
    /export async function withRuntimeTimeout[\s\S]*?\n\}/,
  )?.[0] || '';
  // Null deadline -> await as-is, no race.
  assert.match(body, /deadline\s*===\s*null/);
  assert.match(body, /return\s+operation/);
  // Compute remaining time; expired deadline throws "before ${label}".
  assert.match(body, /Math\.max\(0,\s*deadline\s*-\s*Date\.now\(\)\)/);
  assert.match(body, /Runtime timeout before \$\{label\}\./);
  // Active deadline races the operation against a setTimeout that throws "during".
  assert.match(body, /Promise\.race\(/);
  assert.match(body, /setTimeout\(/);
  assert.match(body, /Runtime timeout during \$\{label\}\./);
  // Timer must be cleared in finally to avoid leaking handles.
  assert.match(body, /finally\s*\{/);
  assert.match(body, /clearTimeout\(timer\)/);
});

test('DEFAULT_RUNTIME_BUDGET is the 60s hard fallback', () => {
  const body = source.match(
    /export const DEFAULT_RUNTIME_BUDGET[\s\S]*?\} as const;/,
  )?.[0] || '';
  // The 60-second total timeout.
  assert.match(body, /timeoutMs:\s*60_000/);
  // 4 max steps.
  assert.match(body, /maxSteps:\s*4/);
  // No retries by default.
  assert.match(body, /retryLimit:\s*0/);
  // 4096 token cap on model output.
  assert.match(body, /maxOutputTokens:\s*4096/);
});
