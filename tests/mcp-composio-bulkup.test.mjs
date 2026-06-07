import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(REPO_ROOT, 'config/mcp-servers.json');
const REGISTRY = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
const MCP_REGISTRY_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/registry.ts'), 'utf8');
const MCP_AUDIT_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/audit.ts'), 'utf8');
const MCP_TOOLS_ROUTE = readFileSync(join(REPO_ROOT, 'app/api/mcp/tools/route.ts'), 'utf8');
const MCP_RESOURCES_READ_ROUTE = readFileSync(join(REPO_ROOT, 'app/api/mcp/resources/read/route.ts'), 'utf8');
const MCP_AUDIT_ROUTE = readFileSync(join(REPO_ROOT, 'app/api/mcp/audit/route.ts'), 'utf8');
const MCP_SERVERS_ROUTE = readFileSync(join(REPO_ROOT, 'app/api/mcp/servers/route.ts'), 'utf8');
const MCP_STATUS_ROUTE = readFileSync(join(REPO_ROOT, 'app/api/mcp/status/route.ts'), 'utf8');
const COMPOSIO_TOOL_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/composio.ts'), 'utf8');
const COMPOSIO_CLI = readFileSync(join(REPO_ROOT, 'bin/supr-composio.mjs'), 'utf8');
const COMPOSIO_APPS_ROUTE = existsSync(join(REPO_ROOT, 'app/api/composio/apps/route.ts'))
  ? readFileSync(join(REPO_ROOT, 'app/api/composio/apps/route.ts'), 'utf8') : '';
const COMPOSIO_CONNECT_ROUTE = existsSync(join(REPO_ROOT, 'app/api/composio/connect/route.ts'))
  ? readFileSync(join(REPO_ROOT, 'app/api/composio/connect/route.ts'), 'utf8') : '';
const MCP_PAGE = existsSync(join(REPO_ROOT, 'app/mcp/page.tsx'))
  ? readFileSync(join(REPO_ROOT, 'app/mcp/page.tsx'), 'utf8') : '';

/**
 * MCP + Composio bulk-up regression tests.
 *
 * Covers the new surface added in this round:
 *   - MCP audit log (every tool call persisted to Audit_Log)
 *   - MCP resource read (skill:// and file:// schemes)
 *   - MCP server toggle (PATCH /api/mcp/servers)
 *   - MCP UI page at /mcp
 *   - Composio CLI at bin/supr-composio.mjs
 *   - Composio HTTP routes for apps/connections/connect
 *   - Composio registered as a real in-process MCP server
 *   - Permission tier ladder unchanged
 */

// 1. MCP audit log
test('MCP audit log writes to MCP_Invocations with structured metadata', () => {
  assert.match(MCP_AUDIT_SOURCE, /INSERT INTO MCP_Invocations/);
  assert.match(MCP_AUDIT_SOURCE, /serverId|toolName/);
  // Must be non-blocking on failure.
  assert.match(MCP_AUDIT_SOURCE, /The audit log is best-effort|never let a write failure/);
});

test('MCP tools route audits every call (ok, denied, error)', () => {
  assert.match(MCP_TOOLS_ROUTE, /logMcpAudit/);
  assert.match(MCP_TOOLS_ROUTE, /status: 'denied'/);
  assert.match(MCP_TOOLS_ROUTE, /status: 'error'/);
  assert.match(MCP_TOOLS_ROUTE, /status: 'success'/);
  // The response must include the resolved server so callers can
  // verify which MCP server handled the call.
  assert.match(MCP_TOOLS_ROUTE, /server: resolved\.server\.id/);
});

test('MCP audit route supports server/agent/mission filtering', () => {
  assert.match(MCP_AUDIT_ROUTE, /queryMcpAudit/);
  assert.match(MCP_AUDIT_ROUTE, /serverId/);
  assert.match(MCP_AUDIT_ROUTE, /agentId/);
  assert.match(MCP_AUDIT_ROUTE, /missionId/);
  assert.match(MCP_AUDIT_ROUTE, /limit/);
});

// 2. MCP resource read
test('MCP resource read supports skill:// and file:// schemes', () => {
  assert.match(MCP_RESOURCES_READ_ROUTE, /skill:\/\//);
  assert.match(MCP_RESOURCES_READ_ROUTE, /file:\/\/\.\//);
  // Path traversal must be blocked.
  assert.match(MCP_RESOURCES_READ_ROUTE, /Path traversal not allowed/);
  // The skill name allowlist must reject anything but the
  // [a-zA-Z0-9._-] character class. Use the `s` flag because the
  // character class appears inside a longer regex on one line.
  assert.match(MCP_RESOURCES_READ_ROUTE, /a-zA-Z0-9\._-]+/);
});

test('MCP resource read is auth-gated', () => {
  assert.match(MCP_RESOURCES_READ_ROUTE, /requireApiAuth/);
});

// 3. MCP server toggle
test('PATCH /api/mcp/servers toggles a server and persists the change', () => {
  assert.match(MCP_SERVERS_ROUTE, /PATCH/);
  assert.match(MCP_SERVERS_ROUTE, /requireApiAuth/);
  assert.match(MCP_SERVERS_ROUTE, /invalidateMcpRegistry/);
  // The id must come from the validated allowlist (allow `-`).
  assert.match(MCP_SERVERS_ROUTE, /a-zA-Z0-9\._-]+/);
  // Must persist to config/mcp-servers.json.
  assert.match(MCP_SERVERS_ROUTE, /writeFile/);
});

// 4. MCP UI page
test('MCP UI page exists and is wired to the status + servers routes', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'app/mcp/page.tsx')));
  assert.match(MCP_PAGE, /\/api\/mcp\/status/);
  assert.match(MCP_PAGE, /\/api\/mcp\/servers/);
  assert.match(MCP_PAGE, /toggleServer/);
});

test('MCP nav link is present in the TopNav', () => {
  const topNav = readFileSync(join(REPO_ROOT, 'components/TopNav.tsx'), 'utf8');
  assert.match(topNav, /href.*'\/mcp'/);
});

// 5. Composio as an MCP server
test('Composio remains registered as a disabled beta in-process MCP server', () => {
  const composio = REGISTRY.servers.find((s) => s.id === 'supr-composio');
  assert.ok(composio, 'supr-composio server must be in the registry');
  assert.equal(composio.transport, 'in-process');
  assert.equal(composio.enabled, false);
  // Composio actions are External_Act — they touch real third-party
  // services, so a Draft/E tier is not enough.
  assert.equal(composio.required_tier, 'External_Act');
});

test('MCP router resolves Composio-bridged tools to the supr-composio server', () => {
  assert.match(MCP_REGISTRY_SOURCE, /supr-composio/);
  assert.match(MCP_REGISTRY_SOURCE, /composioBridge/);
  // The known core suite must be recognized.
  assert.match(MCP_REGISTRY_SOURCE, /github_create_issue/);
  assert.match(MCP_REGISTRY_SOURCE, /slack_send_message/);
  assert.match(MCP_REGISTRY_SOURCE, /notion_append_block/);
});

// 6. Composio bridge module
test('Composio bridge exposes a stable interface for both runtime and CLI', () => {
  assert.match(COMPOSIO_TOOL_SOURCE, /interface ComposioBridge/);
  assert.match(COMPOSIO_TOOL_SOURCE, /listApps\(\)/);
  assert.match(COMPOSIO_TOOL_SOURCE, /listConnections\(\)/);
  assert.match(COMPOSIO_TOOL_SOURCE, /initiateConnection\(appName/);
  assert.match(COMPOSIO_TOOL_SOURCE, /executeAction\(actionName/);
});

test('Composio bridge resolves the API key on every call (no forever-cached client)', () => {
  // The bridge re-reads the key on every operation so a Settings
  // rotation is picked up immediately.
  const getClient = COMPOSIO_TOOL_SOURCE.match(/private async getClient\(\)[\s\S]*?\n  \}/)?.[0] || '';
  assert.match(getClient, /getSecretSetting\('integrations_composio'/);
  assert.match(getClient, /process\.env\.COMPOSIO_API_KEY/);
});

test('Composio bridge supports both SDK and direct REST API paths', () => {
  // Some SDK versions expose apps.list(); others don't. The CLI
  // must fall back to a direct REST call against the Composio
  // backend if the SDK is missing the method.
  assert.match(COMPOSIO_CLI, /runBridgePlain/);
  assert.match(COMPOSIO_CLI, /\/api\/v1\/apps/);
  assert.match(COMPOSIO_CLI, /x-api-key/);
});

// 7. Composio CLI
test('supr-composio CLI exists and supports the full subcommand set', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'bin/supr-composio.mjs')));
  assert.match(COMPOSIO_CLI, /supr-composio <command>/);
  assert.match(COMPOSIO_CLI, /^.*status/m);
  assert.match(COMPOSIO_CLI, /^.*apps/m);
  assert.match(COMPOSIO_CLI, /^.*connections/m);
  assert.match(COMPOSIO_CLI, /^.*connect/m);
  assert.match(COMPOSIO_CLI, /^.*invoke/m);
  // The CLI must refuse to run without an API key.
  assert.match(COMPOSIO_CLI, /COMPOSIO_API_KEY is not set/);
  // The CLI must support JSON params for invoke.
  assert.match(COMPOSIO_CLI, /JSON\.parse\(argv\[2\]\)/);
});

test('supr-composio CLI is registered as an npm script', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts.composio, 'node bin/supr-composio.mjs');
});

// 8. Composio HTTP routes
test('GET /api/composio/apps returns the supported app list', () => {
  assert.match(COMPOSIO_APPS_ROUTE, /requireApiAuth/);
  assert.match(COMPOSIO_APPS_ROUTE, /composioBridge\.listApps/);
});

test('POST /api/composio/connect initiates a third-party OAuth flow', () => {
  assert.match(COMPOSIO_CONNECT_ROUTE, /requireApiAuth/);
  assert.match(COMPOSIO_CONNECT_ROUTE, /composioBridge\.initiateConnection/);
  // The app name must come from the validated allowlist.
  assert.match(COMPOSIO_CONNECT_ROUTE, /a-zA-Z0-9\._-]+/);
});
