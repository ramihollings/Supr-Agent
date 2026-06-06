import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { listAllTools, resolveMcpTool, forwardToMcpServer } from '@/lib/mcp/registry';
import { logMcpAudit } from '@/lib/mcp/audit';
import { toolRegistry, type ToolExecutionContext } from '@/lib/tools/registry';

export const dynamic = 'force-dynamic';

/**
 * List or invoke MCP tools.
 *
 * GET  /api/mcp/tools            -> all available tools, grouped by server
 * GET  /api/mcp/tools?name=X     -> describe tool X
 * POST /api/mcp/tools            -> { name, params, agentId, missionId }
 *                                   resolves the owning server, enforces
 *                                   its required_tier, then forwards the
 *                                   call to the tool registry.
 */
export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const name = req.nextUrl.searchParams.get('name');
  if (name) {
    const tools = await listAllTools();
    const match = tools.find((t) => t.name === name);
    if (!match) return Response.json({ ok: false, error: `Tool '${name}' not found.` }, { status: 404 });
    return Response.json({ ok: true, tool: match });
  }

  const tools = await listAllTools();
  return Response.json({ ok: true, count: tools.length, tools });
}

export async function POST(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }
  const { name, params, agentId, missionId, agentActionId } = body || {};
  if (typeof name !== 'string' || name.length === 0) {
    return Response.json({ ok: false, error: 'Tool name is required.' }, { status: 400 });
  }
  if (!params || typeof params !== 'object') {
    return Response.json({ ok: false, error: 'Tool params must be an object.' }, { status: 400 });
  }

  const ctx: ToolExecutionContext = { agentId, missionId };
  const start = Date.now();
  let resolved: Awaited<ReturnType<typeof resolveMcpTool>> | null = null;
  try {
    // Resolve the owning server and enforce the required tier.
    // This is the same check the agent runtime does, but exposed
    // over HTTP so external MCP clients can hit it.
    resolved = await resolveMcpTool(name, ctx);
  } catch (err: any) {
    await logMcpAudit({
      serverId: '(unknown)',
      serverName: '(unknown)',
      toolName: name,
      agentId,
      missionId,
      status: 'denied',
      durationMs: Date.now() - start,
      errorMessage: err.message,
    });
    return Response.json({ ok: false, error: err.message }, { status: 403 });
  }

  try {
    // In-process server (supr-internal, supr-composio): use the
    // existing tool registry. The registry handles tier
    // checks and trusted-approved-action context for us.
    if (resolved.server.transport === 'in-process') {
      const result = await toolRegistry.executeTool(name, params, agentId, missionId, agentActionId);
      await logMcpAudit({
        serverId: resolved.server.id,
        serverName: resolved.server.name,
        toolName: name,
        agentId,
        missionId,
        status: 'success',
        durationMs: Date.now() - start,
      });
      return Response.json({ ok: true, server: resolved.server.id, result });
    }
    // External server (stdio/http): forward the call over the
    // transport and return the raw result. The tier check was
    // done in resolveMcpTool.
    const result = await forwardToMcpServer(resolved.server, name, params);
    await logMcpAudit({
      serverId: resolved.server.id,
      serverName: resolved.server.name,
      toolName: name,
      agentId,
      missionId,
      status: 'success',
      durationMs: Date.now() - start,
    });
    return Response.json({ ok: true, server: resolved.server.id, result });
  } catch (err: any) {
    await logMcpAudit({
      serverId: resolved.server.id,
      serverName: resolved.server.name,
      toolName: name,
      agentId,
      missionId,
      status: 'error',
      durationMs: Date.now() - start,
      errorMessage: err.message,
    });
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
