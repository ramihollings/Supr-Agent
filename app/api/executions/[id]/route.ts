import { requireApiAuth } from '@/lib/auth';
import { getExecution } from '@/lib/runtime/durable-executions';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request);
  if (auth) return auth;
  const { id } = await context.params;
  const execution = await getExecution(id);
  return execution
    ? Response.json({ ok: true, execution })
    : Response.json({ ok: false, error: 'Execution not found.' }, { status: 404 });
}
