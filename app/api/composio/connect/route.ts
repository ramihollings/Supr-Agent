import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { composioBridge } from '@/lib/tools/composio';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  let body: any;
  try { body = await req.json(); } catch {
    return Response.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }
  const app = String(body?.app || '');
  if (!app || !/^[a-zA-Z0-9._-]+$/.test(app)) {
    return Response.json({ ok: false, error: 'Invalid app name.' }, { status: 400 });
  }
  try {
    const result = await composioBridge.initiateConnection(app);
    return Response.json({ ok: true, app, ...result });
  } catch (err: any) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
