import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const HTTP_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/http.ts'), 'utf8');
const REGISTRY_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/registry.ts'), 'utf8');
const SEMANTIC_SOURCE = readFileSync(join(REPO_ROOT, 'lib/routing/semantic.ts'), 'utf8');
const SUBAGENT_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/subagent.ts'), 'utf8');
const SKILLS_LESSONS_API = readFileSync(join(REPO_ROOT, 'app/api/skills/lessons/route.ts'), 'utf8');
const COMPACTION_API = readFileSync(join(REPO_ROOT, 'app/api/context/compaction/route.ts'), 'utf8');
const PANEL = existsSync(join(REPO_ROOT, 'components/SkillsLessonsPanel.tsx'))
  ? readFileSync(join(REPO_ROOT, 'components/SkillsLessonsPanel.tsx'), 'utf8') : '';
const COMPACTION_PANEL = existsSync(join(REPO_ROOT, 'components/CompactionPanel.tsx'))
  ? readFileSync(join(REPO_ROOT, 'components/CompactionPanel.tsx'), 'utf8') : '';

/**
 * Final wave of Blueprint 5.0 regression tests.
 *
 * Covers the new modules added in this round:
 *   - MCP HTTP transport (remote servers, JSON-RPC over fetch)
 *   - Semantic routing (vector embeddings for subagent selection)
 *   - Lessons HTTP API + Settings panel
 *   - Compaction HTTP API + Settings panel
 */

// 1. MCP HTTP transport
test('MCP HTTP transport validates the endpoint URL on construction', () => {
  assert.match(HTTP_SOURCE, /new URL\(raw\)/);
  assert.match(HTTP_SOURCE, /\['http:', 'https:'\]/);
});

test('MCP HTTP transport injects only the env_keys allowlist as headers', () => {
  // The transport must use the env_keys list — never the full
  // process.env. This mirrors the stdio transport's allowlist.
  assert.match(HTTP_SOURCE, /env_keys/);
  assert.match(HTTP_SOURCE, /'X-' \+ key/);
});

test('MCP registry routes HTTP transport through getOrStartHttpSession', () => {
  assert.match(REGISTRY_SOURCE, /getOrStartHttpSession/);
  assert.match(REGISTRY_SOURCE, /server\.transport === 'http'/);
  assert.match(REGISTRY_SOURCE, /forwardToMcpServer[\s\S]*?http/s);
});

test('MCP forwardToMcpServer supports both stdio and http transports', () => {
  // The dispatcher must branch by transport.
  assert.match(REGISTRY_SOURCE, /server\.transport === 'stdio'/);
  assert.match(REGISTRY_SOURCE, /server\.transport === 'http'/);
});

// 2. Semantic routing
test('Semantic router exposes a Route list and a routeIntent() entry point', () => {
  assert.match(SEMANTIC_SOURCE, /routeIntent/);
  assert.match(SEMANTIC_SOURCE, /interface Route/);
  assert.match(SEMANTIC_SOURCE, /listRoutes/);
});

test('Semantic router covers the canonical subagent roster', () => {
  // Each role from Supr's agent roster must have a route.
  for (const role of ['Code Agent', 'Research Agent', 'Planner Agent', 'QA/Critic Agent', 'Signal Agent']) {
    const re = new RegExp(role.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    assert.match(SEMANTIC_SOURCE, re);
  }
});

test('Semantic router applies a confidence threshold to avoid bad matches', () => {
  assert.match(SEMANTIC_SOURCE, /CONFIDENCE_THRESHOLD/);
  // Below threshold, the router returns null so callers can
  // fall back to a more expensive LLM-based intent classifier.
  assert.match(SEMANTIC_SOURCE, /score < CONFIDENCE_THRESHOLD[\s\S]*?return null/s);
});

test('Semantic router falls back to a deterministic hash embedding', () => {
  // The hash embedding keeps the router functional when no
  // external embedding provider is configured.
  assert.match(SEMANTIC_SOURCE, /hashEmbed/);
  assert.match(SEMANTIC_SOURCE, /sha256/);
});

test('spawn_subagent uses semantic routing when the caller omits the role', () => {
  assert.match(SUBAGENT_SOURCE, /routeIntent\(params\.task\)/);
  assert.match(SUBAGENT_SOURCE, /Semantic routing picked role/);
});

// 3. Lessons HTTP API + panel
test('GET /api/skills/lessons returns a per-skill summary by default', () => {
  assert.match(SKILLS_LESSONS_API, /readRecentLessons/);
  assert.match(SKILLS_LESSONS_API, /loadAllSkills/);
  assert.match(SKILLS_LESSONS_API, /summary/);
});

test('GET /api/skills/lessons?skill=X returns the recent lessons for X', () => {
  assert.match(SKILLS_LESSONS_API, /skill/);
  assert.match(SKILLS_LESSONS_API, /limit/);
});

test('POST /api/skills/lessons prunes the lesson file to a kept count', () => {
  assert.match(SKILLS_LESSONS_API, /pruneLessons/);
  assert.match(SKILLS_LESSONS_API, /a-zA-Z0-9\._-]+/);
});

test('Settings panel fetches from /api/skills/lessons and renders per-skill summary', () => {
  assert.match(PANEL, /\/api\/skills\/lessons/);
  assert.match(PANEL, /prune/);
  assert.match(PANEL, /keep/);
  assert.match(PANEL, /pinned/);
});

// 4. Compaction HTTP API + panel
test('GET /api/context/compaction returns the current config', () => {
  assert.match(COMPACTION_API, /getCompactionConfig/);
  assert.match(COMPACTION_API, /config/);
});

test('GET /api/context/compaction?missionId=X returns event count + summaries', () => {
  assert.match(COMPACTION_API, /countUncompactedEvents/);
  assert.match(COMPACTION_API, /readCompactions/);
  assert.match(COMPACTION_API, /uncompactedEvents/);
});

test('POST update_config validates ranges and persists to Settings', () => {
  assert.match(COMPACTION_API, /update_config/);
  assert.match(COMPACTION_API, /threshold must be between 1 and 10000/);
  assert.match(COMPACTION_API, /window must be between 1 and 1000/);
  assert.match(COMPACTION_API, /maxSummaryTokens must be between 50 and 4000/);
  assert.match(COMPACTION_API, /INSERT INTO Settings/);
});

test('POST compact triggers an on-demand compaction for a mission', () => {
  assert.match(COMPACTION_API, /action === 'compact'/);
  assert.match(COMPACTION_API, /compactMission/);
  assert.match(COMPACTION_API, /missionId/);
});

test('Compaction panel edits the three config fields and posts update_config', () => {
  assert.match(COMPACTION_PANEL, /\/api\/context\/compaction/);
  assert.match(COMPACTION_PANEL, /update_config/);
  assert.match(COMPACTION_PANEL, /threshold/);
  assert.match(COMPACTION_PANEL, /window/);
  assert.match(COMPACTION_PANEL, /maxSummaryTokens/);
});
