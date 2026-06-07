// Structural smoke tests for the sub-agent team feature and the
// concurrent MCP bulk-up. These tests read the source files and
// assert the contracts are present — no live runtime is required.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

function read(rel) {
  return readFileSync(join(root, rel), 'utf8');
}

test('Team_Runs / Team_Members / Team_Context / Team_Messages tables are registered in the migration runner', () => {
  const registry = read('lib/database/migrations_registry.ts');
  assert.match(registry, /addTeamRuns/);
  assert.match(registry, /addTeamMembers/);
  assert.match(registry, /addTeamContext/);
  assert.match(registry, /addTeamMessages/);
  const migration = read('lib/database/migrations/010__team_runs.ts');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS Team_Runs/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS Team_Members/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS Team_Context/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS Team_Messages/);
});

test('spawn_subagent_team tool is registered and exported', () => {
  assert.ok(existsSync(join(root, 'lib/tools/subagent-team.ts')));
  const tool = read('lib/tools/subagent-team.ts');
  assert.match(tool, /export const spawnSubagentTeamTool/);
  assert.match(tool, /name: 'spawn_subagent_team'/);
  // Always-included members
  assert.match(tool, /slot: 'planner'/);
  assert.match(tool, /slot: 'research'/);
  assert.match(tool, /slot: 'qa'/);
  assert.match(tool, /slot: 'supervisor'/);
  // The tool is auto-registered
  assert.match(tool, /toolRegistry\.registerTool\(spawnSubagentTeamTool\)/);
  // And imported by the native tools registration
  const register = read('lib/tools/register.ts');
  assert.match(register, /import "\.\/subagent-team"/);
});

test('Team coordinator enforces always-required slots + file-overlap + safe paths', () => {
  const coord = read('lib/services/team-coordinator.ts');
  // Required-slot enforcement
  assert.match(coord, /Team must include a QA agent/);
  assert.match(coord, /Team must include a Planner agent/);
  assert.match(coord, /Team must include a Research agent/);
  assert.match(coord, /Team must include a Supr sub-agent supervisor/);
  // File overlap detection
  assert.match(coord, /detectFileOverlap/);
  assert.match(coord, /team members must not overlap/);
  // Safe-path enforcement
  assert.match(coord, /startsWith\('\/'\)/);
  assert.match(coord, /includes\('\.\.'\)/);
  // Shared context + messaging helpers
  assert.match(coord, /writeContext/);
  assert.match(coord, /readContext/);
  assert.match(coord, /postMessage/);
  assert.match(coord, /fetchMessagesFor/);
  // Checksum for the post-execution fingerprint
  assert.match(coord, /checksumResult/);
  assert.match(coord, /finalChecksum/);
});

test('spawn_subagent_team team tool has its own two-phase audit + tool-name validation', () => {
  const tool = read('lib/tools/subagent-team.ts');
  // Two-phase audit
  assert.match(tool, /auditTeam/);
  // Tool names must be lowercase a-z0-9_
  assert.match(tool, /lowercase a-z0-9_/);
  // Required-slot enforcement at the tool layer too
  assert.match(tool, /Team is missing the required/);
  // File overlap at the tool layer
  assert.match(tool, /team members must not overlap/);
  // Coordination modes
  assert.match(tool, /'pipeline'.*'chain'|'chain'.*'pipeline'/s);
  // Pre- and post-checksum surfaced to the caller
  assert.match(tool, /Pre-execution checksum/);
  assert.match(tool, /Post-execution checksum/);
});

test('MCP bulk-up: external beta servers remain registered but disabled', () => {
  const cfg = JSON.parse(read('config/mcp-servers.json'));
  const byId = Object.fromEntries(cfg.servers.map((s) => [s.id, s]));
  assert.equal(byId['github-mcp'].enabled, false);
  assert.equal(byId['postgres-mcp'].enabled, false);
  assert.equal(byId['filesystem-mcp'].enabled, false);
  assert.equal(byId['brave-search-mcp'].enabled, false);
  assert.equal(byId['filesystem-mcp'].transport, 'stdio');
  assert.equal(byId['filesystem-mcp'].required_tier, 'Edit');
  assert.equal(byId['brave-search-mcp'].transport, 'stdio');
  assert.deepEqual(byId['brave-search-mcp'].env_keys, ['BRAVE_API_KEY']);
  assert.equal(byId['brave-search-mcp'].required_tier, 'Draft');
});

test('Composio fallback list expanded to 15+ apps', () => {
  const composio = read('lib/tools/composio.ts');
  for (const app of [
    'github', 'slack', 'notion', 'gmail',
    'google_calendar', 'google_drive', 'google_sheets',
    'linear', 'jira', 'hubspot', 'salesforce',
    'asana', 'trello', 'figma', 'airtable',
    'zendesk', 'sendgrid', 'stripe',
  ]) {
    assert.match(composio, new RegExp(`\\b${app}\\b`), `Composio fallback missing ${app}`);
  }
});

test('Settings page has a Composio Bridge input wired through the canonical updateSettingAction', () => {
  const settings = read('app/settings/page.tsx');
  assert.match(settings, /integrations_composio/);
  assert.match(settings, /Composio Bridge/);
  // Goes through the canonical helper (which broadcasts the
  // notifySettingsChanged cross-tab sentinel per the security tests)
  assert.match(settings, /handleUpdateSetting\(.*integrations_composio/s);
});

test('Teams API route returns the Team_Runs shape and is auth-gated', () => {
  const route = read('app/api/teams/route.ts');
  // Standard auth gate
  assert.match(route, /requireApiAuth/);
  // Pulls from the new table
  assert.match(route, /Team_Runs/);
  // Returns the expected fields
  assert.match(route, /teamId: r\.team_id/);
  assert.match(route, /memberCount: r\.member_count/);
  assert.match(route, /coordinationMode: r\.coordination_mode/);
});

test('Mission Control live status bar surfaces active sub-agent teams', () => {
  const page = read('app/page.tsx');
  // The page fetches the teams API
  assert.match(page, /\/api\/teams/);
  // And surfaces the count in the live status bar
  assert.match(page, /active team/);
  assert.match(page, /activeTeamCount/);
});

test('Team coordinator parallelizes member execution (Promise.allSettled, not sequential for-loop)', () => {
  const coord = read('lib/services/team-coordinator.ts');
  // The old sequential pattern is gone
  assert.doesNotMatch(coord, /for \(const m of ordered\) \{[\s\S]{0,400}runOneMember/);
  // The new parallel pattern is in place
  assert.match(coord, /Promise\.allSettled/);
});

test('Team coordinator publishes team_progress + team_completed + team_failed events', () => {
  const coord = read('lib/services/team-coordinator.ts');
  const bus = read('lib/events/team-bus.ts');
  assert.match(bus, /notifyTeamEvent/);
  assert.match(bus, /team_progress/);
  assert.match(bus, /team_completed/);
  assert.match(bus, /team_failed/);
  // The coordinator calls notifyTeamEvent at least 3 times
  // (one per member status, one on team done)
  const calls = (coord.match(/notifyTeamEvent\(/g) || []).length;
  assert.ok(calls >= 3, `Expected >= 3 notifyTeamEvent calls, found ${calls}`);
  // The SSE route forwards them
  const sse = read('app/api/mission/stream/route.ts');
  assert.match(sse, /teamEventBus/);
  assert.match(sse, /onTeamEvent/);
  assert.match(sse, /team_progress/);
  assert.match(sse, /team_completed/);
  assert.match(sse, /team_failed/);
});

test('Member response parser handles JSON, fenced JSON, legacy tags, and free-form prose', () => {
  const parser = read('lib/ide/team-parser.ts');
  assert.match(parser, /parseStructuredMemberOutput/);
  // All four shapes are handled
  assert.match(parser, /STRICT_JSON_RE/);
  assert.match(parser, /FENCED_JSON_RE/);
  assert.match(parser, /WORK_TAG_RE/);
  assert.match(parser, /CONTEXT_TAG_RE/);
  // Tolerant of nested closing tags (we strip them defensively)
  assert.match(parser, /replace\(/);
});

test('Team coordinator writes a Brief artifact on run completion', () => {
  const coord = read('lib/services/team-coordinator.ts');
  assert.match(coord, /addArtifact/);
  assert.match(coord, /\[Team\]/);
});

test('Teams page exposes the list + detail (members/context/messages) views', () => {
  const page = read('app/teams/page.tsx');
  assert.match(page, /Sub-Agent Teams/);
  assert.match(page, /TeamDetail/);
  assert.match(page, /members/);
  assert.match(page, /context/);
  assert.match(page, /messages/);
  // Subscribes to the team_progress / team_completed / team_failed events
  assert.match(page, /addEventListener\('team_progress'/);
  assert.match(page, /addEventListener\('team_completed'/);
  assert.match(page, /addEventListener\('team_failed'/);
  // And a per-team detail API route
  const detailRoute = read('app/api/teams/[teamId]/route.ts');
  assert.match(detailRoute, /Team_Members/);
  assert.match(detailRoute, /Team_Context/);
  assert.match(detailRoute, /Team_Messages/);
});

test('Supervisor page surfaces per-MCP-server health (CloakBrowser + MCP cards)', () => {
  const sup = read('app/supervisor/page.tsx');
  assert.match(sup, /MCP Servers/);
  assert.match(sup, /mcpServers/);
  // The health endpoint returns the mcpServers array
  const health = read('lib/production-health.ts');
  assert.match(health, /mcpServers/);
  assert.match(health, /loadMcpRegistrySafe/);
});

test('Composio Settings card has a Test Connection button that hits the test route', () => {
  const settings = read('app/settings/page.tsx');
  assert.match(settings, /handleTestComposioBridge/);
  assert.match(settings, /\/api\/composio\/test/);
  // And the test route exists
  const testRoute = read('app/api/composio/test/route.ts');
  assert.match(testRoute, /composioBridge\.listApps/);
  assert.match(testRoute, /appCount/);
});

test('Filesystem-mcp is disabled until a pinned executable is certified', () => {
  const cfg = JSON.parse(read('config/mcp-servers.json'));
  const fs = cfg.servers.find((s) => s.id === 'filesystem-mcp');
  assert.ok(fs, 'filesystem-mcp entry must exist');
  assert.equal(fs.enabled, false);
  assert.equal(fs.command, undefined);
  assert.equal(fs.args, undefined);
});

test('MCP registry includes an HTTP transport example (context7)', () => {
  const cfg = JSON.parse(read('config/mcp-servers.json'));
  const c7 = cfg.servers.find((s) => s.id === 'context7-mcp');
  assert.ok(c7, 'context7-mcp HTTP example must exist');
  assert.equal(c7.transport, 'http');
  assert.match(c7.endpoint, /\$\{env:CONTEXT7_MCP_URL/);
  assert.equal(c7.enabled, false);
});

test('chain coordination mode actually gates the rest on the planner', () => {
  const coord = read('lib/services/team-coordinator.ts');
  // The conditional that picks the planner
  assert.match(coord, /coordinationMode === 'chain'/);
  assert.match(coord, /planner = input\.members\.find\(\(m\) => m\.slot === 'planner'\)/);
  // The await on runMemberOnce for the planner BEFORE the rest
  assert.match(coord, /await runMemberOnce\(planner\)/);
  // The rest of the team then runs in parallel
  assert.match(coord, /Promise\.allSettled\(others\.map/);
});

test('withProviderRetry retries transient errors but rethrows persistent ones', () => {
  const coord = read('lib/services/team-coordinator.ts');
  assert.match(coord, /async function withProviderRetry/);
  // Recognises transient signals
  assert.match(coord, /ETIMEDOUT|ECONNRESET|5\\d\\d|overloaded/);
  // Uses exponential backoff
  assert.match(coord, /baseMs \* Math\.pow\(2, attempt\)/);
  // And is wired to both call sites
  const withRetryCallCount = (coord.match(/withProviderRetry\(/g) || []).length;
  assert.ok(withRetryCallCount >= 2, `Expected >= 2 withProviderRetry calls, found ${withRetryCallCount}`);
});

test('Per-team cancel route marks the run cancelled and publishes team_failed', () => {
  const route = read('app/api/teams/[teamId]/cancel/route.ts');
  assert.match(route, /requireApiAuth/);
  assert.match(route, /UPDATE Team_Runs/);
  assert.match(route, /SET status = 'cancelled'/);
  assert.match(route, /notifyTeamEvent/);
  // Idempotent: a second cancel on a terminal team is a no-op
  assert.match(route, /alreadyTerminal/);
});

test('MCP audit log: per-invocation table, fire-and-forget writer, reader', () => {
  const migration = read('lib/database/migrations/011__mcp_invocations.ts');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS MCP_Invocations/);
  // Indexes for server + mission lookups
  assert.match(migration, /idx_mcp_inv_server/);
  assert.match(migration, /idx_mcp_inv_mission/);
  // Migration registered
  const registry = read('lib/database/migrations_registry.ts');
  assert.match(registry, /addMcpInvocations/);
  // Writer exists and is fire-and-forget
  const audit = read('lib/mcp/audit.ts');
  assert.match(audit, /recordMcpInvocation/);
  assert.match(audit, /logMcpAudit/);
  // Reader exists
  assert.match(audit, /queryMcpAudit/);
  // And the registry wraps every forwardToMcpServer call
  const reg = read('lib/mcp/registry.ts');
  assert.match(reg, /forwardToMcpServer/);
  assert.match(reg, /recordMcpInvocation/);
});

test('Spawn Team UI on /teams page: form + spawn route + nav link', () => {
  const page = read('app/teams/page.tsx');
  // The form component
  assert.match(page, /SpawnTeamForm/);
  // The form is opened via a New button
  assert.match(page, /setShowSpawn\(true\)/);
  // Submits to /api/teams/spawn
  assert.match(page, /\/api\/teams\/spawn/);
  // The route exists + calls the tool
  const route = read('app/api/teams/spawn/route.ts');
  assert.match(route, /toolRegistry\.getTool\('spawn_subagent_team'\)/);
  assert.match(route, /requireApiAuth/);
  // Cancel button for running teams
  assert.match(page, /api\/teams\/.+\/cancel/);
});
