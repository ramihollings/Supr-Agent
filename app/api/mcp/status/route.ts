import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { loadMcpRegistry, listServerResources, listPassiveTools } from '@/lib/mcp/registry';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const registry = loadMcpRegistry();
  const tools = await listPassiveTools();
  const resources: Array<{ server_id: string; server_name: string; items: Array<{ uri: string; name: string; description?: string }> }> = [];
  for (const server of registry.servers) {
    if (!server.enabled) continue;
    const items = listServerResources(server);
    if (items.length === 0) continue;
    resources.push({ server_id: server.id, server_name: server.name, items });
  }

  return Response.json({
    ok: true,
    version: registry.version,
    servers: registry.servers.map((s) => ({
      id: s.id,
      name: s.name,
      transport: s.transport,
      description: s.description,
      required_tier: s.required_tier,
      enabled: s.enabled,
    })),
    tool_count: tools.length,
    resource_count: resources.reduce((acc, r) => acc + r.items.length, 0),
    tools: tools.slice(0, 50),
    resources,
  });
}
