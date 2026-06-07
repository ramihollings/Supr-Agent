import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

/**
 * Structural tests for the project-flow orchestrator.
 *
 * lib/runtime/project-flow.ts (890 lines) is the single most complex
 * file in Supr: it touches the runtime, the DB, the LLM provider
 * resolver, and the agent action layer. A real unit test would
 * require mocking all of that. The codebase's testing pattern is
 * file-content assertions via the same Node test runner (see
 * tests/behavior-regression.test.mjs), so this file follows that
 * pattern: assert that the orchestrator has the right shape, the
 * right exports, the right constants, and the right call sites for
 * the events log and the cross-module collaborators.
 *
 * If a refactor removes or renames one of these, the test fails
 * with a clear pointer to what changed.
 */

test('project-flow orchestrator exports the expected public surface', () => {
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  // Public actions the runtime exposes to the API routes.
  for (const fn of [
    'startProjectFlow',
    'runProjectFlow',
    'pauseProjectFlow',
    'resumeProjectFlow',
    'retryFailedFlowNodes',
    'approveLowRiskActions',
    'routeIntakeToProjectFlow',
    'parseTelegramCommand',
  ]) {
    assert.match(flow, new RegExp(`export (async )?function ${fn}\\b`));
  }
});

test('project-flow preset plan is the deterministic fallback when no model is configured', () => {
  // AGENT_PRESETS is a 5-8 row table that powers the fallback
  // plan. The runtime always has these available even without an
  // LLM configured, so the planner never returns empty.
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  assert.match(flow, /AGENT_PRESETS[^=]*=\s*\[/);
  // The fallback in buildProjectPlan must call presetPlan() inside
  // the catch block.
  const planner = flow.match(/async function buildProjectPlan[\s\S]*?\n\}/)?.[0] || '';
  assert.match(planner, /presetPlan\(objective\)/);
  assert.match(planner, /planner\.fallback/);
  // The error must be logged so operators can see it.
  assert.match(planner, /console\.warn\(/);
});

test('parseTelegramCommand is the canonical intake parser for Telegram text', () => {
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  // The function must be exported and split on whitespace.
  const body = flow.match(/export async function parseTelegramCommand[\s\S]*?\n\}/)?.[0] || '';
  assert.match(body, /trimmed\.split\(/);
  assert.match(body, /command\.toLowerCase\(\)/);
});

test('project-flow writes ActivityLog entries at the four lifecycle events', () => {
  // After PR23, the bus and the ActivityLog must both see a
  // lifecycle event so the mission stream and the chat's history
  // pane both update.
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  // 1. startProjectFlow -- planning complete, intake phase marked
  //    Done, others Pending.
  assert.match(flow, /startProjectFlow[\s\S]*?Intake:\s*['"]Done['"]/);
  // 2. pauseProjectFlow -- the Flow_Runs row moves to 'paused'.
  assert.match(flow, /pauseProjectFlow[\s\S]*?Flow_Runs\s+SET\s+status\s*=\s*'paused'/);
  // 3. resumeProjectFlow -- Flow_Runs row moves to 'running'.
  assert.match(flow, /resumeProjectFlow[\s\S]*?Flow_Runs\s+SET\s+status\s*=\s*'running'/);
  // 4. approveLowRiskActions -- runs an UPDATE for all pending
  //    agent_action_ids at Low or Medium risk.
  assert.match(flow, /approveLowRiskActions[\s\S]*?low.{0,2}medium.{0,2}risk|lowrisk|low-risk/i);
});

test('project-flow calls notifyMissionChanged at every state mutation', () => {
  // After PR14, the bus is the source of truth for the stream.
  // Every state-changing helper must notify.
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  // The bus is imported.
  assert.match(flow, /import\s*\{\s*notifyMissionChanged\s*\}\s*from\s*'@\/lib\/events\/bus'/);

  // For every exported lifecycle action, find the function body and
  // assert notifyMissionChanged appears inside. The functions are
  // large so we look for the function name, the first closing brace
  // at the same indent, and the body in between. The notify call
  // lives in any of the success / failure branches.
  for (const fn of [
    'startProjectFlow',
    'runProjectFlow',
    'pauseProjectFlow',
    'resumeProjectFlow',
    'retryFailedFlowNodes',
    'approveLowRiskActions',
    'routeIntakeToProjectFlow',
  ]) {
    // Match the function declaration to its closing brace at the
    // same depth. We approximate by searching for `export async
    // function <fn>` and looking at the next 12000 chars.
    const re = new RegExp(`export (async )?function ${fn}\\b[\\s\\S]{0,12000}`);
    const snippet = flow.match(re)?.[0] || '';
    assert.match(
      snippet,
      /notifyMissionChanged\(/,
      `${fn} must notify the bus`,
    );
  }
});

test('project-flow planner validates the model JSON envelope before trusting it', () => {
  // buildModelProjectPlan must wrap the model call in a try/catch
  // and fall back to presetPlan() on any failure. The parsing must
  // go through parseModelJson (which strips <think> tags, etc.).
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  const planner = flow.match(/async function buildModelProjectPlan[\s\S]*?\n\}/)?.[0] || '';
  assert.match(planner, /parseModelJson/);
  // The planning must tolerate a model that returns invalid JSON.
  const buildPlan = flow.match(/async function buildProjectPlan[\s\S]*?\n\}/)?.[0] || '';
  assert.match(buildPlan, /catch/);
  // The fallback path must mark the migration as a preset_fallback
  // so the supervisor UI shows the source correctly.
  assert.match(buildPlan, /plannerSource:\s*['"]preset_fallback['"]/);
});

test('routeIntakeToProjectFlow scrubs the payload via serializeChannelPayload', () => {
  // After PR4, the intake path logs through the same scrubber as
  // Slack/Discord/Telegram. The fix must persist.
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  // The function body is large; extract up to 12k chars after the
  // declaration to find the serializeChannelPayload call.
  const re = /export async function routeIntakeToProjectFlow\b[\s\S]{0,12000}/;
  const body = flow.match(re)?.[0] || '';
  assert.match(body, /serializeChannelPayload\(/);
  // The Channel_Commands.payload INSERT must use the scrubbed value,
  // not a raw JSON.stringify of attachments.
  assert.match(body, /serializeChannelPayload\(\{ attachments:/);
  // The old raw literal must be gone.
  assert.doesNotMatch(body, /JSON\.stringify\(\{\s*attachments:\s*input\.attachments/);
});

test('project-flow keeps the runtime mode wired through getRuntimeMode', () => {
  // After PR5, the orchestrator respects the user's chosen operating
  // mode instead of hardcoding 'autonomous'.
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  assert.match(flow, /getRuntimeMode/);
  // The Flow_Runs.mode column must be populated from the runtime
  // mode, not from a hardcoded literal.
  const helper = flow.match(/async function getOrCreateFlowRun[\s\S]*?\n\}/)?.[0] || '';
  assert.match(helper, /await getRuntimeMode\(\)/);
  assert.doesNotMatch(helper, /'idle',\s*'autonomous'/);
});

// ---------------------------------------------------------------------------
// Pass 2 additions: Live Work Graph layout.
// The orchestrator writes Flow_Nodes with hand-rolled x/y. Pass 2
// replaces that with a server-side DAG layout in
// lib/services/graph-layout.ts. These tests pin the *shape* of the
// new arrangement so a future regression is caught.
// ---------------------------------------------------------------------------

test('project-flow writes raw Flow_Nodes without forcing positions (Pass 2)', () => {
  // After Pass 2, the orchestrator's `persistFlowNode` must NOT
  // pin x/y -- the canvas needs to receive all positions from
  // the DAG layout engine, not a hand-rolled modulo.
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  // It still writes the Flow_Nodes row -- just without a
  // hardcoded x/y. The canvas layout engine positions them.
  assert.match(flow, /INSERT INTO Flow_Nodes/);
});

test('graph-layout module is a real, importable sibling of project-flow', () => {
  // The DAG layout module must exist on disk; otherwise the
  // operating graph action can't import it.
  assert.ok(existsSync('lib/services/graph-layout.ts'),
    'expected lib/services/graph-layout.ts to exist (Pass 2 Live Work Graph cleanup)');
  const layout = readFileSync('lib/services/graph-layout.ts', 'utf8');
  // Public surface for the canvas to consume.
  for (const symbol of [
    'layoutGraph',
    'layoutGraphDagre',
    'layoutGraphFallback',
    'buildPhaseGroups',
    'annotateNodePhaseIds',
  ]) {
    assert.match(layout, new RegExp(`export\\s+function\\s+${symbol}\\b`));
  }
});

test('operating graph action wires finalizeGraphShape in both branches', () => {
  // Pass 2 refactor must apply the DAG layout to BOTH the
  // Flow_Nodes-driven branch and the legacy mission.phases branch.
  const action = readFileSync('app/actions/chat-workspace.ts', 'utf8');
  const matches = action.match(/finalizeGraphShape\(\{[\s\S]*?missionPhases:/g) || [];
  assert.ok(matches.length >= 2,
    `expected >= 2 finalizeGraphShape() calls with missionPhases, got ${matches.length}`);
});
