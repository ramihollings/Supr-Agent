import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { loadMcpRegistry, listServerResources } from '@/lib/mcp/registry';

export const dynamic = 'force-dynamic';

/**
 * List MCP resources. Resources are read-only data sources exposed
 * by an MCP server (skill files, memory items, database schemas, ...).
 * The response is a flat list grouped by server so a UI can render
 * one card per server.
 */
export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const registry = loadMcpRegistry();
  const serverFilter = req.nextUrl.searchParams.get('server');

  const out: Array<{ server_id: string; server_name: string; items: Array<{ uri: string; name: string; description?: string }> }> = [];
  for (const server of registry.servers) {
    if (!server.enabled) continue;
    if (serverFilter && server.id !== serverFilter) continue;
    const items = listServerResources(server);
    if (items.length === 0) continue;
    out.push({ server_id: server.id, server_name: server.name, items });
  }

  return Response.json({ ok: true, resources: out });
}
