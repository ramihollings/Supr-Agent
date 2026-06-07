import crypto from "node:crypto";
import dbClient from "../../lib/database/db_client";
import { telemetry } from "../../lib/telemetry";

export type BudgetScopeType = "global" | "agent" | "mission";
export type BudgetThresholdType = "soft" | "hard";

export interface BudgetPolicy {
  id: string;
  scopeType: BudgetScopeType;
  scopeId: string;
  limitCents: number;
  warnPercent: number;
  hardStop: number;
  spentCents: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export class BudgetEngine {
  /**
   * Evaluate active budget policies after a cost event.
   */
  async evaluateCostEvent(costCents: number, missionId?: string, agentId?: string): Promise<void> {
    // 1. Find all active budget policies that apply to this execution context.
    const scopes: { type: BudgetScopeType; id: string }[] = [{ type: "global", id: "global" }];
    if (missionId) scopes.push({ type: "mission", id: missionId });
    if (agentId) scopes.push({ type: "agent", id: agentId });

    for (const scope of scopes) {
      // Find the policy for this scope
      const policy = await dbClient.queryOne<any>(
        "SELECT * FROM Budget_Policies WHERE scope_type = ? AND scope_id = ?",
        [scope.type, scope.id]
      );

      if (!policy) continue;

      // Update the spent cents
      const newSpent = (policy.spent_cents || 0) + costCents;
      let nextStatus = "ok";
      const softThreshold = (policy.limit_cents * (policy.warn_percent || 80)) / 100;

      if (newSpent >= policy.limit_cents) {
        nextStatus = "paused";
      } else if (newSpent >= softThreshold) {
        nextStatus = "warning";
      }

      await dbClient.execute(
        "UPDATE Budget_Policies SET spent_cents = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [newSpent, nextStatus, policy.id]
      );

      // Check thresholds and handle incidents
      if (newSpent >= policy.limit_cents && policy.hard_stop) {
        // Hard budget stop exceeded — create incident and pause execution scope
        await this.triggerHardStop(policy, newSpent, missionId, agentId);
      } else if (newSpent >= softThreshold) {
        // Soft warning crossed — create warning incident
        await this.triggerSoftWarning(policy, newSpent);
      }
    }
  }

  /**
   * Trigger a hard budget stop: create incident, log event, and pause target.
   */
  private async triggerHardStop(policy: any, observed: number, missionId?: string, agentId?: string): Promise<void> {
    const incidentId = `inc-hard-${policy.id}-${crypto.randomUUID()}`;
    
    // Check if an open hard incident already exists
    const existing = await dbClient.queryOne(
      "SELECT id FROM Budget_Incidents WHERE policy_id = ? AND threshold_type = 'hard' AND status = 'open'",
      [policy.id]
    );

    if (existing) return;

    // Create the incident
    await dbClient.execute(
      `INSERT INTO Budget_Incidents (id, policy_id, scope_type, scope_id, threshold_type, limit_cents, observed_cents, status)
       VALUES (?, ?, ?, ?, 'hard', ?, ?, 'open')`,
      [incidentId, policy.id, policy.scope_type, policy.scope_id, policy.limit_cents, observed]
    );
    telemetry.error('budget.hard_limit_exceeded', undefined, {
      policyId: policy.id,
      scopeType: policy.scope_type,
      scopeId: policy.scope_id,
      limitCents: policy.limit_cents,
      observedCents: observed,
    });

    // Pause target scope
    if (policy.scope_type === "agent") {
      await dbClient.execute("UPDATE Agents SET status = 'Paused' WHERE id = ?", [policy.scope_id]);
    } else if (policy.scope_type === "mission") {
      await dbClient.execute("UPDATE Missions SET status = 'Paused' WHERE id = ?", [policy.scope_id]);
    } else if (policy.scope_type === "global") {
      // Pause all active agents
      await dbClient.execute("UPDATE Agents SET status = 'Paused' WHERE status IN ('Active', 'Running', 'Idle')");
    }

    // Log the event
    if (missionId) {
      await dbClient.execute(
        `INSERT INTO Event_Log (id, mission_id, actor_type, actor_id, event_type, summary, metadata)
         VALUES (?, ?, 'system', 'budget_engine', 'governance', ?, ?)`,
        [
          `evt-budget-${crypto.randomUUID()}`,
          missionId,
          `Hard budget limit crossed for ${policy.scope_type} (${policy.scope_id}). Scope has been paused.`,
          JSON.stringify({ policyId: policy.id, limitCents: policy.limit_cents, observedCents: observed })
        ]
      );
    }
  }

  /**
   * Trigger a soft budget warning.
   */
  private async triggerSoftWarning(policy: any, observed: number): Promise<void> {
    const incidentId = `inc-soft-${policy.id}-${crypto.randomUUID()}`;

    // Check if a warning already exists
    const existing = await dbClient.queryOne(
      "SELECT id FROM Budget_Incidents WHERE policy_id = ? AND threshold_type = 'soft' AND status = 'open'",
      [policy.id]
    );

    if (existing) return;

    await dbClient.execute(
      `INSERT INTO Budget_Incidents (id, policy_id, scope_type, scope_id, threshold_type, limit_cents, observed_cents, status)
       VALUES (?, ?, ?, ?, 'soft', ?, ?, 'open')`,
      [incidentId, policy.id, policy.scope_type, policy.scope_id, policy.limit_cents, observed]
    );
    telemetry.warn('budget.soft_limit_exceeded', {
      policyId: policy.id,
      scopeType: policy.scope_type,
      scopeId: policy.scope_id,
      limitCents: policy.limit_cents,
      observedCents: observed,
    });
  }

  /**
   * Create or update a budget policy.
   */
  async upsertPolicy(data: {
    scopeType: BudgetScopeType;
    scopeId: string;
    limitCents: number;
    warnPercent?: number;
    hardStop?: boolean;
  }): Promise<void> {
    const id = `pol-${data.scopeType}-${data.scopeId}`;
    const warnPercent = data.warnPercent !== undefined ? data.warnPercent : 80;
    const hardStop = data.hardStop !== false ? 1 : 0;

    await dbClient.execute(
      `INSERT INTO Budget_Policies (id, scope_type, scope_id, limit_cents, warn_percent, hard_stop, spent_cents, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'ok', CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET 
         limit_cents = excluded.limit_cents,
         warn_percent = excluded.warn_percent,
         hard_stop = excluded.hard_stop,
         status = 'ok',
         updated_at = CURRENT_TIMESTAMP`,
      [id, data.scopeType, data.scopeId, data.limitCents, warnPercent, hardStop]
    );
  }

  /**
   * Resolve an open incident.
   */
  async resolveIncident(incidentId: string): Promise<void> {
    const incident = await dbClient.queryOne<any>(
      "SELECT * FROM Budget_Incidents WHERE id = ?",
      [incidentId]
    );

    if (!incident) return;

    await dbClient.execute(
      "UPDATE Budget_Incidents SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = ?",
      [incidentId]
    );

    // Check if there are other open incidents for this policy
    const otherOpen = await dbClient.queryOne(
      "SELECT id FROM Budget_Incidents WHERE policy_id = ? AND status = 'open'",
      [incident.policy_id]
    );

    if (!otherOpen) {
      // Reset spent cents or update policy status back to ok
      await dbClient.execute(
        "UPDATE Budget_Policies SET spent_cents = 0, status = 'ok', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [incident.policy_id]
      );

      // Resume scope
      if (incident.scope_type === "agent") {
        await dbClient.execute("UPDATE Agents SET status = 'Idle' WHERE id = ?", [incident.scope_id]);
      } else if (incident.scope_type === "mission") {
        await dbClient.execute("UPDATE Missions SET status = 'Active' WHERE id = ?", [incident.scope_id]);
      } else if (incident.scope_type === "global") {
        await dbClient.execute("UPDATE Agents SET status = 'Idle' WHERE status = 'Paused'");
      }
    }
  }

  /**
   * Get all policies.
   */
  async listPolicies(): Promise<BudgetPolicy[]> {
    const rows = await dbClient.query<any>("SELECT * FROM Budget_Policies ORDER BY updated_at DESC");
    return rows.map((r: any) => ({
      id: r.id,
      scopeType: r.scope_type,
      scopeId: r.scope_id,
      limitCents: r.limit_cents,
      warnPercent: r.warn_percent,
      hardStop: r.hard_stop,
      spentCents: r.spent_cents,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  /**
   * Get all active incidents.
   */
  async getIncidents(status: "open" | "resolved" | "all" = "open"): Promise<any[]> {
    let sql = "SELECT * FROM Budget_Incidents";
    const params: any[] = [];
    if (status !== "all") {
      sql += " WHERE status = ?";
      params.push(status);
    }
    sql += " ORDER BY created_at DESC";
    return dbClient.query<any>(sql, params);
  }
}

export const budgetEngine = new BudgetEngine();
