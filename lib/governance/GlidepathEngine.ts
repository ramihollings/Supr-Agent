import dbClient from "../../lib/database/db_client";
import { getMissionById, addActivityLog } from "../../lib/db";

export class GlidepathEngine {
  /**
   * Evaluates completion score and progress for a mission.
   * Progress = completed_tasks / total_tasks
   * Readiness Score = average of completed task readiness or a custom evaluation
   */
  static async evaluateMission(missionId: string): Promise<{ progress: number; readinessScore: number }> {
    const mission = await getMissionById(missionId);
    if (!mission) {
      throw new Error(`Mission not found: ${missionId}`);
    }

    const tasks = mission.tasks || [];
    if (tasks.length === 0) {
      return { progress: 0, readinessScore: 0 };
    }

    const completed = tasks.filter((t) => t.status === "Done");
    const progress = completed.length / tasks.length;
    const readinessScore = Math.round(progress * 100);

    // Update Glidepaths table in database
    await dbClient.execute("UPDATE Glidepaths SET progress = ?, readiness_score = ? WHERE mission_id = ?", [
      progress,
      readinessScore,
      missionId,
    ]);

    // If fully completed, update Mission status
    if (progress === 1.0 && mission.status === "Active") {
      await dbClient.execute("UPDATE Missions SET status = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
        missionId,
      ]);
      await addActivityLog(missionId, {
        eventType: "task_complete",
        actor: "Supr",
        actorIcon: "smart_toy",
        summary: `Mission "${mission.name}" completed successfully.`,
        detail: `All ${tasks.length} tasks resolved. Readiness score: ${readinessScore.toFixed(0)}%.`,
      });
    }

    return { progress, readinessScore };
  }

  /**
   * Pauses a mission.
   */
  static async pauseMission(missionId: string): Promise<void> {
    await dbClient.execute("UPDATE Missions SET status = 'Paused', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      missionId,
    ]);
    await addActivityLog(missionId, {
      eventType: "governance",
      actor: "Supr",
      actorIcon: "smart_toy",
      summary: "Mission paused.",
      detail: "Execution halted. Resume to continue the Glidepath.",
    });
  }

  /**
   * Resumes a paused mission.
   */
  static async resumeMission(missionId: string): Promise<void> {
    await dbClient.execute("UPDATE Missions SET status = 'Active', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      missionId,
    ]);
    await addActivityLog(missionId, {
      eventType: "governance",
      actor: "Supr",
      actorIcon: "smart_toy",
      summary: "Mission resumed.",
      detail: "Glidepath execution active.",
    });
  }

  /**
   * Abandons/cancels a mission.
   */
  static async abandonMission(missionId: string): Promise<void> {
    await dbClient.execute("UPDATE Missions SET status = 'Abandoned', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [
      missionId,
    ]);
    await addActivityLog(missionId, {
      eventType: "governance",
      actor: "Supr",
      actorIcon: "smart_toy",
      summary: "Mission abandoned.",
      detail: "Execution terminated by operator request.",
    });
  }
}
export const glidepathEngine = new GlidepathEngine();
