import crypto from "node:crypto";
import dbClient from "../../lib/database/db_client";
import type { ProviderRouteDecision } from "../../lib/runtime/types";

function id() {
  return `provider-route-${crypto.randomUUID()}`;
}

export class ProviderRouteDecisionService {
  async record(input: Omit<ProviderRouteDecision, "id">): Promise<ProviderRouteDecision> {
    const decision: ProviderRouteDecision = { id: id(), ...input };
    await dbClient.execute(
      `INSERT INTO Provider_Route_Decisions
        (id, mission_id, agent_run_id, agent_role, provider, model, fallback_provider, runtime_mode, failure_reason)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        decision.id,
        decision.missionId || null,
        decision.agentRunId || null,
        decision.agentRole,
        decision.provider,
        decision.model || null,
        decision.fallbackProvider || null,
        decision.runtimeMode,
        decision.failureReason || null,
      ],
    );
    return decision;
  }
}

export const providerRouteDecisionService = new ProviderRouteDecisionService();
