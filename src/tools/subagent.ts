import { z } from "zod";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import { AgentLifecycleManager } from "../services/agent-lifecycle";
import { getActiveProvider } from "../../lib/providers/model";

const SubagentParams = z.object({
  name: z.string().describe("Name of the subagent to spawn."),
  role: z.string().describe("The operational role or title of this subagent (e.g. 'Code Extractor')."),
  task: z.string().describe("The specific task/instructions for the subagent to perform."),
  permissionTier: z.enum(["Observe", "Draft", "Edit", "Execute", "External_Act", "Root"]).default("Observe").describe("Permission tier for the subagent."),
  tools: z.array(z.string()).describe("List of allowed tools for this subagent."),
  targetFiles: z.array(z.string()).default([]).describe("Optional file paths this subagent will edit (for overlap detection)."),
  missionId: z.string().optional().describe("Optional mission ID context.")
});

type SubagentParamsType = z.infer<typeof SubagentParams>;

export const subagentTool: ToolDefinition<SubagentParamsType, string> = {
  name: "spawn_subagent",
  description: "Spawns a temporary subagent to delegate a subtask. Provisioning, execution, and cleanup are managed automatically.",
  parameters: SubagentParams,
  requiredTier: "Edit",
  riskLevel: "Medium",
  execute: async (params) => {
    const missionId = params.missionId || `m-ephemeral-${Date.now()}`;
    const agentId = `subagent-${params.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    console.log(`[SubagentTool] Provisioning subagent '${params.name}' for mission '${missionId}'...`);
    
    // Hire/provision subagent
    const profilePath = await AgentLifecycleManager.hireAgent(
      missionId,
      agentId,
      params.name,
      params.role,
      params.permissionTier,
      params.tools,
      `You are ${params.name}, acting as the ${params.role}. Your objective: ${params.task}`
    );

    try {
      // Execute the task using the model provider
      const provider = await getActiveProvider("sub");
      console.log(`[SubagentTool] Spawning subagent execution using provider '${provider.name}'...`);
      
      const prompt = `You have been hired to complete the following task:
"${params.task}"

Please perform the work and write a comprehensive summary of your findings or implementation. You have access to these tools: [${params.tools.join(", ")}].`;

      const response = await provider.generateContent(prompt, {
        systemInstruction: `You are ${params.name}, acting as the ${params.role}. Provide a detailed, premium solution to the user's task. Only respond with original, high-quality work.`,
      });

      return `[Subagent ${params.name} Response]\n\nProfile Path: ${profilePath}\n\n${response}`;
    } catch (error: any) {
      console.error(`[SubagentTool] Execution failed for '${params.name}':`, error);
      throw new Error(`Subagent execution failed: ${error.message}`);
    } finally {
      // Cleanup / terminate subagent
      console.log(`[SubagentTool] Terminating subagent '${params.name}'...`);
      await AgentLifecycleManager.terminateAgent(missionId, agentId, params.name).catch(() => {});
    }
  }
};

toolRegistry.registerTool(subagentTool);
export default subagentTool;
