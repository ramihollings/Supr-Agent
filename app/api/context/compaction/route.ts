import { NextRequest, NextResponse } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import {
  getCompactionConfig,
  maybeCompact,
  compactMission,
  countUncompactedEvents,
  readCompactions,
  type CompactionConfig,
} from '@/lib/context/compaction';
import dbClient from '@/lib/database/db_client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  const cfg = await getCompactionConfig();
  const missionId = req.nextUrl.searchParams.get('missionId') || undefined;
  if (missionId) {
    const [count, compactions] = await Promise.all([
      countUncompactedEvents(missionId),
      Promise.resolve(readCompactions(missionId, 10)),
    ]);
    return NextResponse.json({ ok: true, config: cfg, missionId, uncompactedEvents: count, compactions });
  }
  return NextResponse.json({ ok: true, config: cfg });
}

export async function POST(req: NextRequest) {
  // Two operations are supported:
  //   1. { action: 'update_config', config: { ... } }
  //   2. { action: 'compact', missionId: '...' }
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body.' }, { status: 400 });
  }
  const action = String(body?.action || '');
  if (action === 'update_config') {
    const incoming: Partial<CompactionConfig> = body?.config || {};
    if (typeof incoming.threshold !== 'number' || incoming.threshold < 1 || incoming.threshold > 10_000) {
      return NextResponse.json({ ok: false, error: 'threshold must be between 1 and 10000.' }, { status: 400 });
    }
    if (typeof incoming.window !== 'number' || incoming.window < 1 || incoming.window > 1_000) {
      return NextResponse.json({ ok: false, error: 'window must be between 1 and 1000.' }, { status: 400 });
    }
    if (typeof incoming.maxSummaryTokens !== 'number' || incoming.maxSummaryTokens < 50 || incoming.maxSummaryTokens > 4_000) {
      return NextResponse.json({ ok: false, error: 'maxSummaryTokens must be between 50 and 4000.' }, { status: 400 });
    }
    const merged = { ...await getCompactionConfig(), ...incoming };
    try {
      await dbClient.execute(
        `INSERT INTO Settings (key, value, updated_at)
         VALUES ('compaction_config', ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
        [JSON.stringify(merged)],
      );
    } catch (err: any) {
      return NextResponse.json({ ok: false, error: `Failed to persist: ${err.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, config: merged });
  }
  if (action === 'compact') {
    const missionId = String(body?.missionId || '');
    if (!missionId) {
      return NextResponse.json({ ok: false, error: 'missionId is required.' }, { status: 400 });
    }
    const result = await compactMission(missionId);
    return NextResponse.json({ ok: true, ...result });
  }
  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
