export type PermissionTier = 'Observe' | 'Draft' | 'Edit' | 'Execute' | 'External_Act' | 'Root';

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

const TIER_LEVELS: Record<PermissionTier, number> = {
  'Observe': 1,
  'Draft': 2,
  'Edit': 3,
  'Execute': 4,
  'External_Act': 5,
  'Root': 6
};

export class PermissionEngine {
  
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
    missionId: string | null = null
  ): Promise<GovernanceDecision> {
    try {
      const { getSqliteDb } = require('../database/init');
      const db = getSqliteDb();
      
      // 1. Fetch agent permission tier
      const agent = db.prepare("SELECT * FROM Agents WHERE id = ?").get(agentId) as any;
      if (!agent) {
        return { status: 'Denied', reason: `Agent '${agentId}' not found.` };
      }

      // 2. Fetch capability requirement
      const capability = db.prepare("SELECT * FROM Capabilities WHERE name = ?").get(capabilityName) as any;
      if (!capability) {
        // If capability not in DB, allow access with warning
        return { status: 'Approved', reason: `Capability '${capabilityName}' is not registered. Defaulting to open access.` };
      }

      // 3. Check specific Agent_Capabilities binding
      const agentCap = db.prepare("SELECT * FROM Agent_Capabilities WHERE agent_id = ? AND capability_id = ?").get(agentId, capability.id) as any;
      
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
      const decisionId = `dec-${Date.now()}`;
      db.prepare(`
        INSERT INTO Policy_Decisions (id, mission_id, agent_id, capability_id, decision, reason)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(decisionId, missionId, agentId, capability.id, decisionStatus, reason);

      return { status: decisionStatus, reason };
    } catch (err: any) {
      console.error('[PermissionEngine] Dynamic evaluation failed:', err);
      // Fallback
      return { status: 'RequiresApproval', reason: `Governance pipeline failure: ${err.message}. Escalating to safety.` };
    }
  }
}
