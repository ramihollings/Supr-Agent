import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import dbClient from '@/lib/database/db_client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const url = new URL(req.url);
  const missionId = url.searchParams.get('missionId');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10', 10), 50);

  const params: any[] = [];
  let where = '';
  if (missionId) {
    where = 'WHERE mission_id = ?';
    params.push(missionId);
  }
  const sql = `
    SELECT team_id, mission_id, name, status, member_count, coordination_mode, started_at, completed_at, checksum
      FROM Team_Runs
      ${where}
     ORDER BY started_at DESC
     LIMIT ?
  `;
  params.push(limit);

  const rows = await dbClient
    .query<any>(sql, params)
    .catch(() => [] as any[]);

  return Response.json({
    teams: rows.map((r) => ({
      teamId: r.team_id,
      missionId: r.mission_id,
      name: r.name,
      status: r.status,
      memberCount: r.member_count,
      coordinationMode: r.coordination_mode,
      startedAt: r.started_at,
      completedAt: r.completed_at,
      checksum: r.checksum,
    })),
  });
}
