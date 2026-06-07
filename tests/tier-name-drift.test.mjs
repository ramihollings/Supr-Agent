// tests/tier-name-drift.test.mjs
//
// The 6-tier permission ladder lives in `agent-config/permissions.json`.
// Every MCP server in `config/mcp-servers.json` declares a
// `required_tier` that must match one of the tier ids exactly.
//
// Until 2026-06-06 the two files drifted: `permissions.json` called
// the level-5 tier `External Act` (with a space) while the MCP
// registry used `External_Act` (underscore). This test reads both
// files, collects the set of tier ids, and asserts every
// `required_tier` value matches a known id. A drift like the one
// above now fails the security suite at PR time.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const permissions = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'agent-config', 'permissions.json'), 'utf8'),
);
const mcpServers = JSON.parse(
  readFileSync(resolve(REPO_ROOT, 'config', 'mcp-servers.json'), 'utf8'),
);

test('permissions.json declares exactly 6 tiers with stable ids', () => {
  const tiers = permissions.tiers;
  assert.equal(Array.isArray(tiers), true, 'tiers must be an array');
  assert.equal(tiers.length, 6, 'expected exactly 6 tiers');
  const ids = tiers.map((t) => t.id);
  assert.deepEqual(
    ids,
    ['Observe', 'Draft', 'Edit', 'Execute', 'External_Act', 'Root'],
    'tier ids must match the canonical 6-tier ladder',
  );
});

test('every MCP server required_tier matches a known tier id', () => {
  const knownIds = new Set(permissions.tiers.map((t) => t.id));
  const offenders = [];
  for (const server of mcpServers.servers) {
    if (!server.required_tier) continue;
    if (!knownIds.has(server.required_tier)) {
      offenders.push({ id: server.id, required_tier: server.required_tier });
    }
  }
  assert.equal(
    offenders.length,
    0,
    `MCP servers reference unknown tiers: ${JSON.stringify(offenders)}`,
  );
});
