import dbClient from '@/lib/database/db_client';
import { requireInternalOidc } from '@/lib/internal-auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireInternalOidc(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  if (typeof body.executionId !== 'string' || !body.executionId) {
    return Response.json({ ok: false, error: 'executionId is required.' }, { status: 400 });
  }
  await dbClient.runTransaction([
    {
      sql: `UPDATE Job_Executions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status IN ('queued','running','needs_approval')`,
      params: [body.executionId],
    },
    {
      sql: `UPDATE Agent_Sessions SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
            WHERE id = (SELECT session_id FROM Job_Executions WHERE id = ?)`,
      params: [body.executionId],
    },
  ]);
  return Response.json({ ok: true });
}
