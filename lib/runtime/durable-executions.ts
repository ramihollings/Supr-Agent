import crypto from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import dbClient from '@/lib/database/db_client';
import { buildSessionPlanFromMission, runAgentSession } from '@/lib/runtime/agent-session';
import type { AgentSessionContinuation } from '@/lib/runtime/agent-session';
import { telemetry } from '@/lib/telemetry';
import { nextScheduledRun } from '@/lib/runtime/schedule';
import { restoreWorkspaceSnapshot, uploadWorkspaceSnapshot } from '@/lib/services/workspace-snapshots';
import { syncMissionArtifactsToGcs } from '@/lib/services/artifact-storage';

export type ExecutionSource = 'web' | 'telegram' | 'schedule' | 'api';
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'partial' | 'failed' | 'cancelled' | 'needs_approval';

export interface ExecutionRecord {
  id: string;
  sessionId: string;
  source: ExecutionSource;
  status: ExecutionStatus;
  idempotencyKey: string;
  scheduledFor: string;
  attempt: number;
  error: string | null;
  deadLetteredAt: string | null;
  deadLetterReason: string | null;
}

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function mapExecution(row: any): ExecutionRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    source: row.source,
    status: row.status,
    idempotencyKey: row.idempotency_key,
    scheduledFor: row.scheduled_for,
    attempt: Number(row.attempt || 0),
    error: row.error || null,
    deadLetteredAt: row.dead_lettered_at || null,
    deadLetterReason: row.dead_letter_reason || null,
  };
}

async function persistContinuation(sessionId: string, continuation: AgentSessionContinuation) {
  const state = JSON.stringify(continuation);
  await dbClient.runTransaction([
    {
      sql: `INSERT INTO Run_Continuations (id, session_id, state_data)
            VALUES (?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET state_data = excluded.state_data, updated_at = CURRENT_TIMESTAMP`,
      params: [newId('continuation'), sessionId, state],
    },
    {
      sql: `UPDATE Agent_Sessions SET continuation = ?, plan = ?, evidence = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params: [state, JSON.stringify(continuation.plan), JSON.stringify(continuation.evidence), sessionId],
    },
  ]);
  await uploadWorkspaceSnapshot(sessionId);
}

export async function getExecution(id: string): Promise<ExecutionRecord | null> {
  const row = await dbClient.queryOne<any>('SELECT * FROM Job_Executions WHERE id = ?', [id]);
  return row ? mapExecution(row) : null;
}

export async function createExecution(input: {
  missionId: string;
  source: ExecutionSource;
  idempotencyKey?: string;
  scheduledFor?: string;
  cronJobId?: string | null;
}): Promise<ExecutionRecord> {
  const idempotencyKey = input.idempotencyKey || `${input.source}:${input.missionId}:${crypto.randomUUID()}`;
  const existing = await dbClient.queryOne<any>('SELECT * FROM Job_Executions WHERE idempotency_key = ?', [idempotencyKey]);
  if (existing) return mapExecution(existing);

  const sessionId = newId('session');
  const executionId = newId('exec');
  const plan = await buildSessionPlanFromMission(input.missionId);
  try {
    await dbClient.runTransaction([
      {
        sql: `INSERT INTO Agent_Sessions (id, mission_id, status, plan, idempotency_key)
              VALUES (?, ?, 'queued', ?, ?)`,
        params: [sessionId, input.missionId, JSON.stringify(plan), idempotencyKey],
      },
      {
        sql: `INSERT INTO Job_Executions
              (id, cron_job_id, session_id, source, status, idempotency_key, scheduled_for)
              VALUES (?, ?, ?, ?, 'queued', ?, ?)`,
        params: [executionId, input.cronJobId || null, sessionId, input.source, idempotencyKey, input.scheduledFor || new Date().toISOString()],
      },
    ]);
  } catch (error: any) {
    const duplicate = error?.code === '23505' || String(error?.code || '').startsWith('SQLITE_CONSTRAINT');
    if (!duplicate) throw error;
    const winner = await dbClient.queryOne<any>('SELECT * FROM Job_Executions WHERE idempotency_key = ?', [idempotencyKey]);
    if (!winner) throw error;
    return mapExecution(winner);
  }
  telemetry.info('execution.created', { executionId, sessionId, missionId: input.missionId, source: input.source });
  return (await getExecution(executionId))!;
}

export async function submitExecution(input: {
  missionId: string;
  source: ExecutionSource;
  idempotencyKey?: string;
}) {
  const execution = await createExecution(input);
  const dispatch = await enqueueCloudTask(execution);
  return {
    accepted: true,
    executionId: execution.id,
    statusUrl: `/api/executions/${execution.id}`,
    dispatched: dispatch.enqueued,
  };
}

export async function enqueueCloudTask(execution: ExecutionRecord): Promise<{ enqueued: boolean; taskName?: string }> {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.CLOUD_TASKS_LOCATION;
  const queue = process.env.CLOUD_TASKS_QUEUE;
  const workerUrl = process.env.SUPR_WORKER_URL;
  const serviceAccountEmail = process.env.CLOUD_TASKS_SERVICE_ACCOUNT;
  if (!project || !location || !queue || !workerUrl || !serviceAccountEmail) {
    return { enqueued: false };
  }

  const parent = `projects/${project}/locations/${location}/queues/${queue}`;
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const dispatchId = crypto.randomUUID().replace(/-/g, '');
  const taskName = `${parent}/tasks/${execution.id.replace(/[^A-Za-z0-9_-]/g, '-')}-${dispatchId}`;
  try {
    const response = await client.request<any>({
      url: `https://cloudtasks.googleapis.com/v2/${parent}/tasks`,
      method: 'POST',
      data: {
        task: {
          name: taskName,
          httpRequest: {
            httpMethod: 'POST',
            url: `${workerUrl.replace(/\/$/, '')}/api/internal/executions/run`,
            headers: { 'Content-Type': 'application/json' },
            body: Buffer.from(JSON.stringify({ executionId: execution.id })).toString('base64'),
            oidcToken: { serviceAccountEmail, audience: workerUrl },
          },
        },
      },
    });
    return { enqueued: true, taskName: response.data?.name };
  } catch (error: any) {
    if (error?.response?.status === 409 || error?.code === 409) {
      return { enqueued: true, taskName };
    }
    throw error;
  }
}

export async function requeueDeadLetterExecution(executionId: string) {
  const row = await dbClient.queryOne<any>(
    `UPDATE Job_Executions SET status = 'queued', error = NULL, dead_lettered_at = NULL,
       dead_letter_reason = NULL, claimed_by = NULL, lease_expires_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'failed' AND dead_lettered_at IS NOT NULL
     RETURNING *`,
    [executionId],
  );
  if (!row) return { requeued: false, execution: await getExecution(executionId) };
  await dbClient.execute(
    `UPDATE Agent_Sessions SET status = 'queued', claimed_by = NULL, lease_expires_at = NULL,
     updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [row.session_id],
  );
  const execution = mapExecution(row);
  const dispatch = await enqueueCloudTask(execution);
  telemetry.info('execution.dead_letter_requeued', { executionId, sessionId: row.session_id, dispatched: dispatch.enqueued });
  return { requeued: true, execution, dispatched: dispatch.enqueued };
}

export async function claimExecution(
  executionId: string,
  workerId: string,
  now = new Date(),
  leaseMs = Number(process.env.EXECUTION_LEASE_MS || 35 * 60_000),
) {
  const leaseExpiresAt = new Date(now.getTime() + leaseMs).toISOString();
  return dbClient.queryOne<any>(
    `UPDATE Job_Executions SET status = 'running', claimed_by = ?, lease_expires_at = ?,
       attempt = attempt + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND (status = 'queued' OR (status = 'running' AND lease_expires_at < ?))
     RETURNING *`,
    [workerId, leaseExpiresAt, executionId, now.toISOString()],
  );
}

export async function runExecution(executionId: string, workerId = `worker-${crypto.randomUUID()}`) {
  const row = await claimExecution(executionId, workerId);
  if (!row) {
    const existing = await dbClient.queryOne<any>('SELECT * FROM Job_Executions WHERE id = ?', [executionId]);
    if (!existing) throw new Error(`Execution not found: ${executionId}`);
    return { accepted: false, execution: mapExecution(existing) };
  }
  if (row.claimed_by !== workerId) {
    const existing = await dbClient.queryOne<any>('SELECT * FROM Job_Executions WHERE id = ?', [executionId]);
    return { accepted: false, execution: existing ? mapExecution(existing) : null };
  }
  telemetry.info('execution.claimed', { executionId, sessionId: row.session_id, workerId, attempt: row.attempt });

  const session = await dbClient.queryOne<any>('SELECT * FROM Agent_Sessions WHERE id = ?', [row.session_id]);
  if (!session) throw new Error(`Session not found: ${row.session_id}`);
  const leaseExpiresAt = row.lease_expires_at;
  await dbClient.execute(
    `UPDATE Agent_Sessions SET status = 'running', claimed_by = ?, lease_expires_at = ?,
       attempt = attempt + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [workerId, leaseExpiresAt, session.id],
  );

  const cancellationToken: { aborted?: boolean; reason?: string } = {};
  const cancellationPoll = setInterval(() => {
    void dbClient.queryOne<{ status: string }>('SELECT status FROM Job_Executions WHERE id = ?', [executionId])
      .then((current) => {
        if (current?.status === 'cancelled') {
          cancellationToken.aborted = true;
          cancellationToken.reason = 'Execution cancelled by operator';
        }
      })
      .catch((error) => telemetry.warn('execution.cancellation_poll_failed', { executionId, error: String(error) }));
  }, 2_000);
  cancellationPoll.unref?.();

  try {
    await restoreWorkspaceSnapshot(session.id);
    const durableContinuation = await dbClient.queryOne<{ state_data: string }>(
      'SELECT state_data FROM Run_Continuations WHERE session_id = ?',
      [session.id],
    );
    const continuation = durableContinuation?.state_data
      ? JSON.parse(durableContinuation.state_data) as AgentSessionContinuation
      : session.continuation
        ? JSON.parse(session.continuation) as AgentSessionContinuation
        : null;
    const result = await runAgentSession({
      sessionId: session.id,
      missionId: session.mission_id,
      plan: JSON.parse(session.plan || '[]'),
      cancellationToken,
      continuation,
      onCheckpoint: (state) => persistContinuation(session.id, state),
    });
    const current = await dbClient.queryOne<{ status: string }>('SELECT status FROM Job_Executions WHERE id = ?', [executionId]);
    const finalStatus = current?.status === 'cancelled' ? 'cancelled' : result.status;
    if (finalStatus === 'completed') {
      await syncMissionArtifactsToGcs(session.mission_id);
      await uploadWorkspaceSnapshot(session.id);
    }
    await dbClient.runTransaction([
      {
        sql: `UPDATE Agent_Sessions SET status = ?, result = ?, evidence = ?, claimed_by = NULL,
              lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params: [finalStatus, JSON.stringify(result), JSON.stringify(result.evidence), session.id],
      },
      {
        sql: `UPDATE Job_Executions SET status = ?, error = NULL, claimed_by = NULL,
              lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status <> 'cancelled'`,
        params: [finalStatus, executionId],
      },
    ]);
    if (finalStatus === 'completed' || finalStatus === 'cancelled') {
      await dbClient.runTransaction([
        { sql: 'DELETE FROM Run_Continuations WHERE session_id = ?', params: [session.id] },
        { sql: 'UPDATE Agent_Sessions SET continuation = NULL WHERE id = ?', params: [session.id] },
      ]);
    } else {
      await persistContinuation(session.id, result.continuation);
    }
    if (row.cron_job_id && finalStatus !== 'cancelled') {
      await dbClient.execute(
        `UPDATE Cron_Jobs SET last_success_at = CURRENT_TIMESTAMP, last_error = NULL,
         previous_result = ?, last_execution_id = ? WHERE id = ?`,
        [JSON.stringify(result), executionId, row.cron_job_id],
      );
    }
    telemetry.info('execution.completed', { executionId, sessionId: session.id, status: finalStatus, steps: result.steps });
    return { accepted: true, result: { ...result, status: finalStatus } };
  } catch (error: any) {
    const message = error?.message || String(error);
    const current = await dbClient.queryOne<{ status: string }>('SELECT status FROM Job_Executions WHERE id = ?', [executionId]);
    if (current?.status === 'cancelled') {
      await dbClient.execute(
        `UPDATE Agent_Sessions SET status = 'cancelled', result = ?, claimed_by = NULL,
         lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [JSON.stringify({ error: message }), session.id],
      );
      return { accepted: true, result: { status: 'cancelled', error: message } };
    }
    const maxAttempts = Number(process.env.MAX_EXECUTION_ATTEMPTS || 5);
    const retry = Number(row.attempt || 0) < maxAttempts;
    const nextStatus = retry ? 'queued' : 'failed';
    const deadLetteredAt = retry ? null : new Date().toISOString();
    await dbClient.runTransaction([
      { sql: `UPDATE Agent_Sessions SET status = ?, result = ?, claimed_by = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [nextStatus, JSON.stringify({ error: message }), session.id] },
      { sql: `UPDATE Job_Executions SET status = ?, error = ?, dead_lettered_at = ?,
              dead_letter_reason = ?, claimed_by = NULL, lease_expires_at = NULL,
              updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params: [nextStatus, message, deadLetteredAt, retry ? null : message, executionId] },
    ]);
    if (row.cron_job_id) {
      await dbClient.execute(`UPDATE Cron_Jobs SET last_error = ? WHERE id = ?`, [message, row.cron_job_id]);
    }
    telemetry.error(retry ? 'execution.retry_scheduled' : 'execution.failed', error, {
      executionId,
      sessionId: session.id,
      attempt: row.attempt,
      maxAttempts,
      deadLettered: !retry,
    });
    throw error;
  } finally {
    clearInterval(cancellationPoll);
  }
}

async function resolveCronMission(job: any): Promise<string | null> {
  if (job.associated_task_id) {
    const task = await dbClient.queryOne<any>('SELECT mission_id FROM Tasks WHERE id = ?', [job.associated_task_id]);
    if (task?.mission_id) return task.mission_id;
  }
  if (typeof job.target_action === 'string') {
    const candidate = job.target_action.startsWith('mission:') ? job.target_action.slice('mission:'.length) : job.target_action;
    const mission = await dbClient.queryOne<any>('SELECT id FROM Missions WHERE id = ?', [candidate]);
    if (mission?.id) return mission.id;
  }
  return null;
}

export async function triggerScheduledJob(jobId: string): Promise<ExecutionRecord> {
  const job = await dbClient.queryOne<any>('SELECT * FROM Cron_Jobs WHERE id = ?', [jobId]);
  if (!job) throw new Error(`Scheduled job not found: ${jobId}`);
  const missionId = await resolveCronMission(job);
  if (!missionId) throw new Error('Routine is not linked to a mission or mission task.');
  const now = new Date();
  const execution = await createExecution({
    missionId,
    source: 'schedule',
    cronJobId: job.id,
    scheduledFor: now.toISOString(),
    idempotencyKey: `manual:${job.id}:${crypto.randomUUID()}`,
  });
  await enqueueCloudTask(execution);
  await dbClient.execute(
    `UPDATE Cron_Jobs SET last_run = ?, last_execution_id = ?, last_error = NULL WHERE id = ?`,
    [now.toISOString(), execution.id, job.id],
  );
  return execution;
}

export async function schedulerTick(now = new Date()) {
  const due = await dbClient.query<any>(
    `SELECT * FROM Cron_Jobs WHERE status = 'Active' AND enabled <> 0
     AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY next_run_at ASC LIMIT 50`,
    [now.toISOString()],
  );
  const executions: ExecutionRecord[] = [];
  for (const job of due) {
    const active = await dbClient.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM Job_Executions
       WHERE cron_job_id = ? AND status IN ('queued','running','needs_approval')`,
      [job.id],
    );
    if (Number(active?.count || 0) >= Number(job.max_concurrency || 1)) continue;
    const missionId = await resolveCronMission(job);
    if (!missionId) {
      await dbClient.execute(`UPDATE Cron_Jobs SET last_error = ? WHERE id = ?`, ['Routine is not linked to a mission or mission task.', job.id]);
      continue;
    }
    let nextRun: Date;
    try {
      nextRun = nextScheduledRun(job, now);
    } catch (error: any) {
      await dbClient.execute(`UPDATE Cron_Jobs SET last_error = ? WHERE id = ?`, [error?.message || String(error), job.id]);
      continue;
    }
    const scheduledFor = job.next_run_at || now.toISOString();
    const execution = await createExecution({
      missionId,
      source: 'schedule',
      cronJobId: job.id,
      scheduledFor,
      idempotencyKey: `cron:${job.id}:${scheduledFor}`,
    });
    executions.push(execution);
    await enqueueCloudTask(execution);
    await dbClient.execute(
      `UPDATE Cron_Jobs SET last_run = ?, next_run_at = ?, last_execution_id = ?, last_error = NULL WHERE id = ?`,
      [now.toISOString(), nextRun.toISOString(), execution.id, job.id],
    );
  }
  const queued = await dbClient.query<any>(
    `SELECT * FROM Job_Executions
     WHERE status = 'queued' AND scheduled_for <= ? ORDER BY scheduled_for ASC LIMIT 100`,
    [now.toISOString()],
  );
  let dispatched = 0;
  for (const row of queued) {
    const result = await enqueueCloudTask(mapExecution(row));
    if (result.enqueued) dispatched += 1;
  }
  const oldestQueued = await dbClient.queryOne<{ scheduled_for: string | null }>(
    `SELECT scheduled_for FROM Job_Executions WHERE status = 'queued' ORDER BY scheduled_for ASC LIMIT 1`,
  );
  const stuckLeases = await dbClient.queryOne<{ count: number }>(
    `SELECT COUNT(*) as count FROM Job_Executions WHERE status = 'running' AND lease_expires_at < ?`,
    [now.toISOString()],
  );
  const queueAgeMs = oldestQueued?.scheduled_for
    ? Math.max(0, now.getTime() - new Date(oldestQueued.scheduled_for).getTime())
    : 0;
  telemetry.info('scheduler.tick', {
    due: due.length,
    created: executions.length,
    dispatched,
    queueAgeMs,
    stuckLeases: Number(stuckLeases?.count || 0),
  });
  return { checkedAt: now.toISOString(), due: due.length, executions, dispatched };
}
