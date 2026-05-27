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

    // 1. Root implicitly approves everything except explicitly restricted critical actions
    if (agent.permissionTier === 'Root') {
      return { status: 'Approved', reason: 'Agent has Root authority.' };
    }

    // 2. Direct permission check
    if (agentLevel >= requiredLevel) {
      // Even if tier matches, high risk actions might require human approval in 'Guided' or 'Supervisor' modes.
      // (Assuming 'Supervisor' mode as default for this check)
      if (action.riskLevel === 'High' || action.riskLevel === 'Critical') {
        return { 
          status: 'RequiresApproval', 
          reason: `Action '${action.name}' is within tier but flagged as ${action.riskLevel} risk. Human approval required.` 
        };
      }
      return { status: 'Approved', reason: 'Agent meets required permission tier.' };
    }

    // 3. Permission denied/requires escalation
    // If the agent lacks the tier, it cannot perform the action directly. 
    // It must either be Denied, or it can escalate to a human via RequiresApproval.
    return {
      status: 'RequiresApproval',
      reason: `Agent tier '${agent.permissionTier}' is insufficient for action '${action.name}' (requires '${action.requiredTier}'). Escalating to user.`
    };
  }
}
