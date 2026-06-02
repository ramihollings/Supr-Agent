import crypto from 'crypto';
import dbClient from '@/lib/database/db_client';
import { PermissionEngine } from '@/lib/services/governance';
import type { AgentActionInput, AgentActionRecord, AgentActionStatus, ExecutionResult } from './types';
import { notifyMissionChanged } from '@/lib/events/bus';

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Wrap a SQLite write in a friendly error if a foreign key or unique
 * constraint was violated, instead of returning the raw error message
 * to the API caller.
 */
function translateDbConstraintError(error: any, context: string): Error {
  const code = error?.code;
  if (code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return new Error(`${context}: referenced record does not exist (foreign key constraint failed).`);
  }
  if (code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return new Error(`${context}: a record with the same unique key already exists.`);
  }
  return error instanceof Error ? error : new Error(`${context}: ${String(error)}`);
}

function mapRow(row: any): AgentActionRecord {
  return {
    id: row.id,
    missionId: row.mission_id,
    taskId: row.task_id,
    agentId: row.agent_id,
    capability: row.capability,
    intent: row.intent,
    inputs: safeJson(row.inputs, {}),
    riskLevel: row.risk_level || 'Low',
    requiredPermission: row.required_permission || 'Observe',
    status: row.status,
    approvalId: row.approval_id,
    result: row.result,
    error: row.error,
    traceId: row.trace_id,
    metadata: safeJson(row.metadata, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hasExecutionEvidence(result: unknown) {
  if (!result || typeof result !== 'object') return false;
  const evidence = (result as any).evidence;
  if (!evidence || typeof evidence !== 'object') return false;
  const artifactCount = Array.isArray(evidence.artifacts) ? evidence.artifacts.length : 0;
  const memoryCount = Array.isArray(evidence.memory) ? evidence.memory.length : 0;
  const eventCount = Array.isArray(evidence.events) ? evidence.events.length : 0;
  const toolCallCount = Array.isArray(evidence.toolCalls) ? evidence.toolCalls.length : 0;
  return artifactCount + memoryCount + eventCount + toolCallCount > 0;
}

export async function recordRuntimeAudit(input: {
  missionId?: string | null;
  actorType: string;
  actorId?: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  riskLevel?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await dbClient.execute(
    `INSERT INTO Audit_Log (id, mission_id, actor_type, actor_id, action, target_type, target_id, risk_level, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id('audit'),
      input.missionId || null,
      input.actorType,
      input.actorId || null,
      input.action,
      input.targetType || null,
      input.targetId || null,
      input.riskLevel || null,
      JSON.stringify(input.metadata || {}),
    ]
  );
}

export async function emitActionTimelineEvent(
  action: AgentActionRecord,
  eventType: string,
  summary: string,
  detail?: string,
) {
  await dbClient.execute(
    `INSERT INTO Event_Log (id, mission_id, actor_type, actor_id, event_type, summary, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id('evt'),
      action.missionId,
      'agent',
      action.agentId,
      eventType,
      summary,
      JSON.stringify({ detail, actionId: action.id, traceId: action.traceId, capability: action.capability }),
    ]
  );
}

export async function createAgentAction(input: AgentActionInput): Promise<AgentActionRecord> {
  const actionId = id('act');
  const traceId = id('trace');
  try {
    await dbClient.execute(
      `INSERT INTO Agent_Actions
        (id, mission_id, task_id, agent_id, capability, intent, inputs, risk_level, required_permission, status, trace_id, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        actionId,
        input.missionId,
        input.taskId || null,
        input.agentId,
        input.capability,
        input.intent,
        JSON.stringify(input.inputs || {}),
        input.riskLevel || 'Low',
        input.requiredPermission || 'Observe',
        'draft',
        traceId,
        JSON.stringify(input.metadata || {}),
      ]
    );
  } catch (error: any) {
    throw translateDbConstraintError(error, `Cannot create agent action for mission ${input.missionId}`);
  }
  const action = await getAgentAction(actionId);
  if (!action) throw new Error('Agent action was not persisted.');
  await emitActionTimelineEvent(action, 'agent_action_created', `Queued ${input.capability}`, input.intent);
  notifyMissionChanged(input.missionId, 'agent_action_created');
  await recordRuntimeAudit({
    missionId: input.missionId,
    actorType: 'agent',
    actorId: input.agentId,
    action: 'agent_action_created',
    targetType: 'Agent_Actions',
    targetId: actionId,
    riskLevel: input.riskLevel,
  });
  return action;
}

export async function getAgentAction(actionId: string): Promise<AgentActionRecord | null> {
  const row = await dbClient.queryOne<any>(`SELECT * FROM Agent_Actions WHERE id = ?`, [actionId]);
  return row ? mapRow(row) : null;
}

export async function fetchAgentActionsForMission(missionId: string): Promise<AgentActionRecord[]> {
  const rows = await dbClient.query<any>(
    `SELECT * FROM Agent_Actions WHERE mission_id = ? ORDER BY created_at DESC, rowid DESC`,
    [missionId],
  );
  return rows.map(mapRow);
}

async function updateActionStatus(actionId: string, status: AgentActionStatus, fields: Record<string, unknown> = {}) {
  const sets = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const params: unknown[] = [status];
  for (const [key, value] of Object.entries(fields)) {
    sets.push(`${key} = ?`);
    params.push(value);
  }
  params.push(actionId);
  await dbClient.execute(`UPDATE Agent_Actions SET ${sets.join(', ')} WHERE id = ?`, params);
}

export async function evaluateAgentAction(actionId: string): Promise<ExecutionResult> {
  const action = await getAgentAction(actionId);
  if (!action) throw new Error(`Agent action not found: ${actionId}`);
  if (['approved', 'running', 'completed'].includes(action.status)) return { status: action.status, action };
  if (action.status === 'pending_approval') return { status: action.status, action, approvalId: action.approvalId };

  const decision = await PermissionEngine.evaluateActionDynamic(action.agentId, action.capability, action.missionId);
  const humanGateRequired = action.riskLevel === 'High' || action.riskLevel === 'Critical';

  if (decision.status === 'Denied') {
    await updateActionStatus(action.id, 'failed', { error: decision.reason });
    const failed = await getAgentAction(action.id);
    if (failed) await emitActionTimelineEvent(failed, 'agent_action_denied', `Denied ${action.capability}`, decision.reason);
    return { status: 'failed', action: failed || action, reason: decision.reason };
  }

  if (decision.status === 'RequiresApproval' || humanGateRequired) {
    const approvalId = id('gate');
    const reason = humanGateRequired
      ? `Action '${action.capability}' is ${action.riskLevel} risk. Human approval required before execution.`
      : decision.reason;
    await dbClient.execute(
      `INSERT INTO Approvals
        (id, mission_id, task_id, requesting_agent_id, action, required_permission, risk_level, reason, status, agent_action_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        approvalId,
        action.missionId,
        action.taskId || null,
        action.agentId,
        action.capability,
        action.requiredPermission,
        action.riskLevel,
        reason,
        'pending',
        action.id,
      ],
    );
    await updateActionStatus(action.id, 'pending_approval', { approval_id: approvalId });
    const pending = await getAgentAction(action.id);
    if (pending) await emitActionTimelineEvent(pending, 'approval_requested', `Approval requested for ${action.capability}`, reason);
    return { status: 'pending_approval', action: pending || action, approvalId, reason };
  }

  await updateActionStatus(action.id, 'approved');
  const approved = await getAgentAction(action.id);
  if (approved) await emitActionTimelineEvent(approved, 'agent_action_approved', `Approved ${action.capability}`, decision.reason);
  return { status: 'approved', action: approved || action, reason: decision.reason };
}

export async function executeAgentAction<T>(
  actionId: string,
  executor: (action: AgentActionRecord) => Promise<T>,
): Promise<ExecutionResult> {
  const evaluation = await evaluateAgentAction(actionId);
  if (evaluation.status === 'pending_approval' || evaluation.status === 'failed') return evaluation;

  await updateActionStatus(actionId, 'running');
  const running = await getAgentAction(actionId);
  if (!running) throw new Error(`Agent action not found: ${actionId}`);
  await emitActionTimelineEvent(running, 'agent_action_running', `Running ${running.capability}`, running.intent);

  try {
    const result = await executor(running);
    if ((running.metadata as any)?.requiresEvidence && !hasExecutionEvidence(result)) {
      throw new Error('Agent action produced no durable work evidence. Completion rejected.');
    }
    const serialized = typeof result === 'string' ? result : JSON.stringify(result);
    await updateActionStatus(actionId, 'completed', { result: serialized });
    const completed = await getAgentAction(actionId);
    if (completed) await emitActionTimelineEvent(completed, 'agent_action_completed', `Completed ${running.capability}`, running.intent);
    notifyMissionChanged(running.missionId, 'agent_action_completed');
    return { status: 'completed', action: completed || running, result };
  } catch (error: any) {
    await updateActionStatus(actionId, 'failed', { error: error.message || String(error) });
    const failed = await getAgentAction(actionId);
    if (failed) await emitActionTimelineEvent(failed, 'agent_action_failed', `Failed ${running.capability}`, error.message || String(error));
    notifyMissionChanged(running.missionId, 'agent_action_failed');
    throw error;
  }
}

export async function resumeAgentActionFromApproval(
  approvalId: string,
  decision: 'approved' | 'rejected' | 'revised',
): Promise<AgentActionRecord | null> {
  const row = await dbClient.queryOne<any>(`SELECT * FROM Agent_Actions WHERE approval_id = ? OR id = (SELECT agent_action_id FROM Approvals WHERE id = ?)`, [approvalId, approvalId]);
  if (!row) return null;
  const nextStatus: AgentActionStatus = decision === 'approved' ? 'approved' : decision;
  await updateActionStatus(row.id, nextStatus);
  const action = await getAgentAction(row.id);
  if (action) {
    await emitActionTimelineEvent(action, `agent_action_${nextStatus}`, `${nextStatus.replace('_', ' ')} ${action.capability}`, `Approval ${approvalId} was ${decision}.`);
    await recordRuntimeAudit({
      missionId: action.missionId,
      actorType: 'user',
      action: `approval_${decision}`,
      targetType: 'Agent_Actions',
      targetId: action.id,
      riskLevel: action.riskLevel,
    });
  }
  return action;
}
