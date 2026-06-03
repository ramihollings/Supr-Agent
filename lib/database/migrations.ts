/**
 * Lightweight migration runner for the Supr SQLite database.
 *
 * The original schema lived in lib/database/init.ts as one big
 * `CREATE TABLE IF NOT EXISTS ...` block plus a few try/catch
 * `ALTER TABLE` patches that swallowed every kind of error. The
 * try/catch patches made the schema evolution story opaque: a
 * failed migration was indistinguishable from "already applied".
 *
 * This module replaces that with a versioned migration registry:
 *
 *   1. A `_migrations` table records which migration IDs have
 *      already been applied.
 *   2. Each migration is a small TypeScript module under
 *      `lib/database/migrations/` that exports
 *      `{ id, description, up(db) }`.
 *   3. The runner discovers every migration in lexical order and
 *      applies any that are not yet recorded. A "duplicate column
 *      name" or "table already exists" error during `up()` is
 *      treated as "the schema is already at this version" and the
 *      migration is recorded as applied. Any other error is
 *      rethrown -- a real schema problem fails loud at boot.
 *   4. Existing databases that were initialized before the
 *      migration tool existed get a synthetic `_migrations` row
 *      inserted for the pre-tool schema so the ALTER statements
 *      don't re-run and fail.
 *
 * The runner is sync (better-sqlite3 is sync); the migration list
 * is imported statically so the boot path is one synchronous walk
 * through the schema changes.
 */

import type Database from "better-sqlite3";

const APPLIED_DDL = `CREATE TABLE IF NOT EXISTS _migrations (
  id TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  applied_at TEXT NOT NULL
)`;

export interface Migration {
  /** Stable identifier; never changes. */
  id: string;
  /** Human-readable description. */
  description: string;
  /**
   * Apply this migration. May use any number of statements.
   * Errors that match the "benign" set (duplicate column, duplicate
   * table) are tolerated; everything else is rethrown.
   */
  up: (db: Database.Database) => void;
  /**
   * Optional inverse. When present, the runner exposes this through
   * `downgradeOne()` for use in recovery scripts. Not required for
   * the boot path.
   */
  down?: (db: Database.Database) => void;
}

const BENIGN_MIGRATION_PATTERNS: Array<(message: string) => boolean> = [
  (m) => m.includes("duplicate column name"),
  (m) => m.includes("already exists"),
];

function isBenignMigrationError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? "").toLowerCase();
  return BENIGN_MIGRATION_PATTERNS.some((test) => test(message));
}

function recordMigration(db: Database.Database, migration: Migration) {
  db.prepare(
    `INSERT INTO _migrations (id, description, applied_at) VALUES (?, ?, ?)`
  ).run(migration.id, migration.description, new Date().toISOString());
}

function appliedSet(db: Database.Database): Set<string> {
  return new Set(
    (db.prepare(`SELECT id FROM _migrations`).all() as Array<{ id: string }>).map((r) => r.id),
  );
}

/**
 * Apply every migration in `migrations` whose ID is not already in
 * `_migrations`. Idempotent: safe to call on every boot.
 */
export function applyMigrations(db: Database.Database, migrations: Migration[]): {
  applied: string[];
  skipped: string[];
} {
  db.exec(APPLIED_DDL);
  const done = appliedSet(db);
  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const applied: string[] = [];
  const skipped: string[] = [];
  for (const m of sorted) {
    if (done.has(m.id)) {
      skipped.push(m.id);
      continue;
    }
    try {
      m.up(db);
    } catch (err) {
      if (!isBenignMigrationError(err)) throw err;
      // Benign: the schema is already at this version (e.g. fresh
      // database already had the column). Record the migration so
      // we don't try again on the next boot.
    }
    recordMigration(db, m);
    applied.push(m.id);
  }
  return { applied, skipped };
}

/**
 * Mark a migration as already applied without running it. Used to
 * "lock" pre-tool schema changes when a database is first migrated
 * to the new tool.
 */
export function markMigrationApplied(db: Database.Database, migration: Migration): void {
  db.exec(APPLIED_DDL);
  if (appliedSet(db).has(migration.id)) return;
  recordMigration(db, migration);
}

/**
 * Reverse the most recently applied migration. Used by the
 * recovery CLI in scripts/recover.mjs (when we add one).
 */
export function downgradeOne(db: Database.Database, migrations: Migration[]): string | null {
  const done = appliedSet(db);
  const sorted = [...migrations].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const m = sorted[i];
    if (!done.has(m.id)) continue;
    if (!m.down) throw new Error(`Migration ${m.id} has no down() defined.`);
    m.down(db);
    db.prepare(`DELETE FROM _migrations WHERE id = ?`).run(m.id);
    return m.id;
  }
  return null;
}
