import dbClient from "../../lib/database/db_client";

export class PortabilityService {
  private sensitiveKeys = [
    "api_key",
    "password",
    "secret",
    "token",
    "private_key",
    "credential"
  ];

  /**
   * Helper to scrub sensitive settings before export.
   */
  private scrubSettings(settings: { key: string; value: string }[]): { key: string; value: string }[] {
    return settings.map((s) => {
      const isSensitive = this.sensitiveKeys.some((k) => s.key.toLowerCase().includes(k));
      if (isSensitive) {
        return { key: s.key, value: "[SCRUBBED]" };
      }
      return s;
    });
  }

  /**
   * Exports all relevant database records into a serialized JSON bundle.
   */
  async exportOrganization(): Promise<string> {
    console.log("[PortabilityService] Starting database export...");

    // Retrieve database tables
    const missions = await dbClient.query("SELECT * FROM Missions");
    const glidepaths = await dbClient.query("SELECT * FROM Glidepaths");
    const agents = await dbClient.query("SELECT * FROM Agents");
    const tasks = await dbClient.query("SELECT * FROM Tasks");
    const approvals = await dbClient.query("SELECT * FROM Approvals");
    const memoryItems = await dbClient.query("SELECT * FROM Memory_Items");
    const settingsRaw = await dbClient.query("SELECT * FROM Settings");

    const settings = this.scrubSettings(settingsRaw);

    const exportBundle = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      data: {
        missions,
        glidepaths,
        agents,
        tasks,
        approvals,
        memoryItems,
        settings
      }
    };

    return JSON.stringify(exportBundle, null, 2);
  }

  /**
   * Imports a serialized JSON bundle into the database.
   */
  async importOrganization(serializedData: string, options?: { allowOverwrite?: boolean }): Promise<{
    success: boolean;
    imported: Record<string, number>;
    collisions?: { table: string; count: number; examples: string[] }[];
  }> {
    console.log("[PortabilityService] Starting database import...");
    const bundle = JSON.parse(serializedData);
    if (!bundle || bundle.version !== "1.0.0" || !bundle.data) {
      throw new Error("Invalid or unsupported export bundle version.");
    }

    const { data } = bundle;
    const stats: Record<string, number> = {
      Missions: 0,
      Glidepaths: 0,
      Agents: 0,
      Tasks: 0,
      Approvals: 0,
      Memory_Items: 0,
      Settings: 0
    };

    const collisions = await this.detectCollisions(data);
    if (collisions.length > 0 && !options?.allowOverwrite) {
      return { success: false, imported: stats, collisions };
    }

    const operations: { sql: string; params: any[] }[] = [];

    // 1. Queue Missions import
    if (Array.isArray(data.missions)) {
      for (const m of data.missions) {
        operations.push({
          sql: `INSERT INTO Missions
                (id, title, goal, workflow_type, autonomy_mode, status, current_phase_id, constraints, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET title = excluded.title, goal = excluded.goal,
                workflow_type = excluded.workflow_type, autonomy_mode = excluded.autonomy_mode,
                status = excluded.status, current_phase_id = excluded.current_phase_id,
                constraints = excluded.constraints, updated_at = excluded.updated_at`,
          params: [m.id, m.title, m.goal, m.workflow_type, m.autonomy_mode, m.status, m.current_phase_id, m.constraints, m.created_at, m.updated_at]
        });
        stats.Missions++;
      }
    }

    // 2. Queue Glidepaths import
    if (Array.isArray(data.glidepaths)) {
      for (const gp of data.glidepaths) {
        operations.push({
          sql: `INSERT INTO Glidepaths
                (id, mission_id, phases, tasks, approval_gates, blockers, standards, decisions, risks, assumptions, progress, readiness_score)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET mission_id = excluded.mission_id,
                phases = excluded.phases, tasks = excluded.tasks, approval_gates = excluded.approval_gates,
                blockers = excluded.blockers, standards = excluded.standards, decisions = excluded.decisions,
                risks = excluded.risks, assumptions = excluded.assumptions, progress = excluded.progress,
                readiness_score = excluded.readiness_score`,
          params: [gp.id, gp.mission_id, gp.phases, gp.tasks, gp.approval_gates, gp.blockers, gp.standards, gp.decisions, gp.risks, gp.assumptions, gp.progress, gp.readiness_score]
        });
        stats.Glidepaths++;
      }
    }

    // 3. Queue Agents import
    if (Array.isArray(data.agents)) {
      for (const a of data.agents) {
        operations.push({
          sql: `INSERT INTO Agents
                (id, workspace_id, name, role, type, permission_tier, tools, status, current_task_id, retry_limit, retry_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id, name = excluded.name,
                role = excluded.role, type = excluded.type, permission_tier = excluded.permission_tier,
                tools = excluded.tools, status = excluded.status, current_task_id = excluded.current_task_id,
                retry_limit = excluded.retry_limit, retry_count = excluded.retry_count`,
          params: [a.id, a.workspace_id, a.name, a.role, a.type, a.permission_tier, a.tools, a.status, a.current_task_id, a.retry_limit, a.retry_count]
        });
        stats.Agents++;
      }
    }

    // 4. Queue Tasks import
    if (Array.isArray(data.tasks)) {
      for (const t of data.tasks) {
        operations.push({
          sql: `INSERT INTO Tasks
                (id, mission_id, phase_id, title, status, owner_agent_id, required_permission, retry_count, blocker_reason)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET mission_id = excluded.mission_id, phase_id = excluded.phase_id,
                title = excluded.title, status = excluded.status, owner_agent_id = excluded.owner_agent_id,
                required_permission = excluded.required_permission, retry_count = excluded.retry_count,
                blocker_reason = excluded.blocker_reason`,
          params: [t.id, t.mission_id, t.phase_id, t.title, t.status, t.owner_agent_id, t.required_permission, t.retry_count, t.blocker_reason]
        });
        stats.Tasks++;
      }
    }

    // 5. Queue Approvals import
    if (Array.isArray(data.approvals)) {
      for (const ap of data.approvals) {
        operations.push({
          sql: `INSERT INTO Approvals
                (id, mission_id, task_id, requesting_agent_id, action, required_permission, risk_level, reason, status, decision, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET mission_id = excluded.mission_id, task_id = excluded.task_id,
                requesting_agent_id = excluded.requesting_agent_id, action = excluded.action,
                required_permission = excluded.required_permission, risk_level = excluded.risk_level,
                reason = excluded.reason, status = excluded.status, decision = excluded.decision,
                created_at = excluded.created_at, updated_at = excluded.updated_at`,
          params: [ap.id, ap.mission_id, ap.task_id, ap.requesting_agent_id, ap.action, ap.required_permission, ap.risk_level, ap.reason, ap.status, ap.decision, ap.created_at || new Date().toISOString(), ap.updated_at || ap.created_at || new Date().toISOString()]
        });
        stats.Approvals++;
      }
    }

    // 6. Queue Memory Items import
    if (Array.isArray(data.memoryItems)) {
      for (const m of data.memoryItems) {
        operations.push({
          sql: `INSERT INTO Memory_Items
                (id, workspace_id, mission_id, scope, type, content, source, importance, pinned, reviewed_at, reason, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET workspace_id = excluded.workspace_id, mission_id = excluded.mission_id,
                scope = excluded.scope, type = excluded.type, content = excluded.content, source = excluded.source,
                importance = excluded.importance, pinned = excluded.pinned, reviewed_at = excluded.reviewed_at,
                reason = excluded.reason`,
          params: [m.id, m.workspace_id, m.mission_id, m.scope, m.type, m.content, m.source, m.importance, m.pinned || 0, m.reviewed_at, m.reason, m.created_at]
        });
        stats.Memory_Items++;
      }
    }

    // 7. Queue Settings import (skip importing scrubbed values to prevent overwriting valid ones)
    if (Array.isArray(data.settings)) {
      for (const s of data.settings) {
        if (s.value === "[SCRUBBED]") continue;
        operations.push({
          sql: `INSERT INTO Settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
          params: [s.key, s.value]
        });
        stats.Settings++;
      }
    }

    // Execute all imports within a transaction
    await dbClient.runTransaction(operations);
    console.log("[PortabilityService] Database import completed successfully.");

    return {
      success: true,
      imported: stats,
      collisions
    };
  }

  private async detectCollisions(data: any): Promise<{ table: string; count: number; examples: string[] }[]> {
    const checks = [
      { table: "Missions", rows: data.missions, column: "id", label: "title" },
      { table: "Glidepaths", rows: data.glidepaths, column: "id", label: "id" },
      { table: "Agents", rows: data.agents, column: "id", label: "name" },
      { table: "Tasks", rows: data.tasks, column: "id", label: "title" },
      { table: "Approvals", rows: data.approvals, column: "id", label: "action" },
      { table: "Memory_Items", rows: data.memoryItems, column: "id", label: "scope" },
      { table: "Settings", rows: data.settings?.filter((s: any) => s.value !== "[SCRUBBED]"), column: "key", label: "key" },
    ];

    const collisions: { table: string; count: number; examples: string[] }[] = [];
    for (const check of checks) {
      if (!Array.isArray(check.rows) || check.rows.length === 0) continue;
      const ids = check.rows.map((row: any) => row?.[check.column]).filter(Boolean);
      if (ids.length === 0) continue;
      const placeholders = ids.map(() => "?").join(",");
      const rows = await dbClient.query<any>(
        `SELECT ${check.column} FROM ${check.table} WHERE ${check.column} IN (${placeholders}) LIMIT 20`,
        ids,
      );
      if (rows.length > 0) {
        const found = new Set(rows.map((row: any) => row[check.column]));
        const examples = check.rows
          .filter((row: any) => found.has(row?.[check.column]))
          .slice(0, 3)
          .map((row: any) => String(row?.[check.label] || row?.[check.column]));
        collisions.push({ table: check.table, count: rows.length, examples });
      }
    }
    return collisions;
  }
}

export const portabilityService = new PortabilityService();
export default portabilityService;
