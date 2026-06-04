import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { composioBridge } from '@/lib/tools/composio';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  try {
    const connections = await composioBridge.listConnections();
    return Response.json({ ok: true, count: connections.length, connections });
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
