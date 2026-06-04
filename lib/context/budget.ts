/**
 * Context budget enforcement for subagent spawns.
 *
 * Per Blueprint 5.0 Part 3.3, when spinning up a subagent we do not
 * pass the entire project history. We select only the most relevant
 * operational fragments and stay within a strict token budget.
 *
 * The default budget is ~1,900 tokens (the figure the blueprint
 * calls out as a sensible per-subagent cap), but it is configurable
 * per-user and per-mission via the Settings table:
 *   - subagent_token_budget:  default 1900
 *   - subagent_context_window: default 4096
 *
 * The rough token estimator is `words * 1.33` (the OpenAI rule of
 * thumb). It is intentionally not exact — a real token counter would
 * be model-specific. The goal is to keep the budget bounded, not to
 * hit an exact count.
 */
import dbClient from '../database/db_client';

export interface ContextFragment {
  /** Stable id for dedup; e.g. mission id, timeline id, memory item id. */
  id: string;
  /** Where this fragment came from (mission, memory, skill, error). */
  source: 'mission' | 'memory' | 'skill' | 'error' | 'meta' | 'tool-result';
  /** Short title for UI/log display. */
  title: string;
  /** Body content. Newlines and markdown are fine. */
  body: string;
  /** Higher priority fragments are kept first when the budget overflows. */
  priority: number;
}

const DEFAULT_TOKEN_BUDGET = 1_900;
const APPROX_TOKENS_PER_WORD = 1.33;

export async function getSubagentTokenBudget(agentId?: string): Promise<number> {
  try {
    const row = await dbClient.queryOne<any>(
      `SELECT value FROM Settings WHERE key = 'subagent_token_budget'`,
    );
    if (row?.value) {
      const n = Number(row.value);
      if (Number.isFinite(n) && n > 0) return n;
    }
  } catch {}
  return DEFAULT_TOKEN_BUDGET;
}

export function estimateTokens(text: string): number {
  if (!text) return 0;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(words * APPROX_TOKENS_PER_WORD);
}

/**
 * Pack a list of fragments into a single system-prompt section
 * while staying under the token budget. Fragments are sorted by
 * priority (descending) and dropped from the tail if they would
 * overflow the budget. A final summary line records what was
 * dropped so the agent knows more context exists.
 */
export function packContext(fragments: ContextFragment[], tokenBudget: number): {
  packed: string;
  kept: ContextFragment[];
  dropped: ContextFragment[];
  usedTokens: number;
} {
  const sorted = [...fragments].sort((a, b) => b.priority - a.priority);
  const kept: ContextFragment[] = [];
  const dropped: ContextFragment[] = [];
  let used = 0;
  for (const f of sorted) {
    const headerTokens = estimateTokens(`[${f.source}] ${f.title}\n`);
    const bodyTokens = estimateTokens(f.body);
    const total = headerTokens + bodyTokens;
    if (used + total <= tokenBudget) {
      kept.push(f);
      used += total;
    } else {
      dropped.push(f);
    }
  }
  const sections: string[] = [];
  for (const f of kept) {
    sections.push(`[${f.source}] ${f.title}\n${f.body}`);
  }
  if (dropped.length > 0) {
    sections.push(
      `[meta] ${dropped.length} additional context fragment(s) were dropped to stay under the ${tokenBudget}-token budget. Request a wider budget via Settings → subagent_token_budget if needed.`,
    );
  }
  return {
    packed: sections.join('\n\n'),
    kept,
    dropped,
    usedTokens: used,
  };
}

/**
 * Select and pack the most relevant context fragments for a
 * subagent spawn. Reads mission summary, recent timeline, the
 * most recent N memory items, and the caller's task description,
 * then packs them under the configured budget.
 */
export async function assembleSubagentContext(input: {
  missionId?: string;
  task: string;
  skillBody?: string;
  recentErrors?: Array<{ title: string; body: string }>;
  maxMemoryItems?: number;
}): Promise<{ packed: string; usedTokens: number; budget: number; keptCount: number; droppedCount: number }> {
  const budget = await getSubagentTokenBudget();
  const fragments: ContextFragment[] = [];
  fragments.push({
    id: 'task',
    source: 'meta',
    title: 'Task',
    body: input.task,
    priority: 100,
  });
  if (input.skillBody) {
    fragments.push({
      id: 'skill',
      source: 'skill',
      title: 'Skill instructions',
      body: input.skillBody,
      priority: 90,
    });
  }
  if (input.missionId) {
    try {
      const mission = await dbClient.queryOne<any>(
        `SELECT id, name, objective, status FROM Missions WHERE id = ?`,
        [input.missionId],
      );
      if (mission) {
        fragments.push({
          id: `mission-${mission.id}`,
          source: 'mission',
          title: `Mission: ${mission.name}`,
          body: `Objective: ${mission.objective}\nStatus: ${mission.status}`,
          priority: 80,
        });
      }
      const timeline = await dbClient.query<any>(
        `SELECT id, event_type, summary FROM Event_Log
         WHERE mission_id = ? ORDER BY created_at DESC LIMIT 5`,
        [input.missionId],
      );
      for (const t of timeline || []) {
        fragments.push({
          id: `evt-${t.id}`,
          source: 'mission',
          title: t.event_type,
          body: String(t.summary || ''),
          priority: 50,
        });
      }
    } catch {}
    try {
      const memRows = await dbClient.query<any>(
        `SELECT id, section, content FROM Memory_Items
         WHERE mission_id = ? OR mission_id IS NULL
         ORDER BY updated_at DESC LIMIT ?`,
        [input.missionId, input.maxMemoryItems || 3],
      );
      for (const m of memRows || []) {
        fragments.push({
          id: `mem-${m.id}`,
          source: 'memory',
          title: m.section,
          body: String(m.content || ''),
          priority: 60,
        });
      }
    } catch {}
  }
  if (input.recentErrors) {
    for (const err of input.recentErrors) {
      fragments.push({
        id: `err-${err.title}`,
        source: 'error',
        title: err.title,
        body: err.body,
        priority: 70,
      });
    }
  }
  const result = packContext(fragments, budget);
  return {
    packed: result.packed,
    usedTokens: result.usedTokens,
    budget,
    keptCount: result.kept.length,
    droppedCount: result.dropped.length,
  };
}
