/**
 * Master registry of all schema migrations.
 *
 * New migrations get their own file in this directory and are added
 * to the `migrations` array below in the order they should be
 * applied. The runner sorts by id, so any non-lexical order here is
 * just a hint.
 *
 * To mark a fresh-from-init.ts database as having been "migrated"
 * to the v1 schema without re-running the ALTER TABLE statements,
 * the init() boot path also inserts a synthetic v1 row (see
 * 9999__v1_initial_schema).
 */

import type { Migration } from './migrations';
import {
  addCronJobsAssignedAgentId,
  addCronJobsAssociatedTaskId,
  addMemoryItemsPinned,
  addMemoryItemsReviewedAt,
  addMemoryItemsReason,
  addApprovalsAgentActionId,
} from './migrations/001__v1_alter_patches';
import {
  addTeamRuns,
  addTeamMembers,
  addTeamContext,
  addTeamMessages,
} from './migrations/010__team_runs';
import { addMcpInvocations } from './migrations/011__mcp_invocations';
import { addCostEventsReported } from './migrations/012__cost_events_reported';

export const migrations: Migration[] = [
  addCronJobsAssignedAgentId,
  addCronJobsAssociatedTaskId,
  addMemoryItemsPinned,
  addMemoryItemsReviewedAt,
  addMemoryItemsReason,
  addApprovalsAgentActionId,
  addTeamRuns,
  addTeamMembers,
  addTeamContext,
  addTeamMessages,
  addMcpInvocations,
  addCostEventsReported,
];
