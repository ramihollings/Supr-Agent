import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
    'components/EvidenceSourcePanel.tsx',
    'components/ReportManifestPanel.tsx',
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

  const research = readFileSync('app/research/page.tsx', 'utf8');
  assert.match(research, /EvidenceSourcePanel/);

  const report = readFileSync('app/mission-packet/page.tsx', 'utf8');
  assert.match(report, /ReportManifestPanel/);

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
  assert.match(governance, /await import\(['"]\.\.\/\.\.\/src\/governance\/SafetyRuleEngine['"]\)/);
  assert.match(governance, /await import\(['"]\.\.\/\.\.\/src\/governance\/RuleEngine['"]\)/);
  assert.match(governance, /await import\(['"]\.\.\/database\/init['"]\)/);
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
  const actions = readFileSync('app/actions.ts', 'utf8');
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

test('SQLite schema migrations only swallow duplicate-column errors, and FK errors are translated', () => {
  const init = readFileSync('lib/database/init.ts', 'utf8');
  const agentActions = readFileSync('lib/runtime/agent-actions.ts', 'utf8');

  // Migration guard: isBenignMigrationError must exist and only allow the
  // benign codes (duplicate column, duplicate table).
  assert.match(init, /isBenignMigrationError/);
  const guard = init.match(/function isBenignMigrationError\([^)]*\): boolean \{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(guard, /duplicate column name/);
  assert.match(guard, /already exists/);
  // Every ALTER TABLE block must call the guard (not empty catch).
  const alts = init.match(/ALTER TABLE [A-Za-z_]+ ADD COLUMN [A-Za-z_]+/g) || [];
  assert.ok(alts.length >= 5, `expected at least 5 ALTER blocks, found ${alts.length}`);
  for (const _ of alts) {
    assert.match(init, /isBenignMigrationError\(e\)/);
  }
  // The old empty-catch pattern must be gone.
  assert.doesNotMatch(init, /catch\s*\(\s*e\s*\)\s*\{\s*\}/);

  // FK error translation: createAgentAction must wrap its INSERT in a
  // try and translate the error via translateDbConstraintError.
  assert.match(agentActions, /translateDbConstraintError/);
  const create = agentActions.match(/export async function createAgentAction[\s\S]*?\n\}/)?.[0] || '';
  assert.match(create, /try\s*\{[\s\S]*INSERT INTO Agent_Actions[\s\S]*?\}\s*catch/);
});
