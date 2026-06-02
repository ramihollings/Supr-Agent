import dbClient from "../../lib/database/db_client";
import { addActivityLog } from "../../lib/db";

export class MemoryConsolidationService {
  /**
   * Consolidates temporary memory items into persistent semantic memory.
   * Simulates the 'Dream Report' background process:
   * - Scans for unreviewed Memory_Items.
   * - Reviews and consolidates duplicates.
   * - Promotes important nodes (pinned = 1) or archives transient nodes.
   */
  static async consolidateMemory(missionId: string): Promise<void> {
    const unreviewed = await dbClient.query<any>("SELECT * FROM Memory_Items WHERE mission_id = ? AND reviewed_at IS NULL", [
      missionId,
    ]);

    if (unreviewed.length === 0) {
      return;
    }

    console.log(`[MemoryConsolidation] Running background Dream Report consolidation for ${unreviewed.length} items...`);

    for (const item of unreviewed) {
      let contentObj: any = {};
      try {
        contentObj = JSON.parse(item.content);
      } catch {
        contentObj = { value: item.content };
      }

      const key = contentObj.key || "semantic_node";

      // Consolidation policy:
      // Promote and pin if importance score is high, or key contains critical credential/config terms.
      const shouldPin =
        item.importance >= 0.6 || key.toLowerCase().includes("config") || key.toLowerCase().includes("credential");
      const decision = shouldPin ? "Promoted" : "Rejected";
      const reason = shouldPin
        ? `High importance score (${item.importance}) or critical architectural config key.`
        : "Transient session context. Archiving to prevent context bloat.";

      // Update the record in the database
      await dbClient.execute("UPDATE Memory_Items SET pinned = ?, reviewed_at = CURRENT_TIMESTAMP, reason = ? WHERE id = ?", [
        shouldPin ? 1 : 0,
        reason,
        item.id,
      ]);

      // Log the memory consolidation step
      await addActivityLog(missionId, {
        eventType: "supr_decision",
        actor: "Supr",
        actorIcon: "smart_toy",
        summary: `Dream Report: Consolidated memory node "${key}".`,
        detail: `Action: ${decision}. Reason: ${reason}`,
      });
    }

    console.log(`[MemoryConsolidation] Completed memory consolidation for mission ${missionId}.`);
  }
}
export const memoryConsolidationService = new MemoryConsolidationService();
