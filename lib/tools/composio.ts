import { z } from 'zod';
import { ToolDefinition, toolRegistry } from './registry';
// @ts-ignore - The types might be missing or incomplete depending on version
import { Composio } from 'composio-core';

let composioClient: Composio | null = null;

if (process.env.COMPOSIO_API_KEY) {
  composioClient = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
}

/**
 * Maps a dynamic Composio Tool action into the Supr native ToolRegistry.
 * This guarantees the Governance Engine can intercept Composio executions.
 */
export async function registerComposioTool(actionName: string, riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Medium') {
  let description = `Executes the ${actionName} action via Composio.`;
  let parameters = z.any(); // In production, we'd dynamically compile Zod schemas from the Composio OpenAPI spec.

  // 2. Define the execution bridge
  const toolDefinition: ToolDefinition<any, any> = {
    name: actionName.toLowerCase(), // e.g. github_create_issue
    description: description,
    parameters: parameters,
    requiredTier: 'External_Act',
    riskLevel: riskLevel,
    execute: async (params) => {
      if (!composioClient) {
        throw new Error(`Composio action '${actionName}' requires COMPOSIO_API_KEY in live runtime.`);
      }

      try {
        const response = await (composioClient as any).executeAction(actionName, params);
        return JSON.stringify(response);
      } catch (error: any) {
        throw new Error(`Composio Execution Failed: ${error.message}`);
      }
    }
  };

  // 3. Register it natively
  toolRegistry.registerTool(toolDefinition);
  console.log(`[Composio] Successfully bridged and registered tool: ${toolDefinition.name}`);
  return toolDefinition;
}

// Optionally pre-register core enterprise tools
export async function initializeCoreComposioSuite() {
  await registerComposioTool('GITHUB_CREATE_ISSUE', 'Medium');
  await registerComposioTool('SLACK_SEND_MESSAGE', 'Low');
  await registerComposioTool('NOTION_APPEND_BLOCK', 'Medium');
}
