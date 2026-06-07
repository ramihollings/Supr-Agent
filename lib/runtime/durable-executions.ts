import crypto from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import dbClient from '@/lib/database/db_client';
import { buildSessionPlanFromMission, runAgentSession } from '@/lib/runtime/agent-session';
import { telemetry } from '@/lib/telemetry';

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
  };
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
  const taskName = `${parent}/tasks/${execution.id.replace(/[^A-Za-z0-9_-]/g, '-')}`;
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

export async function runExecution(executionId: string, workerId = `worker-${crypto.randomUUID()}`) {
  const leaseMs = Number(process.env.EXECUTION_LEASE_MS || 35 * 60_000);
  const leaseExpiresAt = new Date(Date.now() + leaseMs).toISOString();
  await dbClient.execute(
    `UPDATE Job_Executions SET status = 'running', claimed_by = ?, lease_expires_at = ?,
       attempt = attempt + 1, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND (status = 'queued' OR (status = 'running' AND lease_expires_at < ?))`,
    [workerId, leaseExpiresAt, executionId, new Date().toISOString()],
  );
  const row = await dbClient.queryOne<any>('SELECT * FROM Job_Executions WHERE id = ?', [executionId]);
  if (!row) throw new Error(`Execution not found: ${executionId}`);
  if (row.claimed_by !== workerId) return { accepted: false, execution: mapExecution(row) };
  telemetry.info('execution.claimed', { executionId, sessionId: row.session_id, workerId, attempt: row.attempt });

  const session = await dbClient.queryOne<any>('SELECT * FROM Agent_Sessions WHERE id = ?', [row.session_id]);
  if (!session) throw new Error(`Session not found: ${row.session_id}`);
  await dbClient.execute(
    `UPDATE Agent_Sessions SET status = 'running', claimed_by = ?, lease_expires_at = ?,
       attempt = attempt + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [workerId, leaseExpiresAt, session.id],
  );

  try {
    const result = await runAgentSession({
      sessionId: session.id,
      missionId: session.mission_id,
      plan: JSON.parse(session.plan || '[]'),
    });
    await dbClient.runTransaction([
      {
        sql: `UPDATE Agent_Sessions SET status = ?, result = ?, evidence = ?, claimed_by = NULL,
              lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params: [result.status, JSON.stringify(result), JSON.stringify(result.evidence), session.id],
      },
      {
        sql: `UPDATE Job_Executions SET status = ?, error = NULL, claimed_by = NULL,
              lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        params: [result.status, executionId],
      },
    ]);
    if (row.cron_job_id) {
      await dbClient.execute(
        `UPDATE Cron_Jobs SET last_success_at = CURRENT_TIMESTAMP, last_error = NULL WHERE id = ?`,
        [row.cron_job_id],
      );
    }
    telemetry.info('execution.completed', { executionId, sessionId: session.id, status: result.status, steps: result.steps });
    return { accepted: true, result };
  } catch (error: any) {
    const message = error?.message || String(error);
    await dbClient.runTransaction([
      { sql: `UPDATE Agent_Sessions SET status = 'failed', result = ?, claimed_by = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [JSON.stringify({ error: message }), session.id] },
      { sql: `UPDATE Job_Executions SET status = 'failed', error = ?, claimed_by = NULL, lease_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params: [message, executionId] },
    ]);
    if (row.cron_job_id) {
      await dbClient.execute(`UPDATE Cron_Jobs SET last_error = ? WHERE id = ?`, [message, row.cron_job_id]);
    }
    telemetry.error('execution.failed', error, { executionId, sessionId: session.id, attempt: row.attempt });
    throw error;
  }
}

function nextRun(last: Date, interval: string): Date {
  const value = interval.toLowerCase();
  const minutes = value.includes('hour') ? 60 : value.includes('daily') ? 1440 : Number(value.match(/\d+/)?.[0] || 10);
  return new Date(last.getTime() + minutes * 60_000);
}

export async function schedulerTick(now = new Date()) {
  const due = await dbClient.query<any>(
    `SELECT * FROM Cron_Jobs WHERE status = 'Active' AND (next_run_at IS NULL OR next_run_at <= ?) ORDER BY next_run_at ASC LIMIT 50`,
    [now.toISOString()],
  );
  const executions: ExecutionRecord[] = [];
  for (const job of due) {
    let missionId: string | null = null;
    if (job.associated_task_id) {
      const task = await dbClient.queryOne<any>('SELECT mission_id FROM Tasks WHERE id = ?', [job.associated_task_id]);
      missionId = task?.mission_id || null;
    }
    if (!missionId && typeof job.target_action === 'string') {
      const candidate = job.target_action.startsWith('mission:') ? job.target_action.slice('mission:'.length) : job.target_action;
      const mission = await dbClient.queryOne<any>('SELECT id FROM Missions WHERE id = ?', [candidate]);
      missionId = mission?.id || null;
    }
    if (!missionId) {
      await dbClient.execute(`UPDATE Cron_Jobs SET last_error = ? WHERE id = ?`, ['Routine is not linked to a mission or mission task.', job.id]);
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
      `UPDATE Cron_Jobs SET last_run = ?, next_run_at = ?, last_error = NULL WHERE id = ?`,
      [now.toISOString(), nextRun(now, job.interval || '10 minutes').toISOString(), job.id],
    );
  }
  return { checkedAt: now.toISOString(), due: due.length, executions };
}
