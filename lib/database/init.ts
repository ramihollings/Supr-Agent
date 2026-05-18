import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

// Initialize the local SQLite database
const dbPath = path.resolve(process.cwd(), 'supr_local.db');
const db = new Database(dbPath, { verbose: console.log });

export function initDatabase() {
  console.log('Initializing Supr local database...');

  // Enable WAL mode for better performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 1. Missions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Missions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      goal TEXT,
      workflow_type TEXT,
      autonomy_mode TEXT,
      status TEXT,
      current_phase_id TEXT,
      constraints TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Glidepaths Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Glidepaths (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      phases TEXT, -- JSON Array
      tasks TEXT, -- JSON Array
      approval_gates TEXT, -- JSON Array
      blockers TEXT, -- JSON Array
      standards TEXT, -- JSON Array
      decisions TEXT, -- JSON Array
      risks TEXT, -- JSON Array
      assumptions TEXT, -- JSON Array
      progress REAL DEFAULT 0,
      readiness_score REAL DEFAULT 0,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  // 3. Agents Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Agents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      name TEXT NOT NULL,
      role TEXT,
      type TEXT, -- permanent or temporary
      permission_tier TEXT,
      tools TEXT, -- JSON Array
      status TEXT,
      current_task_id TEXT,
      retry_limit INTEGER DEFAULT 3,
      retry_count INTEGER DEFAULT 0
    )
  `);

  // 4. Tasks Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Tasks (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      phase_id TEXT,
      title TEXT NOT NULL,
      status TEXT,
      owner_agent_id TEXT,
      required_permission TEXT,
      retry_count INTEGER DEFAULT 0,
      blocker_reason TEXT,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(owner_agent_id) REFERENCES Agents(id)
    )
  `);

  // 5. Approvals Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Approvals (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      task_id TEXT,
      requesting_agent_id TEXT,
      action TEXT,
      required_permission TEXT,
      risk_level TEXT,
      reason TEXT,
      status TEXT, -- pending, approved, rejected, revised
      decision TEXT,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(task_id) REFERENCES Tasks(id),
      FOREIGN KEY(requesting_agent_id) REFERENCES Agents(id)
    )
  `);

  // 6. Artifacts Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Artifacts (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      type TEXT,
      title TEXT,
      content TEXT,
      created_by_agent_id TEXT,
      quality_status TEXT,
      evidence_refs TEXT, -- JSON Array
      assumptions TEXT, -- JSON Array
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(created_by_agent_id) REFERENCES Agents(id)
    )
  `);

  // 7. Memory_Items Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Memory_Items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      mission_id TEXT,
      scope TEXT,
      type TEXT,
      content TEXT,
      source TEXT,
      importance REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  // 8. Event_Log Table (For event-sourced trace replays)
  db.exec(`
    CREATE TABLE IF NOT EXISTS Event_Log (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      actor_type TEXT, -- user, agent, system
      actor_id TEXT,
      event_type TEXT,
      summary TEXT,
      metadata TEXT, -- JSON Object
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  // 9. Failure_Events Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Failure_Events (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      task_id TEXT,
      agent_id TEXT,
      failure_type TEXT,
      attempt_number INTEGER,
      failure_summary TEXT,
      supr_guidance TEXT,
      resolution_status TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(task_id) REFERENCES Tasks(id),
      FOREIGN KEY(agent_id) REFERENCES Agents(id)
    )
  `);

  // 10. Skills Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      provider TEXT,
      tools TEXT, -- JSON Array
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 11. Cron_Jobs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS Cron_Jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      interval TEXT,
      target_action TEXT,
      last_run DATETIME,
      status TEXT, -- Active, Paused
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default Skills if table is empty
  const skillsCount = db.prepare(`SELECT COUNT(*) as cnt FROM Skills`).get() as { cnt: number };
  if (skillsCount.cnt === 0) {
    const insertSkill = db.prepare(`
      INSERT INTO Skills (id, name, description, provider, tools)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertSkill.run(
      'sk-1',
      'Toprank SEO',
      'Optimizes structured markdown deliverables for maximum Google search results positioning.',
      'Custom API',
      JSON.stringify(['optimize_metadata', 'keyword_density_audit'])
    );
    insertSkill.run(
      'sk-2',
      'CloakBrowser Integration',
      'Stealth crawler enabling play-by-play internet exploration without bot-fingerprint blocks.',
      'Composio',
      JSON.stringify(['stealth_scrape', 'javascript_render'])
    );
    insertSkill.run(
      'sk-3',
      'AST Sandbox Self-Healer',
      'Diagnoses code compiler failures and performs single-line replacements within docker nodes.',
      'Anthropic',
      JSON.stringify(['compile_sandbox', 'fix_syntax_lint'])
    );
  }

  // Seed default Cron Jobs if table is empty
  const cronsCount = db.prepare(`SELECT COUNT(*) as cnt FROM Cron_Jobs`).get() as { cnt: number };
  if (cronsCount.cnt === 0) {
    const insertCron = db.prepare(`
      INSERT INTO Cron_Jobs (id, name, interval, target_action, last_run, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertCron.run(
      'cr-1',
      'Signal Aggregator Sync',
      'Every 5 minutes',
      'Scrape competitor product signals & feature releases via CloakBrowser.',
      new Date(Date.now() - 3 * 60000).toISOString(),
      'Active'
    );
    insertCron.run(
      'cr-2',
      'Workspace Log Sanitizer',
      'Daily at midnight',
      'Clean temporary docker assets & compile cache objects inside local sandboxes.',
      new Date(Date.now() - 14 * 3600000).toISOString(),
      'Active'
    );
    insertCron.run(
      'cr-3',
      'Semantic Index Compiler',
      'Hourly',
      'Trigger full recursive embedding update for vectorized RRF memory sync.',
      new Date(Date.now() - 45 * 60000).toISOString(),
      'Paused'
    );
  }

  console.log('Database initialization complete.');
}

// Run database initialization synchronously on import to guarantee all tables exist in SQLite
initDatabase();

export default db;
