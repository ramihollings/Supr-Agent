import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const isPostgres = !!(process.env.DATABASE_URL || process.env.PGHOST);

// Lazily-initialized SQLite instance — never null after first access
let db: any = null;
let _initialized = false;

function getSqliteDb(): any {
  if (isPostgres) {
    throw new Error('[init.ts] getSqliteDb() called in Postgres mode. This is a bug — check db_client.ts routing.');
  }
  if (!db) {
    const dbPath = process.env.SQLITE_DB_PATH
      ? path.resolve(process.env.SQLITE_DB_PATH)
      : path.resolve(process.cwd(), 'supr_local.db');

    // Ensure the parent directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    db = new Database(dbPath);
    console.log(`[init.ts] SQLite database opened at: ${dbPath}`);
  }
  return db;
}

export function initDatabase() {
  if (_initialized) return; // Idempotent — safe to call multiple times
  if (isPostgres) return;  // Nothing to initialize in Postgres mode

  const dbInstance = getSqliteDb();
  console.log('[init.ts] Initializing Supr local database...');

  // Enable WAL mode for better performance outside container, use DELETE mode inside Docker mounts
  const isDocker = fs.existsSync('/.dockerenv');
  if (isDocker) {
    dbInstance.pragma('journal_mode = DELETE');
  } else {
    dbInstance.pragma('journal_mode = WAL');
  }
  dbInstance.pragma('foreign_keys = ON');
  dbInstance.pragma('busy_timeout = 5000');
  dbInstance.pragma('synchronous = NORMAL');
  dbInstance.pragma('temp_store = MEMORY');
  dbInstance.pragma('cache_size = -2000');

  // 1. Missions Table
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
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
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Cron_Jobs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      interval TEXT,
      target_action TEXT,
      last_run DATETIME,
      status TEXT, -- Active, Paused
      assigned_agent_id TEXT,
      associated_task_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    dbInstance.exec(`ALTER TABLE Cron_Jobs ADD COLUMN assigned_agent_id TEXT`);
  } catch (e) {}

  try {
    dbInstance.exec(`ALTER TABLE Cron_Jobs ADD COLUMN associated_task_id TEXT`);
  } catch (e) {}

  // 12. Settings Table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 13. Supr_Chat_Messages Table
  dbInstance.exec(`
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

  // 14. Capabilities Table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Capabilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL, -- direct, mcp, skill
      required_permission TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      input_schema TEXT DEFAULT '{}',
      output_schema TEXT DEFAULT '{}',
      description TEXT
    )
  `);

  // 15. Agent_Capabilities Table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Agent_Capabilities (
      agent_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      allowed INTEGER DEFAULT 1,
      constraints TEXT DEFAULT '{}',
      PRIMARY KEY(agent_id, capability_id),
      FOREIGN KEY(agent_id) REFERENCES Agents(id) ON DELETE CASCADE,
      FOREIGN KEY(capability_id) REFERENCES Capabilities(id) ON DELETE CASCADE
    )
  `);

  // 16. Policy_Decisions Table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Policy_Decisions (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      agent_id TEXT,
      capability_id TEXT,
      decision TEXT NOT NULL, -- Approved, Denied, RequiresApproval
      reason TEXT,
      approval_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 17. Artifact Versions Table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Artifact_Versions (
      id TEXT PRIMARY KEY,
      artifact_id TEXT,
      mission_id TEXT NOT NULL,
      title TEXT NOT NULL,
      type TEXT,
      content TEXT,
      version INTEGER DEFAULT 1,
      status TEXT DEFAULT 'draft',
      generated_by TEXT,
      diff_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  // 18. Runbooks Table
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Runbooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      agents TEXT,
      gates INTEGER DEFAULT 1,
      output TEXT,
      steps TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  try {
    dbInstance.exec(`ALTER TABLE Memory_Items ADD COLUMN pinned INTEGER DEFAULT 0`);
  } catch (e) {}

  try {
    dbInstance.exec(`ALTER TABLE Memory_Items ADD COLUMN reviewed_at DATETIME`);
  } catch (e) {}

  try {
    dbInstance.exec(`ALTER TABLE Memory_Items ADD COLUMN reason TEXT`);
  } catch (e) {}

  // Seed default settings
  const insertSetting = dbInstance.prepare(`
    INSERT OR IGNORE INTO Settings (key, value)
    VALUES (?, ?)
  `);
  
  insertSetting.run('sandbox_allow_api_keys', 'false');
  insertSetting.run('sandbox_api_key_approval', '');
  
  insertSetting.run('operating_mode', 'guided');
  insertSetting.run('permission_boundary', 'governed');
  insertSetting.run('governance_standards', JSON.stringify(['SOX', 'SOC2']));
  insertSetting.run('channels_email', 'true');
  insertSetting.run('channels_slack', 'true');
  insertSetting.run('channels_telegram', 'false');
  insertSetting.run('channels_social', 'false');
  
  // Seeding new appearance and integration settings
  insertSetting.run('appearance_theme', 'neobrutalist');
  insertSetting.run('appearance_palette', 'classic');
  insertSetting.run('integrations_composio', '');
  insertSetting.run('integrations_github', '');
  insertSetting.run('integrations_slack', '');
  insertSetting.run('integrations_gmail', '');

  // Seed initial coordinator message in Supr-Chat if empty
  const chatMessagesCount = dbInstance.prepare(`SELECT COUNT(*) as cnt FROM Supr_Chat_Messages`).get() as { cnt: number };
  if (chatMessagesCount.cnt === 0) {
    dbInstance.prepare(`
      INSERT OR IGNORE INTO Supr_Chat_Messages (id, sender, content)
      VALUES (?, ?, ?)
    `).run(
      'init-chat-msg',
      'supr',
      'Hello! I am Supr, your central coordinator. This is Supr-Chat, a rapid-fire space where you can ask me to perform quick tasks directly. You can upload documents, query data, run fast web intelligence lookups, or ask me to draft emails and scripts. How can I assist you today?'
    );
  }

  // Seed default Skills if table is empty
  const skillsCount = dbInstance.prepare(`SELECT COUNT(*) as cnt FROM Skills`).get() as { cnt: number };
  if (skillsCount.cnt === 0) {
    const insertSkill = dbInstance.prepare(`
      INSERT OR IGNORE INTO Skills (id, name, description, provider, tools)
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
      'Automated web browser helper for gathering internet data.',
      'Composio',
      JSON.stringify(['stealth_scrape', 'javascript_render'])
    );
    insertSkill.run(
      'sk-3',
      'Code Self-Healer',
      'Finds syntax and runtime errors in code and automatically applies fixes.',
      'Anthropic',
      JSON.stringify(['compile_sandbox', 'fix_syntax_lint'])
    );
    insertSkill.run(
      'sk-4',
      'Web Browser Automation',
      'Automates a web browser to read pages, take screenshots, run scripts, and check page loading diagnostics.',
      'MCP',
      JSON.stringify(['navigate', 'screenshot', 'execute_javascript', 'lighthouse_audit'])
    );
  }

  // Seed default Cron Jobs if table is empty
  const cronsCount = dbInstance.prepare(`SELECT COUNT(*) as cnt FROM Cron_Jobs`).get() as { cnt: number };
  if (cronsCount.cnt === 0) {
    const insertCron = dbInstance.prepare(`
      INSERT OR IGNORE INTO Cron_Jobs (id, name, interval, target_action, last_run, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertCron.run(
      'cr-1',
      'Signal Aggregator Sync',
      'Every 5 minutes',
      'Find competitor product signals & feature releases using the automated browser.',
      new Date(Date.now() - 3 * 60000).toISOString(),
      'Active'
    );
    insertCron.run(
      'cr-2',
      'Workspace Log Sanitizer',
      'Daily at midnight',
      'Clean temporary workspace files and cache files.',
      new Date(Date.now() - 14 * 3600000).toISOString(),
      'Active'
    );
    insertCron.run(
      'cr-3',
      'Semantic Index Compiler',
      'Hourly',
      'Refresh AI memory with recent project files.',
      new Date(Date.now() - 45 * 60000).toISOString(),
      'Paused'
    );
  }

  // Seed default runbooks if table is empty
  const runbooksCount = dbInstance.prepare(`SELECT COUNT(*) as cnt FROM Runbooks`).get() as { cnt: number };
  if (runbooksCount.cnt === 0) {
    const insertRunbook = dbInstance.prepare(`
      INSERT OR IGNORE INTO Runbooks (id, name, description, agents, gates, output, steps)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    [
      ['audit-repo', 'Audit Repo', 'Inspect code, dependencies, security posture, and UX risks.', ['Supr', 'Code Agent', 'QA Agent'], 2, 'Security and quality report'],
      ['launch-report', 'Create Launch Report', 'Compile delivery status, risks, artifacts, and executive summary.', ['Research Agent', 'Signal Agent'], 1, 'Executive delivery packet'],
      ['market-research', 'Research Market', 'Gather external signals and convert them into research memory.', ['Research Agent'], 1, 'Research brief and memory entries'],
      ['fix-tests', 'Fix Failing Tests', 'Run diagnostics, propose a patch, and verify tests.', ['Code Agent', 'QA Agent'], 2, 'Patch proposal and test transcript'],
      ['generate-pr', 'Generate PR', 'Prepare a review-ready change summary and approval checklist.', ['Code Agent', 'Supr'], 3, 'Review-ready change summary'],
    ].forEach(([id, name, description, agents, gates, output]) => {
      insertRunbook.run(id, name, description, JSON.stringify(agents), gates, output, JSON.stringify([]));
    });
  }

  // Seed orchestration events for the Observance Hub
  const orchCount = dbInstance.prepare(`SELECT COUNT(*) as cnt FROM Event_Log WHERE event_type IN ('delegation','handoff','review','approval','escalation','governance')`).get() as { cnt: number };
  if (orchCount.cnt === 0) {
    const missionRow = dbInstance.prepare(`SELECT id FROM Missions LIMIT 1`).get() as { id: string } | undefined;
    let mid = missionRow?.id;
    if (!mid) {
      mid = 'm1';
      dbInstance.prepare(`
        INSERT OR IGNORE INTO Missions (id, title, goal, status)
        VALUES (?, ?, ?, ?)
      `).run('m1', 'Production Migration v4.0', 'Hardening cloud-native architecture', 'Active');
      
      dbInstance.prepare(`
        INSERT OR IGNORE INTO Glidepaths (id, mission_id, phases, tasks, readiness_score)
        VALUES (?, ?, ?, ?, ?)
      `).run('gp-m1', 'm1', '[]', '[]', 0.87);
    }
    const insertEvent = dbInstance.prepare(`
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

  // Seed default capabilities if table is empty
  const capCount = dbInstance.prepare(`SELECT COUNT(*) as cnt FROM Capabilities`).get() as { cnt: number };
  if (capCount.cnt === 0) {
    // Seed default agents first to satisfy foreign key constraints
    const insertAgent = dbInstance.prepare(`
      INSERT OR IGNORE INTO Agents (id, name, role, type, permission_tier, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    insertAgent.run('a1', 'Supr', 'Supervisor', 'permanent', 'Root', 'Idle');
    insertAgent.run('a2', 'Research Agent', 'Research', 'permanent', 'Observe', 'Idle');
    insertAgent.run('a3', 'Code Agent', 'Code', 'permanent', 'Execute', 'Idle');
    insertAgent.run('a4', 'QA Agent', 'QA', 'permanent', 'Execute', 'Idle');
    insertAgent.run('a5', 'Signal Agent', 'Signal', 'permanent', 'External_Act', 'Idle');

    const insertCap = dbInstance.prepare(`
      INSERT OR IGNORE INTO Capabilities (id, name, type, required_permission, risk_level, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    insertCap.run('web_scrape', 'web_scrape', 'direct', 'Observe', 'Low', 'Scrapes text content and HTML from a URL using headless browser.');
    insertCap.run('execute_command', 'execute_command', 'direct', 'Execute', 'High', 'Runs a shell command inside the Docker sandbox.');
    insertCap.run('slack_send_message', 'slack_send_message', 'direct', 'External_Act', 'Medium', 'Posts a notification message directly to Slack channel.');
    insertCap.run('github_create_issue', 'github_create_issue', 'direct', 'External_Act', 'Medium', 'Creates a new bug report or task issue on GitHub repository.');
    insertCap.run('obra_superpowers', 'obra_superpowers', 'direct', 'Root', 'Critical', 'Executes highly-privileged system administration modifications.');

    // Seed agent capability bindings
    const insertAgentCap = dbInstance.prepare(`
      INSERT OR IGNORE INTO Agent_Capabilities (agent_id, capability_id, allowed)
      VALUES (?, ?, 1)
    `);

    // Supr (a1) gets all
    insertAgentCap.run('a1', 'web_scrape');
    insertAgentCap.run('a1', 'execute_command');
    insertAgentCap.run('a1', 'slack_send_message');
    insertAgentCap.run('a1', 'github_create_issue');
    insertAgentCap.run('a1', 'obra_superpowers');

    // Research Agent (a2) gets web_scrape
    insertAgentCap.run('a2', 'web_scrape');

    // Code Agent (a3) gets execute_command and github_create_issue
    insertAgentCap.run('a3', 'execute_command');
    insertAgentCap.run('a3', 'github_create_issue');

    // QA Agent (a4) gets web_scrape and execute_command
    insertAgentCap.run('a4', 'web_scrape');
    insertAgentCap.run('a4', 'execute_command');

    // Sub-Supr (a5) gets execute_command and slack_send_message
    insertAgentCap.run('a5', 'execute_command');
    insertAgentCap.run('a5', 'slack_send_message');
  }

  _initialized = true;
  console.log('[init.ts] Database initialization complete.');
}

// Export the lazy getter so db_client.ts can get the live instance after init
export { getSqliteDb };
export default getSqliteDb;
