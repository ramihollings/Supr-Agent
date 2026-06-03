export type PermissionTier = 'Observe' | 'Draft' | 'Edit' | 'Execute' | 'External_Act' | 'Root';
import crypto from 'crypto';
import dbClient from '@/lib/database/db_client';

export interface AgentContext {
  id: string;
  name: string;
  permissionTier: PermissionTier;
  isPermanent: boolean;
}

export interface ToolAction {
  name: string;
  requiredTier: PermissionTier;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
}

export type DecisionType = 'Approved' | 'Denied' | 'RequiresApproval';

export interface GovernanceDecision {
  status: DecisionType;
  reason: string;
}

function mapRuleDecision(result: string, reason?: string): GovernanceDecision | null {
  if (result === 'denied') {
    return { status: 'Denied', reason: reason || 'Blocked by configured governance rule.' };
  }
  if (result === 'needs_approval') {
    return { status: 'RequiresApproval', reason: reason || 'Governance rule requires explicit approval.' };
  }
  return null;
}

const TIER_LEVELS: Record<PermissionTier, number> = {
  'Observe': 1,
  'Draft': 2,
  'Edit': 3,
  'Execute': 4,
  'External_Act': 5,
  'Root': 6
};

export class PermissionEngine {
  private static nativeRulesReady = false;

  private static async ensureNativeRules() {
    if (this.nativeRulesReady) return;
    try {
      // Dynamic imports keep the native rule engines out of the initial
      // module graph (they pull in `node:fs` and `node:path` and would
      // not be safe to load in the browser bundle). The older require()
      // pattern is intentionally avoided here because it does not work
      // under Turbopack's ESM-only module loader.
      const { safetyRuleEngine } = await import('../governance/SafetyRuleEngine');
      const { RuleEngine } = await import('../governance/RuleEngine');
      if (!safetyRuleEngine.getRules().some((rule: any) => rule.name === 'ConditionRuleEngine')) {
        safetyRuleEngine.registerRule(new RuleEngine());
      }
      this.nativeRulesReady = true;
    } catch (err: any) {
      console.warn('[PermissionEngine] Native governance rules unavailable:', err.message);
      this.nativeRulesReady = true;
    }
  }

  static async evaluateToolRules(toolName: string, toolArgs: Record<string, any> = {}): Promise<GovernanceDecision> {
    await this.ensureNativeRules();
    try {
      const { safetyRuleEngine } = await import('../governance/SafetyRuleEngine');
      const decision = safetyRuleEngine.check(toolName, toolArgs);
      const reason = decision.reason || decision.approvalPrompt;
      return mapRuleDecision(decision.result, reason) || { status: 'Approved', reason: 'No configured governance rule matched.' };
    } catch (err: any) {
      return { status: 'RequiresApproval', reason: `Governance rule evaluation failed: ${err.message}.` };
    }
  }

  /**
   * Evaluates whether an agent has the necessary permissions to execute a tool action.
   */
  static evaluateAction(agent: AgentContext, action: ToolAction): GovernanceDecision {
    const agentLevel = TIER_LEVELS[agent.permissionTier] || 0;
    const requiredLevel = TIER_LEVELS[action.requiredTier] || 0;

    if (agent.permissionTier === 'Root') {
      return { status: 'Approved', reason: 'Agent has Root authority.' };
    }

    if (agentLevel >= requiredLevel) {
      if (action.riskLevel === 'High' || action.riskLevel === 'Critical') {
        return {
          status: 'RequiresApproval',
          reason: `Action '${action.name}' is within tier but flagged as ${action.riskLevel} risk. Human approval required.`
        };
      }
      return { status: 'Approved', reason: 'Agent meets required permission tier.' };
    }

    return {
      status: 'RequiresApproval',
      reason: `Agent tier '${agent.permissionTier}' is insufficient for action '${action.name}' (requires '${action.requiredTier}'). Escalating to user.`
    };
  }

  /**
   * Dynamically evaluates whether an agent has the necessary permissions to execute a capability,
   * querying the DB capabilities and agent_capabilities tables, and logging the decision in Policy_Decisions.
   */
  static async evaluateActionDynamic(
    agentId: string,
    capabilityName: string,
    missionId: string | null = null,
    capabilityArgs: Record<string, any> = {}
  ): Promise<GovernanceDecision> {
    try {
      const ruleDecision = await this.evaluateToolRules(capabilityName, capabilityArgs);
      if (ruleDecision.status !== 'Approved') {
        const capability = await dbClient.queryOne<any>(`SELECT * FROM Capabilities WHERE name = ?`, [capabilityName]);
        await dbClient.execute(
          `INSERT INTO Policy_Decisions (id, mission_id, agent_id, capability_id, decision, reason)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [`dec-${crypto.randomUUID()}-rule`, missionId, agentId, capability?.id || null, ruleDecision.status, ruleDecision.reason]
        );
        return ruleDecision;
      }

      // 1. Fetch agent permission tier
      const agent = await dbClient.queryOne<any>(`SELECT * FROM Agents WHERE id = ?`, [agentId]);
      if (!agent) {
        return { status: 'Denied', reason: `Agent '${agentId}' not found.` };
      }

      // 2. Fetch capability requirement
      const capability = await dbClient.queryOne<any>(`SELECT * FROM Capabilities WHERE name = ?`, [capabilityName]);
      if (!capability) {
        return { status: 'Denied', reason: `Capability '${capabilityName}' is not registered. Refusing open-ended execution.` };
      }

      // 3. Check specific Agent_Capabilities binding
      const agentCap = await dbClient.queryOne<any>(`SELECT * FROM Agent_Capabilities WHERE agent_id = ? AND capability_id = ?`, [agentId, capability.id]);

      let decisionStatus: DecisionType = 'Approved';
      let reason = 'Approved by capability policy.';

      if (agent.permission_tier === 'Root') {
        decisionStatus = 'Approved';
        reason = `Agent has Root authority.`;
      } else if (agentCap && agentCap.allowed === 0) {
        decisionStatus = 'Denied';
        reason = `Explicitly blocked by agent capability mapping constraints.`;
      } else {
        const agentLevel = TIER_LEVELS[agent.permission_tier as PermissionTier] || 0;
        const requiredLevel = TIER_LEVELS[capability.required_permission as PermissionTier] || 0;

        if (agentLevel < requiredLevel) {
          decisionStatus = 'RequiresApproval';
          reason = `Agent tier '${agent.permission_tier}' is insufficient for capability '${capabilityName}' (requires '${capability.required_permission}'). Escalating to user.`;
        } else if (capability.risk_level === 'High' || capability.risk_level === 'Critical') {
          decisionStatus = 'RequiresApproval';
          reason = `Capability '${capabilityName}' is within tier but flagged as ${capability.risk_level} risk. Human approval required.`;
        }
      }

      // 4. Log the policy decision in Policy_Decisions
      const decisionId = `dec-${crypto.randomUUID()}`;
      await dbClient.execute(
        `INSERT INTO Policy_Decisions (id, mission_id, agent_id, capability_id, decision, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [decisionId, missionId, agentId, capability.id, decisionStatus, reason]
      );

      return { status: decisionStatus, reason };
    } catch (err: any) {
      console.error('[PermissionEngine] Dynamic evaluation failed:', err);
      // Fallback
      return { status: 'RequiresApproval', reason: `Governance pipeline failure: ${err.message}. Escalating to safety.` };
    }
  }
}
