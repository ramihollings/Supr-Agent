import crypto from "crypto";
import dbClient from "../../lib/database/db_client";
import { redactSensitiveText, serializeRedacted } from "../../lib/security/redaction";

export interface AuditLogEntry {
  missionId?: string;
  actorType: "user" | "agent" | "system" | "plugin";
  actorId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  riskLevel?: "Low" | "Medium" | "High" | "Critical";
  metadata?: Record<string, any>;
}

export interface EventLogEntry {
  missionId: string;
  actorType: "user" | "agent" | "system";
  actorId: string;
  eventType: string; // "delegation" | "handoff" | "review" | "approval" | "escalation" | "governance" | etc.
  summary: string;
  metadata?: Record<string, any>;
}

export class ActivityLogService {
  /**
   * Records a security, mutation, or privilege audit event in the Audit_Log table.
   */
  async logAudit(entry: AuditLogEntry): Promise<void> {
    const id = `audit-${crypto.randomUUID()}`;
    const metadataJson = serializeRedacted(entry.metadata || {});

    await dbClient.execute(
      `INSERT INTO Audit_Log (id, mission_id, actor_type, actor_id, action, target_type, target_id, risk_level, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id,
        entry.missionId || null,
        entry.actorType,
        entry.actorId,
        entry.action,
        entry.targetType || null,
        entry.targetId || null,
        entry.riskLevel || "Low",
        metadataJson
      ]
    );
  }

  /**
   * Records an orchestration or execution timeline event in the Event_Log table.
   */
  async logEvent(entry: EventLogEntry): Promise<void> {
    const id = `evt-${crypto.randomUUID()}`;
    const metadataJson = serializeRedacted(entry.metadata || {});

    await dbClient.execute(
      `INSERT INTO Event_Log (id, mission_id, actor_type, actor_id, event_type, summary, metadata, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id,
        entry.missionId,
        entry.actorType,
        entry.actorId,
        entry.eventType,
        redactSensitiveText(entry.summary),
        metadataJson
      ]
    );
  }

  /**
   * Retrieves audit logs for a given mission.
   */
  async getAuditLogs(missionId?: string, limit: number = 100): Promise<any[]> {
    let sql = "SELECT * FROM Audit_Log";
    const params: any[] = [];
    if (missionId) {
      sql += " WHERE mission_id = ?";
      params.push(missionId);
    }
    sql += " ORDER BY created_at DESC LIMIT ?";
    params.push(limit);
    return dbClient.query<any>(sql, params);
  }

  /**
   * Retrieves timeline event logs for a given mission.
   */
  async getEventLogs(missionId: string, limit: number = 100): Promise<any[]> {
    return dbClient.query<any>(
      "SELECT * FROM Event_Log WHERE mission_id = ? ORDER BY timestamp DESC LIMIT ?",
      [missionId, limit]
    );
  }
}

export const activityLogService = new ActivityLogService();
export default activityLogService;
