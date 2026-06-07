/**
 * Migration: add a `reported` column to Cost_Events.
 *
 * Until now the runtime was passing a hardcoded `inputTokens: 10000`
 * placeholder to `costTracker.recordCostEvent`, so the budget engine
 * had no idea whether a number came from a real provider `usage`
 * payload or from a local text-length estimate. This column records
 * the source so the operator can later report on "how much of our
 * tracked spend is reported vs estimated" — a coverage metric that
 * is meaningless without this column.
 *
 * 1 = the numbers came from the provider's `usage` payload
 * 0 = the numbers were estimated locally (length / 4)
 *
 * Safe to run on databases where the column already exists: the
 * `duplicate column name` error is benign and the migration runner
 * records the migration as applied.
 */

import type { Migration } from '../migrations';

export const addCostEventsReported: Migration = {
  id: '0120__add_cost_events_reported',
  description: 'Add Cost_Events.reported column to distinguish provider-reported usage from local estimates.',
  up: (db) => {
    db.exec(`ALTER TABLE Cost_Events ADD COLUMN reported INTEGER NOT NULL DEFAULT 0`);
  },
  down: (db) => {
    // SQLite does not support DROP COLUMN in older versions; the
    // downgrade is best-effort. We re-create the table without the
    // column so a recovery operator can roll back.
    db.exec(`
      CREATE TABLE Cost_Events__no_reported (
        id TEXT PRIMARY KEY,
        mission_id TEXT,
        agent_id TEXT,
        task_id TEXT,
        agent_run_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_cents REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      INSERT INTO Cost_Events__no_reported
        SELECT id, mission_id, agent_id, task_id, agent_run_id, provider, model,
               input_tokens, output_tokens, cost_cents, created_at
        FROM Cost_Events;
      DROP TABLE Cost_Events;
      ALTER TABLE Cost_Events__no_reported RENAME TO Cost_Events;
    `);
  },
};
