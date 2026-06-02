import { fork, ChildProcess } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { pluginRegistry } from "./plugin-registry";

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
    // Resolve entrypoint path relative to plugins directory
    const pluginsDir = path.resolve(process.cwd(), "plugins");
    const entryPath = path.resolve(pluginsDir, pluginId, entrypoint);

    if (!fs.existsSync(entryPath)) {
      throw new Error(`Entrypoint not found for plugin '${pluginId}' at path: ${entryPath}`);
    }

    console.log(`[PluginWorkers] Starting worker for plugin '${pluginId}' (entrypoint: ${entrypoint})...`);

    // Fork the worker process (isolated environment)
    const child = fork(entryPath, [], {
      env: {
        ...process.env,
        PLUGIN_ID: pluginId,
        NODE_ENV: process.env.NODE_ENV || "development"
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
