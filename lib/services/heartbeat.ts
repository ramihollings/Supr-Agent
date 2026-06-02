import dbClient from "../../lib/database/db_client";
import { getMissionById, getAgents, updateTaskStatus, addActivityLog } from "../../lib/db";
import { runAgentRuntimeAction } from "../../lib/runtime/agent-runtime-runner";
import { AgentLifecycleManager } from "./agent-lifecycle";

export class HeartbeatService {
  private static isRunning = false;
  private static timer: NodeJS.Timeout | null = null;

  /**
   * Starts a background recurring heartbeat loop.
   */
  static startInterval(ms = 5000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.trigger().catch((err) => console.error("[Heartbeat] Loop error:", err));
    }, ms);
    console.log(`[HeartbeatService] Heartbeat loop started with interval ${ms}ms.`);
  }

  /**
   * Stops the background loop.
   */
  static stopInterval(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[HeartbeatService] Heartbeat loop stopped.");
    }
  }

  /**
   * Runs a single iteration of the heartbeat loop.
   */
  static async trigger(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      // Find all active missions
      const missions = await dbClient.query<any>("SELECT id FROM Missions WHERE status = 'Active'");
      for (const mRow of missions) {
        await this.processMissionHeartbeat(mRow.id);
      }
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Processes heartbeat logic for a specific active mission.
   */
  private static async processMissionHeartbeat(missionId: string): Promise<void> {
    const mission = await getMissionById(missionId);
    if (!mission || mission.status !== "Active") return;

    // Find active tasks
    const activeTasks = mission.tasks.filter((t) => t.status === "Active");

    for (const task of activeTasks) {
      // Find the assigned agent details
      const allAgents = await getAgents();
      const agent = allAgents.find((a) => a.name === task.agentName);
      if (!agent || !agent.isActive) {
        continue;
      }

      // Use AgentStartLock to prevent concurrent execution on the same agent
      await AgentLifecycleManager.withAgentStartLock(agent.id, async () => {
        try {
          console.log(`[Heartbeat] Waking up agent '${agent.name}' for task: "${task.title}"`);

          // Log heartbeat wakeup event
          await addActivityLog(missionId, {
            eventType: "supr_decision",
            actor: "Supr",
            actorIcon: "smart_toy",
            summary: `Waking up ${agent.name} for task "${task.title}".`,
            detail: "Initiating agent runtime execution with state coalescing.",
          });

          const action = await dbClient.queryOne<any>(
            `SELECT * FROM Agent_Actions
             WHERE mission_id = ? AND task_id = ? AND agent_id = ? AND status IN ('draft','approved','failed')
             ORDER BY created_at ASC, rowid ASC LIMIT 1`,
            [missionId, task.id, agent.id],
          );

          if (!action) {
            await addActivityLog(missionId, {
              eventType: "supr_decision",
              actor: "Supr",
              actorIcon: "smart_toy",
              summary: `Heartbeat found no executable action for "${task.title}".`,
              detail: "No task status changed because completion now requires a linked Agent_Action with runtime evidence.",
            });
            return;
          }

          const result = await runAgentRuntimeAction({
            actionId: action.id,
            budget: { maxSteps: 4, timeoutMs: 60_000 },
          });

          if (result.status === "completed" && result.evidenceIds.length > 0) {
            await updateTaskStatus(missionId, task.id, "Done");

            await addActivityLog(missionId, {
              eventType: "task_complete",
              actor: agent.name,
              actorIcon: agent.icon || "smart_toy",
              summary: `Resolved task "${task.title}".`,
              detail: `Task completed through runtime action ${action.id} with ${result.evidenceIds.length} evidence link(s).`,
            });
          }
        } catch (err: any) {
          console.error(`[Heartbeat] Execution failed for agent '${agent.name}':`, err);
          await addActivityLog(missionId, {
            eventType: "failure",
            actor: agent.name,
            actorIcon: agent.icon || "smart_toy",
            summary: `Task failed: "${task.title}".`,
            detail: `Error: ${err.message}. Retrying under catch-up policy.`,
          });
        }
      });
    }
  }
}
