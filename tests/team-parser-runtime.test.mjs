// Runtime tests for the pure-logic parts of the team tool:
// the structured parser and the retry helper. These run without
// touching the database or the provider so they stay fast and
// deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';

// We import the source files directly to avoid pulling in the
// coordinator's transitive deps (dbClient, AgentLifecycleManager).
import { parseStructuredMemberOutput } from '../lib/ide/team-parser.ts';

test('parser: strict JSON shape', () => {
  const out = parseStructuredMemberOutput(JSON.stringify({
    work: 'I will refactor the auth layer.',
    context: { plan_summary: 'three steps', next_action: 'start with tokens' },
  }));
  assert.equal(out.work, 'I will refactor the auth layer.');
  assert.deepEqual(out.context, {
    plan_summary: 'three steps',
    next_action: 'start with tokens',
  });
});

test('parser: fenced JSON block with extra prose around it', () => {
  const out = parseStructuredMemberOutput([
    'Sure, here is my contribution:',
    '',
    '```json',
    '{ "work": "drafting the spec", "context": { "section": "auth" } }',
    '```',
    '',
    'Let me know if you need more.',
  ].join('\n'));
  assert.equal(out.work, 'drafting the spec');
  assert.equal(out.context.section, 'auth');
});

test('parser: legacy <work> / <context> tags, tolerant of mixed case', () => {
  const out = parseStructuredMemberOutput([
    '<WORK>I am the planner. My plan: 3 steps.</WORK>',
    '<CONTEXT>',
    'plan_steps=3',
    'top_risk=schema drift',
    '</CONTEXT>',
  ].join('\n'));
  assert.equal(out.work, 'I am the planner. My plan: 3 steps.');
  assert.equal(out.context.plan_steps, '3');
  assert.equal(out.context.top_risk, 'schema drift');
});

test('parser: legacy tags with nested closing-tag-like content (defensive strip)', () => {
  // We strip a literal "</work>" inside the body so the prose
  // reads cleanly even if the LLM prematurely closes the tag.
  const out = parseStructuredMemberOutput(
    '<work>The first item is </work, actually the title. Then we continue.</work>',
  );
  // The work block should contain everything up to the *real* close,
  // minus the spurious inline closing tag.
  assert.ok(out.work.includes('The first item is'));
  assert.ok(out.work.includes('Then we continue'));
});

test('parser: free-form prose with no structure', () => {
  const out = parseStructuredMemberOutput('I have nothing structured to say, just a thought.');
  assert.equal(out.work, 'I have nothing structured to say, just a thought.');
  assert.deepEqual(out.context, {});
});

test('parser: empty string is safe (no throw)', () => {
  const out = parseStructuredMemberOutput('');
  assert.equal(out.work, '');
  assert.deepEqual(out.context, {});
});

test('parser: invalid JSON falls back to free-form prose', () => {
  const out = parseStructuredMemberOutput('{not really json but with a closing brace}');
  // The fenced/structured match should miss, so we fall through
  // to free-form. The full text is the work, context is empty.
  assert.equal(out.work, '{not really json but with a closing brace}');
  assert.deepEqual(out.context, {});
});

test('parser: rejects invalid context keys (only [A-Za-z0-9_.-] allowed)', () => {
  const out = parseStructuredMemberOutput([
    '<context>',
    'valid_key=ok',
    'has space=skip me',
    'also-valid.dotted=ok',
    '</context>',
  ].join('\n'));
  assert.equal(out.context.valid_key, 'ok');
  assert.equal(out.context['also-valid.dotted'], 'ok');
  assert.equal(out.context['has space'], undefined);
});

test('parser: context object values get JSON-stringified', () => {
  const out = parseStructuredMemberOutput(JSON.stringify({
    work: 'w',
    context: { arr: [1, 2, 3], nested: { a: 1 } },
  }));
  assert.equal(out.context.arr, '[1,2,3]');
  assert.equal(out.context.nested, '{"a":1}');
});
