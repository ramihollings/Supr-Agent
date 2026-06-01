import { RuntimeProvider, TaskPayload } from "../../lib/adapters/AgentAdapter";
import { getRuntimeMode, isMockAllowed } from "../../lib/runtime/runtime-mode";

export class HttpAgentProvider implements RuntimeProvider {
  private endpoint: string;

  constructor() {
    this.endpoint = process.env.EXTERNAL_AGENT_ENDPOINT || "https://api.external-agent.internal/v1/execute";
  }

  async init(): Promise<void> {
    console.log(`[HttpAgentProvider] Initialized HTTP Provider (Endpoint: ${this.endpoint}).`);
  }

  async executeTask(taskPayload: TaskPayload, memoryPayload: any, permissionsLevel: number): Promise<any> {
    console.log(`[HttpAgentProvider] Forwarding task '${taskPayload.id}' via HTTP POST to external agent...`);

    try {
      if (this.endpoint.includes("internal")) {
        const mode = await getRuntimeMode();
        if (!isMockAllowed(mode)) {
          throw new Error("EXTERNAL_AGENT_ENDPOINT must point to a live provider in real runtime mode.");
        }
        // Ephemeral mock response when no live external connection is configured
        console.warn("[HttpAgentProvider] Operating in offline diagnostic mode. Returning mock response.");
        return {
          success: true,
          provider: "HttpAgent",
          output: `[HTTP AGENT OFFLINE SUCCESS] Received task '${taskPayload.id}'. Handled action '${taskPayload.tool}' successfully.`,
          evidence: {
            artifacts: [],
            memory: [],
            events: [`http_forward:${taskPayload.tool}`],
            toolCalls: []
          }
        };
      }

      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          task: taskPayload,
          memory: memoryPayload,
          permissionsLevel
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP agent returned status ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (err: any) {
      console.error("[HttpAgentProvider] HTTP request failed:", err);
      throw new Error(`HTTP agent forwarding failed: ${err.message}`);
    }
  }
}
export default HttpAgentProvider;
