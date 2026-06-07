import Database from 'better-sqlite3';
import { Client } from 'pg';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required.');

const sourcePath = process.env.SQLITE_DB_PATH
  ? path.resolve(process.env.SQLITE_DB_PATH)
  : path.resolve(process.cwd(), 'supr_local.db');
const dryRun = process.argv.includes('--dry-run');
const seedPath = fs.existsSync(sourcePath)
  ? sourcePath
  : path.join(os.tmpdir(), `supr-schema-${Date.now()}.db`);

if (!fs.existsSync(sourcePath)) {
  delete process.env.DATABASE_URL;
  delete process.env.PGHOST;
  process.env.SQLITE_DB_PATH = seedPath;
  const { initDatabase } = await import('../lib/database/init');
  initDatabase();
}

const sqlite = new Database(seedPath, { readonly: true });
const pg = new Client({ connectionString: databaseUrl });
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const tables = sqlite.prepare(
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
).all() as Array<{ name: string }>;

function pgType(type: string) {
  const normalized = String(type || '').toUpperCase();
  if (normalized.includes('INT')) return 'BIGINT';
  if (normalized.includes('REAL') || normalized.includes('FLOA') || normalized.includes('DOUB')) return 'DOUBLE PRECISION';
  if (normalized.includes('BLOB')) return 'BYTEA';
  if (normalized.includes('DATE') || normalized.includes('TIME')) return 'TIMESTAMPTZ';
  return 'TEXT';
}

function checksumRows(rows: Record<string, unknown>[]) {
  const hash = crypto.createHash('sha256');
  for (const row of rows) {
    const canonical = Object.fromEntries(
      Object.entries(row).sort(([left], [right]) => left.localeCompare(right)),
    );
    hash.update(JSON.stringify(canonical));
    hash.update('\n');
  }
  return hash.digest('hex');
}

await pg.connect();
try {
  await pg.query('BEGIN');
  const report: Array<{ table: string; sourceRows: number; targetRows: number; sourceChecksum: string }> = [];
  for (const { name } of tables) {
    const columns = sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all() as any[];
    const primaryKeys = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk);
    const definitions = columns.map((column) => {
      const parts = [quote(column.name), pgType(column.type)];
      if (column.notnull) parts.push('NOT NULL');
      if (column.dflt_value !== null && column.dflt_value !== undefined) parts.push(`DEFAULT ${column.dflt_value}`);
      return parts.join(' ');
    });
    if (primaryKeys.length > 0) {
      definitions.push(`PRIMARY KEY (${primaryKeys.map((column) => quote(column.name)).join(', ')})`);
    }
    await pg.query(`CREATE TABLE IF NOT EXISTS ${quote(name)} (${definitions.join(', ')})`);
    const indexes = sqlite.prepare(`PRAGMA index_list(${quote(name)})`).all() as any[];
    for (const index of indexes.filter((item) => item.unique)) {
      const indexColumns = sqlite.prepare(`PRAGMA index_info(${quote(index.name)})`).all() as any[];
      if (indexColumns.length === 0) continue;
      const indexName = `uq_${name}_${indexColumns.map((column) => column.name).join('_')}`.slice(0, 60);
      await pg.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS ${quote(indexName)} ON ${quote(name)}
         (${indexColumns.map((column) => quote(column.name)).join(', ')})`,
      );
    }

    const rows = sqlite.prepare(`SELECT * FROM ${quote(name)}`).all() as Record<string, unknown>[];
    for (const row of rows) {
      const names = Object.keys(row);
      const placeholders = names.map((_, index) => `$${index + 1}`);
      await pg.query(
        `INSERT INTO ${quote(name)} (${names.map(quote).join(', ')}) VALUES (${placeholders.join(', ')})
         ON CONFLICT DO NOTHING`,
        names.map((column) => row[column]),
      );
    }
    const targetCount = await pg.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${quote(name)}`);
    report.push({
      table: name,
      sourceRows: rows.length,
      targetRows: Number(targetCount.rows[0]?.count || 0),
      sourceChecksum: checksumRows(rows),
    });
  }
  const mismatches = report.filter((table) => table.targetRows < table.sourceRows);
  if (mismatches.length > 0) {
    throw new Error(`PostgreSQL row-count verification failed for: ${mismatches.map((table) => table.table).join(', ')}`);
  }
  if (dryRun) await pg.query('ROLLBACK');
  else await pg.query('COMMIT');
  console.log(JSON.stringify({ dryRun, source: seedPath, tables: report }, null, 2));
} catch (error) {
  await pg.query('ROLLBACK');
  throw error;
} finally {
  sqlite.close();
  await pg.end();
  if (seedPath !== sourcePath) fs.rmSync(seedPath, { force: true });
}
