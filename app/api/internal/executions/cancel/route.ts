import { requireInternalOidc } from '@/lib/internal-auth';
import { cancelExecution } from '@/lib/runtime/durable-executions';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireInternalOidc(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  if (typeof body.executionId !== 'string' || !body.executionId) {
    return Response.json({ ok: false, error: 'executionId is required.' }, { status: 400 });
  }
  return Response.json({ ok: true, ...(await cancelExecution(body.executionId)) });
}
