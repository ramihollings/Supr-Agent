import { fork, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { pluginRegistry } from "./plugin-registry";
import { isValidPluginId } from "./plugin-loader";

import { pluginHost } from "./plugin-host";

export interface WorkerMessage {
  type: string;
  payload: any;
  replyId?: string;
}

export class PluginWorkerManager {
  private activeWorkers: Map<string, ChildProcess> = new Map();
  private pendingReplies: Map<string, { resolve: (value: any) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }> = new Map();

  /**
   * Spawns a background process for a registered and enabled plugin.
   */
  async startWorker(pluginId: string): Promise<void> {
    const plugin = await pluginRegistry.getPlugin(pluginId);
    if (!plugin) {
      throw new Error(`Plugin '${pluginId}' not found.`);
    }

    if (plugin.status !== "enabled") {
      throw new Error(`Plugin '${pluginId}' is not enabled.`);
    }

    if (this.activeWorkers.has(pluginId)) {
      console.log(`[PluginWorkers] Worker for '${pluginId}' is already running.`);
      return;
    }

    const entrypoint = plugin.manifest.entrypoint;
    // The plugin id comes from the registry, which the loader populates
    // after passing the strict allowlist check. Re-validate here as a
    // defense-in-depth measure: a bug or future code path that lets an
    // unvalidated id reach the worker must not be able to escape the
    // plugins directory.
    if (!isValidPluginId(pluginId)) {
      throw new Error(`Plugin id '${pluginId}' is not a valid id (must match ^[a-zA-Z0-9._-]{1,64}$).`);
    }
    // Resolve entrypoint path relative to plugins directory.
    const pluginsDir = path.resolve(process.cwd(), "plugins");
    const pluginRoot = path.resolve(pluginsDir, pluginId);
    // Defense-in-depth: pluginRoot itself must be inside pluginsDir.
    // This guards against the (currently impossible, given the id
    // allowlist) case where path.resolve finds a different root.
    if (!pluginRoot.startsWith(pluginsDir + path.sep) && pluginRoot !== pluginsDir) {
      throw new Error(`Plugin '${pluginId}' root escapes the plugins directory.`);
    }
    const entryPath = path.resolve(pluginRoot, entrypoint);

    // Path containment: the resolved entry must be inside
    // plugins/<pluginId>. A manifest with `../../outside.js` would
    // otherwise escape the plugin sandbox and execute arbitrary code.
    if (!entryPath.startsWith(pluginRoot + path.sep) && entryPath !== pluginRoot) {
      throw new Error(`Plugin '${pluginId}' entrypoint '${entrypoint}' escapes the plugin directory.`);
    }

    if (!fs.existsSync(entryPath)) {
      throw new Error(`Entrypoint not found for plugin '${pluginId}' at path: ${entryPath}`);
    }

    console.log(`[PluginWorkers] Starting worker for plugin '${pluginId}' (entrypoint: ${entrypoint})...`);

    // Fork the worker process with a *scoped* environment. The previous
    // implementation inherited all of process.env (including OPENAI_API_KEY,
    // GEMINI_API_KEY, AUTH_SECRET, etc.) which let any plugin exfiltrate
    // host secrets. Plugins now get only the two vars they need to identify
    // themselves; secret access must be requested via a future manifest
    // permission flag.
    const child = fork(entryPath, [], {
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
        PLUGIN_ID: pluginId,
      },
      stdio: ["inherit", "inherit", "inherit", "ipc"]
    });

    child.on("message", (message: WorkerMessage) => {
      this.handleWorkerMessage(pluginId, message);
    });

    child.on("exit", (code, signal) => {
      console.log(`[PluginWorkers] Worker for '${pluginId}' exited with code ${code}, signal ${signal}.`);
      this.activeWorkers.delete(pluginId);
      
      // Auto-restart if enabled and exited abnormally
      if (code !== 0 && plugin.status === "enabled") {
        console.log(`[PluginWorkers] Attempting to restart worker for '${pluginId}'...`);
        setTimeout(() => this.startWorker(pluginId).catch(console.error), 2000);
      }
    });

    child.on("error", (err) => {
      console.error(`[PluginWorkers] Worker for '${pluginId}' encountered error:`, err);
    });

    this.activeWorkers.set(pluginId, child);
    console.log(`[PluginWorkers] Worker for '${pluginId}' started successfully.`);
  }

  /**
   * Terminate a running plugin worker.
   */
  async stopWorker(pluginId: string): Promise<void> {
    const child = this.activeWorkers.get(pluginId);
    if (!child) return;

    console.log(`[PluginWorkers] Stopping worker for plugin '${pluginId}'...`);
    child.kill("SIGTERM");
    this.activeWorkers.delete(pluginId);
  }

  /**
   * Send a message to a plugin worker.
   */
  sendToWorker(pluginId: string, message: WorkerMessage): boolean {
    const child = this.activeWorkers.get(pluginId);
    if (!child) return false;
    return child.send(message);
  }

  async invokeTool(pluginId: string, toolName: string, args: Record<string, any>, timeoutMs = 15000): Promise<any> {
    if (!this.activeWorkers.has(pluginId)) {
      await this.startWorker(pluginId);
    }

    const replyId = `plugin-reply-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const sent = this.sendToWorker(pluginId, {
      type: "tool_call",
      replyId,
      payload: { toolName, arguments: args },
    });

    if (!sent) {
      throw new Error(`Plugin '${pluginId}' has no running worker to handle '${toolName}'.`);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingReplies.delete(replyId);
        reject(new Error(`Plugin '${pluginId}' did not reply to '${toolName}' within ${timeoutMs}ms.`));
      }, timeoutMs);
      this.pendingReplies.set(replyId, { resolve, reject, timer });
    });
  }

  /**
   * Clean shutdown of all running workers.
   */
  async shutdown(): Promise<void> {
    const ids = Array.from(this.activeWorkers.keys());
    await Promise.all(ids.map(id => this.stopWorker(id)));
  }

  /**
   * Handle incoming messages from the worker process.
   */
  private handleWorkerMessage(pluginId: string, message: WorkerMessage) {
    console.log(`[PluginWorkers] Received message from '${pluginId}':`, message);

    if (message.type === "tool_result" && message.replyId) {
      const pending = this.pendingReplies.get(message.replyId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingReplies.delete(message.replyId);
        if (message.payload?.error) {
          pending.reject(new Error(String(message.payload.error)));
        } else {
          pending.resolve(message.payload?.result ?? message.payload);
        }
      }
      return;
    }
    
    // Wire message to event bus, tool dispatcher, or host services
    // For example, inter-plugin communication or logging:
    if (message.type === "log") {
      console.log(`[Plugin - ${pluginId}] ${message.payload}`);
    } else if (message.type === "host_call") {
      pluginHost.handleHostCall(
        pluginId,
        message.payload.method,
        message.payload.params,
        message.replyId
      ).catch(console.error);
    }
  }
}

export const pluginWorkerManager = new PluginWorkerManager();
