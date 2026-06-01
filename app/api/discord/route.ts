import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { getSecretSetting, getSettingValue } from '@/lib/secrets';
import { routeIntakeToProjectFlow } from '@/lib/runtime/project-flow';

export const dynamic = 'force-dynamic';

async function verifyDiscordToken(req: NextRequest) {
  const configured = await getSecretSetting('discord_webhook_token', process.env.DISCORD_WEBHOOK_TOKEN);
  if (!configured) return false;

  const token = req.headers.get('x-supr-discord-token') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const tokenBuffer = Buffer.from(token);
  const configuredBuffer = Buffer.from(configured);
  return tokenBuffer.length === configuredBuffer.length && crypto.timingSafeEqual(tokenBuffer, configuredBuffer);
}

export async function POST(req: NextRequest) {
  const enabled = await getSettingValue('channels_discord');
  if (enabled === 'false') {
    return Response.json({ ok: false, error: 'Discord channel is disabled.' }, { status: 403 });
  }

  const verified = await verifyDiscordToken(req);
  if (!verified) {
    return Response.json({ ok: false, error: 'Invalid Discord webhook token.' }, { status: 401 });
  }

  const payload = await req.json();
  const content = String(payload?.content || payload?.message?.content || payload?.event?.text || '').trim();
  const actorId = String(payload?.author?.id || payload?.user?.id || payload?.actorId || 'discord');
  const projectId = typeof payload?.projectId === 'string' ? payload.projectId : null;
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : [];

  if (!content) {
    return Response.json({ ok: true, ignored: true, reason: 'No text content.' });
  }

  const routed = await routeIntakeToProjectFlow({
    source: 'discord',
    content,
    projectId,
    actorId,
    attachments,
  });
  return Response.json({ ok: routed.success, ...routed }, { status: routed.success ? 200 : 400 });
}
