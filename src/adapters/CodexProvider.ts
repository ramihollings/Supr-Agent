import { RuntimeProvider, TaskPayload } from "../../lib/adapters/AgentAdapter";
import { getActiveProvider } from "../../lib/providers/model";

export class CodexProvider implements RuntimeProvider {
  async init(): Promise<void> {
    console.log("[CodexProvider] Initialized Codex/OpenAI Code Runtime Provider.");
  }

  async executeTask(taskPayload: TaskPayload, memoryPayload: any, permissionsLevel: number): Promise<any> {
    console.log(`[CodexProvider] Executing code generation task '${taskPayload.id}' with permission level ${permissionsLevel}...`);

    try {
      const provider = await getActiveProvider("code");
      const systemInstruction = `You are a specialized software engineering agent powered by Codex. 
Analyze the task parameters and execute the required operation.
Memory Context: ${JSON.stringify(memoryPayload)}
Permission Tier Level: ${permissionsLevel}`;

      const prompt = `Tool Name: ${taskPayload.tool}
Context: "${taskPayload.context}"
Arguments: ${JSON.stringify(taskPayload.args)}`;

      const response = await provider.generateContent(prompt, {
        systemInstruction,
        temperature: 0.0
      });

      return {
        success: true,
        provider: "Codex",
        output: response,
        evidence: {
          artifacts: [],
          memory: [],
          events: [`executed_code_tool:${taskPayload.tool}`],
          toolCalls: []
        }
      };
    } catch (err: any) {
      console.error("[CodexProvider] Task execution failed:", err);
      throw new Error(`Codex task execution failed: ${err.message}`);
    }
  }
}
