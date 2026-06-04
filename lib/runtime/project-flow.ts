import dbClient from '@/lib/database/db_client';
import { addActivityLog, getActiveMission, getMissionById, createMission } from '@/lib/db';
import { createAgentAction, resumeAgentActionFromApproval } from './agent-actions';
import { runAgentRuntimeAction } from './agent-runtime-runner';
import { getActiveProvider } from '@/lib/providers/model';
import { getRuntimeMode, hasConfiguredModelProvider } from './runtime-mode';
import { parseModelJson } from './model-json';
import { messagingGateway } from '@/lib/services/messaging-gateway';
import { serializeChannelPayload } from '@/lib/channel-logging';
import { telemetry } from '@/lib/telemetry';
import { notifyMissionChanged } from '@/lib/events/bus';
import type { PermissionTier } from '@/lib/services/governance';
import type { RiskLevel, RuntimeMode } from './types';

type Preset = {
  role: string;
  agentName: string;
  capability: string;
  permissionTier: PermissionTier;
  riskLevel: RiskLevel;
  phase: string;
};

type PlannedWork = Preset & {
  title: string;
  inputs: Record<string, unknown>;
  plannerSource: 'model' | 'preset_fallback';
};

const AGENT_PRESETS: Preset[] = [
  { role: 'Research', agentName: 'Research Agent', capability: 'web_scrape', permissionTier: 'Observe', riskLevel: 'Low', phase: 'Research' },
  { role: 'Code', agentName: 'Code Agent', capability: 'workspace_write_artifact', permissionTier: 'Edit', riskLevel: 'Medium', phase: 'Build' },
  { role: 'Code', agentName: 'Code Agent', capability: 'workspace_write_file', permissionTier: 'Edit', riskLevel: 'Medium', phase: 'Build' },
  { role: 'Code', agentName: 'Code Agent', capability: 'execute_sandboxed_command', permissionTier: 'Execute', riskLevel: 'High', phase: 'Build' },
  { role: 'QA', agentName: 'QA Agent', capability: 'workspace_validate_outputs', permissionTier: 'Draft', riskLevel: 'Low', phase: 'Verify' },
  { role: 'QA', agentName: 'QA Agent', capability: 'execute_sandboxed_command', permissionTier: 'Execute', riskLevel: 'High', phase: 'Verify' },
  { role: 'Security', agentName: 'Security Agent', capability: 'governance_review', permissionTier: 'Edit', riskLevel: 'Medium', phase: 'Verify' },
  { role: 'Writer', agentName: 'Writer Agent', capability: 'delivery_package', permissionTier: 'Draft', riskLevel: 'Low', phase: 'Deliver' },
];

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Glidepath templates — Phase 3A.
// ---------------------------------------------------------------------------

export interface GlidepathPhase {
  id: string;
  name: string;
  requiredAgents: string[];
  approvalGate: boolean;
  maxRetries?: number;
  escalateOnFailure?: boolean;
  outputs: string[];
}

export interface GlidepathTemplate {
  templateId: string;
  name: string;
  description: string;
  phases: GlidepathPhase[];
  failurePolicy: { maxRetriesPerTask: number; escalationTarget: string; onEscalation: string };
}

/**
 * Load a single glidepath template by id from
 * `agent-config/glidepath_templates/`. Returns null if the file is
 * missing or malformed so callers can fall back to the hard-coded
 * preset plan.
 */
export function loadGlidepathTemplate(templateId: string): GlidepathTemplate | null {
  const path = require('node:path');
  const fs = require('node:fs');
  const filePath = path.resolve(process.cwd(), 'agent-config', 'glidepath_templates', `${templateId}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as GlidepathTemplate;
  } catch {
    return null;
  }
}

/**
 * Heuristic: pick the best template for a given objective. The
 * `feature_development` template wins for objectives that mention
 * "feature", "implement", "build a", "develop"; otherwise the
 * `default_mission` template wins. Returning null lets the planner
 * fall back to the hard-coded preset if no template matches.
 */
export function selectGlidepathTemplateForObjective(objective: string): GlidepathTemplate | null {
  const lower = (objective || '').toLowerCase();
  if (/\b(feature|implement|build a|develop|new feature|add a)\b/.test(lower)) {
    return loadGlidepathTemplate('feature_development');
  }
  return loadGlidepathTemplate('default_mission');
}

/**
 * Convert a GlidepathTemplate into the PlannedWork[] shape that
 * buildModelProjectPlan consumes. The mapping is:
 *   `requiredAgents: ['research']`   -> `capability: 'web_scrape'`
 *   `requiredAgents: ['planner']`     -> `capability: 'delivery_package'`
 *   `requiredAgents: ['code']`        -> `capability: 'workspace_write_artifact'`
 *   `requiredAgents: ['qa_critic']`   -> `capability: 'workspace_validate_outputs'`
 *   `requiredAgents: ['security']`    -> `capability: 'governance_review'`
 *   `requiredAgents: ['supr']`        -> `capability: 'delivery_package'`
 * Unknown agents get `workspace_write_artifact` as a safe default.
 * Approval-gated phases get a higher risk level so the runtime
 * prompts the operator before executing.
 */
const PHASE_AGENT_TO_CAPABILITY: Record<string, string> = {
  research: 'web_scrape',
  planner: 'delivery_package',
  code: 'workspace_write_artifact',
  qa_critic: 'workspace_validate_outputs',
  security: 'governance_review',
  supr: 'delivery_package',
};

const PHASE_AGENT_TO_ROLE: Record<string, string> = {
  research: 'Research',
  planner: 'Planner',
  code: 'Code',
  qa_critic: 'QA',
  security: 'Security',
  supr: 'Writer',
};

const PHASE_AGENT_TO_TIER: Record<string, string> = {
  research: 'Observe',
  planner: 'Draft',
  code: 'Edit',
  qa_critic: 'Draft',
  security: 'Edit',
  supr: 'Draft',
};

export function glidepathToPlan(template: GlidepathTemplate, objective: string): PlannedWork[] {
  return template.phases.map((phase) => {
    const agentKey = phase.requiredAgents[0] || 'code';
    return {
      role: PHASE_AGENT_TO_ROLE[agentKey] || 'Code',
      agentName: `${PHASE_AGENT_TO_ROLE[agentKey] || 'Code'} Agent`,
      capability: PHASE_AGENT_TO_CAPABILITY[agentKey] || 'workspace_write_artifact',
      permissionTier: (PHASE_AGENT_TO_TIER[agentKey] || 'Edit') as any,
      riskLevel: phase.approvalGate ? 'High' : 'Medium',
      phase: phase.name,
      title: `${phase.name}: ${objective}`.slice(0, 240),
      inputs: {
        objective,
        phaseId: phase.id,
        requiredOutputs: phase.outputs,
        approvalGate: phase.approvalGate,
      },
      plannerSource: 'glidepath_template' as const,
    } satisfies PlannedWork;
  });
}


async function logFlowEvent(missionId: string, eventType: string, actor: string, summary: string, detail = '') {
  await addActivityLog(missionId, {
    eventType: eventType as any,
    actor,
    actorIcon: actor === 'Supr' ? 'psychology' : 'smart_toy',
    summary,
    detail,
  });
  // Any flow event implies the mission may have changed state. Notify
  // the stream so connected dashboards update without waiting for the
  // safety-net poll.
  notifyMissionChanged(missionId, eventType === 'agent_action' ? 'agent_action_created' : 'mission_updated');
}

async function ensurePresetAgent(preset: Preset) {
  const existing = await dbClient.queryOne<any>(`SELECT * FROM Agents WHERE name = ? LIMIT 1`, [preset.agentName]);
  if (existing) {
    await ensureAgentCapability(existing.id, preset.capability);
    return existing;
  }

  const agentId = id('a');
  await dbClient.execute(
    `INSERT INTO Agents (id, workspace_id, name, role, type, permission_tier, tools, status, retry_limit, retry_count)
     VALUES (?, NULL, ?, ?, 'permanent', ?, ?, 'active', 3, 0)`,
    [agentId, preset.agentName, preset.role, preset.permissionTier, JSON.stringify([preset.capability])],
  );
  await ensureAgentCapability(agentId, preset.capability);
  return {
    id: agentId,
    name: preset.agentName,
    role: preset.role,
    permission_tier: preset.permissionTier,
  };
}

async function ensureAgentCapability(agentId: string, capabilityName: string) {
  const capability = await dbClient.queryOne<any>(`SELECT id FROM Capabilities WHERE name = ?`, [capabilityName]);
  if (!capability) return;
  await dbClient.execute(
    `INSERT OR IGNORE INTO Agent_Capabilities (agent_id, capability_id, allowed) VALUES (?, ?, 1)`,
    [agentId, capability.id],
  );
}

async function getOrCreateFlowRun(missionId: string, source = 'project_flow') {
  const existing = await dbClient.queryOne<any>(
    `SELECT * FROM Flow_Runs WHERE mission_id = ? AND status IN ('idle','running','paused') ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    [missionId],
  );
  if (existing) return existing;

  // Honor the user's chosen operating mode. The mode column is stored
  // on Flow_Runs so it can be inspected per-run from the supervisor
  // console. The runtime code doesn't gate on it today, but recording
  // it correctly here is what the scheduler expects to read.
  const mode = await getRuntimeMode();

  const flowRunId = id('flow');
  await dbClient.execute(
    `INSERT INTO Flow_Runs (id, mission_id, status, mode, source, started_at)
     VALUES (?, ?, 'idle', ?, ?, CURRENT_TIMESTAMP)`,
    [flowRunId, missionId, mode, source],
  );
  return dbClient.queryOne<any>(`SELECT * FROM Flow_Runs WHERE id = ?`, [flowRunId]);
}

async function upsertFlowNode(input: {
  flowRunId: string;
  missionId: string;
  kind: string;
  refId?: string | null;
  label: string;
  ownerAgentId?: string | null;
  status?: string;
  riskLevel?: string;
  nextAction?: string;
  x: number;
  y: number;
  metadata?: Record<string, unknown>;
}) {
  const existing = input.refId
    ? await dbClient.queryOne<any>(`SELECT id FROM Flow_Nodes WHERE flow_run_id = ? AND kind = ? AND ref_id = ?`, [input.flowRunId, input.kind, input.refId])
    : null;
  if (existing) {
    await dbClient.execute(
      `UPDATE Flow_Nodes
       SET label = ?, owner_agent_id = ?, status = ?, risk_level = ?, next_action = ?, x = ?, y = ?, metadata = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        input.label,
        input.ownerAgentId || null,
        input.status || 'queued',
        input.riskLevel || 'Low',
        input.nextAction || null,
        input.x,
        input.y,
        JSON.stringify(input.metadata || {}),
        existing.id,
      ],
    );
    return existing.id;
  }

  const nodeId = id('node');
  await dbClient.execute(
    `INSERT INTO Flow_Nodes
      (id, flow_run_id, mission_id, kind, ref_id, label, owner_agent_id, status, risk_level, next_action, x, y, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      nodeId,
      input.flowRunId,
      input.missionId,
      input.kind,
      input.refId || null,
      input.label,
      input.ownerAgentId || null,
      input.status || 'queued',
      input.riskLevel || 'Low',
      input.nextAction || null,
      input.x,
      input.y,
      JSON.stringify(input.metadata || {}),
    ],
  );
  return nodeId;
}

function buildTaskTitle(preset: Preset, objective: string) {
  const verb: Record<string, string> = {
    Research: 'Gather context for',
    Code: preset.capability === 'execute_sandboxed_command' ? 'Run sandbox checks for' : 'Build or modify work for',
    QA: preset.capability === 'execute_sandboxed_command' ? 'Run validation command for' : 'Validate outputs for',
    Security: 'Review risk for',
    Writer: 'Prepare deliverables for',
  };
  return `${verb[preset.role] || 'Work on'} ${objective}`.slice(0, 240);
}

const PROJECT_FLOW_CAPABILITIES = new Set([
  'web_scrape',
  'workspace_write_artifact',
  'workspace_write_file',
  'workspace_validate_outputs',
  'governance_review',
  'delivery_package',
  'execute_command',
  'execute_sandboxed_command',
  'execute_remote',
]);

const PERMISSION_TIERS = new Set<PermissionTier>(['Observe', 'Draft', 'Edit', 'Execute', 'External_Act', 'Root']);
const RISK_LEVELS = new Set<RiskLevel>(['Low', 'Medium', 'High', 'Critical']);
const PHASES = ['Intake', 'Research', 'Build', 'Verify', 'Deliver'];

async function recordReplanDecision(input: {
  missionId: string;
  flowRunId: string;
  trigger: string;
  affectedNodeIds?: string[];
  plannerSource?: 'model' | 'preset_fallback' | 'none';
  insertedActionIds?: string[];
  removedActionIds?: string[];
}) {
  const decisionId = id('replan');
  await dbClient.execute(
    `INSERT INTO Replan_Decisions
      (id, mission_id, flow_run_id, trigger, affected_node_ids, planner_source, inserted_action_ids, removed_action_ids)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      decisionId,
      input.missionId,
      input.flowRunId,
      input.trigger,
      JSON.stringify(input.affectedNodeIds || []),
      input.plannerSource || 'none',
      JSON.stringify(input.insertedActionIds || []),
      JSON.stringify(input.removedActionIds || []),
    ],
  );
  return decisionId;
}

async function updateReplanDecision(decisionId: string, input: {
  plannerSource?: 'model' | 'preset_fallback' | 'none';
  insertedActionIds?: string[];
  removedActionIds?: string[];
}) {
  await dbClient.execute(
    `UPDATE Replan_Decisions
     SET planner_source = ?, inserted_action_ids = ?, removed_action_ids = ?
     WHERE id = ?`,
    [
      input.plannerSource || 'none',
      JSON.stringify(input.insertedActionIds || []),
      JSON.stringify(input.removedActionIds || []),
      decisionId,
    ],
  );
}

async function evaluatePhaseGate(flowRunId: string, missionId: string) {
  const missingEvidence = await dbClient.query<any>(
    `SELECT a.id, a.task_id, a.capability
     FROM Agent_Actions a
     LEFT JOIN Tool_Invocations t ON t.agent_action_id = a.id AND t.status = 'completed'
     WHERE a.mission_id = ? AND a.status = 'completed'
     GROUP BY a.id
     HAVING COUNT(t.id) = 0`,
    [missionId],
  );
  if (missingEvidence.length > 0) {
    const nodes = await dbClient.query<any>(
      `SELECT id FROM Flow_Nodes WHERE flow_run_id = ? AND kind = 'agent_action' AND ref_id IN (${missingEvidence.map(() => '?').join(',')})`,
      [flowRunId, ...missingEvidence.map((action) => action.id)],
    );
    await recordReplanDecision({
      missionId,
      flowRunId,
      trigger: 'phase_gate_missing_evidence',
      affectedNodeIds: nodes.map((node) => node.id),
    });
    return { ok: false, missingEvidence };
  }
  return { ok: true, missingEvidence: [] };
}

async function maybeReplanFlow(flowRunId: string, missionId: string, trigger: string) {
  // preserve completed nodes and their evidence; replanning only annotates or inserts downstream work.
  const failedTwice = await dbClient.query<any>(
    `SELECT agent_action_id, COUNT(*) as failures
     FROM Agent_Runs
     WHERE mission_id = ? AND status = 'failed'
     GROUP BY agent_action_id
     HAVING COUNT(*) >= 2`,
    [missionId],
  );
  const gate = await evaluatePhaseGate(flowRunId, missionId);
  if (failedTwice.length === 0 && gate.ok && trigger !== 'manual') return null;

  const affectedActionIds = Array.from(new Set([
    ...failedTwice.map((row) => row.agent_action_id).filter(Boolean),
    ...gate.missingEvidence.map((row: any) => row.id),
  ]));
  const nodes = affectedActionIds.length
    ? await dbClient.query<any>(
      `SELECT id FROM Flow_Nodes WHERE flow_run_id = ? AND kind = 'agent_action' AND ref_id IN (${affectedActionIds.map(() => '?').join(',')})`,
      [flowRunId, ...affectedActionIds],
    )
    : [];
  const existingDecision = affectedActionIds.length
    ? await dbClient.queryOne<any>(
      `SELECT id FROM Replan_Decisions
         WHERE mission_id = ? AND flow_run_id = ? AND removed_action_ids LIKE ?
         ORDER BY created_at DESC LIMIT 1`,
      [missionId, flowRunId, `%${affectedActionIds[0]}%`],
    )
    : null;
  if (existingDecision) return existingDecision.id;

  const decisionId = await recordReplanDecision({
    missionId,
    flowRunId,
    trigger,
    affectedNodeIds: nodes.map((node) => node.id),
    plannerSource: 'none',
  });
  const removedActionIds = await cancelIncompleteDownstreamWork(flowRunId, missionId, affectedActionIds, decisionId);
  const recovery = await buildReplanRecoveryWork(flowRunId, missionId, trigger, decisionId, removedActionIds);
  await updateReplanDecision(decisionId, {
    plannerSource: recovery.plannerSource,
    insertedActionIds: recovery.insertedActionIds,
    removedActionIds,
  });
  await logFlowEvent(missionId, 'supr_decision', 'Supr', 'Replan decision recorded', `Decision ${decisionId}: ${trigger}`);
  return decisionId;
}

async function cancelIncompleteDownstreamWork(flowRunId: string, missionId: string, affectedActionIds: string[], decisionId: string) {
  if (affectedActionIds.length === 0) return [];
  const actions = await dbClient.query<any>(
    `SELECT * FROM Agent_Actions
     WHERE mission_id = ? AND id IN (${affectedActionIds.map(() => '?').join(',')})
       AND status IN ('draft','approved','running','pending_approval','failed')`,
    [missionId, ...affectedActionIds],
  );
  const removedActionIds = actions.map((action) => action.id);
  if (removedActionIds.length === 0) return [];
  await dbClient.execute(
    `UPDATE Agent_Actions SET status = 'cancelled', error = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id IN (${removedActionIds.map(() => '?').join(',')})`,
    [`Superseded by replan ${decisionId}`, ...removedActionIds],
  );
  await dbClient.execute(
    `UPDATE Flow_Nodes SET status = 'cancelled', next_action = ?, updated_at = CURRENT_TIMESTAMP
     WHERE flow_run_id = ? AND kind = 'agent_action' AND ref_id IN (${removedActionIds.map(() => '?').join(',')})`,
    [`Superseded by replan ${decisionId}`, flowRunId, ...removedActionIds],
  );
  const taskIds = actions.map((action) => action.task_id).filter(Boolean);
  if (taskIds.length > 0) {
    await dbClient.execute(
      `UPDATE Tasks SET status = 'Blocked', blocker_reason = ?
       WHERE id IN (${taskIds.map(() => '?').join(',')}) AND status != 'Done'`,
      [`Superseded by replan ${decisionId}`, ...taskIds],
    );
    await dbClient.execute(
      `UPDATE Flow_Nodes SET status = 'Blocked', next_action = ?, updated_at = CURRENT_TIMESTAMP
       WHERE flow_run_id = ? AND kind = 'task' AND ref_id IN (${taskIds.map(() => '?').join(',')})`,
      [`Superseded by replan ${decisionId}`, flowRunId, ...taskIds],
    );
  }
  return removedActionIds;
}

async function buildReplanRecoveryWork(flowRunId: string, missionId: string, trigger: string, decisionId: string, removedActionIds: string[]) {
  const mission = await getMissionById(missionId);
  const objective = [
    'Recover incomplete Supr project flow work.',
    `Original objective: ${mission?.objective || mission?.name || missionId}`,
    `Trigger: ${trigger}`,
    `Superseded actions: ${removedActionIds.join(', ') || 'none'}`,
    'Create only replacement validation, repair, or delivery work needed after preserving completed nodes.',
  ].join('\n');

  let plannerSource: 'model' | 'preset_fallback' = 'preset_fallback';
  let plan: PlannedWork[] = [];
  try {
    const built = await buildProjectPlan(objective);
    plannerSource = built.plannerSource === 'model' ? 'model' : 'preset_fallback';
    plan = built.plan;
  } catch {
    plan = presetPlan(objective);
  }

  const insertedActionIds: string[] = [];
  const recoveryPlan = plan
    .filter((item) => item.capability !== 'web_scrape')
    .slice(0, 3);
  const baseX = 120 + Math.max(0, removedActionIds.length) * 80;
  const existingNodeCount = await dbClient.queryOne<any>(`SELECT COUNT(*) as count FROM Flow_Nodes WHERE flow_run_id = ?`, [flowRunId]);
  const offset = Number(existingNodeCount?.count || 0);

  for (const [index, planned] of recoveryPlan.entries()) {
    const agent = await ensurePresetAgent(planned);
    const title = `[Replan ${decisionId.slice(0, 12)}] ${planned.title}`.slice(0, 240);
    const taskId = id('task');
    await dbClient.execute(
      `INSERT INTO Tasks (id, mission_id, phase_id, title, status, owner_agent_id, required_permission, blocker_reason)
       VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?)`,
      [taskId, missionId, `phase-${planned.phase.toLowerCase()}`, title, agent.id, planned.permissionTier, `Inserted by replan ${decisionId}`],
    );
    const action = await createAgentAction({
      missionId,
      taskId,
      agentId: agent.id,
      capability: planned.capability,
      intent: title,
      inputs: { ...planned.inputs, objective, replanDecisionId: decisionId, supersedesActionIds: removedActionIds },
      riskLevel: planned.riskLevel,
      requiredPermission: planned.permissionTier,
      metadata: {
        flowRunId,
        role: planned.role,
        agentName: planned.agentName,
        requiresEvidence: true,
        plannerSource,
        replanDecisionId: decisionId,
        supersedesActionIds: removedActionIds,
      },
    });
    insertedActionIds.push(action.id);
    await upsertFlowNode({
      flowRunId,
      missionId,
      kind: 'task',
      refId: taskId,
      label: title,
      ownerAgentId: agent.id,
      status: 'Pending',
      riskLevel: planned.riskLevel,
      nextAction: `Run recovery ${planned.agentName}`,
      x: baseX + (offset + index) * 190,
      y: 780,
      metadata: { phase: planned.phase, plannerSource, replanDecisionId: decisionId, supersedesActionIds: removedActionIds },
    });
    await upsertFlowNode({
      flowRunId,
      missionId,
      kind: 'agent_action',
      refId: action.id,
      label: planned.capability,
      ownerAgentId: agent.id,
      status: action.status || 'draft',
      riskLevel: planned.riskLevel,
      nextAction: 'Recovery action queued',
      x: baseX + (offset + index) * 190,
      y: 930,
      metadata: { taskId, traceId: action.traceId, plannerSource, replanDecisionId: decisionId, supersedesActionIds: removedActionIds },
    });
  }

  return { plannerSource, insertedActionIds };
}

async function getOriginatingChannel(missionId: string) {
  return dbClient.queryOne<any>(
    `SELECT source, actor_id FROM Channel_Commands WHERE mission_id = ? AND actor_id IS NOT NULL ORDER BY created_at ASC LIMIT 1`,
    [missionId],
  );
}

function normalizePlanItem(raw: any, objective: string, mode: RuntimeMode): PlannedWork | null {
  const capability = String(raw?.capability || '').trim();
  if (!PROJECT_FLOW_CAPABILITIES.has(capability)) return null;
  const role = String(raw?.role || raw?.agentRole || 'Generalist').slice(0, 80);
  const agentName = String(raw?.agentName || `${role} Agent`).slice(0, 80);
  const phase = PHASES.includes(String(raw?.phase)) ? String(raw.phase) : 'Build';
  const permissionTier = PERMISSION_TIERS.has(raw?.permissionTier) ? raw.permissionTier as PermissionTier : 'Draft';
  const riskLevel = RISK_LEVELS.has(raw?.riskLevel)
    ? raw.riskLevel as RiskLevel
    : capability.includes('execute') ? 'High' : 'Medium';
  const title = String(raw?.title || buildTaskTitle({ role, agentName, capability, permissionTier, riskLevel, phase }, objective)).slice(0, 240);
  const inputs = raw?.inputs && typeof raw.inputs === 'object' && !Array.isArray(raw.inputs)
    ? raw.inputs as Record<string, unknown>
    : {};
  return {
    role,
    agentName,
    capability,
    permissionTier,
    riskLevel,
    phase,
    title,
    inputs: { objective, ...inputs },
    plannerSource: 'model',
  };
}

function presetPlan(objective: string): PlannedWork[] {
  return AGENT_PRESETS.map((preset) => ({
    ...preset,
    title: buildTaskTitle(preset, objective),
    inputs: { objective, phase: preset.phase },
    plannerSource: 'preset_fallback',
  }));
}

async function buildModelProjectPlan(objective: string, mode: RuntimeMode): Promise<PlannedWork[]> {
  if (!await hasConfiguredModelProvider()) {
    throw new Error('Live Project Flow planning requires MiniMax or another configured model provider.');
  }

  const provider = await getActiveProvider('supr');
  const prompt = [
    'Create a Supr Project Flow execution plan for this objective.',
    'Return strict JSON only: {"tasks":[...]}',
    'Each task must include: phase, role, agentName, capability, permissionTier, riskLevel, title, inputs.',
    `Allowed phases: ${PHASES.join(', ')}`,
    `Allowed capabilities: ${Array.from(PROJECT_FLOW_CAPABILITIES).join(', ')}`,
    'Use execute_command for governed local validation and execute_sandboxed_command only when Docker sandbox execution is required.',
    'Create 4-8 tasks. Include research, build, validation/governance, and delivery when relevant.',
    '',
    `Objective: ${objective}`,
  ].join('\n');

  const raw = await provider.generateContent(prompt, {
    systemInstruction: 'You are Supr Planner. Return only valid JSON with a tasks array.',
    maxOutputTokens: 1600,
  });
  const parsed = parseModelJson(raw);
  const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];
  const normalized = tasks
    .map((task: any) => normalizePlanItem(task, objective, mode))
    .filter(Boolean) as PlannedWork[];
  if (normalized.length === 0) throw new Error('Project Flow planner returned no executable tasks.');
  return normalized.slice(0, 10);
}

async function buildProjectPlan(objective: string) {
  const mode = await getRuntimeMode();
  try {
    const plan = await buildModelProjectPlan(objective, mode);
    const plannerSource: 'model' | 'preset_fallback' = plan.some((item) => item.plannerSource === 'model') ? 'model' : 'preset_fallback';
    return { mode, plannerSource, plan };
  } catch (error: any) {
    // Any planner failure (no provider, model timeout, bad JSON, zero
    // normalized tasks) must not drop the whole intake request. Degrade
    // to the deterministic preset plan so the project can still get
    // a minimal Research -> Build -> Verify -> Deliver pipeline running.
    console.warn(`[Supr] buildModelProjectPlan failed; falling back to preset plan. reason=${error?.message || String(error)}`);
    telemetry.warn('planner.fallback', { reason: error?.message || String(error), source: 'buildProjectPlan' });
    return { mode, plannerSource: 'preset_fallback' as const, plan: presetPlan(objective) };
  }
}

export async function startProjectFlow(projectId: string, source = 'project_flow') {
  const mission = await getMissionById(projectId);
  if (!mission) return { success: false, error: 'Project not found.' };

  const flowRun = await getOrCreateFlowRun(projectId, source);
  const flowRunId = flowRun.id;
  const objective = mission.objective || mission.name || 'the project';
  const projectPlan = await buildProjectPlan(objective);

  // Phases are now derived from the relational Tasks table on read, so
  // there is no need to persist them to the Glidepaths JSON column here.
  // The first phase is the only one we can confidently label "Done" at
  // the start of a flow (planning is complete); the rest are pending
  // until the runtime produces tasks in them.
  const initialPhaseStatus: Record<string, 'Done' | 'Active' | 'Pending'> = {
    Intake: 'Done',
    Research: 'Pending',
    Build: 'Pending',
    Verify: 'Pending',
    Deliver: 'Pending',
  };
  for (const [index, phase] of (['Intake', 'Research', 'Build', 'Verify', 'Deliver'] as const).entries()) {
    await upsertFlowNode({
      flowRunId,
      missionId: projectId,
      kind: 'phase',
      refId: `phase-${phase.toLowerCase()}`,
      label: phase,
      status: initialPhaseStatus[phase],
      ownerAgentId: 'a1',
      x: 40 + index * 190,
      y: 40,
      metadata: { source, plannerSource: projectPlan.plannerSource, runtimeMode: projectPlan.mode },
    });
  }

  for (const [index, planned] of projectPlan.plan.entries()) {
    const agent = await ensurePresetAgent(planned);
    const title = planned.title || buildTaskTitle(planned, objective);
    let task = await dbClient.queryOne<any>(
      `SELECT * FROM Tasks WHERE mission_id = ? AND owner_agent_id = ? AND title = ? LIMIT 1`,
      [projectId, agent.id, title],
    );
    if (!task) {
      const taskId = id('task');
      await dbClient.execute(
        `INSERT INTO Tasks (id, mission_id, phase_id, title, status, owner_agent_id, required_permission)
         VALUES (?, ?, ?, ?, 'Pending', ?, ?)`,
        [taskId, projectId, `phase-${planned.phase.toLowerCase()}`, title, agent.id, planned.permissionTier],
      );
      task = await dbClient.queryOne<any>(`SELECT * FROM Tasks WHERE id = ?`, [taskId]);
      await logFlowEvent(projectId, 'delegation', 'Supr', `Assigned ${planned.agentName}`, title);
    }

    const existingAction = await dbClient.queryOne<any>(
      `SELECT * FROM Agent_Actions WHERE mission_id = ? AND task_id = ? AND agent_id = ? AND capability = ? LIMIT 1`,
      [projectId, task.id, agent.id, planned.capability],
    );
    const action = existingAction || await createAgentAction({
      missionId: projectId,
      taskId: task.id,
      agentId: agent.id,
      capability: planned.capability,
      intent: title,
      inputs: { objective, phase: planned.phase, ...planned.inputs },
      riskLevel: planned.riskLevel,
      requiredPermission: planned.permissionTier,
      metadata: { flowRunId, role: planned.role, agentName: planned.agentName, requiresEvidence: true, plannerSource: planned.plannerSource },
    });

    await upsertFlowNode({
      flowRunId,
      missionId: projectId,
      kind: 'task',
      refId: task.id,
      label: title,
      ownerAgentId: agent.id,
      status: task.status || 'Pending',
      riskLevel: planned.riskLevel,
      nextAction: `Run ${planned.agentName}`,
      x: 80 + index * 190,
      y: 180,
      metadata: { phase: planned.phase, plannerSource: planned.plannerSource },
    });
    await upsertFlowNode({
      flowRunId,
      missionId: projectId,
      kind: 'agent_action',
      refId: action.id,
      label: planned.capability,
      ownerAgentId: agent.id,
      status: action.status || 'draft',
      riskLevel: planned.riskLevel,
      nextAction: planned.riskLevel === 'High' || planned.riskLevel === 'Critical' ? 'Request approval' : 'Run automatically',
      x: 80 + index * 190,
      y: 330,
      metadata: { taskId: task.id, traceId: action.traceId, plannerSource: planned.plannerSource },
    });
  }

  await dbClient.execute(`UPDATE Flow_Runs SET status = 'running', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [flowRunId]);
  await logFlowEvent(
    projectId,
    'supr_decision',
    'Supr',
    'Started Project Flow',
    `Supr decomposed the project with ${projectPlan.plannerSource} planner in ${projectPlan.mode} mode and queued ${projectPlan.plan.length} agent-owned work item(s).`,
  );
  // Notify the bus so the mission stream and chat both update.
  notifyMissionChanged(projectId, 'flow_started');
  return { success: true, flowRunId };
}

async function recordAgentRun(flowRunId: string, action: any, status: string, log: string, result?: unknown, error?: string) {
  const runId = id('run');
  await dbClient.execute(
    `INSERT INTO Agent_Runs
      (id, flow_run_id, mission_id, agent_action_id, agent_id, status, heartbeat, logs, result, error, started_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
    [
      runId,
      flowRunId,
      action.missionId || action.mission_id,
      action.id,
      action.agentId || action.agent_id,
      status,
      JSON.stringify([log]),
      result ? JSON.stringify(result) : null,
      error || null,
    ],
  );
}

async function syncFlowNodes(flowRunId: string, missionId: string) {
  const actions = await dbClient.query<any>(`SELECT * FROM Agent_Actions WHERE mission_id = ?`, [missionId]);
  for (const action of actions) {
    await dbClient.execute(
      `UPDATE Flow_Nodes SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE flow_run_id = ? AND kind = 'agent_action' AND ref_id = ?`,
      [action.status, flowRunId, action.id],
    );
    if (action.task_id && action.status === 'completed') {
      await dbClient.execute(`UPDATE Tasks SET status = 'Done' WHERE id = ?`, [action.task_id]);
      await dbClient.execute(
        `UPDATE Flow_Nodes SET status = 'Done', next_action = 'Completed', updated_at = CURRENT_TIMESTAMP WHERE flow_run_id = ? AND kind = 'task' AND ref_id = ?`,
        [flowRunId, action.task_id],
      );
    }
  }

  const approvals = await dbClient.query<any>(`SELECT * FROM Approvals WHERE mission_id = ?`, [missionId]);
  for (const [index, approval] of approvals.entries()) {
    await upsertFlowNode({
      flowRunId,
      missionId,
      kind: 'approval',
      refId: approval.id,
      label: approval.action || 'Approval',
      ownerAgentId: approval.requesting_agent_id,
      status: approval.status || 'pending',
      riskLevel: approval.risk_level || 'Medium',
      nextAction: approval.status === 'pending' ? 'Awaiting approval' : 'Decision recorded',
      x: 110 + index * 210,
      y: 500,
      metadata: { reason: approval.reason, agentActionId: approval.agent_action_id },
    });
  }

  const artifacts = await dbClient.query<any>(`SELECT * FROM Artifacts WHERE mission_id = ? ORDER BY created_at ASC`, [missionId]);
  for (const [index, artifact] of artifacts.entries()) {
    await upsertFlowNode({
      flowRunId,
      missionId,
      kind: 'artifact',
      refId: artifact.id,
      label: artifact.title || 'Artifact',
      ownerAgentId: artifact.created_by_agent_id || null,
      status: artifact.quality_status || 'stored',
      riskLevel: 'Low',
      nextAction: 'Review artifact',
      x: 110 + (index % 5) * 210,
      y: 650 + Math.floor(index / 5) * 130,
      metadata: { type: artifact.type, evidenceRefs: safeJson(artifact.evidence_refs, []) },
    });
  }
}

export async function runProjectFlow(projectId: string) {
  const flowRun = await getOrCreateFlowRun(projectId);
  if (flowRun.status === 'paused') return { success: false, paused: true, flowRunId: flowRun.id };
  await dbClient.execute(`UPDATE Flow_Runs SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [flowRun.id]);

  const actions = await dbClient.query<any>(
    `SELECT * FROM Agent_Actions
     WHERE mission_id = ? AND status IN ('draft','approved','failed')
     ORDER BY created_at ASC, rowid ASC`,
    [projectId],
  );
  let completed = 0;
  let gated = 0;
  let failed = 0;

  for (const actionRow of actions) {
    const latestRun = await dbClient.queryOne<any>(
      `SELECT COUNT(*) as count FROM Agent_Runs WHERE agent_action_id = ? AND status = 'failed'`,
      [actionRow.id],
    );
    if (actionRow.status === 'failed' && Number(latestRun?.count || 0) >= 2) continue;

    await dbClient.execute(`UPDATE Tasks SET status = 'Active' WHERE id = ?`, [actionRow.task_id]);
    await logFlowEvent(projectId, 'agent_action', actionRow.agent_id || 'Agent', `Claimed work: ${actionRow.capability}`, actionRow.intent || '');
    try {
      const execution = await runAgentRuntimeAction({
        actionId: actionRow.id,
        flowRunId: flowRun.id,
        budget: { maxSteps: 4, timeoutMs: 60_000 },
      });
      if (execution.status === 'completed') {
        completed += 1;
        await recordAgentRun(flowRun.id, actionRow, 'completed', `Runtime completed ${actionRow.capability}`, execution.result);
        const origin = await getOriginatingChannel(projectId);
        await messagingGateway.notify({
          source: origin?.source,
          actorId: origin?.actor_id,
          missionId: projectId,
          reason: 'action completed',
          text: `Action completed: ${actionRow.capability}`,
        });
        await maybeReplanFlow(flowRun.id, projectId, 'action_completed');
      } else if (execution.status === 'pending_approval') {
        gated += 1;
        await recordAgentRun(flowRun.id, actionRow, 'pending_approval', `Runtime paused for approval: ${execution.failureReason || actionRow.capability}`);
        const origin = await getOriginatingChannel(projectId);
        await messagingGateway.notify({
          source: origin?.source,
          actorId: origin?.actor_id,
          missionId: projectId,
          reason: 'approval needed',
          text: `Approval needed: ${execution.failureReason || actionRow.capability}`,
        });
      } else if (execution.status === 'failed') {
        failed += 1;
        await recordAgentRun(flowRun.id, actionRow, 'failed', execution.failureReason || 'Action failed', null, execution.failureReason);
        const origin = await getOriginatingChannel(projectId);
        await messagingGateway.notify({
          source: origin?.source,
          actorId: origin?.actor_id,
          missionId: projectId,
          reason: 'action failed',
          text: `Action failed: ${execution.failureReason || actionRow.capability}`,
        });
        await maybeReplanFlow(flowRun.id, projectId, 'action_failed');
      }
    } catch (error: any) {
      failed += 1;
      await recordAgentRun(flowRun.id, actionRow, 'failed', error.message || String(error), null, error.message || String(error));
    }
  }

  await syncFlowNodes(flowRun.id, projectId);
  const open = await dbClient.queryOne<any>(
    `SELECT COUNT(*) as count FROM Agent_Actions WHERE mission_id = ? AND status IN ('draft','approved','running','pending_approval','failed')`,
    [projectId],
  );
  const status = Number(open?.count || 0) === 0 ? 'completed' : 'running';
  await dbClient.execute(
    `UPDATE Flow_Runs SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN CURRENT_TIMESTAMP ELSE completed_at END, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, status, flowRun.id],
  );
  if (status === 'completed') {
    const origin = await getOriginatingChannel(projectId);
    await messagingGateway.notify({
      source: origin?.source,
      actorId: origin?.actor_id,
      missionId: projectId,
      reason: 'mission finished',
      text: `Mission finished: ${projectId}`,
    });
  }
  await logFlowEvent(projectId, 'supr_decision', 'Supr', 'Project Flow heartbeat finished', `${completed} completed, ${gated} waiting for approval, ${failed} failed.`);
  notifyMissionChanged(projectId, status === 'completed' ? 'flow_completed' : 'mission_updated');
  return { success: true, flowRunId: flowRun.id, completed, gated, failed, status };
}

export async function pauseProjectFlow(projectId: string) {
  const flowRun = await getOrCreateFlowRun(projectId);
  await dbClient.execute(`UPDATE Flow_Runs SET status = 'paused', paused_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [flowRun.id]);
  await logFlowEvent(projectId, 'supr_decision', 'Supr', 'Paused Project Flow', 'Queue execution is paused. Current work state is preserved.');
  notifyMissionChanged(projectId, 'flow_paused');
  return { success: true, flowRunId: flowRun.id };
}

export async function resumeProjectFlow(projectId: string) {
  const flowRun = await getOrCreateFlowRun(projectId);
  await dbClient.execute(`UPDATE Flow_Runs SET status = 'running', paused_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [flowRun.id]);
  await logFlowEvent(projectId, 'supr_decision', 'Supr', 'Resumed Project Flow', 'Autonomous queue processing resumed.');
  notifyMissionChanged(projectId, 'flow_resumed');
  return runProjectFlow(projectId);
}

export async function retryFailedFlowNodes(projectId: string) {
  const flowRun = await getOrCreateFlowRun(projectId);
  const failed = await dbClient.query<any>(`SELECT * FROM Agent_Actions WHERE mission_id = ? AND status = 'failed'`, [projectId]);
  for (const action of failed) {
    await dbClient.execute(`UPDATE Agent_Actions SET status = 'draft', error = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [action.id]);
    await dbClient.execute(
      `UPDATE Flow_Nodes SET status = 'draft', next_action = 'Retry queued', updated_at = CURRENT_TIMESTAMP WHERE flow_run_id = ? AND kind = 'agent_action' AND ref_id = ?`,
      [flowRun.id, action.id],
    );
  }
  await logFlowEvent(projectId, 'escalation', 'Supr', 'Retried failed work', `${failed.length} failed action(s) returned to the work queue.`);
  notifyMissionChanged(projectId, 'flow_resumed');
  return { success: true, retried: failed.length, flowRunId: flowRun.id };
}

export async function approveLowRiskActions(projectId: string) {
  const approvals = await dbClient.query<any>(
    `SELECT * FROM Approvals WHERE mission_id = ? AND status = 'pending' AND risk_level IN ('Low','Medium')`,
    [projectId],
  );
  for (const approval of approvals) {
    await dbClient.execute(`UPDATE Approvals SET status = 'approved', decision = 'approved' WHERE id = ?`, [approval.id]);
    await resumeAgentActionFromApproval(approval.id, 'approved');
  }
  const flowRun = await getOrCreateFlowRun(projectId);
  await syncFlowNodes(flowRun.id, projectId);
  await logFlowEvent(projectId, 'approval', 'Supr', 'Approved low-risk work', `${approvals.length} low/medium-risk approval(s) cleared.`);
  notifyMissionChanged(projectId, 'approval_decision');
  return { success: true, approved: approvals.length, flowRunId: flowRun.id };
}

/**
 * Derive a short, deterministic mission name from a free-form user request.
 * Falls back to a timestamped label when the content is too short or noisy
 * to summarise. Trims to <=80 chars to fit the Mission.name column.
 */
function deriveMissionNameFromContent(content: string): string {
  const cleaned = (content || '')
    .replace(/[`*_~>#\n\r\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return `Ad-hoc project ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
  const firstSentence = cleaned.split(/[.?!]/)[0] || cleaned;
  return firstSentence.slice(0, 80).trim() || `Ad-hoc project ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
}

export async function routeIntakeToProjectFlow(input: {
  source: 'supr-chat' | 'telegram' | 'slack' | 'discord' | 'api';
  content: string;
  projectId?: string | null;
  actorId?: string | null;
  attachments?: unknown[];
}) {
  // Auto-provision a project if one isn't available. Before this fix,
  // `routeIntakeToProjectFlow` failed with "No active project is available"
  // any time the user started a chat before creating a mission, which
  // made the chat window feel like a dead-end chatbot. Now Supr will
  // spin up an Active mission whose name is derived from the request and
  // whose objective is the user message itself, then run the flow against
  // that mission. The Command Deck and `/api/mission/state` will pick it
  // up via the existing notify-mission-changed bus.
  let mission = input.projectId ? await getMissionById(input.projectId) : await getActiveMission();
  if (!mission) {
    try {
      mission = await createMission({
        name: deriveMissionNameFromContent(input.content),
        objective: input.content,
        status: 'Active',
        readinessScore: 0,
        phases: ['Intake', 'Research', 'Build', 'Verify', 'Deliver'].map((name) => ({
          id: `phase-${name.toLowerCase()}`,
          name,
          status: 'Pending' as const,
        })),
        tasks: [],
        messages: [],
        artifacts: [],
        activityLog: [],
        failures: [],
        memoryItems: [],
      });
    } catch (error: any) {
      notifyMissionChanged(null, 'intake_routed');
      return { success: false, error: `Unable to provision a project for this request: ${error.message || String(error)}` };
    }
  }
  const commandId = id('cmd');
  await dbClient.execute(
    `INSERT INTO Channel_Commands (id, source, mission_id, command, payload, status, actor_id)
     VALUES (?, ?, ?, ?, ?, 'received', ?)`,
    [
      commandId,
      input.source,
      mission.id,
      input.content,
      serializeChannelPayload({ attachments: input.attachments || [] }),
      input.actorId || null,
    ],
  );
  try {
    await logFlowEvent(mission.id, 'supr_decision', 'Supr', `Received ${input.source} request`, input.content);
    const start = await startProjectFlow(mission.id, input.source);
    const run = start.success ? await runProjectFlow(mission.id) : start;
    const response = start.success
      ? `Supr routed this into Project Flow. Flow ${start.flowRunId} started; ${'completed' in run ? run.completed : 0} action(s) completed and ${'gated' in run ? run.gated : 0} need approval.`
      : start.error || 'Unable to start Project Flow.';
    await dbClient.execute(`UPDATE Channel_Commands SET status = ?, response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      start.success ? 'processed' : 'failed',
      response,
      commandId,
    ]);
    notifyMissionChanged(mission.id, 'intake_routed');
    return { success: start.success, commandId, missionId: mission.id, response, flowRunId: start.flowRunId };
  } catch (error: any) {
    const response = `Unable to route Project Flow request: ${error.message || String(error)}`;
    await dbClient.execute(`UPDATE Channel_Commands SET status = 'failed', response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
      response,
      commandId,
    ]);
    await logFlowEvent(mission.id, 'runtime_error', 'Supr', 'Project Flow routing failed', response).catch(() => undefined);
    return { success: false, commandId, missionId: mission.id, response, error: response };
  }
}

export async function parseTelegramCommand(text: string) {
  const trimmed = text.trim();
  const [command, ...rest] = trimmed.split(/\s+/);
  return { command: command.toLowerCase(), arg: rest.join(' ').trim() };
}
