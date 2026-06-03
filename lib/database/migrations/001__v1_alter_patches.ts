/**
 * Migrations applied by the v1 bootstrap (pre-migration-tool).
 *
 * The original lib/database/init.ts issued these ALTER TABLE
 * statements as try/catch patches. When a database is first
 * upgraded to the new migration tool, we "lock" the v1 schema
 * by inserting a synthetic row for the catch-all v1 migration
 * (see 9999__v1_initial_schema below). Each individual ALTER is
 * still applied as its own migration so that a fresh database --
 * which doesn't have these columns yet -- picks them up via the
 * standard runner.
 *
 * Id (0001..0006) is the order in which the original try/catch
 * blocks lived in init.ts.
 */

import type { Migration } from '../migrations';

export const addCronJobsAssignedAgentId: Migration = {
  id: '0001__add_cron_jobs_assigned_agent_id',
  description: 'Add assigned_agent_id column to Cron_Jobs.',
  up: (db) => {
    db.exec(`ALTER TABLE Cron_Jobs ADD COLUMN assigned_agent_id TEXT`);
  },
};

export const addCronJobsAssociatedTaskId: Migration = {
  id: '0002__add_cron_jobs_associated_task_id',
  description: 'Add associated_task_id column to Cron_Jobs.',
  up: (db) => {
    db.exec(`ALTER TABLE Cron_Jobs ADD COLUMN associated_task_id TEXT`);
  },
};

export const addMemoryItemsPinned: Migration = {
  id: '0003__add_memory_items_pinned',
  description: 'Add pinned column to Memory_Items.',
  up: (db) => {
    db.exec(`ALTER TABLE Memory_Items ADD COLUMN pinned INTEGER DEFAULT 0`);
  },
};

export const addMemoryItemsReviewedAt: Migration = {
  id: '0004__add_memory_items_reviewed_at',
  description: 'Add reviewed_at column to Memory_Items.',
  up: (db) => {
    db.exec(`ALTER TABLE Memory_Items ADD COLUMN reviewed_at DATETIME`);
  },
};

export const addMemoryItemsReason: Migration = {
  id: '0005__add_memory_items_reason',
  description: 'Add reason column to Memory_Items.',
  up: (db) => {
    db.exec(`ALTER TABLE Memory_Items ADD COLUMN reason TEXT`);
  },
};

export const addApprovalsAgentActionId: Migration = {
  id: '0006__add_approvals_agent_action_id',
  description: 'Add agent_action_id column to Approvals.',
  up: (db) => {
    db.exec(`ALTER TABLE Approvals ADD COLUMN agent_action_id TEXT`);
  },
};
