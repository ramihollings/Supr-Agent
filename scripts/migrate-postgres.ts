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

const pg = new Client({ connectionString: databaseUrl });
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const pgTable = (value: string) => quote(value.toLowerCase());

function pgType(type: string) {
  const normalized = String(type || '').toUpperCase();
  if (normalized.includes('BOOL')) return 'BOOLEAN';
  if (normalized.includes('INT')) return 'INTEGER';
  if (normalized.includes('REAL') || normalized.includes('FLOA') || normalized.includes('DOUB')) return 'DOUBLE PRECISION';
  if (normalized.includes('BLOB')) return 'BYTEA';
  if (normalized.includes('DATE') || normalized.includes('TIME')) return 'TIMESTAMPTZ';
  return 'TEXT';
}

function pgDefault(column: any) {
  if (column.dflt_value === null || column.dflt_value === undefined) return null;
  const type = pgType(column.type);
  if (type === 'BOOLEAN') {
    if (String(column.dflt_value) === '0') return 'FALSE';
    if (String(column.dflt_value) === '1') return 'TRUE';
  }
  return String(column.dflt_value);
}

function pgValue(column: any, value: unknown) {
  if (value === null || value === undefined) return value;
  if (pgType(column.type) === 'BOOLEAN') return Boolean(value);
  return value;
}

function normalizedValue(column: any, value: unknown) {
  if (value === null || value === undefined) return value;
  const type = pgType(column?.type || '');
  if (type === 'BOOLEAN') return Boolean(value);
  if (type === 'INTEGER' || type === 'DOUBLE PRECISION') return Number(value);
  if (type === 'TIMESTAMPTZ') {
    const timestamp = typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:/.test(value)
      ? `${value.replace(' ', 'T')}Z`
      : value;
    return new Date(timestamp as any).toISOString();
  }
  if (type === 'BYTEA' && Buffer.isBuffer(value)) return value.toString('base64');
  return value;
}

function checksumRows(rows: Record<string, unknown>[], columns: any[]) {
  const hash = crypto.createHash('sha256');
  const canonicalRows: string[] = [];
  for (const row of rows) {
    const canonical = Object.fromEntries(
      Object.entries(row)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, value]) => [name, normalizedValue(columns.find((column) => column.name === name), value)]),
    );
    canonicalRows.push(JSON.stringify(canonical));
  }
  canonicalRows.sort();
  for (const canonical of canonicalRows) {
    hash.update(canonical);
    hash.update('\n');
  }
  return hash.digest('hex');
}

async function main() {
if (!fs.existsSync(sourcePath)) {
  delete process.env.DATABASE_URL;
  delete process.env.PGHOST;
  process.env.SQLITE_DB_PATH = seedPath;
  const { getSqliteDb, initDatabase } = await import('../lib/database/init');
  initDatabase();
  getSqliteDb().close();
}
const sqlite = new Database(seedPath, { readonly: true });
const tables = sqlite.prepare(
  `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
).all() as Array<{ name: string }>;
await pg.connect();
try {
  await pg.query('BEGIN');
  const report: Array<{
    table: string;
    sourceRows: number;
    targetRows: number;
    sourceChecksum: string;
    targetChecksum: string;
  }> = [];
  const metadata = new Map<string, { columns: any[]; indexes: any[]; foreignKeys: any[] }>();

  // Build every table before indexes, data, and foreign keys. PostgreSQL
  // requires referenced tables to exist before a foreign key is added.
  for (const { name } of tables) {
    const columns = sqlite.prepare(`PRAGMA table_info(${quote(name)})`).all() as any[];
    const indexes = sqlite.prepare(`PRAGMA index_list(${quote(name)})`).all() as any[];
    const foreignKeys = sqlite.prepare(`PRAGMA foreign_key_list(${quote(name)})`).all() as any[];
    metadata.set(name, { columns, indexes, foreignKeys });
    const primaryKeys = columns.filter((column) => column.pk).sort((a, b) => a.pk - b.pk);
    const definitions = columns.map((column) => {
      const parts = [quote(column.name), pgType(column.type)];
      if (column.notnull) parts.push('NOT NULL');
      const defaultValue = pgDefault(column);
      if (defaultValue !== null) parts.push(`DEFAULT ${defaultValue}`);
      return parts.join(' ');
    });
    if (primaryKeys.length > 0) {
      definitions.push(`PRIMARY KEY (${primaryKeys.map((column) => quote(column.name)).join(', ')})`);
    }
    await pg.query(`CREATE TABLE IF NOT EXISTS ${pgTable(name)} (${definitions.join(', ')})`);
  }

  // Recreate both unique and non-unique SQLite indexes. Autoindexes that
  // duplicate a PostgreSQL primary key/unique constraint are skipped.
  for (const { name } of tables) {
    const { indexes } = metadata.get(name)!;
    for (const index of indexes.filter((item) => item.origin !== 'pk')) {
      const indexColumns = sqlite.prepare(`PRAGMA index_info(${quote(index.name)})`).all() as any[];
      if (indexColumns.length === 0) continue;
      const prefix = index.unique ? 'uq' : 'ix';
      const indexName = `${prefix}_${name}_${indexColumns.map((column) => column.name).join('_')}`.toLowerCase().slice(0, 60);
      await pg.query(
        `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX IF NOT EXISTS ${quote(indexName)} ON ${pgTable(name)}
         (${indexColumns.map((column) => quote(column.name)).join(', ')})`,
      );
    }
  }

  // Copy rows after the complete table/index surface exists.
  for (const { name } of tables) {
    const { columns } = metadata.get(name)!;
    const rows = sqlite.prepare(`SELECT * FROM ${quote(name)}`).all() as Record<string, unknown>[];
    for (const row of rows) {
      const names = Object.keys(row);
      const placeholders = names.map((_, index) => `$${index + 1}`);
      await pg.query(
        `INSERT INTO ${pgTable(name)} (${names.map(quote).join(', ')}) VALUES (${placeholders.join(', ')})
         ON CONFLICT DO NOTHING`,
        names.map((column) => pgValue(columns.find((item) => item.name === column), row[column])),
      );
    }
    const targetRows = await pg.query<Record<string, unknown>>(`SELECT * FROM ${pgTable(name)}`);
    report.push({
      table: name,
      sourceRows: rows.length,
      targetRows: targetRows.rows.length,
      sourceChecksum: checksumRows(rows, columns),
      targetChecksum: checksumRows(targetRows.rows, columns),
    });
  }

  // Add provider-neutral foreign-key relationships after data import. A
  // representative database with broken references now fails migration.
  for (const { name } of tables) {
    const { foreignKeys } = metadata.get(name)!;
    const groups = new Map<number, any[]>();
    for (const foreignKey of foreignKeys) {
      const group = groups.get(foreignKey.id) || [];
      group.push(foreignKey);
      groups.set(foreignKey.id, group);
    }
    for (const [id, group] of groups) {
      const ordered = [...group].sort((left, right) => left.seq - right.seq);
      const target = ordered[0].table;
      const constraintName = `fk_${name}_${id}_${target}`.toLowerCase().slice(0, 60);
      const existing = await pg.query(
        `SELECT 1 FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass`,
        [constraintName, name.toLowerCase()],
      );
      if (existing.rowCount) continue;
      const onUpdate = String(ordered[0].on_update || 'NO ACTION').toUpperCase();
      const onDelete = String(ordered[0].on_delete || 'NO ACTION').toUpperCase();
      await pg.query(
        `ALTER TABLE ${pgTable(name)} ADD CONSTRAINT ${quote(constraintName)}
         FOREIGN KEY (${ordered.map((item) => quote(item.from)).join(', ')})
         REFERENCES ${pgTable(target)} (${ordered.map((item) => quote(item.to)).join(', ')})
         ON UPDATE ${onUpdate} ON DELETE ${onDelete}`,
      );
    }
  }
  const mismatches = report.filter(
    (table) => table.targetRows !== table.sourceRows || table.targetChecksum !== table.sourceChecksum,
  );
  if (mismatches.length > 0) {
    throw new Error(`PostgreSQL migration verification failed:\n${JSON.stringify(mismatches, null, 2)}`);
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
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
