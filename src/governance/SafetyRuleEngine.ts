/**
 * Safety rule engine for gating tool executions and managing human approvals.
 */

export enum PermissionResult {
  ALLOWED = "allowed",
  DENIED = "denied",
  NEEDS_APPROVAL = "needs_approval",
}

export interface PermissionDecision {
  result: PermissionResult;
  reason?: string;
  approvalPrompt?: string;
}

export interface SafetyRule {
  name: string;
  check(toolName: string, toolArgs: Record<string, any>): PermissionDecision | null;
}

export class SafetyRuleEngine {
  private rules: SafetyRule[] = [];

  /**
   * Register a new safety rule. Checked in registration order.
   */
  registerRule(rule: SafetyRule): void {
    this.rules.push(rule);
  }

  /**
   * Clears all registered safety rules.
   */
  clearRules(): void {
    this.rules = [];
  }

  /**
   * Returns registered rules.
   */
  getRules(): SafetyRule[] {
    return this.rules;
  }

  /**
   * Evaluates all registered rules in order against a tool execution request.
   * Returns the first non-null decision, or ALLOWED if no rules apply.
   */
  check(toolName: string, toolArgs: Record<string, any>): PermissionDecision {
    for (const rule of this.rules) {
      try {
        const decision = rule.check(toolName, toolArgs);
        if (decision !== null) {
          return decision;
        }
      } catch (err: any) {
        console.error(`[SafetyRuleEngine] Error executing rule '${rule.name}':`, err);
      }
    }

    return { result: PermissionResult.ALLOWED };
  }
}

export const safetyRuleEngine = new SafetyRuleEngine();
