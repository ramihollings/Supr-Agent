import assert from 'node:assert/strict';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');

async function main() {
const admin = new Client({ connectionString: databaseUrl });
await admin.connect();
console.log('PostgreSQL integration: migrated schema ready.');

try {
  const tables = await admin.query<{ lower_name: string; exact_name: string }>(
    `SELECT lower(table_name) AS lower_name, table_name AS exact_name
     FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  assert(tables.rows.some((table) => table.exact_name === 'missions'), 'lowercase missions table is required');
  assert(!tables.rows.some((table) => table.exact_name === 'Missions'), 'quoted mixed-case tables are not allowed');

  const columnTypes = await admin.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT table_name, column_name, data_type FROM information_schema.columns
     WHERE (table_name = 'agent_capabilities' AND column_name = 'allowed')
        OR (table_name = 'memory_items' AND column_name = 'superseded')
        OR (table_name = 'artifacts' AND column_name = 'storage_uri')
        OR (table_name = 'artifact_versions' AND column_name = 'storage_uri')
        OR (table_name = 'approvals' AND column_name IN ('created_at', 'updated_at'))`,
  );
  assert.equal(columnTypes.rows.find((column) => column.column_name === 'allowed')?.data_type, 'integer');
  assert.equal(columnTypes.rows.find((column) => column.column_name === 'superseded')?.data_type, 'boolean');
  assert.equal(columnTypes.rows.filter((column) => column.column_name === 'storage_uri').length, 2);
  assert.equal(columnTypes.rows.filter((column) => column.table_name === 'approvals').length, 2);

  const foreignKeys = await admin.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM pg_constraint WHERE contype = 'f'`,
  );
  assert(Number(foreignKeys.rows[0].count) > 0, 'foreign keys must be recreated');

  const indexes = await admin.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM pg_indexes WHERE schemaname = 'public'`,
  );
  assert(Number(indexes.rows[0].count) > 10, 'application indexes must be recreated');

  const { default: dbClient } = await import('../lib/database/db_client');
  const { consumeDurable } = await import('../lib/route-rate-limit');
  const { claimExecution, requeueDeadLetterExecution, schedulerTick } = await import('../lib/runtime/durable-executions');
  const { decideApprovalOnce, evaluateAgentAction, executeAgentAction } = await import('../lib/runtime/agent-actions');
  const { portabilityService } = await import('../lib/services/portability');
  console.log('PostgreSQL integration: application database modules loaded.');

  await dbClient.execute(
    `INSERT INTO Missions (id, title, goal, status) VALUES (?, ?, ?, ?)`,
    ['pg-mission', 'PostgreSQL verification', 'Exercise production persistence', 'Active'],
  );
  await dbClient.execute(`INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)`, ['pg-key', 'first']);
  await dbClient.execute(`INSERT OR IGNORE INTO Settings (key, value) VALUES (?, ?)`, ['pg-key', 'second']);
  assert.equal((await dbClient.queryOne<{ value: string }>('SELECT value FROM Settings WHERE key = ?', ['pg-key']))?.value, 'first');

  await dbClient.runTransaction([
    {
      sql: `INSERT INTO Agent_Sessions (id, mission_id, status, plan, idempotency_key)
            VALUES (?, ?, 'queued', '[]', ?)`,
      params: ['pg-session', 'pg-mission', 'pg-session-key'],
    },
    {
      sql: `INSERT INTO Job_Executions (id, session_id, source, status, idempotency_key, scheduled_for)
            VALUES (?, ?, 'api', 'queued', ?, ?)`,
      params: ['pg-execution', 'pg-session', 'pg-execution-key', new Date().toISOString()],
    },
  ]);

  const claims = await Promise.all(
    Array.from({ length: 12 }, (_, index) => claimExecution('pg-execution', `worker-${index}`)),
  );
  assert.equal(claims.filter(Boolean).length, 1, 'only one worker may claim an execution');
  await dbClient.execute(
    `UPDATE Job_Executions SET status = 'running', lease_expires_at = ?, claimed_by = ? WHERE id = ?`,
    [new Date(Date.now() - 60_000).toISOString(), 'expired-worker', 'pg-execution'],
  );
  assert(await claimExecution('pg-execution', 'recovery-worker'), 'expired leases must be reclaimable');

  const rateResults = await Promise.all(
    Array.from({ length: 20 }, () => consumeDurable('postgres-integration', 5, 60_000)),
  );
  assert.equal(rateResults.filter(Boolean).length, 5, 'distributed rate limiting must be atomic');

  await dbClient.execute(
    `INSERT INTO Cron_Jobs
     (id, name, interval, schedule_expression, timezone, target_action, status, enabled, next_run_at, max_concurrency)
     VALUES (?, ?, ?, ?, ?, ?, 'Active', 1, ?, 1)`,
    ['pg-cron', 'PostgreSQL scheduler', 'Every 5 minutes', '*/5 * * * *', 'UTC', 'mission:pg-mission', new Date(0).toISOString()],
  );
  const firstTick = await schedulerTick(new Date('2026-01-01T00:00:00.000Z'));
  assert.equal(firstTick.executions.length, 1, 'a due schedule must create an execution');
  await dbClient.execute(`UPDATE Cron_Jobs SET next_run_at = ? WHERE id = ?`, [new Date(0).toISOString(), 'pg-cron']);
  const concurrencyTick = await schedulerTick(new Date('2026-01-01T00:01:00.000Z'));
  assert.equal(concurrencyTick.executions.length, 0, 'schedule concurrency limits must prevent duplicate active work');

  await dbClient.execute(
    `INSERT INTO Cron_Jobs
     (id, name, interval, schedule_expression, timezone, target_action, status, enabled, next_run_at, max_concurrency)
     VALUES (?, ?, ?, ?, ?, ?, 'Active', 1, ?, 1)`,
    ['pg-invalid-cron', 'Invalid scheduler', 'Every 5 minutes', 'not-a-cron', 'UTC', 'mission:pg-mission', new Date(0).toISOString()],
  );
  const invalidTick = await schedulerTick(new Date('2026-01-01T00:02:00.000Z'));
  assert.equal(invalidTick.executions.length, 0, 'invalid schedules must not enqueue executions');
  const invalidJob = await dbClient.queryOne<{ last_error: string | null }>('SELECT last_error FROM Cron_Jobs WHERE id = ?', ['pg-invalid-cron']);
  assert(invalidJob?.last_error, 'invalid schedules must persist an operator-visible error');

  await dbClient.runTransaction([
    {
      sql: `INSERT INTO Agent_Actions
            (id, mission_id, agent_id, capability, intent, inputs, risk_level, required_permission, status, trace_id, metadata)
            VALUES (?, ?, ?, ?, ?, '{}', 'High', 'External_Act', 'pending_approval', ?, '{}')`,
      params: ['pg-approved-action', 'pg-mission', 'a1', 'production_deploy', 'Deploy once', 'pg-trace'],
    },
    {
      sql: `INSERT INTO Approvals
            (id, mission_id, requesting_agent_id, action, required_permission, risk_level, reason, status, agent_action_id)
            VALUES (?, ?, ?, ?, 'External_Act', 'High', 'Approval required', 'pending', ?)`,
      params: ['pg-approval', 'pg-mission', 'a1', 'production_deploy', 'pg-approved-action'],
    },
    {
      sql: `INSERT INTO Agent_Sessions (id, mission_id, status, plan, idempotency_key)
            VALUES (?, ?, 'needs_approval', ?, ?)`,
      params: ['pg-approval-session', 'pg-mission', JSON.stringify([{ kind: 'agent_action', actionId: 'pg-approved-action', label: 'Deploy once' }]), 'pg-approval-session-key'],
    },
    {
      sql: `INSERT INTO Job_Executions (id, session_id, source, status, idempotency_key, scheduled_for)
            VALUES (?, ?, 'api', 'needs_approval', ?, ?)`,
      params: ['pg-approval-execution', 'pg-approval-session', 'pg-approval-execution-key', new Date().toISOString()],
    },
  ]);
  await dbClient.execute(`UPDATE Agent_Actions SET approval_id = ? WHERE id = ?`, ['pg-approval', 'pg-approved-action']);
  const approvalClaims = await Promise.all(Array.from({ length: 8 }, () => decideApprovalOnce('pg-approval', 'approved')));
  assert.equal(approvalClaims.filter((result) => result.decided).length, 1, 'an approval decision must be claimed exactly once');
  assert.equal((await dbClient.queryOne<{ status: string }>('SELECT status FROM Job_Executions WHERE id = ?', ['pg-approval-execution']))?.status, 'queued');

  await dbClient.execute(
    `INSERT INTO Agent_Actions
     (id, mission_id, agent_id, capability, intent, inputs, risk_level, required_permission, status, result, trace_id, metadata)
     VALUES (?, ?, ?, ?, ?, '{}', 'Low', 'Observe', 'completed', ?, ?, '{}')`,
    ['pg-completed-action', 'pg-mission', 'a1', 'web_search', 'Already complete', '{"evidence":{"toolCalls":["done"]}}', 'pg-completed-trace'],
  );
  let completedExecutions = 0;
  const completedResult = await executeAgentAction('pg-completed-action', async () => {
    completedExecutions += 1;
    return {};
  });
  assert.equal(completedResult.status, 'completed');
  assert.equal(completedExecutions, 0, 'completed actions must not repeat side effects during durable retries');

  await dbClient.execute(
    `INSERT INTO Agent_Actions
     (id, mission_id, agent_id, capability, intent, inputs, risk_level, required_permission, status, trace_id, metadata)
     VALUES (?, ?, ?, ?, ?, '{}', 'Low', 'Observe', 'approved', ?, '{}')`,
    ['pg-concurrent-action', 'pg-mission', 'a1', 'web_search', 'Run once concurrently', 'pg-concurrent-trace'],
  );
  let concurrentExecutions = 0;
  const actionRuns = await Promise.all(Array.from({ length: 8 }, () => executeAgentAction('pg-concurrent-action', async () => {
    concurrentExecutions += 1;
    await new Promise((resolve) => setTimeout(resolve, 25));
    return { evidence: { toolCalls: ['once'] } };
  })));
  assert.equal(concurrentExecutions, 1, 'only one concurrent worker may execute an approved action');
  assert(actionRuns.every((result) => ['running', 'completed'].includes(result.status)));

  await dbClient.execute(
    `INSERT INTO Agent_Actions
     (id, mission_id, agent_id, capability, intent, inputs, risk_level, required_permission, status, trace_id, metadata)
     VALUES (?, ?, ?, ?, ?, '{}', 'High', 'External_Act', 'draft', ?, '{}')`,
    ['pg-concurrent-approval-action', 'pg-mission', 'a1', 'production_deploy', 'Request approval once', 'pg-concurrent-approval-trace'],
  );
  await Promise.all(Array.from({ length: 8 }, () => evaluateAgentAction('pg-concurrent-approval-action')));
  const approvalCount = await dbClient.queryOne<{ count: number }>(
    'SELECT COUNT(*) as count FROM Approvals WHERE agent_action_id = ?',
    ['pg-concurrent-approval-action'],
  );
  assert.equal(Number(approvalCount?.count || 0), 1, 'concurrent evaluation must create only one approval gate');

  await dbClient.execute(
    `UPDATE Job_Executions SET status = 'failed', dead_lettered_at = ?, dead_letter_reason = ?
     WHERE id = ?`,
    [new Date().toISOString(), 'terminal integration failure', 'pg-execution'],
  );
  const deadLetterRequeues = await Promise.all(
    Array.from({ length: 8 }, () => requeueDeadLetterExecution('pg-execution')),
  );
  assert.equal(deadLetterRequeues.filter((result) => result.requeued).length, 1, 'a dead-letter execution may be requeued exactly once');
  const requeued = await dbClient.queryOne<{ status: string; dead_lettered_at: string | null }>(
    'SELECT status, dead_lettered_at FROM Job_Executions WHERE id = ?',
    ['pg-execution'],
  );
  assert.equal(requeued?.status, 'queued');
  assert.equal(requeued?.dead_lettered_at, null);

  const rowidRows = await dbClient.query<{ id: string }>('SELECT id FROM Job_Executions ORDER BY rowid ASC');
  assert(rowidRows.length >= 2, 'legacy rowid ordering must translate for PostgreSQL');

  const exportBundle = JSON.parse(await portabilityService.exportOrganization());
  const exportedMission = exportBundle.data.missions.find((mission: any) => mission.id === 'pg-mission');
  assert(exportedMission, 'portability export must include the PostgreSQL mission');
  exportedMission.title = 'PostgreSQL portability overwrite verified';
  const importResult = await portabilityService.importOrganization(JSON.stringify(exportBundle), { allowOverwrite: true });
  assert.equal(importResult.success, true, 'provider-neutral portability overwrite must succeed');
  assert.equal(
    (await dbClient.queryOne<{ title: string }>('SELECT title FROM Missions WHERE id = ?', ['pg-mission']))?.title,
    'PostgreSQL portability overwrite verified',
  );

  console.log('PostgreSQL migration and runtime integration checks passed.');
} finally {
  await import('../lib/database/db_client').then(({ default: dbClient }) => dbClient.close()).catch(() => undefined);
  await admin.query('DROP SCHEMA IF EXISTS public CASCADE');
  await admin.query('CREATE SCHEMA public');
  await admin.end();
}
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
