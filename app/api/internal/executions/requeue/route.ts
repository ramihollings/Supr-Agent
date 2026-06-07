import { requireInternalOidc } from '@/lib/internal-auth';
import { requeueDeadLetterExecution } from '@/lib/runtime/durable-executions';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireInternalOidc(request);
  if (auth) return auth;
  const body = await request.json().catch(() => ({}));
  if (typeof body.executionId !== 'string' || !body.executionId) {
    return Response.json({ ok: false, error: 'executionId is required.' }, { status: 400 });
  }
  const result = await requeueDeadLetterExecution(body.executionId);
  return Response.json({ ok: result.requeued, ...result }, { status: result.requeued ? 202 : 409 });
}
