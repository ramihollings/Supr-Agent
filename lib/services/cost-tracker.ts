import crypto from "crypto";
import dbClient from "../../lib/database/db_client";
import { budgetEngine } from "./budget-engine";

export interface ModelPricing {
  inputRate: number;  // cents per token
  outputRate: number; // cents per token
}

// Pricing rates in cents per token (based on typical market pricing)
const PRICING_MAP: Record<string, ModelPricing> = {
  // Gemini Models
  "gemini-2.0-flash": { inputRate: 0.0000075, outputRate: 0.00003 },
  "gemini-1.5-flash": { inputRate: 0.0000075, outputRate: 0.00003 },
  "gemini-1.5-pro": { inputRate: 0.000125, outputRate: 0.0005 },
  
  // Claude Models
  "claude-3-5-sonnet": { inputRate: 0.0003, outputRate: 0.0015 },
  "claude-3-opus": { inputRate: 0.0015, outputRate: 0.0075 },
  "claude-3-haiku": { inputRate: 0.000025, outputRate: 0.000125 },

  // OpenAI Models
  "gpt-4o": { inputRate: 0.0005, outputRate: 0.0015 },
  "gpt-4o-mini": { inputRate: 0.000015, outputRate: 0.00006 },
  "gpt-4": { inputRate: 0.003, outputRate: 0.006 },
};

const DEFAULT_PRICING: ModelPricing = {
  inputRate: 0.0001,  // $1 per 1M tokens default
  outputRate: 0.0003, // $3 per 1M tokens default
};

export class CostTracker {
  /**
   * Resolve pricing for a model name.
   */
  private getPricing(model: string): ModelPricing {
    const key = model.toLowerCase();
    for (const [modelKey, pricing] of Object.entries(PRICING_MAP)) {
      if (key.includes(modelKey)) {
        return pricing;
      }
    }
    return DEFAULT_PRICING;
  }

  /**
   * Log an LLM usage event and calculate cost.
   *
   * The optional `reported` flag records whether the token counts
   * came from the upstream provider's `usage` payload (true) or
   * were estimated locally from text length (false). This is
   * useful for capacity planning: when the reported-vs-estimated
   * ratio drops we know the budget engine is under-counting real
   * spend.
   */
  async recordCostEvent(data: {
    missionId?: string;
    agentId?: string;
    taskId?: string;
    agentRunId?: string;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    reported?: boolean;
  }): Promise<number> {
    const pricing = this.getPricing(data.model);
    const costCents = (data.inputTokens * pricing.inputRate) + (data.outputTokens * pricing.outputRate);
    const id = `cost-${crypto.randomUUID()}`;
    const reported = data.reported === true ? 1 : 0;

    await dbClient.execute(
      `INSERT INTO Cost_Events
      (id, mission_id, agent_id, task_id, agent_run_id, provider, model, input_tokens, output_tokens, cost_cents, reported, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        id,
        data.missionId || null,
        data.agentId || null,
        data.taskId || null,
        data.agentRunId || null,
        data.provider,
        data.model,
        data.inputTokens,
        data.outputTokens,
        costCents,
        reported,
      ]
    );

    // Update agent_runs table estimate if agent_run_id is provided
    if (data.agentRunId) {
      await dbClient.execute(
        "UPDATE Agent_Runs SET cost_estimate = cost_estimate + ? WHERE id = ?",
        [costCents, data.agentRunId]
      );
    }

    // Forward the cost evaluation to the budget engine
    await budgetEngine.evaluateCostEvent(costCents, data.missionId, data.agentId);

    return costCents;
  }

  /**
   * Get total spend for a mission in cents.
   */
  async getMissionSpend(missionId: string): Promise<number> {
    const row = await dbClient.queryOne<{ total: number | null }>(
      "SELECT SUM(cost_cents) as total FROM Cost_Events WHERE mission_id = ?",
      [missionId]
    );
    return row?.total || 0;
  }

  /**
   * Get total spend for an agent in cents.
   */
  async getAgentSpend(agentId: string): Promise<number> {
    const row = await dbClient.queryOne<{ total: number | null }>(
      "SELECT SUM(cost_cents) as total FROM Cost_Events WHERE agent_id = ?",
      [agentId]
    );
    return row?.total || 0;
  }

  /**
   * Get overall spend summary aggregated by agent, mission, and model.
   * Also reports a `reportedCoverage` ratio: the share of recorded
   * spend whose token counts came from the provider's `usage` payload
   * (vs an estimate). Operators can watch this number drop toward 0
   * as a signal that the budget engine is under-counting real spend.
   */
  async getSpendSummary(): Promise<{
    totalCents: number;
    eventsCount: number;
    reportedCents: number;
    estimatedCents: number;
    reportedCoverage: number;
    byAgent: { agentId: string; agentName: string; costCents: number; inputTokens: number; outputTokens: number }[];
    byMission: { missionId: string; missionTitle: string; costCents: number }[];
    byModel: { provider: string; model: string; costCents: number; callCount: number }[];
  }> {
    const totalRow = await dbClient.queryOne<{ total: number | null; count: number; reported: number | null }>(
      "SELECT SUM(cost_cents) as total, COUNT(*) as count, SUM(CASE WHEN reported = 1 THEN cost_cents ELSE 0 END) as reported FROM Cost_Events"
    );

    const byAgent = await dbClient.query<any>(
      `SELECT c.agent_id as agentId, COALESCE(a.name, 'Unknown Agent') as agentName,
              SUM(c.cost_cents) as costCents, SUM(c.input_tokens) as inputTokens, SUM(c.output_tokens) as outputTokens
       FROM Cost_Events c
       LEFT JOIN Agents a ON c.agent_id = a.id
       GROUP BY c.agent_id, a.name
       ORDER BY costCents DESC`
    );

    const byMission = await dbClient.query<any>(
      `SELECT c.mission_id as missionId, COALESCE(m.title, 'No Mission Context') as missionTitle,
              SUM(c.cost_cents) as costCents
       FROM Cost_Events c
       LEFT JOIN Missions m ON c.mission_id = m.id
       GROUP BY c.mission_id, m.title
       ORDER BY costCents DESC`
    );

    const byModel = await dbClient.query<any>(
      `SELECT provider, model, SUM(cost_cents) as costCents, COUNT(*) as callCount
       FROM Cost_Events
       GROUP BY provider, model
       ORDER BY costCents DESC`
    );

    const totalCents = totalRow?.total || 0;
    const reportedCents = totalRow?.reported || 0;

    return {
      totalCents,
      eventsCount: totalRow?.count || 0,
      reportedCents,
      estimatedCents: Math.max(0, totalCents - reportedCents),
      reportedCoverage: totalCents > 0 ? reportedCents / totalCents : 0,
      byAgent: byAgent.map((r: any) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        costCents: r.costCents || 0,
        inputTokens: r.inputTokens || 0,
        outputTokens: r.outputTokens || 0
      })),
      byMission: byMission.map((r: any) => ({
        missionId: r.missionId,
        missionTitle: r.missionTitle,
        costCents: r.costCents || 0
      })),
      byModel: byModel.map((r: any) => ({
        provider: r.provider,
        model: r.model,
        costCents: r.costCents || 0,
        callCount: r.callCount
      }))
    };
  }
}

export const costTracker = new CostTracker();
