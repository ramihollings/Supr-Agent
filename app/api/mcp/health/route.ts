import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { loadMcpRegistry } from '@/lib/mcp/registry';

export const dynamic = 'force-dynamic';

interface ServerHealth {
  id: string;
  name: string;
  enabled: boolean;
  transport: string;
  status: 'ok' | 'degraded' | 'unreachable' | 'disabled' | 'unknown';
  latencyMs: number | null;
  message?: string;
  toolCount?: number;
  checkedAt: string;
}

/**
 * GET /api/mcp/health
 *
 * Pings each enabled MCP server and reports a per-server
 * status. For in-process servers the check is a no-op
 * (always ok). For stdio and http servers the check
 * calls listTools() with a short timeout.
 */
export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  const registry = loadMcpRegistry();
  const out: ServerHealth[] = [];
  for (const server of registry.servers) {
    const base: ServerHealth = {
      id: server.id,
      name: server.name,
      enabled: server.enabled,
      transport: server.transport,
      status: 'unknown',
      latencyMs: null,
      checkedAt: new Date().toISOString(),
    };
    if (!server.enabled) {
      out.push({ ...base, status: 'disabled' });
      continue;
    }
    const start = Date.now();
    try {
      if (server.transport === 'in-process') {
        out.push({ ...base, status: 'ok', latencyMs: 0 });
        continue;
      }
      if (server.transport === 'stdio') {
        const { getOrStartSession } = await import('@/lib/mcp/stdio');
        const session = await getOrStartSession(server);
        const tools = await session.listTools();
        out.push({ ...base, status: 'ok', latencyMs: Date.now() - start, toolCount: tools.length });
        continue;
      }
      if (server.transport === 'http') {
        const { getOrStartHttpSession } = await import('@/lib/mcp/http');
        const session = await getOrStartHttpSession(server);
        const tools = await session.listTools();
        out.push({ ...base, status: 'ok', latencyMs: Date.now() - start, toolCount: tools.length });
        continue;
      }
      out.push({ ...base, status: 'unknown' });
    } catch (err: any) {
      out.push({
        ...base,
        status: 'unreachable',
        latencyMs: Date.now() - start,
        message: err.message,
      });
    }
  }
  const okCount = out.filter((s) => s.status === 'ok').length;
  const degraded = out.filter((s) => s.status === 'unreachable').length;
  return Response.json({
    ok: true,
    summary: {
      total: out.length,
      ok: okCount,
      degraded,
      disabled: out.filter((s) => s.status === 'disabled').length,
    },
    servers: out,
  });
}
