import { z } from 'zod';
import { PermissionTier } from '../services/governance';

export interface ToolDefinition<TParams = any, TResult = any> {
  name: string;
  description: string;
  parameters: z.ZodType<TParams>;
  requiredTier: PermissionTier;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  execute: (params: TParams) => Promise<TResult>;
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private nativeRegistrationAttempted = false;

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  ensureNativeToolsRegistered() {
    this.ensureNativeToolsRegisteredInternal();
  }

  async executeTool(name: string, params: any, agentId?: string, missionId?: string): Promise<any> {
    let tool = this.tools.get(name);
    if (!tool) {
      this.ensureNativeToolsRegisteredInternal();
      tool = this.tools.get(name);
    }
    if (!tool) throw new Error(`Tool ${name} not found in registry.`);

    const { PermissionEngine } = require('../services/governance');
    const ruleDecision = PermissionEngine.evaluateToolRules(name, params || {});
    if (ruleDecision.status === 'Denied') {
      throw new Error(`Governance Denied: ${ruleDecision.reason}`);
    } else if (ruleDecision.status === 'RequiresApproval') {
      throw new Error(`Governance Intercepted: ${ruleDecision.reason}`);
    }

    if (agentId) {
      const decision = await PermissionEngine.evaluateActionDynamic(agentId, name, missionId || null, params || {});
      if (decision.status === 'Denied') {
        throw new Error(`Governance Denied: Agent ${agentId} is not permitted to execute capability ${name}. Reason: ${decision.reason}`);
      } else if (decision.status === 'RequiresApproval') {
        throw new Error(`Governance Intercepted: Capability ${name} requires explicit human approval. Reason: ${decision.reason}`);
      }
    }

    // Validate parameters
    const parsedParams = tool.parameters.parse(params);
    return tool.execute(parsedParams);
  }

  private ensureNativeToolsRegisteredInternal() {
    if (this.nativeRegistrationAttempted) return;
    this.nativeRegistrationAttempted = true;
    if (process.env.NEXT_PHASE === 'phase-production-build') return;
    try {
      const runtimeRequire = eval('require') as NodeRequire;
      runtimeRequire('../../src/tools/register');
    } catch (err: any) {
      console.warn(`[ToolRegistry] Native tool auto-registration unavailable: ${err.message}`);
    }
  }
}

export const toolRegistry = new ToolRegistry();
