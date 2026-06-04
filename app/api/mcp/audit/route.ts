import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { queryMcpAudit } from '@/lib/mcp/audit';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const serverId = req.nextUrl.searchParams.get('serverId') || undefined;
  const agentId = req.nextUrl.searchParams.get('agentId') || undefined;
  const missionId = req.nextUrl.searchParams.get('missionId') || undefined;
  const limit = Number(req.nextUrl.searchParams.get('limit') || '50');
  const rows = await queryMcpAudit({ serverId, agentId, missionId, limit });
  return Response.json({ ok: true, count: rows.length, entries: rows });
}
