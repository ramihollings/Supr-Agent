/**
 * MCP audit log.
 *
 * Every successful or failed tool call through the /api/mcp/* routes
 * is persisted to the MCP_Audit table so operators can answer
 * "which agent called which tool on which server when?" without
 * trawling application logs.
 *
 * The audit row is intentionally minimal — it does not store tool
 * inputs (which may contain secrets) or outputs (which may be
 * huge). Just the metadata needed to correlate with the
 * application event log.
 */
import crypto from 'node:crypto';
import dbClient from '../database/db_client';

export interface McpAuditEntry {
  serverId: string;
  serverName: string;
  toolName: string;
  agentId?: string;
  missionId?: string;
  status: 'ok' | 'denied' | 'error';
  durationMs: number;
  errorMessage?: string;
}

export async function logMcpAudit(entry: McpAuditEntry): Promise<void> {
  const id = `mcp-${crypto.randomUUID()}`;
  try {
    await dbClient.execute(
      `INSERT INTO Audit_Log (id, actor_type, actor_id, action, target_type, target_id, metadata)
       VALUES (?, 'mcp', ?, ?, 'mcp_tool', ?, ?)`,
      [
        id,
        entry.serverId,
        `mcp.${entry.toolName}`,
        entry.toolName,
        JSON.stringify({
          server_id: entry.serverId,
          server_name: entry.serverName,
          tool_name: entry.toolName,
          agent_id: entry.agentId || null,
          mission_id: entry.missionId || null,
          status: entry.status,
          duration_ms: entry.durationMs,
          error: entry.errorMessage || null,
        }),
      ],
    );
  } catch (err: any) {
    // Audit must never break the request flow.
    console.warn(`[MCP] Failed to write audit log: ${err.message}`);
  }
}

export interface McpAuditQuery {
  serverId?: string;
  agentId?: string;
  missionId?: string;
  limit?: number;
}

export async function queryMcpAudit(q: McpAuditQuery): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(Math.max(q.limit || 50, 1), 500);
  const conditions: string[] = [`action LIKE 'mcp.%'`];
  const params: any[] = [];
  if (q.serverId) {
    conditions.push(`actor_id = ?`);
    params.push(q.serverId);
  }
  if (q.agentId || q.missionId) {
    // agent_id and mission_id are stored inside the metadata
    // JSON blob; we filter post-fetch in JS for simplicity.
  }
  const where = conditions.join(' AND ');
  const rows = await dbClient.query<any>(
    `SELECT id, actor_id, action, target_id, metadata, created_at
     FROM Audit_Log
     WHERE ${where}
     ORDER BY created_at DESC
     LIMIT ?`,
    [...params, limit],
  );
  let filtered = rows || [];
  if (q.agentId || q.missionId) {
    filtered = filtered.filter((row) => {
      try {
        const meta = JSON.parse(row.metadata || '{}');
        if (q.agentId && meta.agent_id !== q.agentId) return false;
        if (q.missionId && meta.mission_id !== q.missionId) return false;
        return true;
      } catch {
        return false;
      }
    });
  }
  return filtered.map((row) => {
    let meta: any = {};
    try { meta = JSON.parse(row.metadata || '{}'); } catch {}
    return {
      id: row.id,
      server_id: row.actor_id,
      server_name: meta.server_name,
      tool_name: row.target_id,
      action: row.action,
      status: meta.status,
      duration_ms: meta.duration_ms,
      agent_id: meta.agent_id,
      mission_id: meta.mission_id,
      error: meta.error,
      created_at: row.created_at,
    };
  });
}
