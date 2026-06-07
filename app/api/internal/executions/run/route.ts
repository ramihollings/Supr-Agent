import { requireInternalOidc } from '@/lib/internal-auth';
import { runExecution } from '@/lib/runtime/durable-executions';

export const dynamic = 'force-dynamic';
export const maxDuration = 1800;

export async function POST(request: Request) {
  const auth = await requireInternalOidc(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  if (typeof body.executionId !== 'string' || !body.executionId) {
    return Response.json({ ok: false, error: 'executionId is required.' }, { status: 400 });
  }
  return Response.json({ ok: true, ...(await runExecution(body.executionId)) });
}
