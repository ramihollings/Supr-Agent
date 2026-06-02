import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const isPostgres = !!(process.env.DATABASE_URL || process.env.PGHOST);

// Lazily-initialized SQLite instance — never null after first access
let db: any = null;
let _initialized = false;

/**
 * The only SQLite errors we want to swallow during schema migrations are
 * "duplicate column name" (when a column was added by an older version
 * of the schema) and "table already exists" (handled by CREATE TABLE IF
 * NOT EXISTS, but worth including for direct ALTERs that target a
 * missing table). Anything else -- a locked DB, a permission error,
 * a syntax error, a real schema mismatch -- is rethrown so the
 * process fails loud at startup instead of silently shipping a
 * half-migrated database.
 */
function isBenignMigrationError(error: { code?: string; message?: string }): boolean {
  const code = error?.code;
  if (code === 'SQLITE_ERROR') {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('duplicate column name')) return true;
    if (message.includes('table') && message.includes('already exists')) return true;
  }
  return false;
}

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
  } catch (e: any) {
    if (!isBenignMigrationError(e)) throw e;
  }

  try {
    dbInstance.exec(`ALTER TABLE Cron_Jobs ADD COLUMN associated_task_id TEXT`);
  } catch (e: any) {
    if (!isBenignMigrationError(e)) throw e;
  }

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
  } catch (e: any) {
    if (!isBenignMigrationError(e)) throw e;
  }

  try {
    dbInstance.exec(`ALTER TABLE Memory_Items ADD COLUMN reviewed_at DATETIME`);
  } catch (e: any) {
    if (!isBenignMigrationError(e)) throw e;
  }

  try {
    dbInstance.exec(`ALTER TABLE Memory_Items ADD COLUMN reason TEXT`);
  } catch (e: any) {
    if (!isBenignMigrationError(e)) throw e;
  }

  try {
    dbInstance.exec(`ALTER TABLE Approvals ADD COLUMN agent_action_id TEXT`);
  } catch (e: any) {
    if (!isBenignMigrationError(e)) throw e;
  }

  // 19. Agent Actions Table - shared runtime queue for all agent/tool work
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Agent_Actions (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      task_id TEXT,
      agent_id TEXT,
      capability TEXT NOT NULL,
      intent TEXT,
      inputs TEXT DEFAULT '{}',
      risk_level TEXT DEFAULT 'Low',
      required_permission TEXT DEFAULT 'Observe',
      status TEXT NOT NULL DEFAULT 'draft',
      approval_id TEXT,
      result TEXT,
      error TEXT,
      trace_id TEXT,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(task_id) REFERENCES Tasks(id),
      FOREIGN KEY(agent_id) REFERENCES Agents(id),
      FOREIGN KEY(approval_id) REFERENCES Approvals(id)
    )
  `);

  // 20. Project Flow runtime tables - visible execution graph and heartbeat runs
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Flow_Runs (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'idle',
      mode TEXT NOT NULL DEFAULT 'autonomous',
      source TEXT DEFAULT 'project_flow',
      started_at DATETIME,
      paused_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Flow_Nodes (
      id TEXT PRIMARY KEY,
      flow_run_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      ref_id TEXT,
      label TEXT NOT NULL,
      owner_agent_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      risk_level TEXT DEFAULT 'Low',
      next_action TEXT,
      x INTEGER DEFAULT 0,
      y INTEGER DEFAULT 0,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(flow_run_id) REFERENCES Flow_Runs(id),
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Agent_Runs (
      id TEXT PRIMARY KEY,
      flow_run_id TEXT,
      mission_id TEXT NOT NULL,
      agent_action_id TEXT NOT NULL,
      agent_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      heartbeat INTEGER DEFAULT 0,
      logs TEXT DEFAULT '[]',
      cost_estimate REAL DEFAULT 0,
      result TEXT,
      error TEXT,
      started_at DATETIME,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(flow_run_id) REFERENCES Flow_Runs(id),
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(agent_action_id) REFERENCES Agent_Actions(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Channel_Commands (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      mission_id TEXT,
      command TEXT NOT NULL,
      payload TEXT DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'received',
      response TEXT,
      actor_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Tool_Invocations (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      flow_run_id TEXT,
      agent_action_id TEXT,
      agent_run_id TEXT,
      agent_id TEXT,
      tool_name TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      input TEXT,
      output TEXT,
      error TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(flow_run_id) REFERENCES Flow_Runs(id),
      FOREIGN KEY(agent_action_id) REFERENCES Agent_Actions(id),
      FOREIGN KEY(agent_run_id) REFERENCES Agent_Runs(id)
    )
  `);

  // 24. Provider Health Table - failover/cooldown state for models and connectors
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Provider_Health (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT DEFAULT 'llm',
      status TEXT NOT NULL DEFAULT 'unknown',
      failure_count INTEGER DEFAULT 0,
      last_success DATETIME,
      last_error TEXT,
      cooldown_until DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 21. Computers Table - runtime/computer separation for local, Docker, VM, E2B, Kubernetes
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Computers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'available',
      allowed_scopes TEXT DEFAULT '[]',
      config_ref TEXT,
      last_health_check DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 22. Plugin Registry Table - stable extension API surface
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Plugin_Registry (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT,
      status TEXT DEFAULT 'disabled',
      manifest TEXT DEFAULT '{}',
      permissions TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 23. Knowledge Pages Table - cited LLM wiki/project knowledge
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Knowledge_Pages (
      id TEXT PRIMARY KEY,
      workspace_id TEXT,
      mission_id TEXT,
      title TEXT NOT NULL,
      slug TEXT NOT NULL,
      content TEXT,
      citations TEXT DEFAULT '[]',
      status TEXT DEFAULT 'draft',
      created_by_agent_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(created_by_agent_id) REFERENCES Agents(id)
    )
  `);

  // 24. RBAC + Audit tables - governance console foundation
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      permissions TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Audit_Log (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      actor_type TEXT,
      actor_id TEXT,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id TEXT,
      risk_level TEXT,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Agent_Groups (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      name TEXT NOT NULL,
      supervisor_agent_id TEXT NOT NULL,
      shared_context TEXT DEFAULT '',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(supervisor_agent_id) REFERENCES Agents(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Agent_Group_Members (
      group_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(group_id, agent_id),
      FOREIGN KEY(group_id) REFERENCES Agent_Groups(id) ON DELETE CASCADE,
      FOREIGN KEY(agent_id) REFERENCES Agents(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Agent_Blueprints (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      prompt TEXT NOT NULL,
      role TEXT NOT NULL,
      instructions TEXT NOT NULL,
      permission_tier TEXT NOT NULL,
      tools TEXT DEFAULT '[]',
      skills TEXT DEFAULT '[]',
      provider TEXT DEFAULT 'default',
      memory_scope TEXT DEFAULT 'mission',
      budget_profile TEXT DEFAULT '{}',
      rationale TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Memory_Sections (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      provenance TEXT DEFAULT 'user',
      user_edited INTEGER DEFAULT 0,
      injection_status TEXT DEFAULT 'inactive',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Operational_Metrics (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      agent_id TEXT,
      event_type TEXT NOT NULL,
      outcome TEXT,
      duration_ms INTEGER,
      cost_estimate REAL,
      metadata TEXT DEFAULT '{}',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Guideline_Packs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      language TEXT,
      framework TEXT,
      context TEXT,
      rules TEXT DEFAULT '[]',
      reminders TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Learned_Skill_Drafts (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      agent_run_id TEXT NOT NULL,
      proposed_name TEXT NOT NULL,
      markdown TEXT NOT NULL,
      source_run_ids TEXT DEFAULT '[]',
      evidence_ids TEXT DEFAULT '[]',
      risk_findings TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      reviewer_agent_id TEXT,
      approval_id TEXT,
      promoted_path TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(agent_run_id) REFERENCES Agent_Runs(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Replan_Decisions (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      flow_run_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      affected_node_ids TEXT DEFAULT '[]',
      planner_source TEXT DEFAULT 'none',
      inserted_action_ids TEXT DEFAULT '[]',
      removed_action_ids TEXT DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(flow_run_id) REFERENCES Flow_Runs(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Provider_Route_Decisions (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      agent_run_id TEXT,
      agent_role TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT,
      fallback_provider TEXT,
      runtime_mode TEXT NOT NULL,
      failure_reason TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(mission_id) REFERENCES Missions(id),
      FOREIGN KEY(agent_run_id) REFERENCES Agent_Runs(id)
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Outbound_Messages (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      source TEXT NOT NULL,
      actor_id TEXT,
      reason TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      sent_at DATETIME,
      FOREIGN KEY(mission_id) REFERENCES Missions(id)
    )
  `);

  // Seed default settings
  const insertSetting = dbInstance.prepare(`
    INSERT OR IGNORE INTO Settings (key, value)
    VALUES (?, ?)
  `);
  
  insertSetting.run('sandbox_allow_api_keys', 'false');
  insertSetting.run('sandbox_api_key_approval', '');
  insertSetting.run('docker_available', 'false');
  insertSetting.run('docker_last_probe', '');
  insertSetting.run('remote_execution_enabled', 'false');
  insertSetting.run('remote_execution_host', '');
  
  insertSetting.run('operating_mode', 'autonomous');
  insertSetting.run('runtime_mode', 'real');
  insertSetting.run('permission_boundary', 'governed');
  insertSetting.run('governance_standards', JSON.stringify(['SOX', 'SOC2']));
  insertSetting.run('channels_email', 'true');
  insertSetting.run('channels_slack', 'false');
  insertSetting.run('channels_discord', 'false');
  insertSetting.run('channels_telegram', 'false');
  insertSetting.run('default_channel', 'telegram');
  insertSetting.run('channels_social', 'false');
  
  // Seeding new appearance and integration settings
  insertSetting.run('appearance_theme', 'neobrutalist');
  insertSetting.run('appearance_palette', 'classic');
  insertSetting.run('integrations_composio', '');
  insertSetting.run('integrations_github', '');
  insertSetting.run('integrations_slack', '');
  insertSetting.run('integrations_discord', '');
  insertSetting.run('slack_signing_secret', '');
  insertSetting.run('discord_webhook_token', '');
  insertSetting.run('integrations_gmail', '');

  const insertProviderHealth = dbInstance.prepare(`
    INSERT OR IGNORE INTO Provider_Health (id, name, provider_type, status)
    VALUES (?, ?, ?, ?)
  `);
  [
    ['gemini', 'Gemini', 'llm', 'unknown'],
    ['minimax', 'MiniMax', 'llm', 'unknown'],
    ['backup', 'Backup LLM', 'llm', 'unknown'],
    ['github', 'GitHub', 'connector', 'unknown'],
    ['slack', 'Slack', 'connector', 'unknown'],
    ['gmail', 'Gmail', 'connector', 'unknown'],
    ['composio', 'Composio', 'connector', 'unknown'],
  ].forEach(([id, name, type, status]) => insertProviderHealth.run(id, name, type, status));

  const insertComputer = dbInstance.prepare(`
    INSERT OR IGNORE INTO Computers (id, name, type, status, allowed_scopes)
    VALUES (?, ?, ?, ?, ?)
  `);
  [
    ['local', 'Local Process', 'local', 'available', ['workspace']],
    ['docker', 'Docker Sandbox', 'docker', 'available', ['workspace', 'temp']],
    ['vm', 'VM Sandbox', 'vm', 'requires_config', []],
    ['e2b', 'E2B Sandbox', 'e2b', 'requires_config', []],
    ['kubernetes', 'Kubernetes Sandbox', 'kubernetes', 'requires_config', []],
  ].forEach(([id, name, type, status, scopes]) => insertComputer.run(id, name, type, status, JSON.stringify(scopes)));

  const insertRole = dbInstance.prepare(`
    INSERT OR IGNORE INTO Roles (id, name, permissions)
    VALUES (?, ?, ?)
  `);
  [
    ['owner', 'Owner', ['Root', 'External_Act', 'Execute', 'Edit', 'Draft', 'Observe']],
    ['operator', 'Operator', ['External_Act', 'Execute', 'Edit', 'Draft', 'Observe']],
    ['reviewer', 'Reviewer', ['Draft', 'Observe']],
  ].forEach(([id, name, permissions]) => insertRole.run(id, name, JSON.stringify(permissions)));

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
      { id: `orch-5`, type: 'escalation', actor: 'Supr', summary: 'Code Agent sandbox failure — rerouting to retry', detail: 'pytest suite failed: sample_tickets.json missing embedding schema key. Auto-retry attempt 2 of 3 initiated with adjusted parameters.', target: 'Code Agent', mins: 22 },
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

  // Seed/update default capabilities and bindings so upgraded databases do not miss runtime tools.
  {
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
    insertCap.run('web_search', 'web_search', 'direct', 'Observe', 'Low', 'Searches the web using a configured live search provider.');
    insertCap.run('workspace_write_artifact', 'workspace_write_artifact', 'direct', 'Edit', 'Medium', 'Creates or updates project artifacts in the workspace.');
    insertCap.run('workspace_write_file', 'workspace_write_file', 'direct', 'Edit', 'Medium', 'Creates or updates a scoped file in the secure local workspace.');
    insertCap.run('workspace_validate_outputs', 'workspace_validate_outputs', 'direct', 'Draft', 'Low', 'Validates project artifacts, queue state, and readiness evidence.');
    insertCap.run('governance_review', 'governance_review', 'direct', 'Edit', 'Medium', 'Reviews open risks, approvals, permissions, and blocked work.');
    insertCap.run('delivery_package', 'delivery_package', 'direct', 'Draft', 'Low', 'Compiles final project status, artifacts, and next actions.');
    insertCap.run('execute_command', 'execute_command', 'direct', 'Execute', 'High', 'Runs a governed local shell command with policy evidence.');
    insertCap.run('execute_sandboxed_command', 'execute_sandboxed_command', 'direct', 'Execute', 'High', 'Runs a command inside the Docker sandbox only when Docker is available.');
    insertCap.run('execute_remote', 'execute_remote', 'direct', 'External_Act', 'Critical', 'Requests remote command execution; disabled until explicit host configuration exists.');
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
    insertAgentCap.run('a1', 'web_search');
    insertAgentCap.run('a1', 'workspace_write_artifact');
    insertAgentCap.run('a1', 'workspace_write_file');
    insertAgentCap.run('a1', 'workspace_validate_outputs');
    insertAgentCap.run('a1', 'governance_review');
    insertAgentCap.run('a1', 'delivery_package');
    insertAgentCap.run('a1', 'execute_command');
    insertAgentCap.run('a1', 'execute_sandboxed_command');
    insertAgentCap.run('a1', 'execute_remote');
    insertAgentCap.run('a1', 'slack_send_message');
    insertAgentCap.run('a1', 'github_create_issue');
    insertAgentCap.run('a1', 'obra_superpowers');

    // Research Agent (a2) gets web research tools
    insertAgentCap.run('a2', 'web_scrape');
    insertAgentCap.run('a2', 'web_search');

    // Code Agent (a3) gets workspace writing, sandbox execution, and GitHub issue creation
    insertAgentCap.run('a3', 'workspace_write_artifact');
    insertAgentCap.run('a3', 'workspace_write_file');
    insertAgentCap.run('a3', 'execute_command');
    insertAgentCap.run('a3', 'execute_sandboxed_command');
    insertAgentCap.run('a3', 'github_create_issue');

    // QA Agent (a4) gets validation, browsing, and sandbox execution
    insertAgentCap.run('a4', 'workspace_validate_outputs');
    insertAgentCap.run('a4', 'web_scrape');
    insertAgentCap.run('a4', 'web_search');
    insertAgentCap.run('a4', 'execute_command');
    insertAgentCap.run('a4', 'execute_sandboxed_command');

    // Signal Agent (a5) gets governance and delivery packaging
    insertAgentCap.run('a5', 'governance_review');
    insertAgentCap.run('a5', 'delivery_package');

    // Sub-Supr (a5) gets execute_command and slack_send_message
    insertAgentCap.run('a5', 'execute_command');
    insertAgentCap.run('a5', 'slack_send_message');
  }

  const obsoleteHeartbeatCapability = `heartbeat${'_'}task`;
  dbInstance.prepare(`DELETE FROM Agent_Capabilities WHERE capability_id = ?`).run(obsoleteHeartbeatCapability);
  dbInstance.prepare(`DELETE FROM Capabilities WHERE id = ?`).run(obsoleteHeartbeatCapability);

  // 25. Cost and Budget Tracking tables
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Cost_Events (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      agent_id TEXT,
      task_id TEXT,
      agent_run_id TEXT,
      provider TEXT,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cost_cents REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Budget_Policies (
      id TEXT PRIMARY KEY,
      scope_type TEXT NOT NULL, -- 'mission', 'agent', 'global'
      scope_id TEXT NOT NULL,
      limit_cents REAL NOT NULL,
      warn_percent REAL DEFAULT 80,
      hard_stop INTEGER DEFAULT 1,
      spent_cents REAL DEFAULT 0,
      status TEXT DEFAULT 'ok',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS Budget_Incidents (
      id TEXT PRIMARY KEY,
      policy_id TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      threshold_type TEXT NOT NULL, -- 'soft', 'hard'
      limit_cents REAL NOT NULL,
      observed_cents REAL NOT NULL,
      status TEXT DEFAULT 'open',
      resolved_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(policy_id) REFERENCES Budget_Policies(id)
    )
  `);

  _initialized = true;
  console.log('[init.ts] Database initialization complete.');
}

// Export the lazy getter so db_client.ts can get the live instance after init
export { getSqliteDb };
export default getSqliteDb;
