import { z } from 'zod';
import { ToolDefinition, toolRegistry } from './registry';
// @ts-ignore - The types might be missing or incomplete depending on version
import { Composio } from 'composio-core';
import { getSecretSetting } from '@/lib/secrets';

// Resolve the Composio key + client lazily and re-resolve on every
// execution, not at module load. The previous implementations:
//   (a) read process.env.COMPOSIO_API_KEY once at import, so the
//       Settings page's `integrations_composio` field could not
//       power Composio tools; and
//   (b) cached the client forever after the first call, so a
//       Settings-side key rotation (add/remove/change) would not
//       take effect until process restart.
// The new path re-reads the key on every call, which is cheap
// (single SELECT) and gives operators immediate rotation.
async function getComposioClient(): Promise<Composio | null> {
  const apiKey = await getSecretSetting('integrations_composio', process.env.COMPOSIO_API_KEY);
  if (!apiKey) return null;
  return new Composio({ apiKey });
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
      const client = await getComposioClient();
      if (!client) {
        throw new Error(`Composio action '${actionName}' requires integrations_composio in Settings or COMPOSIO_API_KEY in env.`);
      }

      try {
        const response = await (client as any).executeAction(actionName, params);
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
