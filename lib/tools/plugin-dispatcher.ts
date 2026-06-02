import { z } from "zod";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import dbClient from "../../lib/database/db_client";
import { pluginWorkerManager } from "../services/plugin-workers";

const PluginDispatcherParams = z.object({
  pluginId: z.string().describe("The ID of the target plugin (e.g., 'android-cli-plugin')."),
  toolName: z.string().describe("The name of the tool/action to invoke on the plugin."),
  arguments: z.record(z.string(), z.any()).describe("Arguments to pass to the plugin tool.")
});

type PluginDispatcherParamsType = z.infer<typeof PluginDispatcherParams>;

export const pluginDispatcherTool: ToolDefinition<PluginDispatcherParamsType, any> = {
  name: "dispatch_plugin_tool",
  description: "Routes a tool invocation request to the designated plugin and returns its structured result.",
  parameters: PluginDispatcherParams,
  requiredTier: "Execute",
  riskLevel: "Medium",
  execute: async (params) => {
    // 1. Query the database to check if the plugin is registered and enabled
    const plugin = await dbClient.queryOne<any>(
      "SELECT status, manifest FROM Plugin_Registry WHERE id = ?",
      [params.pluginId]
    );

    if (!plugin) {
      throw new Error(`Plugin '${params.pluginId}' is not registered in the system.`);
    }

    if (plugin.status !== "enabled") {
      throw new Error(`Plugin '${params.pluginId}' is registered but currently ${plugin.status || "disabled"}.`);
    }

    let manifest: any = {};
    try {
      manifest = JSON.parse(plugin.manifest);
    } catch {}

    if (!manifest.entrypoint) {
      throw new Error(`Plugin '${params.pluginId}' does not declare an executable entrypoint.`);
    }

    console.log(`[PluginDispatcher] Routing execution: ${params.pluginId}/${params.toolName}...`);
    const result = await pluginWorkerManager.invokeTool(params.pluginId, params.toolName, params.arguments);
    return JSON.stringify({
      success: true,
      pluginId: params.pluginId,
      toolName: params.toolName,
      timestamp: new Date().toISOString(),
      result,
    }, null, 2);
  }
};

toolRegistry.registerTool(pluginDispatcherTool);
export default pluginDispatcherTool;
