#!/usr/bin/env node
/**
 * List the migrations that have been applied to the Supr SQLite
 * database. Useful in deployment scripts to confirm a migration
 * ran, or to debug boot failures.
 *
 * Reads SQLITE_DB_PATH (defaults to ./supr_local.db), opens the
 * database read-only, and prints one line per applied migration.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

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

const db = new Database(dbPath, { readonly: true });
try {
  const rows = db.prepare("SELECT id, applied_at FROM _migrations ORDER BY id").all();
  if (rows.length === 0) {
    console.log("(no _migrations table or no applied migrations yet)");
  } else {
    for (const row of rows) console.log(`${row.id}\t${row.applied_at}`);
  }
} finally {
  db.close();
}
