import type { Migration } from '../migrations';

export const addDurableExecutions: Migration = {
  id: '013_durable_executions',
  description: 'Add durable agent sessions, job executions, continuations, and scheduler fields',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Agent_Sessions (
        id TEXT PRIMARY KEY,
        mission_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        plan TEXT NOT NULL DEFAULT '[]',
        result TEXT,
        evidence TEXT NOT NULL DEFAULT '{}',
        continuation TEXT,
        attempt INTEGER NOT NULL DEFAULT 0,
        idempotency_key TEXT NOT NULL UNIQUE,
        claimed_by TEXT,
        lease_expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(mission_id) REFERENCES Missions(id)
      );

      CREATE TABLE IF NOT EXISTS Job_Executions (
        id TEXT PRIMARY KEY,
        cron_job_id TEXT,
        session_id TEXT NOT NULL,
        source TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        idempotency_key TEXT NOT NULL UNIQUE,
        scheduled_for TEXT NOT NULL,
        attempt INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        claimed_by TEXT,
        lease_expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(cron_job_id) REFERENCES Cron_Jobs(id),
        FOREIGN KEY(session_id) REFERENCES Agent_Sessions(id)
      );

      CREATE TABLE IF NOT EXISTS Run_Continuations (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL UNIQUE,
        state_data TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS Rate_Limits (
        key TEXT PRIMARY KEY,
        count INTEGER NOT NULL DEFAULT 0,
        reset_at TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_job_executions_status_schedule
        ON Job_Executions(status, scheduled_for);
      CREATE INDEX IF NOT EXISTS idx_agent_sessions_status_lease
        ON Agent_Sessions(status, lease_expires_at);
    `);

    for (const statement of [
      `ALTER TABLE Cron_Jobs ADD COLUMN schedule_expression TEXT`,
      `ALTER TABLE Cron_Jobs ADD COLUMN timezone TEXT DEFAULT 'UTC'`,
      `ALTER TABLE Cron_Jobs ADD COLUMN next_run_at TEXT`,
      `ALTER TABLE Cron_Jobs ADD COLUMN max_concurrency INTEGER DEFAULT 1`,
      `ALTER TABLE Cron_Jobs ADD COLUMN last_success_at TEXT`,
      `ALTER TABLE Cron_Jobs ADD COLUMN last_error TEXT`,
    ]) {
      try { db.exec(statement); } catch (error: any) {
        if (!String(error?.message || error).toLowerCase().includes('duplicate column')) throw error;
      }
    }
  },
};
