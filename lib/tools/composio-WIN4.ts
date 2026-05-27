import { z } from 'zod';
import { ToolDefinition, toolRegistry } from './registry';
// @ts-ignore - The types might be missing or incomplete depending on version
import { Composio } from 'composio-core';

let composioClient: Composio | null = null;

// Initialize conditionally so we don't crash without an API key
if (process.env.COMPOSIO_API_KEY) {
  composioClient = new Composio({ apiKey: process.env.COMPOSIO_API_KEY });
} else if (process.env.NODE_ENV !== 'production') {
  console.warn("[Composio] Warning: COMPOSIO_API_KEY not set. Operating in mock diagnostic mode.");
}

/**
 * Maps a dynamic Composio Tool action into the Supr native ToolRegistry.
 * This guarantees the Governance Engine can intercept Composio executions.
 */
export async function registerComposioTool(actionName: string, riskLevel: 'Low' | 'Medium' | 'High' | 'Critical' = 'Medium') {
  // 1. Fetch dynamic schema from Composio or mock it
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
        // Diagnostic Mock Execution
        console.log(`[Composio Mock] Executing ${actionName} with params:`, params);
        return `[MOCK COMPOSIO SUCCESS] Executed action: ${actionName}`;
      }

      // Real Execution
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
