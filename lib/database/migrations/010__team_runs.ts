/**
 * Schema additions for sub-agent teams.
 *
 * Four tables, all keyed by a `team_id` UUID assigned at the start
 * of `spawn_subagent_team`. The schema is intentionally narrow so
 * the coordinator can build rich in-memory state on top of it
 * without bloating the database:
 *
 *   - `Team_Runs`     one row per team (lifecycle + checksum)
 *   - `Team_Members`  one row per role assignment (qa, planner,
 *                     research, supervisor, or caller-added extras)
 *   - `Team_Context`  the shared key/value working memory every
 *                     member can read and write during execution
 *   - `Team_Messages` the inter-agent message bus (from, to, body)
 *
 * Naming follows the existing project convention: PascalCase
 * table names, snake_case columns, ISO-8601 timestamps in TEXT
 * columns, and a synthetic primary key produced by the
 * `chatMessageId`-style helper in the team tool.
 */

import type { Migration } from '../migrations';

export const addTeamRuns: Migration = {
  id: '0100__add_team_runs',
  description: 'Create Team_Runs for sub-agent team lifecycles.',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Team_Runs (
        team_id TEXT PRIMARY KEY,
        mission_id TEXT,
        name TEXT NOT NULL,
        supervisor_member_id TEXT,
        shared_brief TEXT NOT NULL,
        coordination_mode TEXT NOT NULL DEFAULT 'pipeline',
        status TEXT NOT NULL DEFAULT 'pending',
        member_count INTEGER NOT NULL DEFAULT 0,
        result TEXT,
        checksum TEXT NOT NULL,
        error TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_team_runs_mission ON Team_Runs(mission_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_team_runs_status ON Team_Runs(status)`);
  },
};

export const addTeamMembers: Migration = {
  id: '0101__add_team_members',
  description: 'Create Team_Members for sub-agent team role assignments.',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Team_Members (
        member_id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        slot TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        task TEXT NOT NULL,
        permission_tier TEXT NOT NULL,
        tools TEXT NOT NULL,
        target_files TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (team_id) REFERENCES Team_Runs(team_id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_team_members_team ON Team_Members(team_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_team_members_status ON Team_Members(status)`);
  },
};

export const addTeamContext: Migration = {
  id: '0102__add_team_context',
  description: 'Create Team_Context for shared working memory across team members.',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Team_Context (
        team_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (team_id, key),
        FOREIGN KEY (team_id) REFERENCES Team_Runs(team_id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_team_context_team ON Team_Context(team_id)`);
  },
};

export const addTeamMessages: Migration = {
  id: '0103__add_team_messages',
  description: 'Create Team_Messages for inter-agent communication inside a team.',
  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS Team_Messages (
        id TEXT PRIMARY KEY,
        team_id TEXT NOT NULL,
        from_member_id TEXT NOT NULL,
        to_member_id TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'message',
        body TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (team_id) REFERENCES Team_Runs(team_id) ON DELETE CASCADE
      )
    `);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_team_messages_team ON Team_Messages(team_id)`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_team_messages_to ON Team_Messages(to_member_id)`);
  },
};
