import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL integration tests.');
const sqlitePath = path.join(os.tmpdir(), `supr-postgres-integration-${Date.now()}.db`);
const durableEvidence = path.join(os.tmpdir(), `supr-durable-evaluation-${Date.now()}.json`);

async function resetSchema() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  await client.query('DROP SCHEMA IF EXISTS public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.end();
}

async function tableCount() {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const result = await client.query(
    `SELECT COUNT(*)::integer AS count FROM information_schema.tables WHERE table_schema = 'public'`,
  );
  await client.end();
  return result.rows[0].count;
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl, SQLITE_DB_PATH: sqlitePath },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited with ${code}`)));
  });
}

function runExpectFailure(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: databaseUrl, SQLITE_DB_PATH: sqlitePath },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code) => code === 0
      ? reject(new Error(`${args.join(' ')} unexpectedly succeeded`))
      : resolve());
  });
}

try {
  await resetSchema();
  await run(['--import', 'tsx', 'scripts/migrate-postgres.ts', '--dry-run']);
  if (await tableCount() !== 0) throw new Error('PostgreSQL migration dry-run did not roll back cleanly.');
  await run(['--import', 'tsx', 'scripts/migrate-postgres.ts']);
  await run(['--import', 'tsx', 'scripts/evaluate-durable-runtime.ts', '--output', durableEvidence]);
  await run(['scripts/verify-durable-evaluation.mjs', '--input', durableEvidence]);
  await run(['--import', 'tsx', 'tests/postgres-integration.ts']);

  const schemaEvidence = path.join(os.tmpdir(), `supr-postgres-schema-${Date.now()}.json`);
  await run(['--import', 'tsx', 'scripts/postgres-schema-gate.ts', '--bootstrap-empty', '--output', schemaEvidence]);
  await run(['--import', 'tsx', 'scripts/postgres-schema-gate.ts', '--output', schemaEvidence]);

  await resetSchema();
  const partial = new pg.Client({ connectionString: databaseUrl });
  await partial.connect();
  await partial.query('CREATE TABLE partial_schema_marker (id TEXT PRIMARY KEY)');
  await partial.end();
  await runExpectFailure(['--import', 'tsx', 'scripts/postgres-schema-gate.ts', '--bootstrap-empty', '--output', schemaEvidence]);
  fs.rmSync(schemaEvidence, { force: true });
} finally {
  fs.rmSync(sqlitePath, { force: true });
  fs.rmSync(durableEvidence, { force: true });
}
