#!/usr/bin/env node
/**
 * Supr schema recovery CLI.
 *
 * Usage:
 *   npm run db:status        # default: list applied migrations
 *   npm run db:status status # same as above
 *   npm run db:status up     # apply every pending migration
 *   npm run db:status lock-v1# seed v1 migrations as applied (pre-migration-tool DBs)
 *   npm run db:status down    # reverse the most recently applied migration
 *
 * Reads SQLITE_DB_PATH (defaulting to ./supr_local.db) from .env.
 *
 * The lock-v1 command exists so that databases initialized before
 * the migration tool existed (PR23) can be brought up to the new
 * tooling without re-running the ALTER TABLE statements that
 * init.ts already applied. The v1 migrations get recorded in
 * _migrations with the current timestamp; future boots skip them.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const COMMAND = process.argv[2] || "status";

const V1_MIGRATIONS = [
  "0001__add_cron_jobs_assigned_agent_id",
  "0002__add_cron_jobs_associated_task_id",
  "0003__add_memory_items_pinned",
  "0004__add_memory_items_reviewed_at",
  "0005__add_memory_items_reason",
  "0006__add_approvals_agent_action_id",
];

function loadEnv() {
  const path = resolve(ROOT, ".env");
  if (!existsSync(path)) return;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();
const dbPath = process.env.SQLITE_DB_PATH || resolve(ROOT, "supr_local.db");
if (!existsSync(dbPath)) {
  console.error(`No database found at ${dbPath}`);
  process.exit(1);
}

const readonly = COMMAND === "status";
const db = new Database(dbPath, { readonly });
try {
  if (COMMAND === "status") {
    const rows = db
      .prepare("SELECT id, applied_at FROM _migrations ORDER BY id")
      .all();
    if (rows.length === 0) {
      console.log("(no _migrations table or no applied migrations yet)");
    } else {
      for (const row of rows) console.log(`${row.id}\t${row.applied_at}`);
    }
  } else if (COMMAND === "up") {
    // Idempotent: the runner records _migrations rows for any
    // already-applied migration, so a re-run is a no-op for old
    // ones and applies the rest.
    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL)`);
    const done = new Set(
      db.prepare("SELECT id FROM _migrations").all().map((r) => r.id),
    );
    const insert = db.prepare(
      `INSERT INTO _migrations (id, description, applied_at) VALUES (?, ?, ?)`,
    );
    for (const id of V1_MIGRATIONS) {
      if (done.has(id)) {
        console.log(`+ ${id}`);
        continue;
      }
      try {
        // Replay the SQL just to surface a real error if the
        // schema isn't what we expect.
        applySqlForId(id, db);
      } catch (err) {
        // Benign: the column or table already exists.
        const message = String(err?.message ?? err);
        if (!/duplicate column name|already exists/i.test(message)) throw err;
      }
      insert.run(id, "pre-migration-tool", new Date().toISOString());
      console.log(`+ ${id}`);
    }
  } else if (COMMAND === "lock-v1") {
    // Same as 'up' but only marks the v1 set as applied, without
    // re-trying the SQL. Use this on a database you're confident
    // already has the v1 schema (i.e. the columns exist).
    db.exec(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, description TEXT NOT NULL, applied_at TEXT NOT NULL)`);
    const done = new Set(
      db.prepare("SELECT id FROM _migrations").all().map((r) => r.id),
    );
    const insert = db.prepare(
      `INSERT INTO _migrations (id, description, applied_at) VALUES (?, ?, ?)`,
    );
    const now = new Date().toISOString();
    for (const id of V1_MIGRATIONS) {
      if (done.has(id)) {
        console.log(`✓ ${id} (already locked)`);
        continue;
      }
      insert.run(id, "pre-migration-tool", now);
      console.log(`+ ${id} (locked)`);
    }
  } else if (COMMAND === "down") {
    const row = db
      .prepare("SELECT id FROM _migrations ORDER BY applied_at DESC LIMIT 1")
      .get();
    if (!row) {
      console.log("(no migrations to roll back)");
    } else {
      db.prepare("DELETE FROM _migrations WHERE id = ?").run(row.id);
      console.log(`- ${row.id}`);
    }
  } else {
    console.error("usage: npm run db:status [status|up|down|lock-v1]");
    process.exit(2);
  }
} finally {
  db.close();
}

/**
 * Apply the SQL for a given migration id. This duplicates the
 * canonical list in lib/database/migrations/001__v1_alter_patches.ts
 * to keep the recovery CLI standalone (no TypeScript loader
 * required). The two MUST stay in sync.
 */
function applySqlForId(id, db) {
  switch (id) {
    case "0001__add_cron_jobs_assigned_agent_id":
      db.exec(`ALTER TABLE Cron_Jobs ADD COLUMN assigned_agent_id TEXT`);
      return;
    case "0002__add_cron_jobs_associated_task_id":
      db.exec(`ALTER TABLE Cron_Jobs ADD COLUMN associated_task_id TEXT`);
      return;
    case "0003__add_memory_items_pinned":
      db.exec(`ALTER TABLE Memory_Items ADD COLUMN pinned INTEGER DEFAULT 0`);
      return;
    case "0004__add_memory_items_reviewed_at":
      db.exec(`ALTER TABLE Memory_Items ADD COLUMN reviewed_at DATETIME`);
      return;
    case "0005__add_memory_items_reason":
      db.exec(`ALTER TABLE Memory_Items ADD COLUMN reason TEXT`);
      return;
    case "0006__add_approvals_agent_action_id":
      db.exec(`ALTER TABLE Approvals ADD COLUMN agent_action_id TEXT`);
      return;
    default:
      throw new Error(`Unknown migration id: ${id}`);
  }
}
