import crypto from "crypto";
import dbClient from "../../lib/database/db_client";
import { pluginEventBus } from "./plugin-events";
import { pluginWorkerManager } from "./plugin-workers";

export class PluginHost {
  /**
   * Dispatches and processes an RPC request received from a plugin worker.
   */
  async handleHostCall(
    pluginId: string,
    method: string,
    params: any,
    replyId?: string
  ): Promise<any> {
    console.log(`[PluginHost] RPC request from '${pluginId}': ${method}`, params);
    
    let result: any = null;
    let error: string | null = null;

    try {
      switch (method) {
        case "state.get":
          result = await this.stateGet(pluginId, params.key);
          break;

        case "state.set":
          await this.stateSet(pluginId, params.key, params.value);
          result = { success: true };
          break;

        case "events.emit":
          pluginEventBus.publish(params.eventType, params.data);
          result = { success: true };
          break;

        case "secrets.get":
          result = await this.secretGet(pluginId, params.key);
          break;

        case "audit.log":
          await this.auditLog(pluginId, params.action, params.targetType, params.targetId, params.metadata);
          result = { success: true };
          break;

        default:
          throw new Error(`Unsupported host method: ${method}`);
      }
    } catch (err: any) {
      console.error(`[PluginHost] Error processing host call '${method}':`, err);
      error = err.message || "Unknown error";
    }

    // Send reply to worker if replyId is present
    if (replyId) {
      pluginWorkerManager.sendToWorker(pluginId, {
        type: "host_reply",
        payload: { result, error },
        replyId
      });
    }

    return result;
  }

  private async stateGet(pluginId: string, key: string): Promise<any> {
    const dbKey = `plugin_state_${pluginId}_${key}`;
    const row = await dbClient.queryOne<any>("SELECT value FROM Settings WHERE key = ?", [dbKey]);
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      return row.value;
    }
  }

  private async stateSet(pluginId: string, key: string, value: any): Promise<void> {
    const dbKey = `plugin_state_${pluginId}_${key}`;
    const rawValue = typeof value === "string" ? value : JSON.stringify(value);
    await dbClient.execute(
      `INSERT INTO Settings (key, value, updated_at) 
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [dbKey, rawValue]
    );
  }

  private async secretGet(pluginId: string, key: string): Promise<string | null> {
    const dbKey = `secret_${pluginId}_${key}`;
    const row = await dbClient.queryOne<any>("SELECT value FROM Settings WHERE key = ?", [dbKey]);
    if (row) return row.value;
    return null;
  }

  private async auditLog(
    pluginId: string,
    action: string,
    targetType?: string,
    targetId?: string,
    metadata?: any
  ): Promise<void> {
    const id = `audit-plugin-${crypto.randomUUID()}`;
    await dbClient.execute(
      `INSERT INTO Audit_Log (id, actor_type, actor_id, action, target_type, target_id, metadata)
       VALUES (?, 'plugin', ?, ?, ?, ?, ?)`,
      [
        id,
        pluginId,
        action,
        targetType || null,
        targetId || null,
        JSON.stringify(metadata || {})
      ]
    );
  }
}

export const pluginHost = new PluginHost();
export default pluginHost;
