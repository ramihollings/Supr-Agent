import dbClient from './db_client';

export const REQUIRED_SCHEMA_PROBES = [
  'SELECT id, status FROM Missions LIMIT 0',
  'SELECT id, status, plan, evidence, continuation, attempt, idempotency_key, claimed_by, lease_expires_at FROM Agent_Sessions LIMIT 0',
  'SELECT id, session_id, status, idempotency_key, scheduled_for, attempt, claimed_by, lease_expires_at, dead_lettered_at FROM Job_Executions LIMIT 0',
  'SELECT id, schedule_expression, timezone, next_run_at, max_concurrency, enabled, last_success_at, last_error FROM Cron_Jobs LIMIT 0',
  'SELECT id, status, agent_action_id, created_at, updated_at FROM Approvals LIMIT 0',
  'SELECT key, count, reset_at FROM Rate_Limits LIMIT 0',
] as const;

export async function checkRequiredSchema(): Promise<string[]> {
  const failures: string[] = [];
  for (const query of REQUIRED_SCHEMA_PROBES) {
    try {
      await dbClient.query(query);
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }
  return failures;
}
