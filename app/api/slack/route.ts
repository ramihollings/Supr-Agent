import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import dbClient from '@/lib/database/db_client';
import { getSecretSetting, getSettingValue } from '@/lib/secrets';
import { routeIntakeToProjectFlow } from '@/lib/runtime/project-flow';

export const dynamic = 'force-dynamic';

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

async function verifySlackSignature(req: NextRequest, rawBody: string) {
  const signingSecret = await getSecretSetting('slack_signing_secret', process.env.SLACK_SIGNING_SECRET);
  if (!signingSecret) return false;

  const signature = req.headers.get('x-slack-signature') || '';
  const timestamp = req.headers.get('x-slack-request-timestamp') || '';
  const requestTime = Number(timestamp);
  if (!signature || !requestTime) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - requestTime) > 60 * 5) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac('sha256', signingSecret).update(base).digest('hex')}`;
  return safeEqual(signature, expected);
}

async function storeRejected(command: string, actorId: string, payload: unknown, response: string) {
  await dbClient.execute(
    `INSERT INTO Channel_Commands (id, source, command, payload, status, actor_id, response)
     VALUES (?, 'slack', ?, ?, 'rejected', ?, ?)`,
    [`cmd-${crypto.randomUUID()}`, command || '[empty]', JSON.stringify(payload), actorId, response],
  );
}

export async function POST(req: NextRequest) {
  const enabled = await getSettingValue('channels_slack');
  if (enabled === 'false') {
    return Response.json({ ok: false, error: 'Slack channel is disabled.' }, { status: 403 });
  }

  const rawBody = await req.text();
  const verified = await verifySlackSignature(req, rawBody);
  if (!verified) {
    await storeRejected('[unverified]', 'slack', { headers: { retry: req.headers.get('x-slack-retry-num') } }, 'Invalid Slack signature.');
    return Response.json({ ok: false, error: 'Invalid Slack signature.' }, { status: 401 });
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (payload?.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge });
  }

  const event = payload?.event || payload;
  const content = String(event?.text || payload?.text || '').trim();
  const actorId = String(event?.user || payload?.user_id || event?.channel || 'slack');
  const projectId = typeof payload?.projectId === 'string' ? payload.projectId : null;
  const attachments = Array.isArray(event?.files) ? event.files : Array.isArray(payload?.files) ? payload.files : [];

  if (!content) {
    return Response.json({ ok: true, ignored: true, reason: 'No text content.' });
  }

  const routed = await routeIntakeToProjectFlow({
    source: 'slack',
    content,
    projectId,
    actorId,
    attachments,
  });
  return Response.json({ ok: routed.success, ...routed }, { status: routed.success ? 200 : 400 });
}
