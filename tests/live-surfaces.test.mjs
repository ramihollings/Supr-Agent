// Structural smoke tests for the live surfaces added across the
// recent mission / code / reasoning / orchestration upgrades.
//
// These tests don't require a running server — they just read the
// source files and assert that the expected contracts are present.
// They run as part of `npm run test:security` via the wildcard in
// package.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

test('LiveCloakBrowser streams events from the navigation API and renders in a sandboxed iframe', () => {
  const browser = read('components/LiveCloakBrowser.tsx');
  // The chrome is real (tab strip, URL bar, status footer)
  assert.match(browser, /CloakBrowser/);
  assert.match(browser, /useCloakBrowser/);
  // The viewport renders fetched HTML in a sandboxed iframe
  assert.match(browser, /sandbox="allow-same-origin"/);
  assert.match(browser, /srcDoc=\{active\.html\}/);
});

test('Research page is wired to the live navigation API and drives CloakBrowser on research completion', () => {
  const page = read('app/research/page.tsx');
  // "Drive CloakBrowser" URL input
  assert.match(page, /Drive CloakBrowser/);
  // The page delegates to the LiveCloakBrowser hook, which calls
  // /api/research/navigate. Verify the call site is wired.
  assert.match(page, /cloak\.actions\.navigate/);
  // Supr Guidance shows the binary readiness
  assert.match(page, /CLOAKBROWSER_PATH/);
});

test('Research navigation API invokes the real CloakBrowser-backed web_scrape tool', () => {
  const route = read('app/api/research/navigate/route.ts');
  // It imports the real tool directly (not via the lighter
  // project-flow web_scrape), so users get the actual binary.
  assert.match(route, /import \{ webScrapeTool \} from '@\/lib\/tools\/browser'/);
  // It rejects requests without a configured CLOAKBROWSER_PATH.
  assert.match(route, /CLOAKBROWSER_PATH/);
  // It streams events back to the client
  assert.match(route, /x-ndjson/);
});

test('LightIDE implements the full feature set (line numbers, find, palette, diff, multi-cursor, chat, minimap)', () => {
  const ide = read('components/LightIDE.tsx');
  // Line numbers + active line highlight
  assert.match(ide, /activeLine/);
  // Find / replace bar
  assert.match(ide, /FindBar/);
  // Command palette
  assert.match(ide, /CommandPalette/);
  // Diff viewer for Code Agent fixes
  assert.match(ide, /DiffViewer/);
  // Multi-cursor
  assert.match(ide, /multiCursors/);
  assert.match(ide, /addCursorAbove/);
  // Chat panel
  assert.match(ide, /CodeAgentChatPanel/);
  // Minimap
  assert.match(ide, /function Minimap/);
});

test('LightIDE diff viewer + multi-cursor have proper test coverage surface', () => {
  // The diff algorithm is the brain of the diff viewer; verify the
  // line-based LCS implementation is in place.
  const diff = read('lib/ide/diff.ts');
  assert.match(diff, /computeLineDiff/);
  assert.match(diff, /lcsTable/);
  assert.match(diff, /backtrack/);
  // Outline + problems extractors are pure and testable
  const outline = read('lib/ide/outline.ts');
  assert.match(outline, /extractOutline/);
  const problems = read('lib/ide/problems.ts');
  assert.match(problems, /extractProblems/);
});

test('Production health surfaces the CloakBrowser binary state to the supervisor UI', () => {
  const health = read('lib/production-health.ts');
  // Probes the configured binary path
  assert.match(health, /CLOAKBROWSER_PATH/);
  // Returns a structured cloakBrowser block
  assert.match(health, /cloakBrowser/);
  // The supervisor page renders the new card
  const supervisor = read('app/supervisor/page.tsx');
  assert.match(supervisor, /cloakBrowser/);
  assert.match(supervisor, /CloakBrowser/);
});

test('Mission Control / Project Report / Library / Orchestration all expose a live SSE status bar', () => {
  for (const rel of ['app/page.tsx', 'app/orchestration/page.tsx', 'app/library/page.tsx', 'app/project-report/page.tsx', 'app/agents/page.tsx', 'app/skills/page.tsx']) {
    const content = read(rel);
    // Every live page subscribes to the mission stream
    assert.match(content, /EventSource/, `${rel} should subscribe to the mission stream`);
    // And renders a "Live" / "Connecting…" / "Offline" badge
    assert.match(content, /Live/, `${rel} should render a Live status badge`);
  }
});

test('Reasoning Core hydrates from the live Event_Log + Agent_Runs API', () => {
  const page = read('app/reasoning/page.tsx');
  const route = read('app/api/reasoning/tree/route.ts');
  // The API queries Event_Log and Agent_Runs
  assert.match(route, /Event_Log/);
  assert.match(route, /Agent_Runs/);
  // The page polls + maps the response
  assert.match(page, /loadReasoningTree/);
  assert.match(page, /Live Reasoning/);
  assert.match(page, /Demo Tree/);
  assert.match(page, /setInterval/);
});

test('Cron jobs page exposes a live countdown + SSE-driven schedule refresh', () => {
  const page = read('app/cron-jobs/page.tsx');
  assert.match(page, /Live Ticker/);
  assert.match(page, /computeNextRun/);
  assert.match(page, /setInterval/);
  // Subscribes to mission stream for schedule changes
  assert.match(page, /EventSource/);
});

test('Skills page live-wires lesson delta toasts and SSE events', () => {
  const page = read('app/skills/page.tsx');
  assert.match(page, /pollLessons/);
  assert.match(page, /new skill lesson/);
  assert.match(page, /EventSource/);
  assert.match(page, /prevSkillIdsRef/);
});

test('Code page wires the LightIDE and exposes auto-save + crash recovery', () => {
  const page = read('app/code/page.tsx');
  // The page uses the new LightIDE
  assert.match(page, /<LightIDE/);
  // And the IDE localStorage session key is present in the page
  assert.match(page, /supr\.lightide\.session\.v1/);
});
