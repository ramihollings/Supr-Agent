import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import dbClient from '../lib/database/db_client';
import {
  cancelExecution,
  claimExecution,
  createExecution,
  requeueDeadLetterExecution,
} from '../lib/runtime/durable-executions';
import { decideApprovalOnce, executeAgentAction } from '../lib/runtime/agent-actions';
import { integrationRegistry } from '../lib/integrations/registry';
import type { ToolAdapter } from '../lib/integrations/contracts';

const outputIndex = process.argv.indexOf('--output');
const outputPath = resolve(outputIndex >= 0 ? process.argv[outputIndex + 1] : 'release-evidence/durable-runtime-evaluation.json');
const environment = process.env.ENVIRONMENT || 'local';
const revision = process.env.REVISION || 'working-tree';
const runId = crypto.randomUUID();
const prefix = `eval-${runId}`;
const checks: Array<{ id: string; passed: boolean; details: Record<string, unknown> }> = [];

function record(id: string, passed: boolean, details: Record<string, unknown>) {
  checks.push({ id, passed, details });
  assert.equal(passed, true, `${id} failed: ${JSON.stringify(details)}`);
}

async function main() {
  const startedAt = new Date().toISOString();
  const missionId = `${prefix}-mission`;
  await dbClient.execute(
    `INSERT INTO Missions (id, title, goal, status) VALUES (?, ?, ?, 'Active')`,
    [missionId, 'Durable runtime evaluation', 'Verify recovery and exactly-once invariants'],
  );

  const idempotencyKey = `${prefix}-idempotency`;
  const duplicateCreates = await Promise.all(
    Array.from({ length: 12 }, () => createExecution({ missionId, source: 'api', idempotencyKey })),
  );
  const executionIds = new Set(duplicateCreates.map((execution) => execution.id));
  const execution = duplicateCreates[0];
  record('idempotent_submission', executionIds.size === 1, {
    attempts: duplicateCreates.length,
    uniqueExecutionIds: [...executionIds],
  });

  const claims = await Promise.all(
    Array.from({ length: 12 }, (_, index) => claimExecution(execution.id, `${prefix}-worker-${index}`)),
  );
  record('single_execution_claim', claims.filter(Boolean).length === 1, {
    claimAttempts: claims.length,
    successfulClaims: claims.filter(Boolean).length,
  });

  await dbClient.execute(
    `UPDATE Job_Executions SET status = 'running', claimed_by = ?, lease_expires_at = ? WHERE id = ?`,
    [`${prefix}-terminated-worker`, new Date(Date.now() - 60_000).toISOString(), execution.id],
  );
  const reclaimed = await claimExecution(execution.id, `${prefix}-recovery-worker`);
  record('expired_lease_recovery', Boolean(reclaimed), {
    executionId: execution.id,
    recoveredBy: reclaimed?.claimed_by || null,
    attempt: Number(reclaimed?.attempt || 0),
  });

  const actionId = `${prefix}-action`;
  const approvalId = `${prefix}-approval`;
  const approvalSessionId = `${prefix}-approval-session`;
  const approvalExecutionId = `${prefix}-approval-execution`;
  await dbClient.runTransaction([
    {
      sql: `INSERT INTO Agent_Actions
            (id, mission_id, agent_id, capability, intent, inputs, risk_level, required_permission, status, trace_id, metadata)
            VALUES (?, ?, 'a1', 'production_deploy', 'Deploy once', '{}', 'High', 'External_Act', 'pending_approval', ?, '{}')`,
      params: [actionId, missionId, `${prefix}-trace`],
    },
    {
      sql: `INSERT INTO Approvals
            (id, mission_id, requesting_agent_id, action, required_permission, risk_level, reason, status, agent_action_id)
            VALUES (?, ?, 'a1', 'production_deploy', 'External_Act', 'High', 'Approval required', 'pending', ?)`,
      params: [approvalId, missionId, actionId],
    },
    {
      sql: `UPDATE Agent_Actions SET approval_id = ? WHERE id = ?`,
      params: [approvalId, actionId],
    },
    {
      sql: `INSERT INTO Agent_Sessions (id, mission_id, status, plan, idempotency_key)
            VALUES (?, ?, 'needs_approval', ?, ?)`,
      params: [approvalSessionId, missionId, JSON.stringify([{ kind: 'agent_action', actionId, label: 'Deploy once' }]), `${prefix}-approval-session-key`],
    },
    {
      sql: `INSERT INTO Job_Executions (id, session_id, source, status, idempotency_key, scheduled_for)
            VALUES (?, ?, 'api', 'needs_approval', ?, ?)`,
      params: [approvalExecutionId, approvalSessionId, `${prefix}-approval-execution-key`, new Date().toISOString()],
    },
  ]);
  const approvalDecisions = await Promise.all(
    Array.from({ length: 12 }, () => decideApprovalOnce(approvalId, 'approved')),
  );
  const decided = approvalDecisions.filter((decision) => decision.decided);
  record('approval_resume_exactly_once', decided.length === 1 && decided[0].resumedExecutionIds.length === 1, {
    decisionAttempts: approvalDecisions.length,
    successfulDecisions: decided.length,
    resumedExecutionIds: decided.flatMap((decision) => decision.resumedExecutionIds),
  });

  const sideEffectActionId = `${prefix}-side-effect-action`;
  await dbClient.execute(
    `INSERT INTO Agent_Actions
     (id, mission_id, agent_id, capability, intent, inputs, risk_level, required_permission, status, trace_id, metadata)
     VALUES (?, ?, 'a1', 'web_search', 'Execute one reversible side effect', '{}', 'Low', 'Observe', 'approved', ?, '{}')`,
    [sideEffectActionId, missionId, `${prefix}-side-effect-trace`],
  );
  let sideEffects = 0;
  await Promise.all(Array.from({ length: 12 }, () => executeAgentAction(sideEffectActionId, async () => {
    sideEffects += 1;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 20));
    return { evidence: { toolCalls: [`${prefix}-side-effect`] } };
  })));
  record('side_effect_exactly_once', sideEffects === 1, { attempts: 12, sideEffects });

  const cancellationMissionId = `${prefix}-cancellation-mission`;
  await dbClient.execute(
    `INSERT INTO Missions (id, title, goal, status) VALUES (?, ?, ?, 'Active')`,
    [cancellationMissionId, 'Cancellation evaluation', 'Verify terminal executions cannot be cancelled'],
  );
  const cancellable = await createExecution({
    missionId: cancellationMissionId,
    source: 'api',
    idempotencyKey: `${prefix}-cancellable`,
  });
  const cancellationAttempts = await Promise.all(
    Array.from({ length: 12 }, () => cancelExecution(cancellable.id)),
  );
  record('cancellation_exactly_once', cancellationAttempts.filter((result) => result.cancelled).length === 1, {
    attempts: cancellationAttempts.length,
    successfulCancellations: cancellationAttempts.filter((result) => result.cancelled).length,
  });
  await dbClient.execute(`UPDATE Job_Executions SET status = 'completed' WHERE id = ?`, [cancellable.id]);
  await dbClient.execute(`UPDATE Agent_Sessions SET status = 'completed' WHERE id = ?`, [cancellable.sessionId]);
  const terminalCancellation = await cancelExecution(cancellable.id);
  const terminalSession = await dbClient.queryOne<{ status: string }>('SELECT status FROM Agent_Sessions WHERE id = ?', [cancellable.sessionId]);
  record('terminal_cancellation_noop', !terminalCancellation.cancelled && terminalSession?.status === 'completed', {
    executionId: cancellable.id,
    sessionStatus: terminalSession?.status || null,
  });

  await dbClient.execute(
    `UPDATE Job_Executions SET status = 'failed', dead_lettered_at = ?, dead_letter_reason = ?
     WHERE id = ?`,
    [new Date().toISOString(), 'evaluation terminal failure', execution.id],
  );
  const requeues = await Promise.all(
    Array.from({ length: 12 }, () => requeueDeadLetterExecution(execution.id)),
  );
  record('dead_letter_requeue_exactly_once', requeues.filter((result) => result.requeued).length === 1, {
    attempts: requeues.length,
    successfulRequeues: requeues.filter((result) => result.requeued).length,
  });

  let adapterAttempts = 0;
  const adapterId = `${prefix}-unavailable-adapter`;
  const unavailableAdapter: ToolAdapter = {
    async describe() {
      return { id: adapterId, operations: ['evaluate'], permissions: ['Observe'], riskLevel: 'Low', availability: 'degraded' };
    },
    async validate() {
      return { valid: true, errors: [] };
    },
    async execute() {
      adapterAttempts += 1;
      return { ok: false, error: 'Synthetic provider outage', errorDetail: { code: 'PROVIDER_UNAVAILABLE', retryable: true, adapterId, attempt: adapterAttempts - 1 } };
    },
    async healthCheck() {
      return { status: 'unavailable', latencyMs: 0, message: 'Synthetic provider outage' };
    },
  };
  integrationRegistry.register(adapterId, unavailableAdapter, { retryLimit: 1, circuitBreakerThreshold: 1 });
  const degraded = await integrationRegistry.execute(adapterId, {}, {});
  const circuitOpen = await integrationRegistry.execute(adapterId, {}, {});
  integrationRegistry.unregister(adapterId);
  record('provider_degradation', !degraded.ok && circuitOpen.errorDetail?.code === 'CIRCUIT_OPEN', {
    adapterAttempts,
    firstErrorCode: degraded.errorDetail?.code || null,
    secondErrorCode: circuitOpen.errorDetail?.code || null,
  });

  const report = {
    schemaVersion: 1,
    environment,
    revision,
    runId,
    missionId,
    executionIds: [execution.id, approvalExecutionId, cancellable.id],
    sessionIds: [execution.sessionId, approvalSessionId, cancellable.sessionId],
    startedAt,
    completedAt: new Date().toISOString(),
    passed: checks.every((check) => check.passed),
    checks,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Durable runtime evaluation PASS; evidence written to ${outputPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => dbClient.close());
