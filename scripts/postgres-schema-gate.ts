import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { Client } from 'pg';
import { checkRequiredSchema } from '../lib/database/schema-health';
import dbClient from '../lib/database/db_client';

const bootstrap = process.argv.includes('--bootstrap-empty');
const outputArg = process.argv.indexOf('--output');
const outputPath = resolve(outputArg >= 0 ? process.argv[outputArg + 1] : 'release-evidence/postgres-schema.json');
const hasConnection = Boolean(process.env.DATABASE_URL || process.env.PGHOST);

if (!hasConnection) {
  throw new Error('DATABASE_URL or PGHOST is required.');
}

function pgClient() {
  return process.env.DATABASE_URL
    ? new Client({ connectionString: process.env.DATABASE_URL })
    : new Client();
}

async function countApplicationTables() {
  const client = pgClient();
  await client.connect();
  try {
    const result = await client.query<{ count: number }>(
      `SELECT COUNT(*)::integer AS count
       FROM information_schema.tables
       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`,
    );
    return Number(result.rows[0]?.count || 0);
  } finally {
    await client.end();
  }
}

function bootstrapEmptySchema() {
  return new Promise<void>((resolvePromise, reject) => {
    const emptySchemaSource = resolve(tmpdir(), `supr-empty-schema-${randomUUID()}.db`);
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'scripts/migrate-postgres.ts'],
      {
        cwd: process.cwd(),
        env: { ...process.env, SQLITE_DB_PATH: emptySchemaSource },
        stdio: 'inherit',
      },
    );
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`PostgreSQL schema bootstrap exited with code ${code}`));
    });
  });
}

async function main() {
  const startedAt = new Date().toISOString();
  const initialTableCount = await countApplicationTables();
  let bootstrapped = false;

  if (bootstrap && initialTableCount === 0) {
    await bootstrapEmptySchema();
    bootstrapped = true;
  }

  const failures = await checkRequiredSchema();
  const finalTableCount = await countApplicationTables();
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    startedAt,
    bootstrapRequested: bootstrap,
    bootstrapped,
    initialTableCount,
    finalTableCount,
    passed: failures.length === 0,
    failures,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await dbClient.close();

  if (failures.length > 0) {
    throw new Error(`PostgreSQL schema gate failed with ${failures.length} missing or incompatible schema probe(s).`);
  }
  console.log(`PostgreSQL schema gate passed with ${finalTableCount} tables${bootstrapped ? ' after empty-database bootstrap' : ''}.`);
}

main().catch(async (error) => {
  await dbClient.close().catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
});
