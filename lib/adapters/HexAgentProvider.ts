import { RuntimeProvider, TaskPayload } from './AgentAdapter';
import { PermissionEnforcer } from '../governance/PermissionEnforcer';
import { toolRegistry } from '../tools/registry';

export class HexAgentProvider implements RuntimeProvider {
  async init(): Promise<void> {
    // Native Supr tools are registered lazily by the registry.
  }

  async executeTask(taskPayload: TaskPayload, memoryPayload: any, permissionsLevel: number): Promise<any> {
    if (!PermissionEnforcer.validate(permissionsLevel, taskPayload.tool)) {
      throw new Error(`[Governance] Permission Denied: Tool '${taskPayload.tool}' is not allowed at Tier ${permissionsLevel}.`);
    }

    console.log(`[Supr] Routing task through native tool registry. Tool: ${taskPayload.tool}, Tier: ${permissionsLevel}`);

    try {
      const result = await toolRegistry.executeTool(taskPayload.tool, {
        ...(taskPayload.args || {}),
        context: taskPayload.context,
        memory: memoryPayload,
      });
      return { status: "success", data: result };
    } catch (error: any) {
      return { status: "error", error: error.message };
    }
  }
}
