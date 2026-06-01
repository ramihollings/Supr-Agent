import { RuntimeProvider, TaskPayload } from "../../lib/adapters/AgentAdapter";
import { getActiveProvider } from "../../lib/providers/model";

export class ClaudeProvider implements RuntimeProvider {
  async init(): Promise<void> {
    console.log("[ClaudeProvider] Initialized Claude Runtime Provider.");
  }

  async executeTask(taskPayload: TaskPayload, memoryPayload: any, permissionsLevel: number): Promise<any> {
    console.log(`[ClaudeProvider] Executing task '${taskPayload.id}' with permission level ${permissionsLevel}...`);

    try {
      const provider = await getActiveProvider("supr");
      const systemInstruction = `You are an AI agent powered by Claude. Run the tool '${taskPayload.tool}' using the instructions below. 
Memory Context: ${JSON.stringify(memoryPayload)}
Permission Tier Level: ${permissionsLevel}`;

      const prompt = `Task instructions: "${taskPayload.context}"
Arguments: ${JSON.stringify(taskPayload.args)}`;

      const response = await provider.generateContent(prompt, {
        systemInstruction,
        temperature: 0.1
      });

      return {
        success: true,
        provider: "Claude",
        output: response,
        evidence: {
          artifacts: [],
          memory: [],
          events: [`executed_tool:${taskPayload.tool}`],
          toolCalls: []
        }
      };
    } catch (err: any) {
      console.error("[ClaudeProvider] Task execution failed:", err);
      throw new Error(`Claude task execution failed: ${err.message}`);
    }
  }
}
