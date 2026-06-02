import crypto from "node:crypto";
import dbClient from "../../lib/database/db_client";

export interface OperationalMetric {
  id: string;
  missionId?: string | null;
  agentId?: string | null;
  eventType: "mission" | "agent" | "tool" | "approval" | "cost" | "duration" | "failure" | "outcome";
  outcome?: string | null;
  durationMs?: number | null;
  costEstimate?: number | null;
  metadata?: Record<string, unknown>;
}

function id() {
  return `metric-${crypto.randomUUID()}`;
}

function scrubMetadata(metadata: Record<string, unknown> = {}) {
  const scrubbed: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (/prompt|body|content|secret|token|key/i.test(key)) continue;
    scrubbed[key] = value;
  }
  return scrubbed;
}

export class OperationalMetricsService {
  async record(input: Omit<OperationalMetric, "id">): Promise<OperationalMetric> {
    const metric: OperationalMetric = {
      id: id(),
      missionId: input.missionId || null,
      agentId: input.agentId || null,
      eventType: input.eventType,
      outcome: input.outcome || null,
      durationMs: input.durationMs || null,
      costEstimate: input.costEstimate || null,
      metadata: scrubMetadata(input.metadata),
    };

    await dbClient.execute(
      `INSERT INTO Operational_Metrics
        (id, mission_id, agent_id, event_type, outcome, duration_ms, cost_estimate, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        metric.id,
        metric.missionId,
        metric.agentId,
        metric.eventType,
        metric.outcome,
        metric.durationMs,
        metric.costEstimate,
        JSON.stringify(metric.metadata || {}),
      ],
    );

    return metric;
  }

  async listRecent(limit = 40, missionId?: string | null): Promise<OperationalMetric[]> {
    const boundedLimit = Math.max(1, Math.min(100, limit));
    const rows = missionId
      ? await dbClient.query<any>(
          `SELECT * FROM Operational_Metrics WHERE mission_id = ? ORDER BY created_at DESC LIMIT ${boundedLimit}`,
          [missionId],
        )
      : await dbClient.query<any>(`SELECT * FROM Operational_Metrics ORDER BY created_at DESC LIMIT ${boundedLimit}`);
    return rows.map((row) => ({
      id: row.id,
      missionId: row.mission_id,
      agentId: row.agent_id,
      eventType: row.event_type,
      outcome: row.outcome,
      durationMs: row.duration_ms,
      costEstimate: row.cost_estimate,
      metadata: JSON.parse(row.metadata || "{}"),
    }));
  }
}

export const operationalMetrics = new OperationalMetricsService();
