import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { composioBridge } from '@/lib/tools/composio';

export const dynamic = 'force-dynamic';

/**
 * Composio bridge health probe. The Settings page calls this from
 * the "Test Connection" button. The response is intentionally
 * minimal so the operator can see at a glance:
 *   - whether the API key is configured
 *   - whether the bridge can reach the upstream Composio API
 *   - a count of available apps (sanity check that the response
 *     is non-empty)
 */
export async function POST(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  void req;

  const startedAt = Date.now();
  try {
    const apps = await composioBridge.listApps();
    const elapsed = Date.now() - startedAt;
    return Response.json({
      ok: true,
      elapsedMs: elapsed,
      appCount: apps.length,
      firstApps: apps.slice(0, 3).map((a) => ({ key: a.key, name: a.name })),
    });
  } catch (error: any) {
    return Response.json(
      {
        ok: false,
        elapsedMs: Date.now() - startedAt,
        error: error.message || String(error),
      },
      { status: 200 },
    );
  }
}
