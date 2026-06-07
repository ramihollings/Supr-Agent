import dbClient from "../../lib/database/db_client";

export interface RunContinuation {
  id: string;
  missionId: string;
  taskId: string;
  agentId: string;
  stateData: string;
  updatedAt: string;
}

export class ContinuationManager {
  /**
   * Saves a continuation snapshot for a specific agent execution task.
   */
  static async saveContinuation(
    missionId: string,
    taskId: string,
    agentId: string,
    stateData: Record<string, any>,
  ): Promise<void> {
    const id = `cont-${missionId}-${taskId}-${agentId}`;
    const rawState = JSON.stringify(stateData);

    await dbClient.execute(
      `INSERT INTO Run_Continuations (id, session_id, state_data, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(session_id) DO UPDATE SET state_data = excluded.state_data, updated_at = excluded.updated_at`,
      [id, id, rawState],
    );
  }

  /**
   * Loads a continuation snapshot.
   */
  static async loadContinuation(
    missionId: string,
    taskId: string,
    agentId: string,
  ): Promise<Record<string, any> | null> {
    const id = `cont-${missionId}-${taskId}-${agentId}`;
    const row = await dbClient.queryOne<any>("SELECT state_data FROM Run_Continuations WHERE session_id = ?", [id]);
    if (!row) return null;
    try {
      return JSON.parse(row.state_data);
    } catch {
      return null;
    }
  }

  /**
   * Generates a continuation summary from the database events of the mission/task.
   */
  static async generateContinuationSummary(missionId: string, taskId: string): Promise<string> {
    // Fetch the recent activity events for this task
    const logs = await dbClient.query<any>(
      "SELECT * FROM Event_Log WHERE mission_id = ? AND (summary LIKE ? OR metadata LIKE ?) ORDER BY timestamp DESC LIMIT 5",
      [missionId, `%${taskId}%`, `%${taskId}%`],
    );

    if (logs.length === 0) {
      return "No prior execution history found for this task in this session.";
    }

    const summaryLines = logs.map((l) => {
      const time = new Date(l.timestamp).toLocaleTimeString();
      return `- [${time}] ${l.actor_id}: ${l.summary}`;
    });

    return `### Session Continuation Summary\n\nHere is what occurred in the prior heartbeats of this task:\n${summaryLines.join("\n")}\n\nPlease resume execution from the last state, focusing on completing the pending milestones.`;
  }
}
export const continuationManager = new ContinuationManager();
