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

test('MCP bulk-up: github + postgres enabled, filesystem + brave-search added', () => {
  const cfg = JSON.parse(read('config/mcp-servers.json'));
  const byId = Object.fromEntries(cfg.servers.map((s) => [s.id, s]));
  assert.equal(byId['github-mcp'].enabled, true);
  assert.equal(byId['postgres-mcp'].enabled, true);
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
