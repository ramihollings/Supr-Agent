import dbClient from "../../lib/database/db_client";

export class PipelineGates {
  /**
   * Hard Gate: Verifies that an approved implementation plan exists in the database
   * before allowing execution of implementation tasks.
   */
  static async verifyPlanGate(missionId: string): Promise<{ passed: boolean; message?: string }> {
    // Check if there is an approved version of the implementation plan
    const row = await dbClient.queryOne<any>(
      `SELECT * FROM Artifact_Versions 
       WHERE mission_id = ? AND title LIKE '%plan.md%' AND status = 'approved'
       ORDER BY version DESC LIMIT 1`,
      [missionId],
    );

    if (!row) {
      return {
        passed: false,
        message:
          "Hard Gate Block: No approved implementation plan found for this mission. You must create and approve the plan before execution can begin.",
      };
    }

    return { passed: true };
  }

  /**
   * Hard Gate: Verifies that a task passes review (QA or human approval) before delivery.
   */
  static async verifyReviewGate(missionId: string, taskId: string): Promise<{ passed: boolean; message?: string }> {
    // Check if there is an approved review/approval record for this task
    const row = await dbClient.queryOne<any>(
      `SELECT * FROM Approvals 
       WHERE mission_id = ? AND task_id = ? AND status = 'approved'
       LIMIT 1`,
      [missionId, taskId],
    );

    if (!row) {
      return {
        passed: false,
        message: `Hard Gate Block: Task "${taskId}" requires review approval before it can be marked as completed.`,
      };
    }

    return { passed: true };
  }
}
