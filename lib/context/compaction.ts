/**
 * Context compaction.
 *
 * Per Blueprint 5.0 Part 3.4, as an agent works it should
 * periodically summarize its findings and drop raw logs,
 * storing the distilled knowledge into long-term memory.
 * This keeps the live context window bounded while preserving
 * the cumulative state of the mission.
 *
 * The compaction strategy here is event-driven rather than
 * time-driven: every time a new Event_Log row is written for a
 * mission, we count the rows. If the count crosses
 * `compaction_threshold` (default 50), we trigger a compaction
 * pass that:
 *
 *   1. Pulls the last `compaction_window` (default 25) events
 *   2. Asks the live LLM to summarize them in <= `compaction_max_tokens`
 *      tokens (default 400)
 *   3. Writes the summary to Memory_Items as a `compaction_<id>` row
 *   4. Marks the summarized events as `compacted_at = NOW()`
 *
 * The agent's live context can then pull from the compaction
 * rows instead of the raw event stream.
 */
import crypto from 'node:crypto';
import dbClient from '../database/db_client';
import { getActiveProvider } from '../providers/model';

export interface CompactionConfig {
  threshold: number;
  window: number;
  maxSummaryTokens: number;
}

const DEFAULT_CONFIG: CompactionConfig = {
  threshold: 50,
  window: 25,
  maxSummaryTokens: 400,
};

export async function getCompactionConfig(): Promise<CompactionConfig> {
  try {
    const row = await dbClient.queryOne<any>(
      `SELECT value FROM Settings WHERE key = 'compaction_config'`,
    );
    if (row?.value) {
      const parsed = JSON.parse(row.value);
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch {}
  return DEFAULT_CONFIG;
}

export interface CompactionResult {
  triggered: boolean;
  eventsScanned: number;
  summaryId?: string;
  summaryText?: string;
  durationMs: number;
  reason: 'threshold' | 'manual' | 'none';
}

/**
 * Count uncompacted events for a mission. Cheap query used by
 * the caller to decide whether to trigger compaction.
 */
export async function countUncompactedEvents(missionId: string): Promise<number> {
  try {
    const row = await dbClient.queryOne<any>(
      `SELECT COUNT(*) as n FROM Event_Log WHERE mission_id = ? AND compacted_at IS NULL`,
      [missionId],
    );
    return Number(row?.n || 0);
  } catch {
    return 0;
  }
}

/**
 * If the mission has more uncompacted events than the
 * configured threshold, run a compaction pass.
 *
 * Returns `{ triggered: false, reason: 'none' }` when below
 * threshold so the caller can call this on every event write
 * without worrying about cost.
 */
export async function maybeCompact(missionId: string): Promise<CompactionResult> {
  const start = Date.now();
  const cfg = await getCompactionConfig();
  const count = await countUncompactedEvents(missionId);
  if (count < cfg.threshold) {
    return { triggered: false, eventsScanned: count, durationMs: Date.now() - start, reason: 'none' };
  }
  const result = await compactMission(missionId, cfg);
  return { ...result, durationMs: Date.now() - start, reason: 'threshold' };
}

export async function compactMission(missionId: string, cfg: CompactionConfig = DEFAULT_CONFIG): Promise<Omit<CompactionResult, 'durationMs' | 'reason'>> {
  // 1. Pull the most recent N uncompacted events.
  let events: any[] = [];
  try {
    events = await dbClient.query<any>(
      `SELECT id, event_type, summary, created_at
       FROM Event_Log
       WHERE mission_id = ? AND compacted_at IS NULL
       ORDER BY created_at DESC
       LIMIT ?`,
      [missionId, cfg.window],
    );
  } catch (err: any) {
    console.warn(`[Compaction] Failed to read events for mission ${missionId}: ${err.message}`);
    return { triggered: false, eventsScanned: 0 };
  }
  if (events.length === 0) {
    return { triggered: false, eventsScanned: 0 };
  }

  // 2. Ask the LLM to summarize.
  const lines: string[] = [];
  for (const e of events.reverse()) {
    lines.push(`- [${e.created_at}] ${e.event_type}: ${String(e.summary || '').slice(0, 500)}`);
  }
  const provider = await getActiveProvider('sub');
  let summary = '';
  try {
    const prompt = [
      `You are summarizing the recent activity log of a Supr mission.`,
      `Produce a concise summary (<= ${cfg.maxSummaryTokens} tokens) that captures:`,
      `  - What was attempted and what succeeded`,
      `  - What failed and why (only include failures, not retries)`,
      `  - Open questions / next steps for the operator`,
      `Use bullet points. Do not invent events that are not in the log.`,
      ``,
      `## Event log (oldest to newest)`,
      ...lines,
    ].join('\n');
    summary = await provider.generateContent(prompt, {
      systemInstruction: 'You are a Supr context-compaction agent. Be terse. Cite event ids when you reference a specific entry.',
      maxOutputTokens: cfg.maxSummaryTokens,
    } as any);
  } catch (err: any) {
    console.warn(`[Compaction] LLM summarize failed for mission ${missionId}: ${err.message}`);
    return { triggered: false, eventsScanned: events.length };
  }

  // 3. Write the summary to Memory_Items.
  const summaryId = `compaction-${crypto.randomUUID()}`;
  try {
    await dbClient.execute(
      `INSERT INTO Memory_Items (id, mission_id, section, content, metadata, created_at, updated_at)
       VALUES (?, ?, 'compaction', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        summaryId,
        missionId,
        summary,
        JSON.stringify({
          source: 'compaction',
          events_scanned: events.length,
          event_ids: events.map((e) => e.id),
          window_start: events[events.length - 1]?.created_at,
          window_end: events[0]?.created_at,
        }),
      ],
    );
  } catch (err: any) {
    console.warn(`[Compaction] Failed to write summary for mission ${missionId}: ${err.message}`);
    return { triggered: false, eventsScanned: events.length };
  }

  // 4. Mark the events as compacted.
  try {
    const ids = events.map((e) => e.id);
    // SQLite supports `IN (?, ?, ?)`; build the placeholders.
    const placeholders = ids.map(() => '?').join(',');
    await dbClient.execute(
      `UPDATE Event_Log SET compacted_at = CURRENT_TIMESTAMP, compaction_id = ?
       WHERE id IN (${placeholders})`,
      [summaryId, ...ids],
    );
  } catch (err: any) {
    console.warn(`[Compaction] Failed to mark events as compacted for mission ${missionId}: ${err.message}`);
  }

  return {
    triggered: true,
    eventsScanned: events.length,
    summaryId,
    summaryText: summary,
  };
}

/**
 * Read the compaction summaries for a mission, newest first.
 * The agent's live context can splice these in place of the
 * raw event stream.
 */
export async function readCompactions(missionId: string, limit = 5): Promise<Array<{ id: string; content: string; eventsScanned: number; createdAt: string }>> {
  try {
    const rows = await dbClient.query<any>(
      `SELECT id, content, metadata, created_at
       FROM Memory_Items
       WHERE mission_id = ? AND section = 'compaction'
       ORDER BY created_at DESC
       LIMIT ?`,
      [missionId, limit],
    );
    return (rows || []).map((row) => {
      let meta: any = {};
      try { meta = JSON.parse(row.metadata || '{}'); } catch {}
      return {
        id: row.id,
        content: String(row.content || ''),
        eventsScanned: Number(meta.events_scanned || 0),
        createdAt: row.created_at,
      };
    });
  } catch {
    return [];
  }
}
