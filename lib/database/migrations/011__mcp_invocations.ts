/**
 * Migration: MCP_Invocations audit log.
 *
 * Every time the MCP router resolves a tool call against a
 * server, we record one row here so the operator can later
 * inspect who called what, when, and whether the call
 * succeeded. The table is intentionally narrow so the row
 * write is cheap on the hot path:
 *
 *   - one row per (server, tool) call
 *   - server_id + tool_name + agent_id + mission_id (nullable)
 *   - ok boolean + duration_ms + error (nullable)
 *   - a free-text args_preview so the operator can see WHAT was
 *     called without dragging the full args blob through the
 *     audit log
 *
 * Cap args_preview at 400 chars so a runaway args object can't
 * blow up the row size.
 */

import type { Migration } from '../migrations';

export const addMcpInvocations: Migration = {
  id: '0110__add_mcp_invocations',
  description: 'Create MCP_Invocations audit log for per-server tool calls.',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS MCP_Invocations (
        id TEXT PRIMARY KEY,
        server_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        agent_id TEXT,
        mission_id TEXT,
        ok INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        args_preview TEXT,
        error TEXT,
        called_at TEXT NOT NULL
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_inv_server ON MCP_Invocations(server_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_inv_called_at ON MCP_Invocations(called_at)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_mcp_inv_mission ON MCP_Invocations(mission_id)`);
  },
};
