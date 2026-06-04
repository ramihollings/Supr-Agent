import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';

function withDb(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'supr-behavior-'));
  const db = new Database(join(dir, 'supr-test.db'));
  db.pragma('foreign_keys = ON');
  try {
    createSchema(db);
    fn(db);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE Missions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      objective TEXT,
      status TEXT,
      readiness_score INTEGER
    );

    CREATE TABLE Tasks (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT,
      assigned_agent TEXT
    );

    CREATE TABLE Activity_Logs (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      event_type TEXT,
      actor TEXT,
      summary TEXT,
      detail TEXT
    );

    CREATE TABLE Runbooks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      agents TEXT,
      gates INTEGER DEFAULT 1,
      output TEXT,
      steps TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE Artifacts (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      type TEXT,
      title TEXT,
      content TEXT
    );

    CREATE TABLE Artifact_Versions (
      id TEXT PRIMARY KEY,
      artifact_id TEXT,
      mission_id TEXT NOT NULL,
      title TEXT,
      type TEXT,
      content TEXT,
      version INTEGER,
      status TEXT,
      generated_by TEXT,
      diff_summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE Approvals (
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
      agent_action_id TEXT
    );

    CREATE TABLE Agent_Actions (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      capability TEXT NOT NULL,
      required_permission TEXT,
      risk_level TEXT,
      intent TEXT,
      status TEXT,
      approval_id TEXT,
      result TEXT,
      error TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE Settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE Provider_Health (
      id TEXT PRIMARY KEY,
      provider TEXT,
      category TEXT,
      status TEXT,
      last_success DATETIME,
      last_error TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE Agent_Runs (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      agent_id TEXT,
      agent_action_id TEXT,
      status TEXT,
      result TEXT
    );

    CREATE TABLE Tool_Invocations (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      agent_run_id TEXT,
      tool_name TEXT,
      status TEXT,
      output TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE Learned_Skill_Drafts (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      agent_run_id TEXT NOT NULL,
      proposed_name TEXT NOT NULL,
      markdown TEXT NOT NULL,
      source_run_ids TEXT DEFAULT '[]',
      evidence_ids TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'draft',
      approval_id TEXT
    );

    CREATE TABLE Flow_Runs (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      status TEXT
    );

    CREATE TABLE Flow_Nodes (
      id TEXT PRIMARY KEY,
      flow_run_id TEXT NOT NULL,
      mission_id TEXT NOT NULL,
      kind TEXT,
      ref_id TEXT,
      status TEXT
    );

    CREATE TABLE Replan_Decisions (
      id TEXT PRIMARY KEY,
      mission_id TEXT NOT NULL,
      flow_run_id TEXT NOT NULL,
      trigger TEXT NOT NULL,
      affected_node_ids TEXT DEFAULT '[]',
      inserted_action_ids TEXT DEFAULT '[]',
      removed_action_ids TEXT DEFAULT '[]'
    );

    CREATE TABLE Outbound_Messages (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      source TEXT NOT NULL,
      reason TEXT NOT NULL,
      text TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT
    );
  `);
}

function startRunbook(db, runbookId) {
  const runbook = db.prepare('SELECT * FROM Runbooks WHERE id = ?').get(runbookId);
  if (!runbook) return { success: false, error: 'Runbook not found.' };

  const missionId = `mission-${runbookId}`;
  const agents = JSON.parse(runbook.agents || '[]');
  db.prepare('INSERT INTO Missions (id, name, objective, status, readiness_score) VALUES (?, ?, ?, ?, ?)').run(
    missionId,
    runbook.name,
    runbook.description || runbook.output || `Run ${runbook.name}`,
    'Active',
    25,
  );
  for (const [index, agent] of agents.entries()) {
    db.prepare('INSERT INTO Tasks (id, mission_id, title, status, assigned_agent) VALUES (?, ?, ?, ?, ?)').run(
      `task-${index}`,
      missionId,
      `${agent}: ${runbook.output || runbook.name}`,
      index === 0 ? 'Active' : 'Pending',
      agent,
    );
  }
  db.prepare('INSERT INTO Activity_Logs (id, mission_id, event_type, actor, summary, detail) VALUES (?, ?, ?, ?, ?, ?)').run(
    `log-${runbookId}`,
    missionId,
    'Mission Created',
    'Runbook',
    `Started from ${runbook.name}`,
    runbook.description || runbook.output || 'Runbook mission initialized.',
  );
  return { success: true, missionId };
}

function rollbackArtifactVersion(db, versionId) {
  const row = db.prepare('SELECT * FROM Artifact_Versions WHERE id = ?').get(versionId);
  if (!row) return { success: false, error: 'Version not found.' };

  if (row.artifact_id) {
    db.prepare('UPDATE Artifacts SET content = ?, type = ?, title = ? WHERE id = ?').run(
      row.content || '',
      row.type || 'markdown',
      row.title,
      row.artifact_id,
    );
  } else {
    db.prepare('INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)').run(
      'art-restored',
      row.mission_id,
      row.type || 'markdown',
      row.title,
      row.content || '',
    );
  }

  const latest = db
    .prepare('SELECT COALESCE(MAX(version), 0) as version FROM Artifact_Versions WHERE mission_id = ? AND title = ?')
    .get(row.mission_id, row.title);
  db.prepare(`
    INSERT INTO Artifact_Versions
      (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    `ver-rollback-${latest.version + 1}`,
    row.artifact_id,
    row.mission_id,
    row.title,
    row.type || 'markdown',
    row.content || '',
    latest.version + 1,
    'approved',
    'Supr',
    `Rolled back to v${row.version}`,
  );
  return { success: true };
}

function decideApproval(db, approvalId, decision) {
  db.prepare('UPDATE Approvals SET status = ?, decision = ? WHERE id = ?').run(decision, decision, approvalId);
  const action = db
    .prepare('SELECT * FROM Agent_Actions WHERE approval_id = ? OR id = (SELECT agent_action_id FROM Approvals WHERE id = ?)')
    .get(approvalId, approvalId);
  if (action) {
    const nextStatus = decision === 'approved' ? 'approved' : decision;
    db.prepare('UPDATE Agent_Actions SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(nextStatus, action.id);
  }
  return { success: true };
}

function recordConnectorResult(db, connectorId, status, detail) {
  const checkedAt = new Date('2026-05-30T12:00:00.000Z').toISOString();
  db.prepare('INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    `connector_${connectorId}_last_status`,
    status,
  );
  db.prepare('INSERT INTO Settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(
    `connector_${connectorId}_last_checked`,
    checkedAt,
  );

  if (status === 'Live' || status === 'Partially Connected') {
    db.prepare(`
      INSERT INTO Provider_Health (id, provider, category, status, last_success, last_error)
      VALUES (?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, last_success = excluded.last_success, last_error = NULL
    `).run(connectorId, connectorId, 'connector', status, checkedAt);
  } else {
    db.prepare(`
      INSERT INTO Provider_Health (id, provider, category, status, last_success, last_error)
      VALUES (?, ?, ?, ?, NULL, ?)
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, last_error = excluded.last_error
    `).run(connectorId, connectorId, 'connector', status, detail);
  }
}

function maybeCreateLearnedSkillDraft(db, agentRunId) {
  const run = db.prepare("SELECT * FROM Agent_Runs WHERE id = ? AND status = 'completed'").get(agentRunId);
  if (!run) return null;
  const tools = db.prepare("SELECT * FROM Tool_Invocations WHERE agent_run_id = ? AND status = 'completed' ORDER BY id").all(agentRunId);
  if (tools.length < 3) return null;
  const existing = db.prepare('SELECT * FROM Learned_Skill_Drafts WHERE agent_run_id = ?').get(agentRunId);
  if (existing) return existing;
  const draftId = `draft-${agentRunId}`;
  db.prepare(`
    INSERT INTO Learned_Skill_Drafts (id, mission_id, agent_run_id, proposed_name, markdown, source_run_ids, evidence_ids, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(
    draftId,
    run.mission_id,
    agentRunId,
    'code-agent-runtime-pattern',
    '---\nname: code-agent-runtime-pattern\ndescription: Learned pattern\n---\n\n## Procedure\nStore durable evidence.',
    JSON.stringify([agentRunId]),
    JSON.stringify(tools.map((tool) => tool.id)),
  );
  return db.prepare('SELECT * FROM Learned_Skill_Drafts WHERE id = ?').get(draftId);
}

function promoteLearnedSkillDraft(db, draftId) {
  const draft = db.prepare('SELECT * FROM Learned_Skill_Drafts WHERE id = ?').get(draftId);
  if (!draft?.approval_id) return { success: false, error: 'Approval is required before writing learned skills.' };
  const approval = db.prepare("SELECT * FROM Approvals WHERE id = ? AND status = 'approved'").get(draft.approval_id);
  if (!approval) return { success: false, error: 'Approval is required before writing learned skills.' };
  db.prepare("UPDATE Learned_Skill_Drafts SET status = 'promoted' WHERE id = ?").run(draftId);
  return { success: true };
}

function replanIncompleteDownstream(db, flowRunId, failedActionId) {
  const flowRun = db.prepare('SELECT * FROM Flow_Runs WHERE id = ?').get(flowRunId);
  const affected = db
    .prepare("SELECT * FROM Flow_Nodes WHERE flow_run_id = ? AND status NOT IN ('completed','done') AND ref_id != ?")
    .all(flowRunId, failedActionId);
  for (const node of affected) {
    db.prepare("UPDATE Flow_Nodes SET status = 'cancelled' WHERE id = ?").run(node.id);
  }
  db.prepare(`
    INSERT INTO Replan_Decisions (id, mission_id, flow_run_id, trigger, affected_node_ids, inserted_action_ids, removed_action_ids)
    VALUES (?, ?, ?, 'action_failed', ?, ?, ?)
  `).run(
    `replan-${failedActionId}`,
    flowRun.mission_id,
    flowRunId,
    JSON.stringify(affected.map((node) => node.id)),
    JSON.stringify([`recovery-${failedActionId}`]),
    JSON.stringify(affected.map((node) => node.ref_id)),
  );
}

function recordOutboundMessage(db, source, status, error = null) {
  db.prepare(`
    INSERT INTO Outbound_Messages (id, mission_id, source, reason, text, status, error)
    VALUES (?, 'mission-msg', ?, 'approval needed', 'Approval needed for action action-1.', ?, ?)
  `).run(`out-${source}-${status}`, source, status, error);
}

test('runbook launch creates an active mission with ordered agent tasks and timeline context', () => {
  withDb((db) => {
    db.prepare('INSERT INTO Runbooks (id, name, description, agents, output) VALUES (?, ?, ?, ?, ?)').run(
      'audit-repo',
      'Audit repo',
      'Audit the current codebase',
      JSON.stringify(['Security Agent', 'Code Agent', 'UX Agent']),
      'Production hardening report',
    );

    const result = startRunbook(db, 'audit-repo');
    assert.deepEqual(result, { success: true, missionId: 'mission-audit-repo' });

    const mission = db.prepare('SELECT * FROM Missions WHERE id = ?').get(result.missionId);
    assert.equal(mission.status, 'Active');
    assert.equal(mission.readiness_score, 25);

    const tasks = db.prepare('SELECT title, status, assigned_agent FROM Tasks WHERE mission_id = ? ORDER BY id').all(result.missionId);
    assert.deepEqual(tasks, [
      { title: 'Security Agent: Production hardening report', status: 'Active', assigned_agent: 'Security Agent' },
      { title: 'Code Agent: Production hardening report', status: 'Pending', assigned_agent: 'Code Agent' },
      { title: 'UX Agent: Production hardening report', status: 'Pending', assigned_agent: 'UX Agent' },
    ]);

    const log = db.prepare('SELECT event_type, actor, summary FROM Activity_Logs WHERE mission_id = ?').get(result.missionId);
    assert.deepEqual(log, {
      event_type: 'Mission Created',
      actor: 'Runbook',
      summary: 'Started from Audit repo',
    });
  });
});

test('artifact rollback restores prior content and records an approved follow-up version', () => {
  withDb((db) => {
    db.prepare('INSERT INTO Missions (id, name, status) VALUES (?, ?, ?)').run('mission-1', 'Launch', 'Active');
    db.prepare('INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)').run(
      'artifact-1',
      'mission-1',
      'markdown',
      'release.md',
      'current version',
    );
    db.prepare(`
      INSERT INTO Artifact_Versions (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('version-1', 'artifact-1', 'mission-1', 'release.md', 'markdown', 'stable version', 1, 'approved', 'Code Agent', 'Initial draft');
    db.prepare(`
      INSERT INTO Artifact_Versions (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('version-2', 'artifact-1', 'mission-1', 'release.md', 'markdown', 'current version', 2, 'draft', 'Code Agent', 'Experimental edit');

    assert.deepEqual(rollbackArtifactVersion(db, 'version-1'), { success: true });

    const artifact = db.prepare('SELECT content, type, title FROM Artifacts WHERE id = ?').get('artifact-1');
    assert.deepEqual(artifact, { content: 'stable version', type: 'markdown', title: 'release.md' });

    const latest = db
      .prepare('SELECT version, status, generated_by, diff_summary, content FROM Artifact_Versions WHERE title = ? ORDER BY version DESC LIMIT 1')
      .get('release.md');
    assert.deepEqual(latest, {
      version: 3,
      status: 'approved',
      generated_by: 'Supr',
      diff_summary: 'Rolled back to v1',
      content: 'stable version',
    });
  });
});

test('approval decisions update both the approval queue and linked agent action', () => {
  withDb((db) => {
    db.prepare('INSERT INTO Missions (id, name, status) VALUES (?, ?, ?)').run('mission-2', 'Deploy', 'Active');
    db.prepare(`
      INSERT INTO Agent_Actions (id, mission_id, agent_id, capability, required_permission, risk_level, intent, status, approval_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('action-1', 'mission-2', 'code-agent', 'sandbox.execute', 'Can Execute Code', 'High', 'Run production smoke tests', 'pending_approval', 'approval-1');
    db.prepare(`
      INSERT INTO Approvals
        (id, mission_id, requesting_agent_id, action, required_permission, risk_level, reason, status, agent_action_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('approval-1', 'mission-2', 'code-agent', 'sandbox.execute', 'Can Execute Code', 'High', 'Needs human gate', 'pending', 'action-1');

    assert.deepEqual(decideApproval(db, 'approval-1', 'approved'), { success: true });

    const approval = db.prepare('SELECT status, decision FROM Approvals WHERE id = ?').get('approval-1');
    assert.deepEqual(approval, { status: 'approved', decision: 'approved' });

    const action = db.prepare('SELECT status FROM Agent_Actions WHERE id = ?').get('action-1');
    assert.deepEqual(action, { status: 'approved' });
  });
});

test('connector tests persist user-visible status and provider health state', () => {
  withDb((db) => {
    recordConnectorResult(db, 'gemini', 'Live', 'Gemini key is available.');
    recordConnectorResult(db, 'github', 'Offline', 'No credential configured.');

    const settings = Object.fromEntries(db.prepare('SELECT key, value FROM Settings ORDER BY key').all().map((row) => [row.key, row.value]));
    assert.equal(settings.connector_gemini_last_status, 'Live');
    assert.equal(settings.connector_github_last_status, 'Offline');
    assert.equal(settings.connector_gemini_last_checked, '2026-05-30T12:00:00.000Z');

    const geminiHealth = db.prepare('SELECT status, last_success, last_error FROM Provider_Health WHERE id = ?').get('gemini');
    assert.deepEqual(geminiHealth, {
      status: 'Live',
      last_success: '2026-05-30T12:00:00.000Z',
      last_error: null,
    });

    const githubHealth = db.prepare('SELECT status, last_success, last_error FROM Provider_Health WHERE id = ?').get('github');
    assert.deepEqual(githubHealth, {
      status: 'Offline',
      last_success: null,
      last_error: 'No credential configured.',
    });
  });
});

test('learned skills require a complex completed run and approved review before promotion', () => {
  withDb((db) => {
    db.prepare('INSERT INTO Missions (id, name, status) VALUES (?, ?, ?)').run('mission-sial', 'SIAL', 'Active');
    db.prepare('INSERT INTO Agent_Runs (id, mission_id, agent_id, agent_action_id, status, result) VALUES (?, ?, ?, ?, ?, ?)').run(
      'run-simple',
      'mission-sial',
      'code-agent',
      'action-simple',
      'completed',
      JSON.stringify({ summary: 'too small' }),
    );
    db.prepare('INSERT INTO Tool_Invocations (id, mission_id, agent_run_id, tool_name, status) VALUES (?, ?, ?, ?, ?)').run(
      'tool-1',
      'mission-sial',
      'run-simple',
      'workspace_write_file',
      'completed',
    );
    assert.equal(maybeCreateLearnedSkillDraft(db, 'run-simple'), null);

    db.prepare('INSERT INTO Agent_Runs (id, mission_id, agent_id, agent_action_id, status, result) VALUES (?, ?, ?, ?, ?, ?)').run(
      'run-complex',
      'mission-sial',
      'code-agent',
      'action-complex',
      'completed',
      JSON.stringify({ summary: 'complex evidence-backed run' }),
    );
    for (const toolId of ['tool-a', 'tool-b', 'tool-c']) {
      db.prepare('INSERT INTO Tool_Invocations (id, mission_id, agent_run_id, tool_name, status) VALUES (?, ?, ?, ?, ?)').run(
        toolId,
        'mission-sial',
        'run-complex',
        'workspace_write_file',
        'completed',
      );
    }

    const draft = maybeCreateLearnedSkillDraft(db, 'run-complex');
    assert.equal(draft.status, 'draft');
    assert.deepEqual(JSON.parse(draft.evidence_ids), ['tool-a', 'tool-b', 'tool-c']);
    assert.deepEqual(promoteLearnedSkillDraft(db, draft.id), {
      success: false,
      error: 'Approval is required before writing learned skills.',
    });

    db.prepare(`
      INSERT INTO Approvals (id, mission_id, requesting_agent_id, action, required_permission, risk_level, reason, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('approval-sial', 'mission-sial', 'security-agent', 'governance_review', 'Edit', 'Medium', 'Review learned skill', 'approved');
    db.prepare("UPDATE Learned_Skill_Drafts SET status = 'review_requested', approval_id = ? WHERE id = ?").run('approval-sial', draft.id);
    assert.deepEqual(promoteLearnedSkillDraft(db, draft.id), { success: true });
    assert.equal(db.prepare('SELECT status FROM Learned_Skill_Drafts WHERE id = ?').get(draft.id).status, 'promoted');
  });
});

test('replanning cancels only incomplete downstream work and preserves completed evidence', () => {
  withDb((db) => {
    db.prepare('INSERT INTO Missions (id, name, status) VALUES (?, ?, ?)').run('mission-replan', 'Replan', 'Active');
    db.prepare('INSERT INTO Flow_Runs (id, mission_id, status) VALUES (?, ?, ?)').run('flow-1', 'mission-replan', 'running');
    for (const node of [
      ['node-done', 'task-done', 'completed'],
      ['node-failed', 'action-failed', 'failed'],
      ['node-open', 'action-open', 'queued'],
    ]) {
      db.prepare('INSERT INTO Flow_Nodes (id, flow_run_id, mission_id, kind, ref_id, status) VALUES (?, ?, ?, ?, ?, ?)').run(
        node[0],
        'flow-1',
        'mission-replan',
        'agent_action',
        node[1],
        node[2],
      );
    }

    replanIncompleteDownstream(db, 'flow-1', 'action-failed');

    assert.equal(db.prepare('SELECT status FROM Flow_Nodes WHERE id = ?').get('node-done').status, 'completed');
    assert.equal(db.prepare('SELECT status FROM Flow_Nodes WHERE id = ?').get('node-open').status, 'cancelled');
    const decision = db.prepare('SELECT * FROM Replan_Decisions WHERE id = ?').get('replan-action-failed');
    assert.deepEqual(JSON.parse(decision.removed_action_ids), ['action-open']);
    assert.deepEqual(JSON.parse(decision.inserted_action_ids), ['recovery-action-failed']);
  });
});

test('outbound messaging records delivery state without persisting prompt bodies', () => {
  withDb((db) => {
    recordOutboundMessage(db, 'slack', 'sent');
    recordOutboundMessage(db, 'discord', 'failed', 'discord webhook is not configured.');

    const rows = db.prepare('SELECT source, reason, text, status, error FROM Outbound_Messages ORDER BY source DESC').all();
    assert.deepEqual(rows, [
      { source: 'slack', reason: 'approval needed', text: 'Approval needed for action action-1.', status: 'sent', error: null },
      { source: 'discord', reason: 'approval needed', text: 'Approval needed for action action-1.', status: 'failed', error: 'discord webhook is not configured.' },
    ]);
    for (const row of rows) {
      assert.doesNotMatch(row.text, /raw prompt|system instruction|secret/i);
    }
  });
});

test('supervisor dashboard exposes consolidated object, transcript, artifact, and runtime surfaces', () => {
  const requiredFiles = [
    'types/index.ts',
    'lib/dashboard-model.ts',
    'components/DashboardObjectDrawer.tsx',
    'components/RunTranscriptView.tsx',
    'components/ArtifactSourcePreview.tsx',
    'components/RuntimeConsoleStrip.tsx',
  ];

  for (const file of requiredFiles) {
    assert.equal(existsSync(file), true, `${file} should exist`);
  }

  const types = readFileSync('types/index.ts', 'utf8');
  for (const symbol of ['DashboardObject', 'ObjectAction', 'RunEvent', 'ExecutionEvidence', 'DashboardArtifact']) {
    assert.match(types, new RegExp(`interface ${symbol}|type ${symbol}`));
  }

  const dashboard = readFileSync('app/page.tsx', 'utf8');
  assert.match(dashboard, /DashboardObjectDrawer/);
  assert.match(dashboard, /OperationsPanel/);
  assert.match(dashboard, /ObjectsRail/);
  assert.match(dashboard, /WorkPanel/);

  const operationsPanel = readFileSync('components/OperationsPanel.tsx', 'utf8');
  assert.match(operationsPanel, /RuntimeConsoleStrip/);

  const workPanel = readFileSync('components/WorkPanel.tsx', 'utf8');
  assert.match(workPanel, /ProjectWorkflowCanvas/);
  assert.match(workPanel, /RunTranscriptView/);

  const objectsRail = readFileSync('components/ObjectsRail.tsx', 'utf8');
  assert.match(objectsRail, /dashboardObjects/);

  const library = readFileSync('app/library/page.tsx', 'utf8');
  assert.match(library, /ArtifactSourcePreview/);
  assert.doesNotMatch(library, /Artifact source\/preview portal/);

  // app/research and app/mission-packet previously consumed the
  // EvidenceSourcePanel and ReportManifestPanel components. Both
  // components have been removed as dead code (chore(dead-code));
  // the pages themselves remain and render their own inline evidence
  // and report surfaces.

  const code = readFileSync('app/code/page.tsx', 'utf8');
  assert.match(code, /RunTranscriptView/);
  assert.match(code, /codeRunEvents/);
  assert.match(code, /Raw terminal/);
});

test('production model probe does strict JSON shape checking, not substring matches', () => {
  const health = readFileSync('lib/production-health.ts', 'utf8');
  // Must parse JSON; must check for { ok: true } exactly.
  assert.match(health, /JSON\.parse\(response\)/);
  assert.match(health, /\(parsed as Record<string, unknown>\)\.ok === true/);
  assert.match(health, /Object\.keys\(parsed as Record<string, unknown>\)\.length === 1/);
  // The old loose regex must be gone.
  assert.doesNotMatch(health, /"ok"\\s*:\\s*true\|ok\/i/);
  assert.doesNotMatch(health, /\btest\(.*"ok"\s*:\s*true\|ok/i);
});

test('intake falls back to preset plan and scrubs attachment payloads', () => {
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');

  // Planner fallback: buildProjectPlan must catch model errors and return presetPlan.
  assert.match(flow, /async function buildProjectPlan/);
  const planBody = flow.match(/async function buildProjectPlan[\s\S]*?\n\}/)?.[0] || '';
  assert.match(planBody, /presetPlan\(objective\)/);
  assert.match(planBody, /planner\.fallback/);
  assert.doesNotMatch(planBody, /throw error;/);

  // Scrubbed intake logging: routeIntakeToProjectFlow must use
  // serializeChannelPayload for the Channel_Commands.payload column.
  assert.match(flow, /import\s*\{[^}]*serializeChannelPayload[^}]*\}\s*from\s*'@\/lib\/channel-logging'/);
  // The call to serializeChannelPayload must appear in the file (after
  // the routeIntakeToProjectFlow function declaration).
  const afterIntake = flow.slice(flow.indexOf('export async function routeIntakeToProjectFlow'));
  assert.match(afterIntake, /serializeChannelPayload\(/);
  // The old raw attachments payload literal must be gone from the intake path.
  assert.doesNotMatch(afterIntake, /JSON\.stringify\(\{\s*attachments:\s*input\.attachments/);
});

test('agent routes reject requests without an active mission, instead of falling back to a phantom id', () => {
  // No more `mission?.id || 'm1'` anywhere in the API routes or runtime.
  for (const file of ['app/api/code-agent/route.ts', 'app/api/research/route.ts']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /mission\?\.id \|\| 'm1'/);
  }
  // Both routes must explicitly bail out when no mission is found.
  const research = readFileSync('app/api/research/route.ts', 'utf8');
  assert.match(research, /No active project is available for research/);
  const codeAgent = readFileSync('app/api/code-agent/route.ts', 'utf8');
  assert.match(codeAgent, /No active project is available for the code agent/);
});

test('flow run records the configured operating mode, not a hardcoded autonomous literal', () => {
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  // The getOrCreateFlowRun helper must call getRuntimeMode() and pass
  // the result as the mode column on Flow_Runs. The hardcoded
  // 'idle', 'autonomous' literal in the INSERT must be gone.
  const helper = flow.match(/async function getOrCreateFlowRun[\s\S]*?\n\}/)?.[0] || '';
  assert.match(helper, /await getRuntimeMode\(\)/);
  assert.doesNotMatch(helper, /'idle',\s*'autonomous'/);
  // And the function's returned row should still have the autonomous
  // mode, not the getRuntimeMode string. The INSERT must bind the
  // helper variable (mode) as a parameter, not a hardcoded literal.
  assert.match(helper, /\[flowRunId, missionId, mode, source\]/);
});

test('PermissionEngine loads native rules via dynamic import, not require()', () => {
  const governance = readFileSync('lib/services/governance.ts', 'utf8');
  // The lazy-load helper and the two call sites must use await import().
  assert.match(governance, /await import\(['"]\.\.\/governance\/SafetyRuleEngine['"]\)/);
  assert.match(governance, /await import\(['"]\.\.\/governance\/RuleEngine['"]\)/);
  // The database access must go through the dbClient adapter (not the
  // raw getSqliteDb() / db.prepare() SQLite handle, which would tie the
  // governance layer to SQLite and break any future Postgres migration).
  assert.match(governance, /import\s+dbClient\s+from\s+['"]@\/lib\/database\/db_client['"]/);
  assert.match(governance, /dbClient\.queryOne/);
  assert.match(governance, /dbClient\.execute/);
  // And no require() calls anywhere in governance code (Turbopack rejects them).
  // Match require( followed by a quote so we don't trip on the word in a comment.
  assert.doesNotMatch(governance, /\brequire\(\s*['"]/);
  // ToolRegistry must use a static import of PermissionEngine too.
  const registry = readFileSync('lib/tools/registry.ts', 'utf8');
  assert.match(registry, /import\s*\{[^}]*PermissionEngine[^}]*\}\s*from\s*['"]\.\.\/services\/governance['"]/);
  assert.doesNotMatch(registry, /\brequire\(['"]\.\.\/services\/governance['"]\)/);
});

test('getActiveProvider caches results with a TTL and invalidates on LLM setting changes', () => {
  const model = readFileSync('lib/providers/model.ts', 'utf8');
  // After the actions.ts split, the invalidate call now lives
  // in app/actions/settings.ts. Read both so the assertion
  // survives the refactor.
  const actions = readFileSync('app/actions.ts', 'utf8') + readFileSync('app/actions/settings.ts', 'utf8');
  assert.match(model, /providerCache/);
  assert.match(model, /PROVIDER_CACHE_TTL_MS/);
  assert.match(model, /invalidateProviderCache/);
  assert.match(actions, /invalidateProviderCache/);
  // The TTL must be a finite, reasonable value (5s .. 10min).
  // Allow numeric separators (30_000).
  const ttlMatch = model.match(/PROVIDER_CACHE_TTL_MS\s*=\s*(\d[\d_]*)/);
  assert.ok(ttlMatch, 'PROVIDER_CACHE_TTL_MS must be a number literal');
  const ttl = Number(ttlMatch[1].replace(/_/g, ''));
  assert.ok(ttl >= 5_000 && ttl <= 600_000, `expected TTL in [5s, 10m], got ${ttl}ms`);
  // updateSettingAction must invalidate the cache for the LLM/operating
  // mode key families only, not for every setting.
  const updateBody = actions.match(/export async function updateSettingAction[\s\S]*?\n\}/)?.[0] || '';
  assert.match(updateBody, /key\.startsWith\(['"]llm_['"]\)/);
  assert.match(updateBody, /key\.startsWith\(['"]global_['"]\)/);
  assert.match(updateBody, /key === ['"]runtime_mode['"]/);
});

test('SQLite schema migrations go through the versioned runner, and FK errors are translated', () => {
  const init = readFileSync('lib/database/init.ts', 'utf8');
  const agentActions = readFileSync('lib/runtime/agent-actions.ts', 'utf8');

  // Migration runner: lib/database/init.ts must call applyMigrations()
  // with the registry. ALTER TABLE ADD COLUMN lives in
  // lib/database/migrations/ as individual migration modules.
  assert.match(init, /applyMigrations\(dbInstance, migrations\)/);
  const migrations = readFileSync('lib/database/migrations.ts', 'utf8');
  assert.match(migrations, /export function applyMigrations/);
  assert.match(migrations, /CREATE TABLE IF NOT EXISTS _migrations/);
  assert.match(migrations, /duplicate column name/);
  assert.match(migrations, /already exists/);
  // The old try/catch ALTER pattern must be gone from init.ts.
  assert.doesNotMatch(init, /try\s*\{[\s\S]*?ALTER TABLE[\s\S]*?\}\s*catch/);

  // FK error translation: createAgentAction must wrap its INSERT in a
  // try and translate the error via translateDbConstraintError.
  assert.match(agentActions, /translateDbConstraintError/);
  const create = agentActions.match(/export async function createAgentAction[\s\S]*?\n\}/)?.[0] || '';
  assert.match(create, /try\s*\{[\s\S]*INSERT INTO Agent_Actions[\s\S]*?\}\s*catch/);
});

test('repo hygiene: leftover debug + tunnel artifacts are not tracked and the .gitignore blocks re-introduction', () => {
  // The .gitignore must include patterns for every known offender.
  const gitignore = readFileSync('.gitignore', 'utf8');
  assert.match(gitignore, /test_keys_\*\.js/);
  assert.match(gitignore, /cloudflared(?:\.exe)?/);
  // Defensive pattern for folders whose names contain a trailing space.
  assert.match(gitignore, /Complex/);

  // Verify the offenders have actually been removed from the working tree.
  assert.equal(existsSync('test_keys_direct.js'), false, 'test_keys_direct.js must be removed');
  assert.equal(existsSync('cloudflared.exe'), false, 'cloudflared.exe must be removed');
});

test('OpenAICompatibleProvider picks the right max-tokens field name per provider', () => {
  const model = readFileSync('lib/providers/model.ts', 'utf8');
  // The provider class must accept a maxTokensField option and use it as
  // the dynamic key in the request body (computed key, not a hard-coded
  // string).
  assert.match(model, /maxTokensField/);
  assert.match(model, /\[this\.maxTokensField\]:\s*options\?\.maxOutputTokens\s*\?\?\s*2048/);
  // Every builder that constructs the class must pass the right field:
  //   - OpenAI -> max_completion_tokens (new)
  //   - MiniMax, xAI, OpenRouter, Groq, Mistral, DeepSeek -> max_tokens
  //   - The user-configured "openai_compat" backup -> max_completion_tokens
  assert.match(model, /buildMinimax[\s\S]*?maxTokensField:\s*'max_tokens'/);
  // The preset builder for non-OpenAI providers must opt out of the
  // new field name.
  const preset = model.match(/buildOpenAICompatiblePreset\s*=[\s\S]*?\n\s*\}\s*;/) || [];
  // The same builder, for the 'openai' literal, must opt in.
  assert.match(model, /provider\s*===\s*'openai'\s*\?\s*'max_completion_tokens'\s*:\s*'max_tokens'/);
  // The backup (openai_compat) builder defaults to the new field.
  assert.match(model, /buildBackup[\s\S]*?maxTokensField:\s*'max_completion_tokens'/);
});

test('mission state changes are published through a process-local event bus, not via polling', () => {
  const bus = readFileSync('lib/events/bus.ts', 'utf8');
  assert.match(bus, /class MissionEventBus extends EventEmitter/);
  assert.match(bus, /emitChange/);
  assert.match(bus, /onChange/);
  assert.match(bus, /notifyMissionChanged/);
  assert.match(bus, /setMaxListeners/);

  // The stream route must subscribe, not poll exclusively.
  const stream = readFileSync('app/api/mission/stream/route.ts', 'utf8');
  assert.match(stream, /missionEventBus/);
  assert.match(stream, /onChange/);
  // The old 2-second-only poll must be gone; the safety-net poll must
  // be substantially longer (>= 5s).
  const pollMatch = stream.match(/SAFETY_NET_POLL_MS\s*=\s*(\d[\d_]*)/);
  assert.ok(pollMatch, 'SAFETY_NET_POLL_MS must be a number literal');
  const poll = Number(pollMatch[1].replace(/_/g, ''));
  assert.ok(poll >= 5_000, `safety-net poll should be at least 5s, got ${poll}ms`);

  // Emitters in the runtime must call notifyMissionChanged on the
  // mutation paths (logFlowEvent, createAgentAction, success and
  // failure branches of executeAgentAction).
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  assert.match(flow, /notifyMissionChanged/);
  const agentActions = readFileSync('lib/runtime/agent-actions.ts', 'utf8');
  assert.match(agentActions, /notifyMissionChanged/);
});

test('mission phases are derived from the relational Tasks table, not the Glidepaths JSON column', () => {
  const db = readFileSync('lib/db.ts', 'utf8');
  const flow = readFileSync('lib/runtime/project-flow.ts', 'utf8');

  // New derivePhasesFromTasks must exist and use Tasks table.
  assert.match(db, /export async function derivePhasesFromTasks/);
  assert.match(db, /SELECT phase_id, status FROM Tasks WHERE mission_id = \?/);
  // Read path must use the derived phases when Tasks rows exist.
  // The derivation is split across two helpers (phaseListFromStatuses +
  // phaseStatusFromTaskStatuses); just assert the call chain exists.
  assert.match(db, /phaseListFromStatuses\(/);
  assert.match(db, /phaseStatusFromTaskStatuses\(/);

  // Runtime no longer writes the Glidepaths.phases JSON column.
  assert.doesNotMatch(flow, /UPDATE Glidepaths SET phases = \?/);
  // createMission INSERT no longer includes the phases column.
  assert.doesNotMatch(db, /INSERT INTO Glidepaths \(id, mission_id, phases, tasks, readiness_score\)/);
  // But the Tasks column is still used (createAgentAction etc.).
  assert.match(db, /INSERT INTO Glidepaths \(id, mission_id, tasks, readiness_score\)/);
});

test('getDb loads all missions in a fixed number of batched queries, not N+1', () => {
  const db = readFileSync('lib/db.ts', 'utf8');
  // The new getMissionsBatch helper must exist and use WHERE id IN (?)
  // for each related table so a 50-mission dashboard does 7 queries
  // instead of 400.
  assert.match(db, /export async function getMissionsBatch/);
  assert.match(db, /SELECT \* FROM Missions WHERE id IN/);
  assert.match(db, /SELECT \* FROM Glidepaths WHERE mission_id IN/);
  assert.match(db, /SELECT \* FROM Tasks WHERE mission_id IN/);
  assert.match(db, /SELECT \* FROM Event_Log WHERE mission_id IN/);
  assert.match(db, /SELECT \* FROM Failure_Events WHERE mission_id IN/);
  assert.match(db, /SELECT \* FROM Artifacts WHERE mission_id IN/);
  assert.match(db, /SELECT \* FROM Memory_Items WHERE mission_id IN/);
  // The wrapper must use the batch helper, not the N+1 pattern.
  assert.match(db, /getMissionsBatch\(missions\.map\(\(m\) => m\.id\)\)/);
  assert.doesNotMatch(db, /missions\.map\(m => getMissionById\(m\.id\)\)/);
});

test('getMissionById has a short-TTL in-process cache to absorb stream-burst reads', () => {
  const db = readFileSync('lib/db.ts', 'utf8');
  // Cache map and TTL constant.
  assert.match(db, /missionCache = new Map/);
  assert.match(db, /MISSION_CACHE_TTL_MS = 1_000|MISSION_CACHE_TTL_MS\s*=\s*1000/);
  // Public invalidation helper.
  assert.match(db, /export function invalidateMissionCache/);
  // The public function checks the cache first and falls through to
  // an inner _Uncached worker.
  const publicBody = db.match(/export async function getMissionById\([^)]*\): Promise<Mission[^>]*> \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(publicBody, /missionCache\.get\(id\)/);
  assert.match(publicBody, /getMissionByIdUncached\(id\)/);
});

test('settings page broadcasts notifySettingsChanged after a successful save', () => {
  const page = readFileSync('app/settings/page.tsx', 'utf8');
  // The hook helper must be imported in the settings page.
  assert.match(page, /notifySettingsChanged/);
  // The central save helper (handleUpdateSetting) must call it on
  // success so the chat picks up the change without a refresh.
  const handleBody = page.match(/const handleUpdateSetting[\s\S]*?\n\s*\};/)?.[0] || '';
  assert.match(handleBody, /notifySettingsChanged\(\)/);
});

test('every settings save route in app/settings/page.tsx goes through handleUpdateSetting (so the cross-tab sentinel fires)', () => {
  const page = readFileSync('app/settings/page.tsx', 'utf8');
  // No remaining direct call to updateSettingAction in the page --
  // every save must go through handleUpdateSetting so the chat
  // re-fetches the snapshot in the same tab as well. We can't
  // simply count updateSettingAction occurrences because the
  // helper itself uses it (line 318). So we assert that the only
  // updateSettingAction usage is inside the handleUpdateSetting
  // function body and the call sites use handleUpdateSetting.
  const handleBody = page.match(/const handleUpdateSetting[\s\S]*?\n\s*\};/)?.[0] || '';
  assert.match(handleBody, /updateSettingAction\(/);
  // Every other save site must call handleUpdateSetting, not
  // updateSettingAction directly. Search for callers of the form
  // `await handleUpdateSetting` or `void handleUpdateSetting` or
  // `handleUpdateSetting(`. There should be several.
  const directCalls = page.match(/(?<![A-Za-z])updateSettingAction\(/g) || [];
  // The single allowed occurrence is the one inside handleUpdateSetting
  // (already matched above). All other matches would be missed
  // broadcast sites.
  const otherCalls = directCalls.length - 1;
  if (otherCalls !== 0) {
    throw new Error(
      `Found ${otherCalls} direct updateSettingAction call(s) outside handleUpdateSetting; ` +
      `every save must broadcast notifySettingsChanged. Search for "updateSettingAction(" in the page.`
    );
  }
});

test('npm run db:status is a recovery CLI with status, up, down, and lock-v1 commands', () => {
  // The package.json entry must exist so operators can run it.
  const pkg = readFileSync('package.json', 'utf8');
  assert.match(pkg, /"db:status"/);
  assert.match(pkg, /scripts\/recover\.mjs/);

  // The script must be a real CLI (shebang + imports).
  const script = readFileSync('scripts/recover.mjs', 'utf8');
  assert.match(script, /^#!\/usr\/bin\/env node/);
  assert.match(script, /_migrations/);
  assert.match(script, /SQLITE_DB_PATH/);

  // All four commands must be routed.
  assert.match(script, /COMMAND === "status"/);
  assert.match(script, /COMMAND === "up"/);
  assert.match(script, /COMMAND === "down"/);
  assert.match(script, /COMMAND === "lock-v1"/);

  // V1 migrations seeded for pre-migration-tool DBs.
  assert.match(script, /0001__add_cron_jobs_assigned_agent_id/);
  assert.match(script, /0006__add_approvals_agent_action_id/);
});

test('dead field AgentRuntimeRunInput.resumeCursor is removed and the no-provider error is helpful', () => {
  const types = readFileSync('lib/runtime/types.ts', 'utf8');
  const model = readFileSync('lib/providers/model.ts', 'utf8');
  // The field itself must be gone (matches a declaration: 'resumeCursor?:'
  // or 'resumeCursor:'). The deprecation comment may still mention the
  // word in prose, which is intentional.
  assert.doesNotMatch(types, /resumeCursor\s*\??\s*:/);
  // The no-provider error must list the env vars operators can set.
  const noProvider = model.match(/No model provider is configured[\s\S]{0,400}/);
  assert.ok(noProvider, 'expected the no-provider error message in model.ts');
  for (const v of ['MINIMAX_API_KEY', 'GEMINI_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'BACKUP_LLM_API_KEY']) {
    assert.match(noProvider[0], new RegExp(v));
  }
});

test('lib and src are consolidated: no @/src/ imports anywhere', () => {
  // After PR18, every former src/ module lives under lib/ and the
  // old @/src/ alias is gone. This guards against accidental
  // re-introduction.

  // No @/src/ imports anywhere in app, components, lib, proxy.ts.
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      const stat = statSync(p);
      if (stat.isDirectory()) {
        walk(p);
      } else if (/\.(ts|tsx)$/.test(entry)) {
        const s = readFileSync(p, 'utf8');
        if (s.includes("'@/src/")) offenders.push(p);
      }
    }
  };
  for (const top of ['app', 'components', 'lib']) {
    if (existsSync(top)) walk(top);
  }
  // proxy.ts is a single file at the repo root, not a directory.
  if (existsSync('proxy.ts')) {
    const s = readFileSync('proxy.ts', 'utf8');
    if (s.includes("'@/src/")) offenders.push('proxy.ts');
  }
  assert.equal(offenders.length, 0, `unexpected @/src/ imports: ${offenders.join('\n')}`);

  // The src/ directory must not exist.
  assert.equal(existsSync('src'), false, 'src/ directory should be removed after consolidation');
});

test('useSettingsSnapshot hook is the shared source of truth for active model + autonomy', () => {
  const hook = readFileSync('hooks/useSettingsSnapshot.ts', 'utf8');
  assert.match(hook, /export function useSettingsSnapshot/);
  assert.match(hook, /fetchSettingsAction/);
  assert.match(hook, /llm_provider_supr/);
  assert.match(hook, /llm_model_supr/);
  assert.match(hook, /operating_mode/);
  assert.match(hook, /sandbox_allow_api_keys/);

  // The chat page must use the shared hook rather than re-deriving
  // the same four settings itself.
  const chat = readFileSync('app/supr-chat/page.tsx', 'utf8');
  assert.match(chat, /useSettingsSnapshot/);

  // Cross-tab refresh: the hook must re-fetch on focus so settings
  // changed in another tab become visible when the user returns.
  assert.match(hook, /addEventListener\(['"]focus['"]/);

  // A helper for other client code to broadcast that settings
  // changed is exported.
  assert.match(hook, /export function notifySettingsChanged/);
  assert.match(hook, /supr:settings-updated/);
});

test('DataTable component is a generic neobrutalist list table for shared use', () => {
  const tbl = readFileSync('components/DataTable.tsx', 'utf8');
  assert.match(tbl, /export function DataTable/);
  assert.match(tbl, /export interface DataTableColumn/);
  assert.match(tbl, /columns\.map/);
  assert.match(tbl, /rows\.map/);
  // Empty-state copy so callers don't reinvent it.
  assert.match(tbl, /emptyMessage/);
  // Optional row click so callers can render the rows as buttons.
  assert.match(tbl, /onRowClick/);
  // Custom renderer per column.
  assert.match(tbl, /render\?\: \(row: T\) => ReactNode/);
});

test('Supr-Chat uses the extracted WorkspaceFilesPanel component', () => {
  const page = readFileSync('app/supr-chat/page.tsx', 'utf8');
  assert.match(page, /from '@\/components\/WorkspaceFilesPanel'/);
  // The page must not inline the file-list block.
  assert.doesNotMatch(page, /Local Sandbox Directory/);
  // The component file must exist and have the public surface.
  const comp = readFileSync('components/WorkspaceFilesPanel.tsx', 'utf8');
  assert.match(comp, /export function WorkspaceFilesPanel/);
  assert.match(comp, /onCreateNewFile/);
  assert.match(comp, /onOpenFile/);
  assert.match(comp, /onDeleteFile/);
  // Empty state copy.
  assert.match(comp, /Workspace directory is currently empty/);
});

test('Supr-Chat uses extracted CanvasEditorPanel and CanvasRunPanel components', () => {
  const page = readFileSync('app/supr-chat/page.tsx', 'utf8');
  assert.match(page, /from '@\/components\/CanvasEditorPanel'/);
  assert.match(page, /from '@\/components\/CanvasRunPanel'/);
  // The component files must exist with the right public surface.
  const editor = readFileSync('components/CanvasEditorPanel.tsx', 'utf8');
  assert.match(editor, /export function CanvasEditorPanel/);
  assert.match(editor, /Save Changes/);
  assert.match(editor, /Execute Code/);
  assert.match(editor, /Select a document from Sandbox Files/);
  const run = readFileSync('components/CanvasRunPanel.tsx', 'utf8');
  assert.match(run, /export function CanvasRunPanel/);
  assert.match(run, /Terminal Execution Logs/);
  assert.match(run, /Executing script inside sandbox/);
  assert.match(run, /STDOUT/);
  assert.match(run, /STDERR/);
});

test('Settings page uses the extracted StandardsSection component', () => {
  const page = readFileSync('app/settings/page.tsx', 'utf8');
  assert.match(page, /from '@\/components\/settings\/StandardsSection'/);
  // The component file must exist and have the public surface.
  const comp = readFileSync('components/settings/StandardsSection.tsx', 'utf8');
  assert.match(comp, /export function StandardsSection/);
  assert.match(comp, /cite_evidence/);
  assert.match(comp, /pass_tests/);
  assert.match(comp, /scope_approval/);
});

test('Settings page uses the extracted PermissionsSection component', () => {
  const page = readFileSync('app/settings/page.tsx', 'utf8');
  assert.match(page, /from '@\/components\/settings\/PermissionsSection'/);
  // The component file must exist with the right public surface.
  const comp = readFileSync('components/settings/PermissionsSection.tsx', 'utf8');
  assert.match(comp, /export function PermissionsSection/);
  assert.match(comp, /Docker Sandbox/);
  assert.match(comp, /Remote Execution/);
  assert.match(comp, /onEnforceTier/);
  assert.match(comp, /onDockerProbe/);
  // The 4 tier rows.
  assert.match(comp, /observe/);
  assert.match(comp, /governed/);
  assert.match(comp, /execute/);
  assert.match(comp, /root/);
});

test('Settings page uses the extracted PortabilitySection component', () => {
  const page = readFileSync('app/settings/page.tsx', 'utf8');
  assert.match(page, /from '@\/components\/settings\/PortabilitySection'/);
  // The component file must exist with the right public surface.
  const comp = readFileSync('components/settings/PortabilitySection.tsx', 'utf8');
  assert.match(comp, /export function PortabilitySection/);
  assert.match(comp, /Back up workspace/);
  assert.match(comp, /Import \/ Restore Backup/);
  assert.match(comp, /Choose JSON Backup File/);
  assert.match(comp, /Restore Completed/);
  // All import status strings are typed.
  assert.match(comp, /ImportStatus = "idle" \| "reading" \| "ready" \| "importing"/);
  // The component must declare its ref as a real prop, not
  // useRef() internally, so the page can scroll to it.
  const propsType = comp.match(/export interface PortabilitySectionProps[\s\S]*?\}/)?.[0] || '';
  assert.match(propsType, /ref: Ref<HTMLDivElement>/);
});

test('Settings page uses the extracted LLMConfigSection component', () => {
  const page = readFileSync('app/settings/page.tsx', 'utf8');
  assert.match(page, /from '@\/components\/settings\/LLMConfigSection'/);
  // The component file must exist with the right public surface.
  const comp = readFileSync('components/settings/LLMConfigSection.tsx', 'utf8');
  assert.match(comp, /export function LLMConfigSection/);
  assert.match(comp, /Global Providers &amp; Fallbacks|Global Providers & Fallbacks/);
  assert.match(comp, /Backup Provider Config/);
  // The component must declare its ref as a prop.
  const propsType = comp.match(/export interface LlmConfigSectionProps[\s\S]*?\}/)?.[0] || '';
  assert.match(propsType, /ref: Ref<HTMLDivElement>/);
  // The destructure on the function body should consume the ref
  // (so the page can scroll to it) rather than reading props.ref.
  assert.match(comp, /export function LLMConfigSection\(\{ ref, \.\.\.props \}[\s\S]{0,80}\<div ref=\{ref\}/);
  // The component takes role configs as 4 props (supr/code/research/sub).
  assert.match(propsType, /supr: LlmRoleConfig/);
  assert.match(propsType, /code: LlmRoleConfig/);
  assert.match(propsType, /research: LlmRoleConfig/);
  assert.match(propsType, /sub: LlmRoleConfig/);
  // The role override sub-component is internal but its existence
  // is asserted by the file structure.
  assert.match(comp, /function RoleOverridesCard/);
});

test('Settings page uses the extracted MemorySection component (with the inspector modal inside)', () => {
  const page = readFileSync('app/settings/page.tsx', 'utf8');
  assert.match(page, /from '@\/components\/settings\/MemorySection'/);
  // The inline modal block must be gone.
  assert.doesNotMatch(page, /Memory Banks Interactive Modal/);
  // The component file must exist with the right public surface.
  const comp = readFileSync('components/settings/MemorySection.tsx', 'utf8');
  assert.match(comp, /export function MemorySection/);
  assert.match(comp, /Memory Inspector/);
  assert.match(comp, /Inject Custom Memory Entry/);
  assert.match(comp, /function MemoryInspectorModal/);
  // The 3 bank tiles.
  assert.match(comp, /User/);
  assert.match(comp, /Workspace/);
  assert.match(comp, /Mission/);
});

