import Database from 'better-sqlite3';
import { Client } from 'pg';
import path from 'path';
import fs from 'fs';

// Resolve SQLite Database Path
const dbPath = process.env.SQLITE_DB_PATH 
  ? path.resolve(process.env.SQLITE_DB_PATH) 
  : path.resolve(process.cwd(), 'supr_local.db');

// Resolve PostgreSQL Connection URI
const pgUri = process.env.DATABASE_URL;

if (!pgUri) {
  console.error("Error: DATABASE_URL environment variable must be set.");
  process.exit(1);
}

console.log(`[Migration] SQLite DB Path: ${dbPath}`);
console.log(`[Migration] PostgreSQL DB Target: ${pgUri.replace(/:[^:@/]+@/, ':****@')}`); // Mask password

async function runMigration() {
  if (!fs.existsSync(dbPath)) {
    console.error(`Error: Source SQLite database not found at ${dbPath}`);
    process.exit(1);
  }

  const sqliteDb = new Database(dbPath, { readonly: true });
  const pgClient = new Client({ connectionString: pgUri });

  try {
    await pgClient.connect();
    console.log("[Migration] Connected to PostgreSQL.");

    // Start database schema synchronization
    await pgClient.query("BEGIN;");

    console.log("[Migration] Creating tables if not exist in PostgreSQL...");

    // 1. Missions Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Missions (
        id VARCHAR(255) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        goal TEXT,
        workflow_type VARCHAR(255),
        autonomy_mode VARCHAR(255),
        status VARCHAR(255),
        current_phase_id VARCHAR(255),
        constraints TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. Agents Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Agents (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255),
        name VARCHAR(255) NOT NULL,
        role VARCHAR(255),
        type VARCHAR(255), -- permanent or temporary
        permission_tier VARCHAR(255),
        tools JSONB,
        status VARCHAR(255),
        current_task_id VARCHAR(255),
        retry_limit INTEGER DEFAULT 3,
        retry_count INTEGER DEFAULT 0
      );
    `);

    // 3. Glidepaths Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Glidepaths (
        id VARCHAR(255) PRIMARY KEY,
        mission_id VARCHAR(255) NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
        phases JSONB,
        tasks JSONB,
        approval_gates JSONB,
        blockers JSONB,
        standards JSONB,
        decisions JSONB,
        risks JSONB,
        assumptions JSONB,
        progress REAL DEFAULT 0,
        readiness_score REAL DEFAULT 0
      );
    `);

    // 4. Tasks Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Tasks (
        id VARCHAR(255) PRIMARY KEY,
        mission_id VARCHAR(255) NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
        phase_id VARCHAR(255),
        title VARCHAR(255) NOT NULL,
        status VARCHAR(255),
        owner_agent_id VARCHAR(255) REFERENCES Agents(id) ON DELETE SET NULL,
        required_permission VARCHAR(255),
        retry_count INTEGER DEFAULT 0,
        blocker_reason TEXT
      );
    `);

    // 5. Approvals Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Approvals (
        id VARCHAR(255) PRIMARY KEY,
        mission_id VARCHAR(255) NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
        task_id VARCHAR(255) REFERENCES Tasks(id) ON DELETE CASCADE,
        requesting_agent_id VARCHAR(255) REFERENCES Agents(id) ON DELETE SET NULL,
        action VARCHAR(255),
        required_permission VARCHAR(255),
        risk_level VARCHAR(255),
        reason TEXT,
        status VARCHAR(255),
        decision TEXT
      );
    `);

    // 6. Artifacts Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Artifacts (
        id VARCHAR(255) PRIMARY KEY,
        mission_id VARCHAR(255) NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
        type VARCHAR(255),
        title VARCHAR(255),
        content TEXT,
        created_by_agent_id VARCHAR(255) REFERENCES Agents(id) ON DELETE SET NULL,
        quality_status VARCHAR(255),
        evidence_refs JSONB,
        assumptions JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 7. Memory_Items Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Memory_Items (
        id VARCHAR(255) PRIMARY KEY,
        workspace_id VARCHAR(255),
        mission_id VARCHAR(255) REFERENCES Missions(id) ON DELETE CASCADE,
        scope VARCHAR(255),
        type VARCHAR(255),
        content TEXT,
        source VARCHAR(255),
        importance REAL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 8. Event_Log Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Event_Log (
        id VARCHAR(255) PRIMARY KEY,
        mission_id VARCHAR(255) NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
        actor_type VARCHAR(255),
        actor_id VARCHAR(255),
        event_type VARCHAR(255),
        summary TEXT,
        metadata JSONB,
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 9. Failure_Events Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Failure_Events (
        id VARCHAR(255) PRIMARY KEY,
        mission_id VARCHAR(255) NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
        task_id VARCHAR(255) REFERENCES Tasks(id) ON DELETE CASCADE,
        agent_id VARCHAR(255) REFERENCES Agents(id) ON DELETE SET NULL,
        failure_type VARCHAR(255),
        attempt_number INTEGER,
        failure_summary TEXT,
        supr_guidance TEXT,
        resolution_status VARCHAR(255),
        timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 10. Skills Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Skills (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        provider VARCHAR(255),
        tools JSONB,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 11. Cron_Jobs Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Cron_Jobs (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        interval VARCHAR(255),
        target_action TEXT,
        last_run TIMESTAMPTZ,
        status VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 12. Settings Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 13. Supr_Chat_Messages Table
    await pgClient.query(`
      CREATE TABLE IF NOT EXISTS Supr_Chat_Messages (
        id VARCHAR(255) PRIMARY KEY,
        sender VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        file_name VARCHAR(255),
        file_type VARCHAR(255),
        file_content TEXT,
        created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log("[Migration] PostgreSQL schema initialized successfully.");

    // Helper function to safely parse stringified SQLite fields to JSON objects/arrays
    const safeParse = (str: string | null | undefined): any => {
      if (!str) return null;
      try {
        return JSON.parse(str);
      } catch (e) {
        return str; // Return raw value if not JSON
      }
    };

    // --- Migrate Data ---

    // 1. Missions Table
    console.log("[Migration] Migrating Missions...");
    const missions = sqliteDb.prepare("SELECT * FROM Missions").all() as any[];
    for (const m of missions) {
      await pgClient.query(
        `INSERT INTO Missions (id, title, goal, workflow_type, autonomy_mode, status, current_phase_id, constraints, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET
         title=$2, goal=$3, workflow_type=$4, autonomy_mode=$5, status=$6, current_phase_id=$7, constraints=$8, created_at=$9, updated_at=$10`,
        [m.id, m.title, m.goal, m.workflow_type, m.autonomy_mode, m.status, m.current_phase_id, m.constraints, m.created_at, m.updated_at]
      );
    }

    // 2. Agents Table
    console.log("[Migration] Migrating Agents...");
    const agents = sqliteDb.prepare("SELECT * FROM Agents").all() as any[];
    for (const a of agents) {
      await pgClient.query(
        `INSERT INTO Agents (id, workspace_id, name, role, type, permission_tier, tools, status, current_task_id, retry_limit, retry_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (id) DO UPDATE SET
         workspace_id=$2, name=$3, role=$4, type=$5, permission_tier=$6, tools=$7, status=$8, current_task_id=$9, retry_limit=$10, retry_count=$11`,
        [a.id, a.workspace_id, a.name, a.role, a.type, a.permission_tier, JSON.stringify(safeParse(a.tools)), a.status, a.current_task_id, a.retry_limit, a.retry_count]
      );
    }

    // 3. Glidepaths Table
    console.log("[Migration] Migrating Glidepaths...");
    const glidepaths = sqliteDb.prepare("SELECT * FROM Glidepaths").all() as any[];
    for (const g of glidepaths) {
      await pgClient.query(
        `INSERT INTO Glidepaths (id, mission_id, phases, tasks, approval_gates, blockers, standards, decisions, risks, assumptions, progress, readiness_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) ON CONFLICT (id) DO UPDATE SET
         mission_id=$2, phases=$3, tasks=$4, approval_gates=$5, blockers=$6, standards=$7, decisions=$8, risks=$9, assumptions=$10, progress=$11, readiness_score=$12`,
        [
          g.id, g.mission_id, 
          JSON.stringify(safeParse(g.phases)), 
          JSON.stringify(safeParse(g.tasks)), 
          JSON.stringify(safeParse(g.approval_gates)), 
          JSON.stringify(safeParse(g.blockers)), 
          JSON.stringify(safeParse(g.standards)), 
          JSON.stringify(safeParse(g.decisions)), 
          JSON.stringify(safeParse(g.risks)), 
          JSON.stringify(safeParse(g.assumptions)), 
          g.progress, g.readiness_score
        ]
      );
    }

    // 4. Tasks Table
    console.log("[Migration] Migrating Tasks...");
    const tasks = sqliteDb.prepare("SELECT * FROM Tasks").all() as any[];
    for (const t of tasks) {
      await pgClient.query(
        `INSERT INTO Tasks (id, mission_id, phase_id, title, status, owner_agent_id, required_permission, retry_count, blocker_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET
         mission_id=$2, phase_id=$3, title=$4, status=$5, owner_agent_id=$6, required_permission=$7, retry_count=$8, blocker_reason=$9`,
        [t.id, t.mission_id, t.phase_id, t.title, t.status, t.owner_agent_id, t.required_permission, t.retry_count, t.blocker_reason]
      );
    }

    // 5. Approvals Table
    console.log("[Migration] Migrating Approvals...");
    const approvals = sqliteDb.prepare("SELECT * FROM Approvals").all() as any[];
    for (const ap of approvals) {
      await pgClient.query(
        `INSERT INTO Approvals (id, mission_id, task_id, requesting_agent_id, action, required_permission, risk_level, reason, status, decision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET
         mission_id=$2, task_id=$3, requesting_agent_id=$4, action=$5, required_permission=$6, risk_level=$7, reason=$8, status=$9, decision=$10`,
        [ap.id, ap.mission_id, ap.task_id, ap.requesting_agent_id, ap.action, ap.required_permission, ap.risk_level, ap.reason, ap.status, ap.decision]
      );
    }

    // 6. Artifacts Table
    console.log("[Migration] Migrating Artifacts...");
    const artifacts = sqliteDb.prepare("SELECT * FROM Artifacts").all() as any[];
    for (const ar of artifacts) {
      await pgClient.query(
        `INSERT INTO Artifacts (id, mission_id, type, title, content, created_by_agent_id, quality_status, evidence_refs, assumptions, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET
         mission_id=$2, type=$3, title=$4, content=$5, created_by_agent_id=$6, quality_status=$7, evidence_refs=$8, assumptions=$9, created_at=$10`,
        [ar.id, ar.mission_id, ar.type, ar.title, ar.content, ar.created_by_agent_id, ar.quality_status, JSON.stringify(safeParse(ar.evidence_refs)), JSON.stringify(safeParse(ar.assumptions)), ar.created_at]
      );
    }

    // 7. Memory_Items Table
    console.log("[Migration] Migrating Memory_Items...");
    const memoryItems = sqliteDb.prepare("SELECT * FROM Memory_Items").all() as any[];
    for (const m of memoryItems) {
      await pgClient.query(
        `INSERT INTO Memory_Items (id, workspace_id, mission_id, scope, type, content, source, importance, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO UPDATE SET
         workspace_id=$2, mission_id=$3, scope=$4, type=$5, content=$6, source=$7, importance=$8, created_at=$9`,
        [m.id, m.workspace_id, m.mission_id, m.scope, m.type, m.content, m.source, m.importance, m.created_at]
      );
    }

    // 8. Event_Log Table
    console.log("[Migration] Migrating Event_Log...");
    const eventLogs = sqliteDb.prepare("SELECT * FROM Event_Log").all() as any[];
    for (const el of eventLogs) {
      await pgClient.query(
        `INSERT INTO Event_Log (id, mission_id, actor_type, actor_id, event_type, summary, metadata, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (id) DO UPDATE SET
         mission_id=$2, actor_type=$3, actor_id=$4, event_type=$5, summary=$6, metadata=$7, timestamp=$8`,
        [el.id, el.mission_id, el.actor_type, el.actor_id, el.event_type, el.summary, JSON.stringify(safeParse(el.metadata)), el.timestamp]
      );
    }

    // 9. Failure_Events Table
    console.log("[Migration] Migrating Failure_Events...");
    const failureEvents = sqliteDb.prepare("SELECT * FROM Failure_Events").all() as any[];
    for (const fe of failureEvents) {
      await pgClient.query(
        `INSERT INTO Failure_Events (id, mission_id, task_id, agent_id, failure_type, attempt_number, failure_summary, supr_guidance, resolution_status, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO UPDATE SET
         mission_id=$2, task_id=$3, agent_id=$4, failure_type=$5, attempt_number=$6, failure_summary=$7, supr_guidance=$8, resolution_status=$9, timestamp=$10`,
        [fe.id, fe.mission_id, fe.task_id, fe.agent_id, fe.failure_type, fe.attempt_number, fe.failure_summary, fe.supr_guidance, fe.resolution_status, fe.timestamp]
      );
    }

    // 10. Skills Table
    console.log("[Migration] Migrating Skills...");
    const skills = sqliteDb.prepare("SELECT * FROM Skills").all() as any[];
    for (const s of skills) {
      await pgClient.query(
        `INSERT INTO Skills (id, name, description, provider, tools, created_at)
         VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO UPDATE SET
         name=$2, description=$3, provider=$4, tools=$5, created_at=$6`,
        [s.id, s.name, s.description, s.provider, JSON.stringify(safeParse(s.tools)), s.created_at]
      );
    }

    // 11. Cron_Jobs Table
    console.log("[Migration] Migrating Cron_Jobs...");
    const cronJobs = sqliteDb.prepare("SELECT * FROM Cron_Jobs").all() as any[];
    for (const c of cronJobs) {
      await pgClient.query(
        `INSERT INTO Cron_Jobs (id, name, interval, target_action, last_run, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET
         name=$2, interval=$3, target_action=$4, last_run=$5, status=$6, created_at=$7`,
        [c.id, c.name, c.interval, c.target_action, c.last_run, c.status, c.created_at]
      );
    }

    // 12. Settings Table
    console.log("[Migration] Migrating Settings...");
    const settings = sqliteDb.prepare("SELECT * FROM Settings").all() as any[];
    for (const st of settings) {
      await pgClient.query(
        `INSERT INTO Settings (key, value, updated_at)
         VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET
         value=$2, updated_at=$3`,
        [st.key, st.value, st.updated_at]
      );
    }

    // 13. Supr_Chat_Messages Table
    console.log("[Migration] Migrating Supr_Chat_Messages...");
    const chatMessages = sqliteDb.prepare("SELECT * FROM Supr_Chat_Messages").all() as any[];
    for (const cm of chatMessages) {
      await pgClient.query(
        `INSERT INTO Supr_Chat_Messages (id, sender, content, file_name, file_type, file_content, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (id) DO UPDATE SET
         sender=$2, content=$3, file_name=$4, file_type=$5, file_content=$6, created_at=$7`,
        [cm.id, cm.sender, cm.content, cm.file_name, cm.file_type, cm.file_content, cm.created_at]
      );
    }

    await pgClient.query("COMMIT;");
    console.log("[Migration] Transaction committed successfully. SQLite relational data successfully mapped to PostgreSQL!");
  } catch (error) {
    await pgClient.query("ROLLBACK;");
    console.error("[Migration] Schema migration failed. Transaction rolled back.", error);
    process.exit(1);
  } finally {
    sqliteDb.close();
    await pgClient.end();
    console.log("[Migration] Disconnected from databases.");
  }
}

runMigration().catch(err => {
  console.error("[Migration] Fatal uncaught migration error:", err);
  process.exit(1);
});
