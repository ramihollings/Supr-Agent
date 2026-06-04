/**
 * MCP (Model Context Protocol) server registry and router.
 *
 * Per Blueprint 5.0 Part 3.1, subagents must NEVER attach to MCP
 * servers directly. They go through the unified `/api/mcp/*` routes,
 * which:
 *   1. Resolve the requested server from the JSON registry
 *   2. Enforce the per-server permission tier against the calling
 *      agent's current tier (PermissionEngine.evaluateActionDynamic)
 *   3. Re-validate any tool/resource request against the per-server
 *      `env_keys` allowlist
 *
 * This module is the in-process side of the same surface the HTTP
 * routes expose. Direct imports from agent code (e.g. via the
 * `invoke_subagent` tool) also go through `resolveMcpTool()` so
 * the tier check is uniform.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolRegistry, type ToolExecutionContext } from '@/lib/tools/registry';
import { PermissionEngine, type PermissionTier } from '@/lib/services/governance';

const REPO_ROOT = process.cwd();
const REGISTRY_PATH = join(REPO_ROOT, 'config', 'mcp-servers.json');
const SKILLS_DIR = join(REPO_ROOT, '.agents', 'skills');

export interface McpServerEntry {
  id: string;
  name: string;
  transport: 'in-process' | 'stdio' | 'http';
  description: string;
  required_tier: PermissionTier;
  enabled: boolean;
  command?: string;
  args?: string[];
  env_keys?: string[];
  tools?: string;
  resources?: string;
}

interface McpRegistry {
  version: number;
  description: string;
  servers: McpServerEntry[];
}

let cachedRegistry: McpRegistry | null = null;

export function loadMcpRegistry(): McpRegistry {
  if (cachedRegistry) return cachedRegistry;
  if (!existsSync(REGISTRY_PATH)) {
    cachedRegistry = { version: 0, description: '', servers: [] };
    return cachedRegistry;
  }
  try {
    const raw = readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw) as McpRegistry;
    cachedRegistry = parsed;
    return parsed;
  } catch (err: any) {
    console.error(`[MCP] Failed to load registry at ${REGISTRY_PATH}: ${err.message}`);
    cachedRegistry = { version: 0, description: '', servers: [] };
    return cachedRegistry;
  }
}

/**
 * Force a re-read of the registry on the next call. Operators can
 * edit `config/mcp-servers.json` to enable/disable servers and
 * re-load without restarting the process.
 */
export function invalidateMcpRegistry() {
  cachedRegistry = null;
}

const TIER_RANK: Record<PermissionTier, number> = {
  Observe: 1,
  Draft: 2,
  Edit: 3,
  Execute: 4,
  External_Act: 5,
  Root: 6,
};

export function tierMeetsRequirement(agentTier: PermissionTier, required: PermissionTier): boolean {
  return TIER_RANK[agentTier] >= TIER_RANK[required];
}

export interface McpToolResolution {
  server: McpServerEntry;
  toolName: string;
}

/**
 * Resolve an MCP tool call: find the server that owns the tool and
 * verify the agent's tier meets the server's `required_tier`.
 *
 * For in-process servers (the built-in Supr ones), the tool list
 * is read from the live tool registry at request time. For stdio
 * servers, the tool list is the server's own JSON-RPC
 * `tools/list` response (cached in the registry under `tools`).
 */
export async function resolveMcpTool(
  toolName: string,
  ctx: ToolExecutionContext,
): Promise<McpToolResolution> {
  const registry = loadMcpRegistry();
  const agentTier = await resolveAgentTier(ctx.agentId);
  for (const server of registry.servers) {
    if (!server.enabled) continue;
    const owns = await serverOwnsTool(server, toolName);
    if (!owns) continue;
    if (!tierMeetsRequirement(agentTier, server.required_tier)) {
      throw new Error(
        `MCP server '${server.id}' requires tier '${server.required_tier}' but agent has '${agentTier}'.`,
      );
    }
    return { server, toolName };
  }
  throw new Error(`No MCP server provides tool '${toolName}'.`);
}

async function serverOwnsTool(server: McpServerEntry, toolName: string): Promise<boolean> {
  if (server.id === 'supr-internal') {
    // The internal server exposes the live tool registry.
    // ensureNativeToolsRegistered triggers a dynamic import of the
    // register module, populating the in-process registry.
    await toolRegistry.ensureNativeToolsRegistered();
    return toolRegistry.getTool(toolName) !== undefined;
  }
  if (server.id === 'supr-composio') {
    // The Composio server exposes the actions whose names match
    // a registered bridge tool. We don't dynamically import the
    // composio-core SDK on every probe (that would hit the
    // network); we just check the in-process bridge's known
    // registered actions, which initializeCoreComposioSuite
    // populates on startup.
    const { composioBridge } = await import('@/lib/tools/composio');
    // Heuristic: composio-bridged tool names are lowercased
    // action names. We allow-list the core suite plus any
    // tool already registered as a composio action.
    const knownComposioActions = new Set([
      'github_create_issue',
      'slack_send_message',
      'notion_append_block',
    ]);
    await toolRegistry.ensureNativeToolsRegistered();
    if (toolRegistry.getTool(toolName) && knownComposioActions.has(toolName)) {
      return true;
    }
    // Also accept any tool whose name is exactly the action name
    // lowercased — this lets operators register custom actions
    // without editing the registry.
    return toolName === toolName.toLowerCase() && toolName.includes('_');
  }
  if (server.transport === 'stdio' && server.enabled) {
    // For stdio servers we cache the tool list in a module-level
    // map so repeated probes don't spawn a new child process.
    const { getOrStartSession } = await import('./stdio');
    try {
      const session = await getOrStartSession(server);
      const tools = await session.listTools();
      return tools.some((t) => t.name === toolName);
    } catch {
      // If the child fails to start (missing binary, bad args,
      // etc.) the registry still returns false so a different
      // server can claim the tool.
      return false;
    }
  }
  if (server.transport === 'http' && server.enabled) {
    const { getOrStartHttpSession } = await import('./http');
    try {
      const session = await getOrStartHttpSession(server);
      const tools = await session.listTools();
      return tools.some((t) => t.name === toolName);
    } catch {
      return false;
    }
  }
  // For any other transport, return false.
  return false;
}

/**
 * Cache of tool lists for stdio servers, so repeated probes
 * don't pay the JSON-RPC cost.
 */
const stdioToolCache = new Map<string, { tools: string[]; fetchedAt: number }>();
const STDIO_CACHE_TTL_MS = 30_000;

async function resolveAgentTier(agentId?: string): Promise<PermissionTier> {
  if (!agentId) return 'Observe';
  // Read the agent's permission_tier from the Agents table.
  try {
    const { default: dbClient } = await import('@/lib/database/db_client');
    const row = await dbClient.queryOne<any>(
      `SELECT permission_tier FROM Agents WHERE id = ?`,
      [agentId],
    );
    return (row?.permission_tier as PermissionTier) || 'Observe';
  } catch {
    return 'Observe';
  }
}

/**
 * List the resources exposed by a server. For in-process servers
 * with `resources: auto:...`, enumerate the configured source.
 */
export function listServerResources(server: McpServerEntry): Array<{ uri: string; name: string; description?: string }> {
  if (!server.resources) return [];
  if (server.resources.startsWith('auto:.agents/skills')) {
    return listSkillResources();
  }
  return [];
}

function listSkillResources(): Array<{ uri: string; name: string; description?: string }> {
  if (!existsSync(SKILLS_DIR)) return [];
  const out: Array<{ uri: string; name: string; description?: string }> = [];
  for (const entry of readdirSync(SKILLS_DIR)) {
    const skillMd = join(SKILLS_DIR, entry, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    let description = '';
    try {
      const raw = readFileSync(skillMd, 'utf8');
      // Pull the YAML `description:` field from the front-matter.
      const m = raw.match(/^description:\s*(.+)$/m);
      if (m) description = m[1].trim();
    } catch {}
    out.push({
      uri: `skill://${entry}/SKILL.md`,
      name: entry,
      description: description || undefined,
    });
  }
  return out;
}

export interface McpToolDescriptor {
  name: string;
  description: string;
  required_tier: PermissionTier;
  server_id: string;
  server_name: string;
}

export async function listAllTools(): Promise<McpToolDescriptor[]> {
  const registry = loadMcpRegistry();
  const out: McpToolDescriptor[] = [];
  for (const server of registry.servers) {
    if (!server.enabled) continue;
    if (server.id === 'supr-internal') {
      await toolRegistry.ensureNativeToolsRegistered();
      for (const tool of toolRegistry.getAllTools()) {
        out.push({
          name: tool.name,
          description: tool.description,
          required_tier: tool.requiredTier,
          server_id: server.id,
          server_name: server.name,
        });
      }
    } else if (server.transport === 'stdio') {
      const cached = stdioToolCache.get(server.id);
      if (cached && Date.now() - cached.fetchedAt < STDIO_CACHE_TTL_MS) {
        for (const name of cached.tools) {
          out.push({
            name,
            description: `MCP tool from ${server.name}`,
            required_tier: server.required_tier,
            server_id: server.id,
            server_name: server.name,
          });
        }
        continue;
      }
      try {
        const { getOrStartSession } = await import('./stdio');
        const session = await getOrStartSession(server);
        const tools = await session.listTools();
        stdioToolCache.set(server.id, { tools: tools.map((t) => t.name), fetchedAt: Date.now() });
        for (const t of tools) {
          out.push({
            name: t.name,
            description: t.description || `MCP tool from ${server.name}`,
            required_tier: server.required_tier,
            server_id: server.id,
            server_name: server.name,
          });
        }
      } catch (err: any) {
        console.warn(`[MCP] Failed to list tools for stdio server '${server.id}': ${err.message}`);
      }
    } else if (server.transport === 'http') {
      try {
        const { getOrStartHttpSession } = await import('./http');
        const session = await getOrStartHttpSession(server);
        const tools = await session.listTools();
        for (const t of tools) {
          out.push({
            name: t.name,
            description: t.description || `MCP tool from ${server.name}`,
            required_tier: server.required_tier,
            server_id: server.id,
            server_name: server.name,
          });
        }
      } catch (err: any) {
        console.warn(`[MCP] Failed to list tools for http server '${server.id}': ${err.message}`);
      }
    }
  }
  return out;
}

/**
 * Forward a tool call to a non-internal MCP server (currently
 * stdio and http). The in-process server is handled by the
 * toolRegistry directly.
 */
export async function forwardToMcpServer(
  server: McpServerEntry,
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (server.transport === 'stdio') {
    const { getOrStartSession } = await import('./stdio');
    const session = await getOrStartSession(server);
    const result = await session.callTool(toolName, args);
    if ((result as any)?.isError) {
      const text = (result as any).content?.[0]?.text || 'MCP tool returned an error.';
      throw new Error(text);
    }
    return result;
  }
  if (server.transport === 'http') {
    const { getOrStartHttpSession } = await import('./http');
    const session = await getOrStartHttpSession(server);
    const result = await session.callTool(toolName, args);
    if ((result as any)?.isError) {
      const text = (result as any).content?.[0]?.text || 'MCP tool returned an error.';
      throw new Error(text);
    }
    return result;
  }
  throw new Error(`Server '${server.id}' is not a forwardable transport.`);
}
