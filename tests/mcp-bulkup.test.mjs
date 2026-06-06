import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(REPO_ROOT, 'config/mcp-servers.json');
const REGISTRY = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const COMPOSIO_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/composio.ts'), 'utf8');
const SETTINGS_PAGE = readFileSync(join(REPO_ROOT, 'app/settings/page.tsx'), 'utf8');

/**
 * MCP bulk-up regression tests.
 *
 * Covers the new surface added in this round:
 *   - config/mcp-servers.json: 8 entries (4 original + 2 now-enabled + 2 new)
 *   - filesystem-mcp + brave-search-mcp with their required_tier / transport
 *   - Composio fallback list expanded to 15+ apps
 *   - Settings page has the Composio Bridge card and the
 *     integrations_composio setting reference
 */

test('config/mcp-servers.json parses and contains 9 servers', () => {
  assert.ok(Array.isArray(REGISTRY.servers), 'servers must be an array');
  assert.equal(REGISTRY.servers.length, 9, 'expected 9 server entries');
});

test('all four in-process servers remain enabled', () => {
  const ids = ['supr-internal', 'supr-skills', 'supr-memory', 'supr-composio'];
  for (const id of ids) {
    const s = REGISTRY.servers.find((entry) => entry.id === id);
    assert.ok(s, `${id} must be in the registry`);
    assert.equal(s.transport, 'in-process');
    assert.equal(s.enabled, true);
    assert.ok(s.required_tier, `${id} must declare required_tier`);
  }
});

test('github-mcp and postgres-mcp are enabled by default', () => {
  for (const id of ['github-mcp', 'postgres-mcp']) {
    const s = REGISTRY.servers.find((entry) => entry.id === id);
    assert.ok(s, `${id} must be in the registry`);
    assert.equal(s.transport, 'stdio');
    assert.equal(s.enabled, true, `${id} should be enabled by default`);
    assert.ok(Array.isArray(s.env_keys) && s.env_keys.length > 0, `${id} must declare env_keys`);
    assert.ok(s.description, `${id} must have a description`);
  }
});

test('filesystem-mcp is registered as a stdio Edit-tier server', () => {
  const s = REGISTRY.servers.find((entry) => entry.id === 'filesystem-mcp');
  assert.ok(s, 'filesystem-mcp must be in the registry');
  assert.equal(s.transport, 'stdio');
  assert.equal(s.required_tier, 'Edit');
  assert.equal(s.enabled, true);
  assert.equal(s.command, 'npx');
  assert.ok(Array.isArray(s.args) && s.args.includes('-y'));
  assert.ok(s.args.includes('@modelcontextprotocol/server-filesystem'));
  assert.ok(Array.isArray(s.env_keys) && s.env_keys.length === 0, 'filesystem-mcp has no env_keys');
  assert.ok(s.description, 'filesystem-mcp must have a description');
});

test('brave-search-mcp is registered as a stdio Draft-tier server', () => {
  const s = REGISTRY.servers.find((entry) => entry.id === 'brave-search-mcp');
  assert.ok(s, 'brave-search-mcp must be in the registry');
  assert.equal(s.transport, 'stdio');
  assert.equal(s.required_tier, 'Draft');
  assert.equal(s.enabled, true);
  assert.equal(s.command, 'npx');
  assert.ok(Array.isArray(s.args) && s.args.includes('-y'));
  assert.ok(s.args.includes('@modelcontextprotocol/server-brave-search'));
  assert.deepEqual(s.env_keys, ['BRAVE_API_KEY']);
  assert.ok(s.description, 'brave-search-mcp must have a description');
});

test('Composio bridge exports the expanded fallback app list (15+)', () => {
  const fallback = COMPOSIO_SOURCE.match(/return \[\s*\{ key: 'github'[\s\S]*?\];/);
  assert.ok(fallback, 'expanded fallback list must be present in composio.ts');
  const matches = [...fallback[0].matchAll(/key:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.ok(matches.length >= 15, `expected at least 15 fallback apps, found ${matches.length}`);
  for (const required of [
    'github', 'slack', 'notion', 'gmail', 'google_calendar', 'google_drive',
    'google_sheets', 'linear', 'jira', 'hubspot', 'salesforce', 'asana',
    'trello', 'figma', 'airtable', 'zendesk', 'sendgrid', 'stripe',
  ]) {
    assert.ok(matches.includes(required), `fallback list missing ${required}`);
  }
});

test('Settings page wires the integrations_composio setting through handleUpdateSetting', () => {
  assert.match(SETTINGS_PAGE, /integrations_composio/);
  assert.match(SETTINGS_PAGE, /handleUpdateSetting\('integrations_composio'/);
});

test('Settings page has an explicit Composio Bridge card', () => {
  assert.match(SETTINGS_PAGE, /Composio Bridge/);
  assert.match(SETTINGS_PAGE, /handleSaveComposioBridge/);
});
