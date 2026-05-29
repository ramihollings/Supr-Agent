import { Client } from 'pg';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const sqliteDbPath = process.env.SQLITE_DB_PATH 
  ? path.resolve(process.env.SQLITE_DB_PATH) 
  : path.resolve(process.cwd(), 'supr_local.db');

const pgConnectionUri = process.env.DATABASE_URL;

if (!pgConnectionUri) {
  console.error("DATABASE_URL must be specified to execute the v4.0 migration.");
  process.exit(1);
}

async function migrateToPostgresV4() {
  if (!fs.existsSync(sqliteDbPath)) {
    console.error(`SQLite source database not found at: ${sqliteDbPath}`);
    process.exit(1);
  }

  const sqlite = new Database(sqliteDbPath, { readonly: true });
  const pgClient = new Client({ connectionString: pgConnectionUri });

  try {
    await pgClient.connect();
    console.log("[Migration v4.0] Connected to PostgreSQL. Preparing schema setup...");

    // Begin isolated transaction block
    await pgClient.query("BEGIN;");

    // Initialize Schema structures
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Missions (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        goal TEXT,
        workflow_type VARCHAR(255),
        autonomy_mode VARCHAR(255),
        status VARCHAR(255) NOT NULL,
        current_phase_id VARCHAR(255),
        constraints TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS Agents (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        role VARCHAR(255),
        type VARCHAR(255) CHECK (type IN ('permanent', 'temporary')),
        permission_tier VARCHAR(255),
        tools JSONB DEFAULT '[]',
        status VARCHAR(255),
        current_task_id VARCHAR(255),
        retry_limit INTEGER DEFAULT 3,
        retry_count INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS Glidepaths (
        id VARCHAR(255) PRIMARY KEY,
        mission_id VARCHAR(255) NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
        phases JSONB NOT NULL,
        tasks JSONB NOT NULL,
        approval_gates JSONB NOT NULL DEFAULT '[]',
        progress REAL DEFAULT 0,
        readiness_score REAL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS Event_Log (
        id VARCHAR(255) PRIMARY KEY,
        mission_id VARCHAR(255) NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
        actor_type VARCHAR(255),
        actor_id VARCHAR(255),
        event_type VARCHAR(255),
        summary TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}',
        timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Helper functions
    const safeJsonParse = (rawStr: string | null | undefined): any => {
      if (!rawStr) return null;
      try {
        return JSON.parse(rawStr);
      } catch (err) {
        return {};
      }
    };

    // Load and validate relational data loops
    console.log("[Migration v4.0] Extracting data from SQLite and mapping to PostgreSQL...");

    // 1. Migrate Missions
    const missions = sqlite.prepare("SELECT * FROM Missions").all() as any[];
    console.log(`[Migration v4.0] Mapping ${missions.length} Missions...`);
    for (const m of missions) {
      await pgClient.query(
        `INSERT INTO Missions (id, title, goal, workflow_type, autonomy_mode, status, current_phase_id, constraints, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO UPDATE SET
         title=$2, goal=$3, workflow_type=$4, autonomy_mode=$5, status=$6, current_phase_id=$7, constraints=$8, created_at=$9, updated_at=$10`,
        [m.id, m.title, m.goal, m.workflow_type, m.autonomy_mode, m.status || 'Active', m.current_phase_id, m.constraints, m.created_at, m.updated_at]
      );
    }

    // 2. Migrate Agents
    const agents = sqlite.prepare("SELECT * FROM Agents").all() as any[];
    console.log(`[Migration v4.0] Mapping ${agents.length} Agents...`);
    for (const a of agents) {
      const parsedTools = safeJsonParse(a.tools) || [];
      await pgClient.query(
        `INSERT INTO Agents (id, workspace_id, name, role, type, permission_tier, tools, status, current_task_id, retry_limit, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
         workspace_id=$2, name=$3, role=$4, type=$5, permission_tier=$6, tools=$7, status=$8, current_task_id=$9, retry_limit=$10, retry_count=$11`,
        [a.id, a.workspace_id, a.name, a.role, a.type, a.permission_tier, JSON.stringify(parsedTools), a.status, a.current_task_id, a.retry_limit, a.retry_count]
      );
    }

    // 3. Migrate Glidepaths (Casting stringified TEXT to JSONB)
    const glidepaths = sqlite.prepare("SELECT * FROM Glidepaths").all() as any[];
    console.log(`[Migration v4.0] Mapping ${glidepaths.length} Glidepaths into native JSONB schema...`);
    for (const g of glidepaths) {
      const parsedPhases = safeJsonParse(g.phases) || [];
      const parsedTasks = safeJsonParse(g.tasks) || [];
      const parsedGates = safeJsonParse(g.approval_gates) || [];
      
      await pgClient.query(
        `INSERT INTO Glidepaths (id, mission_id, phases, tasks, approval_gates, progress, readiness_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
         mission_id=$2, phases=$3, tasks=$4, approval_gates=$5, progress=$6, readiness_score=$7`,
        [g.id, g.mission_id, JSON.stringify(parsedPhases), JSON.stringify(parsedTasks), JSON.stringify(parsedGates), g.progress, g.readiness_score]
      );
    }

    // 4. Migrate Event Logs (Mapping metadata TEXT containing JSON -> JSONB, with timezone indexes)
    const eventLogs = sqlite.prepare("SELECT * FROM Event_Log").all() as any[];
    console.log(`[Migration v4.0] Mapping ${eventLogs.length} Event logs...`);
    for (const log of eventLogs) {
      const parsedMeta = safeJsonParse(log.metadata) || {};
      
      await pgClient.query(
        `INSERT INTO Event_Log (id, mission_id, actor_type, actor_id, event_type, summary, metadata, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
         mission_id=$2, actor_type=$3, actor_id=$4, event_type=$5, summary=$6, metadata=$7, timestamp=$8`,
        [log.id, log.mission_id, log.actor_type, log.actor_id, log.event_type, log.summary, JSON.stringify(parsedMeta), log.timestamp]
      );
    }

    // Commit changes if all constraints passed successfully
    await pgClient.query("COMMIT;");
    console.log("[Migration v4.0] Relational schema and dataset successfully loaded in transaction block.");

  } catch (error) {
    // Rollback transaction to prevent system state corruption
    await pgClient.query("ROLLBACK;");
    console.error("[Migration v4.0] Failed to complete database migration. Rollback executed.", error);
    process.exit(1);
  } finally {
    sqlite.close();
    await pgClient.end();
    console.log("[Migration v4.0] Relational connection pool destroyed.");
  }
}

migrateToPostgresV4().catch(err => {
  console.error("[Migration v4.0] Critical uncaught failure:", err);
  process.exit(1);
});
