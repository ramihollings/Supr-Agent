import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const REGISTRY_PATH = join(REPO_ROOT, 'config/mcp-servers.json');
const MCP_REGISTRY_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/registry.ts'), 'utf8');
const MCP_STATUS_SOURCE = readFileSync(join(REPO_ROOT, 'app/api/mcp/status/route.ts'), 'utf8');
const MCP_RESOURCES_SOURCE = readFileSync(join(REPO_ROOT, 'app/api/mcp/resources/route.ts'), 'utf8');
const MCP_TOOLS_SOURCE = readFileSync(join(REPO_ROOT, 'app/api/mcp/tools/route.ts'), 'utf8');
const SKILLS_CATALOG_SOURCE = readFileSync(join(REPO_ROOT, 'lib/skills/catalog.ts'), 'utf8');
const CONTEXT_BUDGET_SOURCE = readFileSync(join(REPO_ROOT, 'lib/context/budget.ts'), 'utf8');
const SUBAGENT_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/subagent.ts'), 'utf8');

/**
 * Blueprint 5.0 regression tests.
 *
 * Covers the new MCP server infrastructure, structured skill
 * catalog, and context budget enforcement. These are all
 * additive — the assertions check the new modules exist, that
 * they wire up to the existing patterns (registry, tool router,
 * settings table), and that the new APIs are reachable from the
 * outside world via /api/mcp/*.
 */

// 1. MCP server registry
test('config/mcp-servers.json exists and is a valid JSON registry', () => {
  assert.ok(existsSync(REGISTRY_PATH), 'config/mcp-servers.json must exist');
  const parsed = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  assert.equal(typeof parsed.version, 'number');
  assert.ok(Array.isArray(parsed.servers), 'registry.servers must be an array');
  assert.ok(parsed.servers.length >= 3, 'expected at least 3 in-process MCP servers');
  // Every server must have a required_tier and an enabled flag.
  for (const server of parsed.servers) {
    assert.ok(typeof server.id === 'string' && server.id.length > 0, 'server.id required');
    assert.ok(['Observe', 'Draft', 'Edit', 'Execute', 'External_Act', 'Root'].includes(server.required_tier), `server '${server.id}' required_tier invalid`);
    assert.equal(typeof server.enabled, 'boolean', `server '${server.id}' enabled must be boolean`);
  }
});

test('MCP router enforces per-server tier before allowing tool calls', () => {
  assert.match(MCP_REGISTRY_SOURCE, /tierMeetsRequirement/);
  assert.match(MCP_REGISTRY_SOURCE, /required_tier/);
  assert.match(MCP_REGISTRY_SOURCE, /resolveAgentTier/);
});

test('MCP router reuses the existing PermissionEngine tier ladder', () => {
  // The router must use the same tier strings as the rest of
  // the codebase so a server's required_tier matches what
  // PermissionEngine.evaluateActionDynamic returns.
  assert.match(MCP_REGISTRY_SOURCE, /PermissionEngine/);
  // The TIER_RANK object literal must list every tier used by
  // the permission engine. The `s` flag lets `.` match newlines
  // since the literal spans multiple lines.
  assert.match(
    MCP_REGISTRY_SOURCE,
    /Observe.*Draft.*Edit.*Execute.*External_Act.*Root/s,
  );
});

test('MCP router never lets a subagent attach to a stdio server directly', () => {
  // The whole point of the router is that callers must go
  // through resolveMcpTool. There must be no helper that
  // spawns a child process or opens a socket.
  assert.doesNotMatch(MCP_REGISTRY_SOURCE, /child_process/);
  assert.doesNotMatch(MCP_REGISTRY_SOURCE, /spawn\(/);
  assert.doesNotMatch(MCP_REGISTRY_SOURCE, /fork\(/);
});

// 2. MCP HTTP routes
test('MCP status route lists servers, tools, and resources', () => {
  assert.match(MCP_STATUS_SOURCE, /loadMcpRegistry/);
  assert.match(MCP_STATUS_SOURCE, /listPassiveTools/);
  assert.match(MCP_STATUS_SOURCE, /listServerResources/);
  // Must require auth like the rest of the API.
  assert.match(MCP_STATUS_SOURCE, /requireApiAuth/);
});

test('MCP resources route enumerates in-process resources', () => {
  assert.match(MCP_RESOURCES_SOURCE, /listServerResources/);
  assert.match(MCP_RESOURCES_SOURCE, /requireApiAuth/);
});

test('MCP tools route resolves and forwards tool calls', () => {
  assert.match(MCP_TOOLS_SOURCE, /resolveMcpTool/);
  assert.match(MCP_TOOLS_SOURCE, /toolRegistry\.executeTool/);
  assert.match(MCP_TOOLS_SOURCE, /requireApiAuth/);
});

// 3. Skill catalog
test('Skill catalog parses YAML front-matter from SKILL.md files', () => {
  assert.match(SKILLS_CATALOG_SOURCE, /splitFrontMatter/);
  assert.match(SKILLS_CATALOG_SOURCE, /description/);
  assert.match(SKILLS_CATALOG_SOURCE, /metadata/);
  assert.match(SKILLS_CATALOG_SOURCE, /tags/);
});

test('Skill catalog exposes a renderSkillPrompt helper that materializes the body verbatim', () => {
  // Per Blueprint 5.0 Part 3.2, the skill body is treated as a
  // security clearance. It must be injected verbatim — no
  // template substitution, no eval, no require() of the body.
  assert.match(SKILLS_CATALOG_SOURCE, /renderSkillPrompt/);
  assert.doesNotMatch(SKILLS_CATALOG_SOURCE, /eval\(/);
  assert.doesNotMatch(SKILLS_CATALOG_SOURCE, /new Function/);
});

test('Skill catalog is reachable from the MCP supr-skills server', () => {
  // The MCP router must auto-enumerate .agents/skills/*/SKILL.md
  // as resources of the supr-skills server.
  assert.match(MCP_REGISTRY_SOURCE, /listSkillResources/);
  assert.match(MCP_REGISTRY_SOURCE, /skill:\/\//);
});

// 4. Context budget enforcement
test('Context budget packs fragments under the configured token cap', () => {
  assert.match(CONTEXT_BUDGET_SOURCE, /packContext/);
  assert.match(CONTEXT_BUDGET_SOURCE, /estimateTokens/);
  assert.match(CONTEXT_BUDGET_SOURCE, /DEFAULT_TOKEN_BUDGET = 1_900/);
});

test('Context budget reads the budget from Settings so operators can tune it', () => {
  assert.match(CONTEXT_BUDGET_SOURCE, /getSubagentTokenBudget/);
  assert.match(CONTEXT_BUDGET_SOURCE, /subagent_token_budget/);
  assert.match(CONTEXT_BUDGET_SOURCE, /Settings WHERE key = /);
});

test('Context budget reports dropped fragments so the agent knows more context exists', () => {
  assert.match(CONTEXT_BUDGET_SOURCE, /dropped/);
  assert.match(CONTEXT_BUDGET_SOURCE, /additional context fragment\(s\) were dropped/);
});

// 5. Subagent integration
test('spawn_subagent uses the context budget for the spawned prompt', () => {
  // The subagent tool must call assembleSubagentContext so
  // every spawned subagent gets a packed context, not the full
  // project history.
  assert.match(SUBAGENT_SOURCE, /assembleSubagentContext/);
  assert.match(SUBAGENT_SOURCE, /from "\.\.\/context\/budget"/);
  assert.match(SUBAGENT_SOURCE, /Relevant context \(budget:/);
});
