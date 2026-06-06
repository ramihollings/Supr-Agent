import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import dbClient from '@/lib/database/db_client';
import { notifyTeamEvent } from '@/lib/events/team-bus';

export const dynamic = 'force-dynamic';

/**
 * Cancel a running team. The team coordinator runs every member
 * inside an LLM call, so we can't truly abort the in-flight work
 * without an AbortController plumbed all the way through the
 * provider. Instead we:
 *   1. Mark the team as `cancelled` in Team_Runs
 *   2. Publish a `team_failed` event with a "cancelled" tone so
 *      the live status bar updates immediately
 *   3. Let the coordinator finish naturally; its result will be
 *      discarded by the UI because the chip already shows failed
 *
 * The mark + notify is idempotent — calling cancel twice on the
 * same team is a no-op.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const { teamId } = await params;
  if (!teamId) return new Response('teamId required', { status: 400 });

  const rows = (await dbClient
    .query<{ name: string; mission_id: string | null; status: string }>(
      `SELECT name, mission_id, status FROM Team_Runs WHERE team_id = ?`,
      [teamId],
    )
    .catch(() => [] as any[])) as any[];
  const team = rows[0];
  if (!team) return new Response('Team not found', { status: 404 });
  if (team.status === 'completed' || team.status === 'cancelled' || team.status === 'failed') {
    return Response.json({
      ok: true,
      alreadyTerminal: true,
      status: team.status,
    });
  }

  await dbClient.execute(
    `UPDATE Team_Runs
        SET status = 'cancelled',
            completed_at = ?,
            error = COALESCE(error, 'Cancelled by operator.')
      WHERE team_id = ?`,
    [new Date().toISOString(), teamId],
  );

  notifyTeamEvent({
    teamId,
    missionId: team.mission_id,
    name: team.name,
    reason: 'team_failed',
    payload: {
      status: 'cancelled',
      cancelled: true,
      memberCount: 0,
      completedCount: 0,
      failedCount: 0,
    },
  });

  return Response.json({ ok: true, status: 'cancelled' });
}
