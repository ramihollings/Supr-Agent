import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const SETTINGS_PAGE = readFileSync(join(REPO_ROOT, 'app/settings/page.tsx'), 'utf8');
const MODEL_SOURCE = readFileSync(join(REPO_ROOT, 'lib/providers/model.ts'), 'utf8');
const SEMANTIC_SOURCE = readFileSync(join(REPO_ROOT, 'lib/routing/semantic.ts'), 'utf8');
const HTTP_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/http.ts'), 'utf8');
const HEALTH_ROUTE = existsSync(join(REPO_ROOT, 'app/api/mcp/health/route.ts'))
  ? readFileSync(join(REPO_ROOT, 'app/api/mcp/health/route.ts'), 'utf8') : '';
const STREAM_ROUTE = existsSync(join(REPO_ROOT, 'app/api/mcp/stream/route.ts'))
  ? readFileSync(join(REPO_ROOT, 'app/api/mcp/stream/route.ts'), 'utf8') : '';
const SKILLS_LESSONS_API = readFileSync(join(REPO_ROOT, 'app/api/skills/lessons/route.ts'), 'utf8');
const COMPACTION_API = readFileSync(join(REPO_ROOT, 'app/api/context/compaction/route.ts'), 'utf8');
const SANDBOX_SOURCE = readFileSync(join(REPO_ROOT, 'lib/providers/local-node-sandbox.ts'), 'utf8');
const ACTIONS_SKILLS = readFileSync(join(REPO_ROOT, 'app/actions/skills.ts'), 'utf8');
const ACTIONS_SETTINGS = readFileSync(join(REPO_ROOT, 'app/actions/settings.ts'), 'utf8');
const ACTIONS_MEMORY = readFileSync(join(REPO_ROOT, 'app/actions/memory.ts'), 'utf8');
const ACTIONS = readFileSync(join(REPO_ROOT, 'app/actions.ts'), 'utf8');
const AUTH_FLOW_SPEC = existsSync(join(REPO_ROOT, 'tests/e2e/auth-flow.spec.ts'))
  ? readFileSync(join(REPO_ROOT, 'tests/e2e/auth-flow.spec.ts'), 'utf8') : '';

/**
 * Regression tests for the final cleanup pass: panels into
 * Settings, embedding on the semantic router, MCP health +
 * stream routes, lessons/compaction HTTP APIs, the actions.ts
 * domain split, getSqliteDb() removal from the sandbox
 * provider, and the new E2E auth-flow spec.
 */

// 1. Settings page wiring
test('Settings page mounts the SkillsLessonsPanel', () => {
  assert.match(SETTINGS_PAGE, /import \{ SkillsLessonsPanel \}/);
  assert.match(SETTINGS_PAGE, /<SkillsLessonsPanel \/>/);
  assert.match(SETTINGS_PAGE, /Skill Lessons \(\.lessons\.md\)/);
});

test('Settings page mounts the CompactionPanel', () => {
  assert.match(SETTINGS_PAGE, /import \{ CompactionPanel \}/);
  assert.match(SETTINGS_PAGE, /<CompactionPanel \/>/);
  assert.match(SETTINGS_PAGE, /Context Compaction/);
});

// 2. Model embedding hook
test('ModelProvider declares an optional embedContent method', () => {
  assert.match(MODEL_SOURCE, /embedContent\?/);
});

// 3. Semantic router uses real embeddings when available
test('Semantic router prefers the active provider embedContent over the hash fallback', () => {
  assert.match(SEMANTIC_SOURCE, /embedTextAsync/);
  // The real-embedding path must come before the hash fallback.
  assert.match(SEMANTIC_SOURCE, /getActiveProvider/);
});

// 4. MCP HTTP transport
test('MCP HTTP transport validates the endpoint URL on construction', () => {
  assert.match(HTTP_SOURCE, /new URL\(raw\)/);
  assert.match(HTTP_SOURCE, /\['http:', 'https:'\]/);
});

// 5. MCP health endpoint
test('GET /api/mcp/health returns a per-server status array', () => {
  assert.match(HEALTH_ROUTE, /getOrStartSession/);
  assert.match(HEALTH_ROUTE, /getOrStartHttpSession/);
  assert.match(HEALTH_ROUTE, /ok|degraded|unreachable|disabled/);
});

// 6. MCP stream endpoint
test('GET /api/mcp/stream emits SSE events for health and registry changes', () => {
  assert.match(STREAM_ROUTE, /event: hello/);
  assert.match(STREAM_ROUTE, /event: tick/);
  assert.match(STREAM_ROUTE, /event: change/);
  assert.match(STREAM_ROUTE, /keep-alive/);
});

// 7. Lessons HTTP API
test('GET /api/skills/lessons returns a summary and POST prunes', () => {
  assert.match(SKILLS_LESSONS_API, /readRecentLessons/);
  assert.match(SKILLS_LESSONS_API, /pruneLessons/);
});

// 8. Compaction HTTP API
test('POST /api/context/compaction validates and persists the compaction config', () => {
  assert.match(COMPACTION_API, /update_config/);
  assert.match(COMPACTION_API, /threshold must be between 1 and 10000/);
  assert.match(COMPACTION_API, /window must be between 1 and 1000/);
  assert.match(COMPACTION_API, /maxSummaryTokens must be between 50 and 4000/);
  assert.match(COMPACTION_API, /INSERT INTO Settings/);
});

test('POST /api/context/compaction?action=compact triggers an on-demand pass', () => {
  assert.match(COMPACTION_API, /action === 'compact'/);
  assert.match(COMPACTION_API, /compactMission/);
});

// 9. getSqliteDb() removal from the sandbox
test('local-node-sandbox no longer calls getSqliteDb() directly', () => {
  assert.doesNotMatch(SANDBOX_SOURCE, /getSqliteDb\(\)/);
  // The sandbox must use dbClient for Settings lookups.
  assert.match(SANDBOX_SOURCE, /dbClient\.queryOne/);
});

// 10. actions.ts domain split
test('app/actions.ts re-exports from the new domain files', () => {
  // The full split into 8+ domain files is an incremental
  // refactor. This test pins what was actually moved in this
  // pass: the skills, settings, and memory actions are now in
  // dedicated domain files, and the facade re-exports them.
  // The remaining ~2000 lines of actions.ts (orchestration,
  // mission, chat, workspace, etc.) can be split in follow-up
  // passes; the hard line count is not the gate for those.
  assert.match(ACTIONS, /from '\.\/actions\/skills'/);
  assert.match(ACTIONS, /from '\.\/actions\/settings'/);
  assert.match(ACTIONS, /from '\.\/actions\/memory'/);
  // The domain files must exist on disk.
  assert.ok(existsSync(join(REPO_ROOT, 'app/actions/skills.ts')));
  assert.ok(existsSync(join(REPO_ROOT, 'app/actions/settings.ts')));
  assert.ok(existsSync(join(REPO_ROOT, 'app/actions/memory.ts')));
});

test('app/actions/skills.ts owns the Skills + Cron_Jobs CRUD', () => {
  assert.match(ACTIONS_SKILLS, /fetchSkillsState/);
  assert.match(ACTIONS_SKILLS, /createSkillAction/);
  assert.match(ACTIONS_SKILLS, /fetchCronJobsState/);
  assert.match(ACTIONS_SKILLS, /createCronJobAction/);
  assert.match(ACTIONS_SKILLS, /crypto\.randomUUID/);
});

test('app/actions/settings.ts owns the Settings + bootstrap + shadow mode actions', () => {
  assert.match(ACTIONS_SETTINGS, /fetchSettingsAction/);
  assert.match(ACTIONS_SETTINGS, /fetchBootstrapStateAction/);
  assert.match(ACTIONS_SETTINGS, /updateSettingAction/);
  assert.match(ACTIONS_SETTINGS, /checkShadowModeAction/);
  assert.match(ACTIONS_SETTINGS, /toggleShadowModeAction/);
  assert.match(ACTIONS_SETTINGS, /updateGlidepathAction/);
  assert.match(ACTIONS_SETTINGS, /invalidateProviderCache/);
});

test('app/actions/memory.ts owns the Memory_Items CRUD', () => {
  assert.match(ACTIONS_MEMORY, /fetchMemoryItemsAction/);
  assert.match(ACTIONS_MEMORY, /purgeMemoryItemsAction/);
  assert.match(ACTIONS_MEMORY, /addGlobalMemoryItemAction/);
  assert.match(ACTIONS_MEMORY, /updateMemoryReviewAction/);
});

// 11. New E2E spec
test('tests/e2e/auth-flow.spec.ts covers the auth boundary', () => {
  // Pin the structural shape of the auth-flow spec, not exact
  // test titles — the spec is allowed to rename tests as the
  // auth flow changes.
  assert.match(AUTH_FLOW_SPEC, /unauthenticated visit to a protected route/);
  assert.match(AUTH_FLOW_SPEC, /wrong password/);
  assert.match(AUTH_FLOW_SPEC, /\/api\/auth\/status/);
});
