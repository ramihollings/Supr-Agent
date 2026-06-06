import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { toolRegistry } from '@/lib/tools/registry';

export const dynamic = 'force-dynamic';
// Team runs can take several minutes (planner + N parallel members).
// Allow the streaming/standard request up to 5 minutes.
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const body = await req.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const sharedBrief = typeof body?.sharedBrief === 'string' ? body.sharedBrief.trim() : '';
  const coordinationMode = body?.coordinationMode === 'chain' ? 'chain' : 'pipeline';
  const missionId = typeof body?.missionId === 'string' ? body.missionId : undefined;
  const members = Array.isArray(body?.members) ? body.members : [];

  if (!name) return Response.json({ ok: false, error: 'Team name is required.' }, { status: 400 });
  if (!sharedBrief) return Response.json({ ok: false, error: 'Shared brief is required.' }, { status: 400 });
  if (name.length > 120) return Response.json({ ok: false, error: 'Team name must be 120 chars or fewer.' }, { status: 400 });
  if (sharedBrief.length > 16_000) return Response.json({ ok: false, error: 'Shared brief must be 16,000 chars or fewer.' }, { status: 400 });
  for (const m of members) {
    if (typeof m?.name !== 'string' || m.name.length === 0 || m.name.length > 120) {
      return Response.json({ ok: false, error: 'Each extra member needs a non-empty name <= 120 chars.' }, { status: 400 });
    }
  }

  const tool = toolRegistry.getTool('spawn_subagent_team');
  if (!tool) {
    return Response.json({ ok: false, error: 'spawn_subagent_team tool is not registered.' }, { status: 500 });
  }

  try {
    const result = await tool.execute(
      { name, sharedBrief, coordinationMode, missionId, members },
      { agentId: 'u-spawn', missionId },
    );
    return Response.json({ ok: true, report: typeof result === 'string' ? result : String(result) });
  } catch (err: any) {
    return Response.json({ ok: false, error: err?.message || String(err) }, { status: 200 });
  }
}
