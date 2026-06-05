import { NextRequest } from 'next/server';
import dbClient from '@/lib/database/db_client';
import { requireApiAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const missionId = url.searchParams.get('missionId');

  if (!missionId) {
    return Response.json({ nodes: [], recentFailures: [], eventCount: 0, runCount: 0 });
  }

  // Pull the last 25 events and the 12 most recent Agent_Runs (both
  // ordered newest-first) and join them into a reasoning tree the
  // page can render without a custom backend. We don't need a strict
  // schema here — the page maps the rows onto its own ReasoningNode
  // shape and degrades gracefully when fields are missing.
  const events = await dbClient
    .query<any>(
      `SELECT id, event_type, actor_id, summary, detail, target_agent, timestamp
         FROM Event_Log
        WHERE mission_id = ?
        ORDER BY timestamp DESC
        LIMIT 25`,
      [missionId],
    )
    .catch(() => [] as any[]);

  const runs = await dbClient
    .query<any>(
      `SELECT id, status, started_at, completed_at, updated_at, error
         FROM Agent_Runs
        WHERE mission_id = ?
        ORDER BY COALESCE(completed_at, updated_at, started_at) DESC
        LIMIT 12`,
      [missionId],
    )
    .catch(() => [] as any[]);

  const recentFailures = runs
    .filter((r) => r.status === 'failed' || r.error)
    .slice(0, 5)
    .map((r) => ({
      id: r.id,
      status: r.status,
      error: r.error ? String(r.error).slice(0, 240) : null,
      at: r.completed_at || r.updated_at || r.started_at || null,
    }));

  return Response.json({
    nodes: events.map((e, i) => {
      let detail = '';
      let target = '';
      try {
        const m = e.detail ? JSON.parse(e.detail) : null;
        detail = m?.detail || '';
        target = m?.targetAgent || '';
      } catch {
        /* not JSON */
      }
      return {
        id: e.id,
        label: e.summary || `${e.event_type} by ${e.actor_id || 'system'}`,
        status:
          e.event_type === 'failure' || e.event_type === 'escalation'
            ? 'failed'
            : e.event_type === 'agent_action' || e.event_type === 'artifact'
              ? 'passed'
              : 'pending',
        timestamp: e.timestamp,
        actor: e.actor_id,
        targetAgent: target,
        thoughtProcess: detail || e.summary || '',
        actionTaken: e.summary || '',
      };
    }),
    recentFailures,
    eventCount: events.length,
    runCount: runs.length,
  });
}
