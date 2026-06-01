import crypto from 'crypto';
import dbClient from '@/lib/database/db_client';
import { recordRuntimeAudit } from './agent-actions';

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function summarize(value: unknown) {
  if (value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > 8000 ? `${text.slice(0, 8000)}...` : text;
}

export type FlowToolContext = {
  missionId: string;
  flowRunId?: string | null;
  agentActionId?: string | null;
  agentRunId?: string | null;
  agentId?: string | null;
};

export async function runFlowTool<T>(
  context: FlowToolContext,
  toolName: string,
  input: Record<string, unknown>,
  handler: () => Promise<T>,
): Promise<{ invocationId: string; output: T }> {
  const invocationId = id('tool');
  await dbClient.execute(
    `INSERT INTO Tool_Invocations
      (id, mission_id, flow_run_id, agent_action_id, agent_run_id, agent_id, tool_name, status, input)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
    [
      invocationId,
      context.missionId,
      context.flowRunId || null,
      context.agentActionId || null,
      context.agentRunId || null,
      context.agentId || null,
      toolName,
      summarize(input),
    ],
  );

  await recordRuntimeAudit({
    missionId: context.missionId,
    actorType: 'tool',
    actorId: context.agentId || null,
    action: `tool_started:${toolName}`,
    targetType: 'Tool_Invocations',
    targetId: invocationId,
    metadata: {
      flowRunId: context.flowRunId,
      agentActionId: context.agentActionId,
    },
  });

  try {
    const output = await handler();
    await dbClient.execute(
      `UPDATE Tool_Invocations
       SET status = 'completed', output = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [summarize(output), invocationId],
    );
    await recordRuntimeAudit({
      missionId: context.missionId,
      actorType: 'tool',
      actorId: context.agentId || null,
      action: `tool_completed:${toolName}`,
      targetType: 'Tool_Invocations',
      targetId: invocationId,
    });
    return { invocationId, output };
  } catch (error: any) {
    const message = error?.message || String(error);
    await dbClient.execute(
      `UPDATE Tool_Invocations
       SET status = 'failed', error = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [message, invocationId],
    );
    await recordRuntimeAudit({
      missionId: context.missionId,
      actorType: 'tool',
      actorId: context.agentId || null,
      action: `tool_failed:${toolName}`,
      targetType: 'Tool_Invocations',
      targetId: invocationId,
      metadata: { error: message },
    });
    throw error;
  }
}
