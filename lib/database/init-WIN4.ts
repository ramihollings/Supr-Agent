import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const isPostgres = !!(process.env.DATABASE_URL || process.env.PGHOST);

// 1. Initialize SQLite Database instance for fallback/local mode
const dbPath = process.env.SQLITE_DB_PATH 
  ? path.resolve(process.env.SQLITE_DB_PATH) 
  : path.resolve(process.cwd(), 'supr_local.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath, { verbose: console.log });

export function initDatabaseSQLite() {
  console.log('Initializing Supr local SQLite database...');

  // Enable WAL mode for better performance outside container, use DELETE mode inside Docker mounts
  const isDocker = fs.existsSync('/.dockerenv');
  if (isDocker) {
    db.pragma('journal_mode = DELETE');
  } else {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -2000');

  // SQLite table creations
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

  db.exec(`
    CREATE TABLE IF NOT EXISTS Glidepaths (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      phases TEXT,
      tasks TEXT,
      approval_gates TEXT,
      blockers TEXT,
      standards TEXT,
      decisions TEXT,
      risks TEXT,
      assumptions TEXT,
      progress REAL DEFAULT 0,
      readiness_score REAL DEFAULT 0,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS Agents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      name TEXT NOT NULL,
      role TEXT,
      type TEXT,
      permission_tier TEXT,
      tools TEXT,
      status TEXT,
      current_task_id TEXT,
      retry_limit INTEGER DEFAULT 3,
      retry_count INTEGER DEFAULT 0
    )
  `);

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
      status TEXT,
      decision TEXT,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(task_id) REFERENCES Tasks(id),
      FOREIGN KEY(requesting_agent_id) REFERENCES Agents(id)
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS Artifacts (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      type TEXT,
      title TEXT,
      content TEXT,
      created_by_agent_id TEXT,
      quality_status TEXT,
      evidence_refs TEXT,
      assumptions TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(created_by_agent_id) REFERENCES Agents(id)
    )
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS Event_Log (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      actor_type TEXT,
      actor_id TEXT,
      event_type TEXT,
      summary TEXT,
      metadata TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

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

  db.exec(`
    CREATE TABLE IF NOT EXISTS Skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      provider TEXT,
      tools TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS Cron_Jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      interval TEXT,
      target_action TEXT,
      last_run DATETIME,
      status TEXT,
      assigned_agent_id TEXT,
      associated_task_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    db.exec(`ALTER TABLE Cron_Jobs ADD COLUMN assigned_agent_id TEXT`);
  } catch (e) {}

  try {
    db.exec(`ALTER TABLE Cron_Jobs ADD COLUMN associated_task_id TEXT`);
  } catch (e) {}

  db.exec(`
    CREATE TABLE IF NOT EXISTS Settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS Supr_Chat_Messages (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      file_name TEXT,
      file_type TEXT,
      file_content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seeding default SQLite settings
  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO Settings (key, value)
    VALUES (?, ?)
  `);
  
  insertSetting.run('operating_mode', 'guided');
  insertSetting.run('permission_boundary', 'governed');
  insertSetting.run('governance_standards', JSON.stringify(['SOX', 'SOC2']));
  insertSetting.run('channels_email', 'true');
  insertSetting.run('channels_slack', 'true');
  insertSetting.run('channels_telegram', 'false');
  insertSetting.run('channels_social', 'false');
  insertSetting.run('appearance_theme', 'neobrutalist');
  insertSetting.run('appearance_palette', 'classic');
  insertSetting.run('integrations_composio', '');
  insertSetting.run('integrations_github', '');
  insertSetting.run('integrations_slack', '');
  insertSetting.run('integrations_gmail', '');

  const chatMessagesCount = db.prepare(`SELECT COUNT(*) as cnt FROM Supr_Chat_Messages`).get() as { cnt: number };
  if (chatMessagesCount.cnt === 0) {
    db.prepare(`
      INSERT OR IGNORE INTO Supr_Chat_Messages (id, sender, content)
      VALUES (?, ?, ?)
    `).run(
      'init-chat-msg',
      'supr',
      'Hello! I am Supr, your central coordinator. This is Supr-Chat, a rapid-fire space where you can ask me to perform quick tasks directly. You can upload documents, query data, run fast web intelligence lookups, or ask me to draft emails and scripts. How can I assist you today?'
    );
  }

  const skillsCount = db.prepare(`SELECT COUNT(*) as cnt FROM Skills`).get() as { cnt: number };
  if (skillsCount.cnt === 0) {
    const insertSkill = db.prepare(`
      INSERT OR IGNORE INTO Skills (id, name, description, provider, tools)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertSkill.run('sk-1', 'Toprank SEO', 'Optimizes structured markdown deliverables for maximum Google search results positioning.', 'Custom API', JSON.stringify(['optimize_metadata', 'keyword_density_audit']));
    insertSkill.run('sk-2', 'CloakBrowser Integration', 'Automated web browser helper for gathering internet data.', 'Composio', JSON.stringify(['stealth_scrape', 'javascript_render']));
    insertSkill.run('sk-3', 'Code Self-Healer', 'Finds syntax and runtime errors in code and automatically applies fixes.', 'Anthropic', JSON.stringify(['compile_sandbox', 'fix_syntax_lint']));
    insertSkill.run('sk-4', 'Web Browser Automation', 'Automates a web browser to read pages, take screenshots, run scripts, and check page loading diagnostics.', 'MCP', JSON.stringify(['navigate', 'screenshot', 'execute_javascript', 'lighthouse_audit']));
  }

  const cronsCount = db.prepare(`SELECT COUNT(*) as cnt FROM Cron_Jobs`).get() as { cnt: number };
  if (cronsCount.cnt === 0) {
    const insertCron = db.prepare(`
      INSERT OR IGNORE INTO Cron_Jobs (id, name, interval, target_action, last_run, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertCron.run('cr-1', 'Signal Aggregator Sync', 'Every 5 minutes', 'Find competitor product signals & feature releases using the automated browser.', new Date(Date.now() - 3 * 60000).toISOString(), 'Active');
    insertCron.run('cr-2', 'Workspace Log Sanitizer', 'Daily at midnight', 'Clean temporary workspace files and cache files.', new Date(Date.now() - 14 * 3600000).toISOString(), 'Active');
    insertCron.run('cr-3', 'Semantic Index Compiler', 'Hourly', 'Refresh AI memory with recent project files.', new Date(Date.now() - 45 * 60000).toISOString(), 'Paused');
  }

  const orchCount = db.prepare(`SELECT COUNT(*) as cnt FROM Event_Log WHERE event_type IN ('delegation','handoff','review','approval','escalation','governance')`).get() as { cnt: number };
  if (orchCount.cnt === 0) {
    const missionRow = db.prepare(`SELECT id FROM Missions LIMIT 1`).get() as { id: string } | undefined;
    let mid = missionRow?.id;
    if (!mid) {
      mid = 'm1';
      db.prepare(`
        INSERT OR IGNORE INTO Missions (id, title, goal, status)
        VALUES (?, ?, ?, ?)
      `).run('m1', 'Production Migration v4.0', 'Hardening cloud-native architecture', 'Active');
      
      db.prepare(`
        INSERT OR IGNORE INTO Glidepaths (id, mission_id, phases, tasks, readiness_score)
        VALUES (?, ?, ?, ?, ?)
      `).run('gp-m1', 'm1', '[]', '[]', 0.87);
    }
    const insertEvent = db.prepare(`
      INSERT OR IGNORE INTO Event_Log (id, mission_id, event_type, actor_type, actor_id, summary, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const events = [
      { id: `orch-1`, type: 'delegation', actor: 'Supr', summary: 'Assigned Research Agent to Context Scan phase', detail: 'Research Agent has Observe+Draft permissions and direct access to the GitHub issues cache. Optimal fit for initial context gathering.', target: 'Research Agent', mins: 42 },
      { id: `orch-2`, type: 'delegation', actor: 'Supr', summary: 'Assigned Signal Agent to Ingestion phase', detail: 'Signal Agent will run CloakBrowser stealth scraping on competitor product feeds. Task requires External_Act permission tier.', target: 'Signal Agent', mins: 38 },
      { id: `orch-3`, type: 'handoff', actor: 'Research Agent', summary: 'Passed context findings → Code Agent for implementation', detail: 'Research Agent completed 24 data frame extractions. Handing structured JSON payload to Code Agent for schema integration.', target: 'Code Agent', mins: 30 },
      { id: `orch-4`, type: 'review', actor: 'Supr', summary: 'Reviewed Code Agent output on Brief Gen phase', detail: 'Code Agent submitted spec draft v1. Supr flagged missing test coverage specifications and acceptance criteria. Requesting revisions.', target: 'Code Agent', mins: 25 },
      { id: `orch-5`, type: 'escalation', actor: 'Supr', summary: 'Code Agent sandbox failure — rerouting to retry', detail: 'pytest suite failed: mock_tickets.json missing embedding schema key. Auto-retry attempt 2 of 3 initiated with adjusted parameters.', target: 'Code Agent', mins: 22 },
      { id: `orch-6`, type: 'governance', actor: 'Supr', summary: 'Denied Execute permission for temporary Scout Agent', detail: 'Scout Agent requested sandbox execution access but only holds Observe tier. Escalating to user for manual permission grant.', target: 'Scout Agent', mins: 20 },
      { id: `orch-7`, type: 'delegation', actor: 'Supr', summary: 'Reassigned QA Gate to QA Agent after Code Agent retry', detail: 'Code Agent completed retry successfully. QA Agent will now validate the corrected output against acceptance criteria.', target: 'QA Agent', mins: 18 },
      { id: `orch-8`, type: 'review', actor: 'Supr', summary: 'Reviewed QA Agent test results on sandbox output', detail: 'QA Agent ran 12 assertions. 11 passed, 1 edge case flagged. Supr approved with conditional note to monitor edge case in production.', target: 'QA Agent', mins: 14 },
      { id: `orch-9`, type: 'approval', actor: 'Supr', summary: 'Approved QA Gate — advancing project to Export phase', detail: 'All critical assertions passed. Readiness score advanced from 72% to 87%. Clearing project for artifact export and delivery bundle generation.', target: 'QA Agent', mins: 10 },
      { id: `orch-10`, type: 'handoff', actor: 'QA Agent', summary: 'Passed validated artifacts → Signal Agent for export packaging', detail: 'QA-verified code and brief artifacts handed to Signal Agent for final formatting and delivery bundle compilation.', target: 'Signal Agent', mins: 8 },
      { id: `orch-11`, type: 'delegation', actor: 'Supr', summary: 'Assigned Research Agent to compile strategic insights memo', detail: 'With core execution complete, Research Agent will compile a final strategic insights document from all memory items and findings.', target: 'Research Agent', mins: 5 },
      { id: `orch-12`, type: 'governance', actor: 'Supr', summary: 'Promoted Code Agent permission tier: Edit → Execute', detail: 'Code Agent demonstrated reliability across 3 successful sandbox runs. Supr auto-promoted permission tier for future tasks.', target: 'Code Agent', mins: 3 },
      { id: `orch-13`, type: 'approval', actor: 'Supr', summary: 'Final delivery bundle approved for strategic handoff', detail: 'All 3 deliverable artifacts validated. Readiness score: 87%. Project cleared for user review and download.', target: 'Signal Agent', mins: 1 },
      { id: `orch-14`, type: 'delegation', actor: 'Supr', summary: 'Assigned Context Agent to begin next project intake', detail: 'With current project nearing completion, Supr is pre-allocating Context Agent to the intake phase of the next queued project.', target: 'Context Agent', mins: 0 },
    ];
    for (const ev of events) {
      insertEvent.run(
        ev.id, mid, ev.type, 'agent', ev.actor, ev.summary,
        JSON.stringify({ detail: ev.detail, targetAgent: ev.target }),
        new Date(now - ev.mins * 60000).toISOString()
      );
    }
  }

  console.log('SQLite database initialization complete.');
}

export async function initDatabasePostgres() {
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  const pool = connectionString ? new Pool({ connectionString }) : new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    port: process.env.PGPORT ? parseInt(process.env.PGPORT) : 5432,
  });

  console.log('Initializing Supr PostgreSQL database...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Missions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      goal TEXT,
      workflow_type TEXT,
      autonomy_mode TEXT,
      status TEXT,
      current_phase_id TEXT,
      constraints TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Glidepaths (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
      phases TEXT,
      tasks TEXT,
      approval_gates TEXT,
      blockers TEXT,
      standards TEXT,
      decisions TEXT,
      risks TEXT,
      assumptions TEXT,
      progress REAL DEFAULT 0,
      readiness_score REAL DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Agents (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      name TEXT NOT NULL,
      role TEXT,
      type TEXT,
      permission_tier TEXT,
      tools TEXT,
      status TEXT,
      current_task_id TEXT,
      retry_limit INTEGER DEFAULT 3,
      retry_count INTEGER DEFAULT 0
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Tasks (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
      phase_id TEXT,
      title TEXT NOT NULL,
      status TEXT,
      owner_agent_id TEXT REFERENCES Agents(id) ON DELETE SET NULL,
      required_permission TEXT,
      retry_count INTEGER DEFAULT 0,
      blocker_reason TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Approvals (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES Tasks(id) ON DELETE SET NULL,
      requesting_agent_id TEXT REFERENCES Agents(id) ON DELETE SET NULL,
      action TEXT,
      required_permission TEXT,
      risk_level TEXT,
      reason TEXT,
      status TEXT,
      decision TEXT
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Artifacts (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
      type TEXT,
      title TEXT,
      content TEXT,
      created_by_agent_id TEXT REFERENCES Agents(id) ON DELETE SET NULL,
      quality_status TEXT,
      evidence_refs TEXT,
      assumptions TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Memory_Items (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      mission_id TEXT REFERENCES Missions(id) ON DELETE SET NULL,
      scope TEXT,
      type TEXT,
      content TEXT,
      source TEXT,
      importance REAL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Event_Log (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
      actor_type TEXT,
      actor_id TEXT,
      event_type TEXT,
      summary TEXT,
      metadata TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Failure_Events (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL REFERENCES Missions(id) ON DELETE CASCADE,
      task_id TEXT REFERENCES Tasks(id) ON DELETE SET NULL,
      agent_id TEXT REFERENCES Agents(id) ON DELETE SET NULL,
      failure_type TEXT,
      attempt_number INTEGER,
      failure_summary TEXT,
      supr_guidance TEXT,
      resolution_status TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      provider TEXT,
      tools TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Cron_Jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      interval TEXT,
      target_action TEXT,
      last_run TIMESTAMP,
      status TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS Supr_Chat_Messages (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      file_name TEXT,
      file_type TEXT,
      file_content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Seed default settings
  const seedSetting = async (key: string, value: string) => {
    await pool.query(`
      INSERT INTO Settings (key, value)
      VALUES ($1, $2)
      ON CONFLICT (key) DO NOTHING
    `, [key, value]);
  };

  await seedSetting('operating_mode', 'guided');
  await seedSetting('permission_boundary', 'governed');
  await seedSetting('governance_standards', JSON.stringify(['SOX', 'SOC2']));
  await seedSetting('channels_email', 'true');
  await seedSetting('channels_slack', 'true');
  await seedSetting('channels_telegram', 'false');
  await seedSetting('channels_social', 'false');
  await seedSetting('appearance_theme', 'neobrutalist');
  await seedSetting('appearance_palette', 'classic');
  await seedSetting('integrations_composio', '');
  await seedSetting('integrations_github', '');
  await seedSetting('integrations_slack', '');
  await seedSetting('integrations_gmail', '');

  const chatMessagesCount = await pool.query(`SELECT COUNT(*) as cnt FROM Supr_Chat_Messages`);
  if (parseInt(chatMessagesCount.rows[0].cnt) === 0) {
    await pool.query(`
      INSERT INTO Supr_Chat_Messages (id, sender, content)
      VALUES ($1, $2, $3)
    `, [
      'init-chat-msg',
      'supr',
      'Hello! I am Supr, your central coordinator. This is Supr-Chat, a rapid-fire space where you can ask me to perform quick tasks directly. You can upload documents, query data, run fast web intelligence lookups, or ask me to draft emails and scripts. How can I assist you today?'
    ]);
  }

  const skillsCount = await pool.query(`SELECT COUNT(*) as cnt FROM Skills`);
  if (parseInt(skillsCount.rows[0].cnt) === 0) {
    const insertSkill = async (id: string, name: string, description: string, provider: string, tools: string[]) => {
      await pool.query(`
        INSERT INTO Skills (id, name, description, provider, tools)
        VALUES ($1, $2, $3, $4, $5)
      `, [id, name, description, provider, JSON.stringify(tools)]);
    };
    await insertSkill('sk-1', 'Toprank SEO', 'Optimizes structured markdown deliverables for maximum Google search results positioning.', 'Custom API', ['optimize_metadata', 'keyword_density_audit']);
    await insertSkill('sk-2', 'CloakBrowser Integration', 'Automated web browser helper for gathering internet data.', 'Composio', ['stealth_scrape', 'javascript_render']);
    await insertSkill('sk-3', 'Code Self-Healer', 'Finds syntax and runtime errors in code and automatically applies fixes.', 'Anthropic', ['compile_sandbox', 'fix_syntax_lint']);
    await insertSkill('sk-4', 'Web Browser Automation', 'Automates a web browser to read pages, take screenshots, run scripts, and check page loading diagnostics.', 'MCP', ['navigate', 'screenshot', 'execute_javascript', 'lighthouse_audit']);
  }

  const cronsCount = await pool.query(`SELECT COUNT(*) as cnt FROM Cron_Jobs`);
  if (parseInt(cronsCount.rows[0].cnt) === 0) {
    await pool.query(`
      INSERT INTO Cron_Jobs (id, name, interval, target_action, last_run, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['cr-1', 'Signal Aggregator Sync', 'Every 5 minutes', 'Find competitor product signals & feature releases using the automated browser.', new Date(Date.now() - 3 * 60000).toISOString(), 'Active']);
    await pool.query(`
      INSERT INTO Cron_Jobs (id, name, interval, target_action, last_run, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['cr-2', 'Workspace Log Sanitizer', 'Daily at midnight', 'Clean temporary workspace files and cache files.', new Date(Date.now() - 14 * 3600000).toISOString(), 'Active']);
    await pool.query(`
      INSERT INTO Cron_Jobs (id, name, interval, target_action, last_run, status)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, ['cr-3', 'Semantic Index Compiler', 'Hourly', 'Refresh AI memory with recent project files.', new Date(Date.now() - 45 * 60000).toISOString(), 'Paused']);
  }

  console.log('PostgreSQL database initialization complete.');
  await pool.end();
}

// Run database initialization on import
if (isPostgres) {
  initDatabasePostgres().catch(console.error);
} else {
  initDatabaseSQLite();
}

export default db;
