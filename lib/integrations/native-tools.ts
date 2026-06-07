import type { ToolDefinition } from '@/lib/tools/registry';
import { toolRegistry } from '@/lib/tools/registry';
import { integrationRegistry } from './registry';

export function registerNativeToolAdapters(tools: ToolDefinition[]) {
  for (const tool of tools) {
    if (integrationRegistry.has(tool.name)) continue;
    integrationRegistry.register(tool.name, {
      async describe() {
        return {
          id: tool.name,
          operations: [tool.name],
          permissions: [tool.requiredTier],
          riskLevel: tool.riskLevel,
          availability: 'available',
        };
      },
      async validate(input) {
        const parsed = tool.parameters.safeParse(input);
        return parsed.success
          ? { valid: true, errors: [] }
          : { valid: false, errors: parsed.error.issues.map((issue) => issue.message) };
      },
      async execute(context, input) {
        const output = await toolRegistry.executeTool(
          tool.name,
          input,
          context.agentId,
          context.missionId,
          context.agentActionId,
          context.signal,
          context.sessionId,
        );
        return { ok: true, output };
      },
      async healthCheck() {
        return { status: 'available', latencyMs: 0 };
      },
    }, { retryLimit: 0 });
  }
}
