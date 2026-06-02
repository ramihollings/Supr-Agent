import dbClient from "../../lib/database/db_client";
import { addActivityLog } from "../../lib/db";

export class RoutineScheduler {
  private static timer: NodeJS.Timeout | null = null;

  /**
   * Start recurring checks on scheduled routines.
   */
  static start(intervalMs = 60000): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      this.checkAndRunJobs().catch((err) => console.error("[RoutineScheduler] Error:", err));
    }, intervalMs);
    console.log(`[RoutineScheduler] Started checking jobs every ${intervalMs}ms.`);
  }

  /**
   * Stop routine checking.
   */
  static stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log("[RoutineScheduler] Stopped.");
    }
  }

  /**
   * Scans the database for active cron jobs and runs any that are due.
   */
  static async checkAndRunJobs(): Promise<void> {
    const jobs = await dbClient.query<any>("SELECT * FROM Cron_Jobs WHERE status = 'Active'");
    const now = new Date();

    for (const job of jobs) {
      if (this.isJobDue(job, now)) {
        await this.runJob(job, now);
      }
    }
  }

  private static isJobDue(job: any, now: Date): boolean {
    if (!job.last_run) return true;

    const lastRun = new Date(job.last_run);
    const diffMs = now.getTime() - lastRun.getTime();
    const intervalStr = job.interval.toLowerCase();

    if (intervalStr.includes("5 minutes")) {
      return diffMs >= 5 * 60000;
    }
    if (intervalStr.includes("hourly")) {
      return diffMs >= 60 * 60000;
    }
    if (intervalStr.includes("daily")) {
      return diffMs >= 24 * 60 * 60000;
    }

    // Default fallback interval is 10 minutes
    return diffMs >= 10 * 60000;
  }

  private static async runJob(job: any, now: Date): Promise<void> {
    console.log(`[RoutineScheduler] Running routine '${job.name}' (Action: ${job.target_action})`);

    // Update last run time in DB
    await dbClient.execute("UPDATE Cron_Jobs SET last_run = ? WHERE id = ?", [now.toISOString(), job.id]);

    await addActivityLog(`system-routine-${job.id}`, {
      eventType: "governance",
      actor: job.assigned_agent_id || "System",
      actorIcon: "smart_toy",
      summary: `Executed routine job "${job.name}".`,
      detail: `Target action: "${job.target_action}". Next run scheduled automatically.`,
    });
  }
}
export const routineScheduler = new RoutineScheduler();
