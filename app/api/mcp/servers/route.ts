import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { loadMcpRegistry, invalidateMcpRegistry } from '@/lib/mcp/registry';

export const dynamic = 'force-dynamic';

/**
 * Toggle a registered MCP server on or off.
 *
 * PATCH /api/mcp/servers
 *   { id: "github-mcp", enabled: true }
 *
 * The change is persisted by rewriting the registry's
 * `enabled` flag for the matching server and re-writing
 * `config/mcp-servers.json`. The in-process cache is
 * invalidated so the next read sees the change immediately.
 */
export async function PATCH(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }
  const id = String(body?.id || '');
  const enabled = Boolean(body?.enabled);
  if (!id) {
    return Response.json({ ok: false, error: 'Server id is required.' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(id)) {
    return Response.json({ ok: false, error: 'Invalid server id.' }, { status: 400 });
  }

  const registry = loadMcpRegistry();
  const target = registry.servers.find((s) => s.id === id);
  if (!target) {
    return Response.json({ ok: false, error: `Server '${id}' not found.` }, { status: 404 });
  }
  target.enabled = enabled;
  // Persist.
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const regPath = path.join(process.cwd(), 'config', 'mcp-servers.json');
    await fs.writeFile(regPath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
  } catch (err: any) {
    return Response.json({ ok: false, error: `Failed to persist: ${err.message}` }, { status: 500 });
  }
  invalidateMcpRegistry();
  return Response.json({ ok: true, id, enabled });
}
