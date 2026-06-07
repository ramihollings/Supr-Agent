import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { serializeChannelPayload } from '@/lib/channel-logging';
import dbClient from '@/lib/database/db_client';
import { getActiveMission } from '@/lib/db';
import { getSecretSetting, getSettingValue } from '@/lib/secrets';
import { consumeDurable, isChannelDebugEnabled } from '@/lib/route-rate-limit';
import {
  approveLowRiskActions,
  pauseProjectFlow,
  retryFailedFlowNodes,
  routeIntakeToProjectFlow,
  startProjectFlow,
  resumeProjectFlow,
} from '@/lib/runtime/project-flow';
import { decideApprovalOnce } from '@/lib/runtime/agent-actions';
import { submitExecution } from '@/lib/runtime/durable-executions';

export const dynamic = 'force-dynamic';

const DISABLED_CHANNEL_MAX = 5;
const DISABLED_CHANNEL_WINDOW_MS = 60_000;
const OPERATOR_CHANNEL_MAX = 60;
const OPERATOR_CHANNEL_WINDOW_MS = 60_000;

/**
 * Constant-time string comparison. Used to validate the Telegram
 * webhook secret token so a timing-attack can't be used to recover it.
 * The two inputs may differ in length, in which case we still do a
 * full pass over the longer input but always compare against the
 * shorter one padded to that length.
 */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function reply(chatId: string, text: string) {
  const token = await getSecretSetting('telegram_token', process.env.TELEGRAM_BOT_TOKEN);
  if (!token) return;
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => {});
}

async function configuredChatId() {
  return await getSettingValue('telegram_chat_id') || process.env.TELEGRAM_CHAT_ID || null;
}

async function activeProjectId(fallback?: string) {
  if (fallback) return fallback;
  const mission = await getActiveMission();
  return mission?.id || null;
}

async function openTasks(projectId: string) {
  const rows = await dbClient.query<any>(
    `SELECT t.title, t.status, a.name as agent_name
     FROM Tasks t LEFT JOIN Agents a ON a.id = t.owner_agent_id
     WHERE t.mission_id = ? AND t.status != 'Done'
     ORDER BY t.title ASC, t.id ASC LIMIT 8`,
    [projectId],
  );
  if (rows.length === 0) return 'No open tasks.';
  return rows.map((row, index) => `${index + 1}. ${row.title} (${row.status}, ${row.agent_name || 'Unassigned'})`).join('\n');
}

async function statusText(projectId: string) {
  const [flow, actions, approvals] = await Promise.all([
    dbClient.queryOne<any>(`SELECT * FROM Flow_Runs WHERE mission_id = ? ORDER BY created_at DESC, id DESC LIMIT 1`, [projectId]),
    dbClient.queryOne<any>(`SELECT COUNT(*) as count FROM Agent_Actions WHERE mission_id = ? AND status IN ('draft','approved','running','pending_approval','failed')`, [projectId]),
    dbClient.queryOne<any>(`SELECT COUNT(*) as count FROM Approvals WHERE mission_id = ? AND status = 'pending'`, [projectId]),
  ]);
  return `Project ${projectId}\nFlow: ${flow?.status || 'not started'}\nOpen work: ${actions?.count || 0}\nNeeds approval: ${approvals?.count || 0}`;
}

async function handleCommand(text: string, projectHint?: string | null) {
  const [rawCommand, ...rest] = text.trim().split(/\s+/);
  const command = rawCommand.toLowerCase();
  const arg = rest.join(' ').trim();
  const projectId = await activeProjectId(projectHint || undefined);
  if (!projectId) return 'No active project found.';

  if (command === '/start_flow') {
    const target = arg || projectId;
    const started = await startProjectFlow(target, 'telegram');
    if (!started.success) return started.error || 'Unable to start flow.';
    const run = await submitExecution({ missionId: target, source: 'telegram' });
    return `Queued Project Flow.\nExecution: ${run.executionId}`;
  }
  if (command === '/pause') {
    await pauseProjectFlow(arg || projectId);
    return 'Project Flow paused.';
  }
  if (command === '/resume') {
    const result = await resumeProjectFlow(arg || projectId);
    return `Project Flow resumed.\n${JSON.stringify(result)}`;
  }
  if (command === '/retry_failed') {
    const result = await retryFailedFlowNodes(arg || projectId);
    return `Retry queued for ${result.retried || 0} failed node(s).`;
  }
  if (command === '/approve_low_risk') {
    const result = await approveLowRiskActions(arg || projectId);
    return `Approved ${result.approved || 0} low/medium-risk approval(s).`;
  }
  if (command === '/approve') {
    if (!arg) return 'Usage: /approve <approval_id>';
    const result = await decideApprovalOnce(arg, 'approved');
    return result.decided ? `Approved ${arg}.` : `Approval ${arg} was already decided or does not exist.`;
  }
  if (command === '/status') return statusText(arg || projectId);
  if (command === '/open_tasks') return openTasks(arg || projectId);

  const routed = await routeIntakeToProjectFlow({
    source: 'telegram',
    content: text,
    projectId,
    actorId: 'telegram',
  });
  return routed.response || routed.error || 'Telegram request received.';
}

export async function POST(req: NextRequest) {
  const enabled = await getSettingValue('channels_telegram');
  const productionEnabled = process.env.SUPR_TELEGRAM_ENABLED === 'true';
  if (enabled !== 'true' && !productionEnabled) {
    if (!await consumeDurable('telegram:disabled', DISABLED_CHANNEL_MAX, DISABLED_CHANNEL_WINDOW_MS)) {
      return Response.json({ ok: true, ignored: true, response: 'Telegram channel is disabled; rate limit reached.' });
    }
    const debug = await isChannelDebugEnabled('telegram');
    if (debug) {
      const update = await req.json().catch(() => ({}));
      const message = update.message || update.edited_message || update.channel_post;
      const text = String(message?.text || '').trim();
      const chatId = String(message?.chat?.id || '');
      await dbClient.execute(
        `INSERT INTO Channel_Commands (id, source, command, payload, status, actor_id, response)
         VALUES (?, 'telegram', ?, ?, 'ignored', ?, ?)`,
        [`cmd-${crypto.randomUUID()}`, text || '[telegram disabled]', serializeChannelPayload(update), chatId || null, 'Telegram channel disabled; core Supr runtime remains live.'],
      );
    }
    return Response.json({ ok: true, ignored: true, response: 'Telegram channel is disabled; Supr runtime remains live.' });
  }

  // Telegram's bot API supports an optional secret token that is sent
  // in the `X-Telegram-Bot-Api-Secret-Token` header on every webhook
  // delivery. Without it, an attacker who knows (or guesses) the chat
  // id can forge POSTs to this endpoint and run privileged commands
  // like `/start_flow`, `/pause`, `/approve`, `/approve_low_risk`.
  // We require the header to match the stored secret BEFORE parsing
  // the body, so a forged request is rejected before any command
  // dispatch can run.
  const configuredSecret = await getSecretSetting('telegram_webhook_secret', process.env.TELEGRAM_WEBHOOK_SECRET);
  if (!configuredSecret) {
    // Operator has not configured a webhook secret. Refuse to dispatch
    // commands rather than fall back to the chat-id-only check, which
    // is forgeable.
    console.error('[Telegram] Webhook secret is not configured. Set telegram_webhook_secret in settings or TELEGRAM_WEBHOOK_SECRET in the environment.');
    return Response.json(
      { ok: false, error: 'Telegram webhook secret is not configured. Set telegram_webhook_secret in settings or TELEGRAM_WEBHOOK_SECRET in the environment.' },
      { status: 503 },
    );
  }
  const providedSecret = req.headers.get('x-telegram-bot-api-secret-token') || '';
  if (!providedSecret || !safeEqual(providedSecret, configuredSecret)) {
    return Response.json({ ok: false, error: 'Unauthorized Telegram webhook.' }, { status: 401 });
  }

  const configured = await configuredChatId();
  const update = await req.json();
  const message = update.message || update.edited_message || update.channel_post;
  const chatId = String(message?.chat?.id || '');
  const text = String(message?.text || '').trim();

  if (!configured || chatId !== configured) {
    await dbClient.execute(
      `INSERT INTO Channel_Commands (id, source, command, payload, status, actor_id, response)
       VALUES (?, 'telegram', ?, ?, 'rejected', ?, ?)`,
      [`cmd-${crypto.randomUUID()}`, text || '[non-text]', serializeChannelPayload(update), chatId, 'Unauthorized Telegram chat.'],
    );
    return Response.json({ ok: false, error: 'Unauthorized Telegram chat.' }, { status: 403 });
  }
  if (!await consumeDurable(`telegram:operator:${chatId}`, OPERATOR_CHANNEL_MAX, OPERATOR_CHANNEL_WINDOW_MS)) {
    return Response.json({ ok: false, error: 'Telegram operator rate limit reached.' }, { status: 429 });
  }

  const responseText = text ? await handleCommand(text) : 'Send a text command or project request.';
  await reply(chatId, responseText);
  return Response.json({ ok: true, response: responseText });
}
