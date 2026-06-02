import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { getProductionHealth } from '@/lib/production-health';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await requireApiAuth(request);
  if (auth) return auth;

  const probeModel = request.nextUrl.searchParams.get('probe') === 'model';
  const health = await getProductionHealth({ probeModel });
  const status = health.status === 'fail' ? 503 : 200;
  return Response.json(health, { status });
}
