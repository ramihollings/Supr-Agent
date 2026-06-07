import { requireApiAuth } from '@/lib/auth';
import { submitExecution, type ExecutionSource } from '@/lib/runtime/durable-executions';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  if (typeof body.missionId !== 'string' || !body.missionId) {
    return Response.json({ ok: false, error: 'missionId is required.' }, { status: 400 });
  }
  const allowedSources: ExecutionSource[] = ['web', 'api'];
  const source: ExecutionSource = allowedSources.includes(body.source) ? body.source : 'web';
  const result = await submitExecution({
    missionId: body.missionId,
    source,
    idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : undefined,
  });
  return Response.json({ ok: true, ...result }, { status: 202 });
}
