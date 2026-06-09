import { Pool } from 'pg';
import { getSqliteDb, initDatabase } from './init';

const isPostgres = !!(process.env.DATABASE_URL || process.env.PGHOST);
const allowProductionSqliteForTests = process.env.SUPR_ALLOW_PRODUCTION_SQLITE_FOR_TESTS === 'true';

let pgPool: Pool | null = null;
if (isPostgres) {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    pgPool = new Pool({ 
      connectionString,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
  } else {
    pgPool = new Pool({
      host: process.env.PGHOST,
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE,
      port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
      connectionTimeoutMillis: 5000,
      statement_timeout: 10000,
    });
  }
  console.log('[db_client] Initialized PostgreSQL connection pool.');
} else {
  console.log(
    process.env.NODE_ENV === 'production' && !allowProductionSqliteForTests
      ? '[db_client] PostgreSQL configuration required in production.'
      : '[db_client] Falling back to SQLite.',
  );
}

let isSqliteInitialized = false;
function ensureSqliteInitialized() {
  if (!isPostgres && !isSqliteInitialized) {
    if (process.env.NODE_ENV === 'production' && !allowProductionSqliteForTests) {
      throw new Error('PostgreSQL configuration is required in production.');
    }
    initDatabase(); // Idempotent — safe to call multiple times
    isSqliteInitialized = true;
  }
}

/**
 * Helper to translate SQLite query placeholders (?) to PostgreSQL placeholders ($1, $2, ...)
 */
function translateQuery(sql: string): string {
  if (!isPostgres) return sql;
  let translated = sql
    .replace(/\browid\b/gi, 'id')
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, 'INSERT INTO');
  let index = 1;
  translated = translated.replace(/\?/g, () => `$${index++}`);
  if (/^\s*INSERT\s+INTO/i.test(translated) && /INSERT\s+OR\s+IGNORE/i.test(sql)) {
    translated = `${translated.replace(/;\s*$/, '')} ON CONFLICT DO NOTHING`;
  }
  return translated;
}

export const dbClient = {
  isPostgres,

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    if (isPostgres && pgPool) {
      const pgSql = translateQuery(sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows;
    } else {
      ensureSqliteInitialized();
      const db = getSqliteDb();
      return db.prepare(sql).all(params) as T[];
    }
  },

  async queryOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
    if (isPostgres && pgPool) {
      const pgSql = translateQuery(sql);
      const res = await pgPool.query(pgSql, params);
      return res.rows[0];
    } else {
      ensureSqliteInitialized();
      const db = getSqliteDb();
      return db.prepare(sql).get(params) as T | undefined;
    }
  },

  async execute(sql: string, params: any[] = []): Promise<void> {
    if (isPostgres && pgPool) {
      const pgSql = translateQuery(sql);
      await pgPool.query(pgSql, params);
    } else {
      ensureSqliteInitialized();
      const db = getSqliteDb();
      db.prepare(sql).run(params);
    }
  },

  // Helper for batch transaction execution
  async runTransaction(operations: { sql: string; params: any[] }[]): Promise<void> {
    if (isPostgres && pgPool) {
      const client = await pgPool.connect();
      try {
        await client.query('BEGIN');
        for (const op of operations) {
          const pgSql = translateQuery(op.sql);
          await client.query(pgSql, op.params);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      ensureSqliteInitialized();
      const db = getSqliteDb();
      const transaction = db.transaction((ops: typeof operations) => {
        for (const op of ops) {
          db.prepare(op.sql).run(op.params);
        }
      });
      transaction(operations);
    }
  },

  async close(): Promise<void> {
    if (pgPool) {
      await pgPool.end();
      pgPool = null;
    }
    if (!isPostgres && isSqliteInitialized) {
      getSqliteDb().close();
      isSqliteInitialized = false;
    }
  }
};

export default dbClient;
