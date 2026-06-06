/**
 * MCP audit log writer + reader.
 *
 * Every forwarded call to a non-internal MCP server is recorded
 * in `MCP_Invocations` so the operator can see who called what
 * server, when, and how long it took. The write is fire-and-forget
 * so the audit path never adds latency to the hot tool-call path.
 *
 * The reader is exposed via the existing `/api/mcp/audit` route
 * which already imports `queryMcpAudit` (see app/api/mcp/audit/route.ts).
 */
import crypto from 'node:crypto';
import dbClient from '@/lib/database/db_client';

export interface McpInvocationRecord {
  serverId: string;
  toolName: string;
  agentId?: string | null;
  missionId?: string | null;
  args?: Record<string, unknown>;
}

export type McpInvocationOutcome = {
  ok: boolean;
  durationMs: number;
  error?: string;
};

function previewArgs(args: Record<string, unknown> | undefined): string {
  if (!args) return '';
  try {
    const text = JSON.stringify(args);
    if (text.length <= 400) return text;
    return text.slice(0, 397) + '...';
  } catch {
    return '(unserializable)';
  }
}

// Public alias for the existing /api/mcp/tools route which
// imports `logMcpAudit`. We support two call shapes here:
//
//   1. The new shape (McpInvocationRecord + McpInvocationOutcome)
//      — used by the registry's forwardToMcpServer wrapper.
//
//   2. The legacy shape ({ serverId, serverName, toolName,
//      agentId, missionId, status, durationMs, ... }) that the
//      existing /api/mcp/tools route uses. We translate it into
//      the new shape so the route doesn't have to change.
//
// The translation drops the legacy `serverName` and `status`
// fields (the new shape only needs ok/error).
export async function logMcpInvocation(record: McpInvocationRecord, outcome: McpInvocationOutcome): Promise<void> {
  return recordMcpInvocation(record, outcome);
}

export async function logMcpAudit(
  legacy: {
    serverId: string;
    serverName?: string;
    toolName: string;
    agentId?: string;
    missionId?: string;
    status: 'success' | 'denied' | 'error';
    durationMs: number;
    errorMessage?: string;
    argsPreview?: string;
  },
): Promise<void> {
  return recordMcpInvocation(
    {
      serverId: legacy.serverId,
      toolName: legacy.toolName,
      agentId: legacy.agentId ?? null,
      missionId: legacy.missionId ?? null,
    },
    {
      ok: legacy.status === 'success',
      durationMs: legacy.durationMs,
      error: legacy.status === 'success' ? undefined : legacy.errorMessage,
    },
  );
}

export function recordMcpInvocation(record: McpInvocationRecord, outcome: McpInvocationOutcome): void {
  const id = `mcp-${crypto.randomUUID()}`;
  const calledAt = new Date().toISOString();
  const argsPreview = previewArgs(record.args);
  // Fire-and-forget. We intentionally do not await the DB write so
  // the caller's tool latency is unaffected. The write is cheap
  // (single insert into a narrow table) and isolated from the
  // caller's request lifecycle.
  void dbClient
    .execute(
      `INSERT INTO MCP_Invocations (id, server_id, tool_name, agent_id, mission_id, ok, duration_ms, args_preview, error, called_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        record.serverId,
        record.toolName,
        record.agentId ?? null,
        record.missionId ?? null,
        outcome.ok ? 1 : 0,
        outcome.durationMs,
        argsPreview,
        outcome.error ? String(outcome.error).slice(0, 500) : null,
        calledAt,
      ],
    )
    .catch((err) => {
      // The audit log is best-effort; never let a write failure
      // bubble back up to the caller (the caller's tool result
      // was already returned or thrown).
      console.warn(`[MCP_AUDIT] Failed to record invocation for ${record.serverId}/${record.toolName}:`, err?.message ?? err);
    });
}

export interface McpAuditQuery {
  serverId?: string;
  agentId?: string;
  missionId?: string;
  limit?: number;
  sinceIso?: string;
}

export interface McpAuditEntry {
  id: string;
  serverId: string;
  toolName: string;
  agentId: string | null;
  missionId: string | null;
  ok: number;
  durationMs: number;
  argsPreview: string | null;
  error: string | null;
  calledAt: string;
}

export async function queryMcpAudit(q: McpAuditQuery = {}): Promise<McpAuditEntry[]> {
  const where: string[] = [];
  const params: any[] = [];
  if (q.serverId) { where.push('server_id = ?'); params.push(q.serverId); }
  if (q.agentId) { where.push('agent_id = ?'); params.push(q.agentId); }
  if (q.missionId) { where.push('mission_id = ?'); params.push(q.missionId); }
  if (q.sinceIso) { where.push('called_at >= ?'); params.push(q.sinceIso); }
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
  const sql = `
    SELECT id, server_id, tool_name, agent_id, mission_id, ok, duration_ms, args_preview, error, called_at
      FROM MCP_Invocations
      ${where.length > 0 ? 'WHERE ' + where.join(' AND ') : ''}
     ORDER BY called_at DESC
     LIMIT ?
  `;
  params.push(limit);
  const rows = (await dbClient
    .query<any>(sql, params)
    .catch(() => [] as any[])) as any[];
  return rows.map((r) => ({
    id: r.id,
    serverId: r.server_id,
    toolName: r.tool_name,
    agentId: r.agent_id,
    missionId: r.mission_id,
    ok: r.ok,
    durationMs: r.duration_ms,
    argsPreview: r.args_preview,
    error: r.error,
    calledAt: r.called_at,
  }));
}

