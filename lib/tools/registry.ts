import { z } from 'zod';
import { PermissionEngine, PermissionTier } from '../services/governance';
import dbClient from '../database/db_client';

/**
 * Per-execution context passed to a tool's `execute` function.
 * Tools that enforce internal policy gates (e.g. shell) can use
 * `trustedApprovedActionId` to bypass a redundant gate when the agent
 * registry has already recorded a human approval for the calling
 * action.
 */
export interface ToolExecutionContext {
  /** Agent performing the call. */
  agentId?: string;
  /** Mission the call belongs to. */
  missionId?: string;
  /**
   * If set, the agent registry has already approved this action via
   * the Approval flow and the tool's internal approval gate can be
   * bypassed. The id is the Agent_Actions row id.
   */
  trustedApprovedActionId?: string;
}

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  requiredTier: PermissionTier;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  execute: (params: TParams, ctx?: ToolExecutionContext) => Promise<TResult>;
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private nativeRegistrationPromise: Promise<void> | null = null;

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async ensureNativeToolsRegistered() {
    await this.ensureNativeToolsRegisteredInternal();
  }

  async executeTool(
    name: string,
    params: any,
    agentId?: string,
    missionId?: string,
    agentActionId?: string,
  ): Promise<any> {
    let tool = this.tools.get(name);
    if (!tool) {
      await this.ensureNativeToolsRegisteredInternal();
      tool = this.tools.get(name);
    }
    if (!tool) throw new Error(`Tool ${name} not found in registry.`);

    const ruleDecision = await PermissionEngine.evaluateToolRules(name, params || {});
    if (ruleDecision.status === 'Denied') {
      throw new Error(`Governance Denied: ${ruleDecision.reason}`);
    } else if (ruleDecision.status === 'RequiresApproval') {
      throw new Error(`Governance Intercepted: ${ruleDecision.reason}`);
    }

    let trustedApprovedActionId: string | undefined;
    if (agentId) {
      const decision = await PermissionEngine.evaluateActionDynamic(agentId, name, missionId || null, params || {});
      if (decision.status === 'Denied') {
        throw new Error(`Governance Denied: Agent ${agentId} is not permitted to execute capability ${name}. Reason: ${decision.reason}`);
      } else if (decision.status === 'RequiresApproval') {
        // If the calling Agent_Actions row is already in 'approved'
        // status, treat that as the human approval and proceed
        // without re-blocking. This is the documented path: the
        // agent creates the action as 'pending_approval', the
        // operator approves it, and only then does the runtime
        // call the tool. Without this bridge, every internal
        // call from an already-approved high-risk action would
        // be rejected by the registry's RequiresApproval gate
        // and the shell tool's internal gate simultaneously.
        if (agentActionId) {
          const actionRow = await dbClient.queryOne<any>(
            `SELECT status FROM Agent_Actions WHERE id = ?`,
            [agentActionId],
          );
          if (actionRow?.status === 'approved') {
            trustedApprovedActionId = agentActionId;
          } else {
            throw new Error(`Governance Intercepted: Capability ${name} requires explicit human approval. Reason: ${decision.reason}`);
          }
        } else {
          throw new Error(`Governance Intercepted: Capability ${name} requires explicit human approval. Reason: ${decision.reason}`);
        }
      }
    }

    // Validate parameters
    const parsedParams = tool.parameters.parse(params);
    return tool.execute(parsedParams, {
      agentId,
      missionId,
      trustedApprovedActionId,
    });
  }

  private async ensureNativeToolsRegisteredInternal() {
    if (this.nativeRegistrationPromise) return this.nativeRegistrationPromise;
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    const nativeToolsModule = '../tools/' + 'register';
    this.nativeRegistrationPromise = import(nativeToolsModule)
      .then(() => undefined)
      .catch((err: any) => {
        this.nativeRegistrationPromise = null;
        console.warn(`[ToolRegistry] Native tool auto-registration unavailable: ${err.message}`);
      });
    return this.nativeRegistrationPromise;
  }
}

export const toolRegistry = new ToolRegistry();
