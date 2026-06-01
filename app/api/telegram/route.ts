import { NextRequest } from 'next/server';
import dbClient from '@/lib/database/db_client';
import { getActiveMission } from '@/lib/db';
import { getSecretSetting, getSettingValue } from '@/lib/secrets';
import {
  approveLowRiskActions,
  pauseProjectFlow,
  retryFailedFlowNodes,
  routeIntakeToProjectFlow,
  runProjectFlow,
  startProjectFlow,
  resumeProjectFlow,
} from '@/lib/runtime/project-flow';
import { resumeAgentActionFromApproval } from '@/lib/runtime/agent-actions';

export const dynamic = 'force-dynamic';

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
     ORDER BY t.rowid ASC LIMIT 8`,
    [projectId],
  );
  if (rows.length === 0) return 'No open tasks.';
  return rows.map((row, index) => `${index + 1}. ${row.title} (${row.status}, ${row.agent_name || 'Unassigned'})`).join('\n');
}

async function statusText(projectId: string) {
  const [flow, actions, approvals] = await Promise.all([
    dbClient.queryOne<any>(`SELECT * FROM Flow_Runs WHERE mission_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, [projectId]),
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
    const run = await runProjectFlow(target);
    return `Started Project Flow.\n${JSON.stringify(run)}`;
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
    await dbClient.execute(`UPDATE Approvals SET status = 'approved', decision = 'approved' WHERE id = ?`, [arg]);
    await resumeAgentActionFromApproval(arg, 'approved');
    return `Approved ${arg}.`;
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
  if (enabled !== 'true') {
    const update = await req.json().catch(() => ({}));
    const message = update.message || update.edited_message || update.channel_post;
    const text = String(message?.text || '').trim();
    const chatId = String(message?.chat?.id || '');
    await dbClient.execute(
      `INSERT INTO Channel_Commands (id, source, command, payload, status, actor_id, response)
       VALUES (?, 'telegram', ?, ?, 'ignored', ?, ?)`,
      [`cmd-${crypto.randomUUID()}`, text || '[telegram disabled]', JSON.stringify(update), chatId || null, 'Telegram channel disabled; core Supr runtime remains live.'],
    );
    return Response.json({ ok: true, ignored: true, response: 'Telegram channel is disabled; Supr runtime remains live.' });
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
      [`cmd-${crypto.randomUUID()}`, text || '[non-text]', JSON.stringify(update), chatId, 'Unauthorized Telegram chat.'],
    );
    return Response.json({ ok: false, error: 'Unauthorized Telegram chat.' }, { status: 403 });
  }

  const responseText = text ? await handleCommand(text) : 'Send a text command or project request.';
  await reply(chatId, responseText);
  return Response.json({ ok: true, response: responseText });
}
