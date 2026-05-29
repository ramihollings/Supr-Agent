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

  registerTool(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  async executeTool(name: string, params: any, agentId?: string, missionId?: string): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found in registry.`);
    
    if (agentId) {
      const { PermissionEngine } = require('../services/governance');
      const decision = await PermissionEngine.evaluateActionDynamic(agentId, name, missionId || null);
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
}

export const toolRegistry = new ToolRegistry();
