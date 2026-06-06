import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import dbClient from '@/lib/database/db_client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;

  const { teamId } = await params;
  if (!teamId) return new Response('teamId required', { status: 400 });

  const members = await dbClient
    .query<any>(
      `SELECT member_id, slot, name, role, task, permission_tier, tools, target_files, status, result, error, created_at, completed_at
         FROM Team_Members
        WHERE team_id = ?
        ORDER BY created_at ASC`,
      [teamId],
    )
    .catch(() => [] as any[]);

  const context = await dbClient
    .query<any>(
      `SELECT key, value, updated_by, updated_at
         FROM Team_Context
        WHERE team_id = ?
        ORDER BY updated_at ASC`,
      [teamId],
    )
    .catch(() => [] as any[]);

  const messages = await dbClient
    .query<any>(
      `SELECT id, from_member_id, to_member_id, kind, body, created_at
         FROM Team_Messages
        WHERE team_id = ?
        ORDER BY created_at ASC
        LIMIT 200`,
      [teamId],
    )
    .catch(() => [] as any[]);

  return Response.json({
    members: members.map((m) => ({
      memberId: m.member_id,
      slot: m.slot,
      name: m.name,
      role: m.role,
      task: m.task,
      permissionTier: m.permission_tier,
      tools: safeJson(m.tools, []),
      targetFiles: safeJson(m.target_files, []),
      status: m.status,
      result: m.result,
      error: m.error,
      createdAt: m.created_at,
      completedAt: m.completed_at,
    })),
    context: context.map((c) => ({
      key: c.key,
      value: c.value,
      updatedBy: c.updated_by,
      updatedAt: c.updated_at,
    })),
    messages: messages.map((m) => ({
      id: m.id,
      from: m.from_member_id,
      to: m.to_member_id,
      kind: m.kind,
      body: m.body,
      createdAt: m.created_at,
    })),
  });
}

function safeJson<T>(text: string | null | undefined, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
