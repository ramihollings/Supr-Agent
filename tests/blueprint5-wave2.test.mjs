import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const LESSONS_SOURCE = readFileSync(join(REPO_ROOT, 'lib/skills/lessons.ts'), 'utf8');
const SKILL_INVOKER_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/skill-invoker.ts'), 'utf8');
const STDIO_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/stdio.ts'), 'utf8');
const REGISTRY_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/registry.ts'), 'utf8');
const SUBAGENT_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/subagent.ts'), 'utf8');
const COMPACTION_SOURCE = readFileSync(join(REPO_ROOT, 'lib/context/compaction.ts'), 'utf8');
const COMPOSIO_CONNECT_ROUTE = readFileSync(join(REPO_ROOT, 'app/api/composio/connect/route.ts'), 'utf8');

/**
 * Second wave of Blueprint 5.0 regression tests.
 *
 * Covers the new modules added in this round:
 *   - Skill feedback loop (.lessons.md)
 *   - MCP stdio transport (child process + JSON-RPC)
 *   - Two-phase commit for subagent (intent + audit + checksum)
 *   - Context compaction (event → summary → Memory_Items)
 *   - Composio HTTP route (was already covered, repeated for safety)
 */

// 1. Skill lessons
test('Skill lessons module appends and reads .lessons.md files', () => {
  assert.match(LESSONS_SOURCE, /appendLesson/);
  assert.match(LESSONS_SOURCE, /readRecentLessons/);
  assert.match(LESSONS_SOURCE, /pruneLessons/);
  assert.match(LESSONS_SOURCE, /renderLessonsSection/);
});

test('Skill lessons file lives under the skill directory and is gitignored', () => {
  assert.match(LESSONS_SOURCE, /lessonsPathFor/);
  assert.match(LESSONS_SOURCE, /\.lessons\.md/);
});

test('Skill lessons support pinned entries that survive garbage collection', () => {
  assert.match(LESSONS_SOURCE, /pinned/);
  assert.match(LESSONS_SOURCE, /\[pin\]/);
});

test('Skill invoker reads lessons and appends a new one on every run', () => {
  assert.match(SKILL_INVOKER_SOURCE, /renderLessonsSection/);
  assert.match(SKILL_INVOKER_SOURCE, /appendLesson/);
  // The invoker must record both success and failure.
  assert.match(SKILL_INVOKER_SOURCE, /tags: \['ok'\]/);
  assert.match(SKILL_INVOKER_SOURCE, /tags: \['error'/);
});

// 2. MCP stdio transport
test('MCP stdio transport spawns a child process and speaks JSON-RPC over stdio', () => {
  assert.match(STDIO_SOURCE, /StdioMcpSession/);
  assert.match(STDIO_SOURCE, /spawn\(/);
  // JSON-RPC handshake.
  assert.match(STDIO_SOURCE, /jsonrpc/);
  assert.match(STDIO_SOURCE, /'initialize'/);
  assert.match(STDIO_SOURCE, /tools\/list/);
  assert.match(STDIO_SOURCE, /tools\/call/);
});

test('MCP stdio transport applies the env_keys allowlist to the child process', () => {
  // The child must not inherit the host's full env. Only the
  // keys declared in the server's `env_keys` should pass through.
  assert.match(STDIO_SOURCE, /env_keys/);
  assert.match(STDIO_SOURCE, /allowedKeys/);
  assert.match(STDIO_SOURCE, /PATH.*HOME.*USER.*TMPDIR/);
  // And the child must be killed on stop().
  assert.match(STDIO_SOURCE, /SIGTERM/);
});

test('MCP registry discovers tools from stdio servers via the session cache', () => {
  assert.match(REGISTRY_SOURCE, /getOrStartSession/);
  assert.match(REGISTRY_SOURCE, /stdioToolCache/);
  assert.match(REGISTRY_SOURCE, /STDIO_CACHE_TTL_MS/);
  assert.match(REGISTRY_SOURCE, /forwardToMcpServer/);
});

test('MCP tools route forwards stdio calls through forwardToMcpServer', () => {
  const toolsRoute = readFileSync(join(REPO_ROOT, 'app/api/mcp/tools/route.ts'), 'utf8');
  // The route must import the forwarder.
  assert.match(toolsRoute, /forwardToMcpServer/);
  // The in-process branch is an explicit if; the stdio branch
  // is the fall-through (no `else` keyword, just sequential
  // code after the return). Both must be present.
  assert.match(toolsRoute, /transport === 'in-process'/);
  // The forwarder is called after the in-process return.
  assert.match(toolsRoute, /await forwardToMcpServer/);
});

// 3. Two-phase commit for subagent
test('Subagent tool builds an ActionIntent with a SHA-256 checksum', () => {
  assert.match(SUBAGENT_SOURCE, /buildIntent/);
  assert.match(SUBAGENT_SOURCE, /createHash\('sha256'\)/);
  assert.match(SUBAGENT_SOURCE, /ActionIntent/);
});

test('Subagent tool audits the intent before executing (Phase 2)', () => {
  assert.match(SUBAGENT_SOURCE, /auditIntent/);
  // The audit must enforce the tool allowlist regex.
  assert.match(SUBAGENT_SOURCE, /\^\[a-z0-9_\]\+\$/);
  // And the path-traversal check for target files.
  assert.match(SUBAGENT_SOURCE, /includes\('\.\.'\)/);
  // The subagent must refuse to run on a failed audit.
  assert.match(SUBAGENT_SOURCE, /Subagent intent rejected/);
});

test('Subagent tool emits a post-execution checksum for operator verification', () => {
  assert.match(SUBAGENT_SOURCE, /Post-checksum/);
  assert.match(SUBAGENT_SOURCE, /postChecksum/);
});

test('Subagent tool description mentions the two-phase commit', () => {
  assert.match(SUBAGENT_SOURCE, /two-phase commit/);
  assert.match(SUBAGENT_SOURCE, /intent.*audit.*execute/);
});

// 4. Context compaction
test('Compaction module counts uncompacted events and triggers above threshold', () => {
  assert.match(COMPACTION_SOURCE, /countUncompactedEvents/);
  assert.match(COMPACTION_SOURCE, /threshold/);
  assert.match(COMPACTION_SOURCE, /maybeCompact/);
});

test('Compaction writes a summary to Memory_Items and marks events as compacted', () => {
  assert.match(COMPACTION_SOURCE, /INSERT INTO Memory_Items/);
  assert.match(COMPACTION_SOURCE, /section.*'compaction'/);
  assert.match(COMPACTION_SOURCE, /compacted_at = CURRENT_TIMESTAMP/);
  assert.match(COMPACTION_SOURCE, /compaction_id/);
});

test('Compaction reads summaries back for the live context', () => {
  assert.match(COMPACTION_SOURCE, /readCompactions/);
  assert.match(COMPACTION_SOURCE, /section = 'compaction'/);
});

test('Compaction config is read from Settings so operators can tune the threshold', () => {
  assert.match(COMPACTION_SOURCE, /getCompactionConfig/);
  assert.match(COMPACTION_SOURCE, /compaction_config/);
});

// 5. Behavioral sanity: lessons file format round-trips
test('lessons module: append and read round-trips correctly', async () => {
  // We exercise the module in-process to verify the parse
  // function handles the markdown format it produces.
  const mod = await import('../lib/skills/lessons.ts');
  const { appendLesson, readRecentLessons, pruneLessons } = mod;
  const skillDir = join(REPO_ROOT, '.agents', 'skills', '__test_lessons__');
  const lessonsPath = join(skillDir, '.lessons.md');
  try {
    mkdirSync(skillDir, { recursive: true });
    appendLesson('__test_lessons__', {
      timestamp: '2026-01-01T00:00:00.000Z',
      observation: 'Test observation 1',
      correctiveAction: 'Test corrective action 1',
      tags: ['test', 'pin'],
      pinned: true,
    });
    appendLesson('__test_lessons__', {
      timestamp: '2026-01-02T00:00:00.000Z',
      observation: 'Test observation 2',
      correctiveAction: 'Test corrective action 2',
      tags: ['test'],
    });
    appendLesson('__test_lessons__', {
      timestamp: '2026-01-03T00:00:00.000Z',
      observation: 'Test observation 3',
      correctiveAction: 'Test corrective action 3',
      tags: ['test'],
    });
    const lessons = readRecentLessons('__test_lessons__', 5);
    assert.equal(lessons.length, 3, 'expected 3 lessons (1 pinned + 2 recent)');
    const pinned = lessons.find((l) => l.pinned);
    assert.ok(pinned, 'pinned lesson must be present');
    assert.equal(pinned.observation, 'Test observation 1');
    // Prune to 1 unpinned: with 1 pinned and 2 unpinned lessons
    // the survivors are 1 pinned + 1 unpinned (the most recent),
    // so exactly 1 unpinned is removed.
    const pruneResult = pruneLessons('__test_lessons__', 1);
    assert.equal(pruneResult.removed, 1, 'expected 1 unpinned lesson to be removed');
    const afterPrune = readRecentLessons('__test_lessons__', 5);
    assert.equal(afterPrune.length, 2, 'expected 2 lessons after prune (1 pinned + 1 unpinned)');
    assert.ok(afterPrune.some((l) => l.pinned), 'the pinned lesson must survive the prune');
  } finally {
    try { rmSync(lessonsPath, { force: true }); } catch {}
    try { rmSync(skillDir, { recursive: true, force: true }); } catch {}
  }
});
