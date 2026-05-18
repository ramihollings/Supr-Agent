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

  async executeTool(name: string, params: any): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Tool ${name} not found in registry.`);
    
    // Validate parameters
    const parsedParams = tool.parameters.parse(params);
    return tool.execute(parsedParams);
  }
}

export const toolRegistry = new ToolRegistry();
