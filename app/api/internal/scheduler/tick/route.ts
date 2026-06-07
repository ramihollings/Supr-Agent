import { requireInternalOidc } from '@/lib/internal-auth';
import { schedulerTick } from '@/lib/runtime/durable-executions';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await requireInternalOidc(request);
  if (auth) return auth;
  return Response.json({ ok: true, ...(await schedulerTick()) });
}
