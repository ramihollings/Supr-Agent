/**
 * Supr-Chat & Workspace file system actions.
 *
 * Per Blueprint 5.0's extensibility guidance, the original
 * `app/actions.ts` god file is being split by domain. This
 * module owns the chat + workspace server actions: design
 * profile catalog, project flow controls, approval center,
 * mission quality scoring, connector health, runbooks,
 * artifact versioning, Supr-Chat message CRUD, Imagen
 * generation, sandboxed code execution, workspace file CRUD,
 * project lint/build checks, organization export/import,
 * mission duplication, and the agent-status feed that powers
 * the chat UI.
 *
 * The public API is preserved — `app/actions.ts` re-exports
 * every function from this file, so existing call sites
 * (`useServerAction(...)`, etc.) keep working.
 */
import { z } from 'zod';
import crypto from 'crypto';
import dbClient from '@/lib/database/db_client';
import { getActiveMission, getMissionById, addActivityLog, createMission } from '@/lib/db';
import { portabilityService } from '@/lib/services/portability';
import { probeDockerAvailability } from '@/lib/services/execution-environment';
import { layoutGraph, buildPhaseGroups, type PhaseGroup, type GraphNodeInput } from '@/lib/services/graph-layout';
import { fetchSettingsAction, updateSettingAction, checkShadowModeAction } from './settings';
import fs from 'fs';
import path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import { getActiveProvider, invalidateProviderCache } from '@/lib/providers/model';
import { getSecretSetting, isSecretSettingKey, redactSettings } from '@/lib/secrets';
import { DEFAULT_GEMINI_MODEL, OPENAI_COMPATIBLE_BASE_URLS } from '@/lib/providers/catalog';
import { hasConfiguredModelProvider } from '@/lib/runtime/runtime-mode';
import { createAgentAction as createRuntimeAgentAction, fetchAgentActionsForMission, resumeAgentActionFromApproval } from '@/lib/runtime/agent-actions';
import { recordProviderFailure, recordProviderSuccess } from '@/lib/runtime/provider-health';
import {
  approveLowRiskActions,
  pauseProjectFlow,
  resumeProjectFlow,
  retryFailedFlowNodes,
  routeIntakeToProjectFlow,
  startProjectFlow,
} from '@/lib/runtime/project-flow';

// Helper for generating unique persisted primary keys. Uses
// crypto.randomUUID() so parallel writers (concurrent skill saves,
// duplicate missions, etc.) never collide on the primary key.
// `Date.now()` is fine for UI state and timestamps, but never for
// database IDs — two writes in the same millisecond would collide.
function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);
const MAX_WORKSPACE_FILE_BYTES = 512 * 1024;
const MAX_CHAT_FILE_BYTES = 256 * 1024;
const EXECUTION_WINDOW_MS = 60 * 1000;
const EXECUTION_LIMIT_PER_WINDOW = 5;
const ALLOWED_WORKSPACE_EXTENSIONS = new Set(['.txt', '.md', '.json', '.js', '.ts', '.tsx', '.py', '.csv', '.html', '.css']);
const EXECUTION_ATTEMPTS = new Map<string, number[]>();
const PROJECT_FLOW_CAPABILITIES = [
  'web_scrape',
  'workspace_write_artifact',
  'workspace_write_file',
  'workspace_validate_outputs',
  'governance_review',
  'delivery_package',
  'execute_command',
  'execute_sandboxed_command',
  'execute_remote',
] as const;

type DesignProfileSummary = {
  id: string;
  name: string;
  file: string;
  theme: string;
  palette: string;
  mood: string;
  preview: string;
};

function inferDesignMapping(filename: string, content: string) {
  const lower = `${filename} ${content.slice(0, 1200)}`.toLowerCase();
  if (lower.includes('notion')) {
    return { theme: 'design-notion', palette: 'design-notion', mood: 'calm workspace' };
  }
  if (lower.includes('verge') || lower.includes('storystream')) {
    return { theme: 'design-verge', palette: 'design-verge', mood: 'editorial command center' };
  }
  if (lower.includes('carbon') || lower.includes('ibm')) {
    return { theme: 'design-carbon', palette: 'corporate-tech', mood: 'enterprise operations' };
  }
  if (lower.includes('retro') || lower.includes('terminal')) {
    return { theme: 'crt', palette: 'matrix-digital', mood: 'terminal cockpit' };
  }
  if (lower.includes('glass') || lower.includes('aurora')) {
    return { theme: 'google-neural', palette: 'nordic-frost', mood: 'soft glass workspace' };
  }
  if (lower.includes('cyber')) {
    return { theme: 'cyberpunk', palette: 'toxic-spill', mood: 'high-contrast operations' };
  }
  return { theme: 'minimalist', palette: 'corporate-tech', mood: 'clean workspace' };
}

const getWorkspacePath = (filename: string) => {
  const safeName = path.basename(filename).trim();
  const ext = path.extname(safeName).toLowerCase();

  if (!safeName || safeName !== filename || safeName.startsWith('.') || safeName.includes('\0')) {
    throw new Error('Invalid workspace filename.');
  }
  if (!ALLOWED_WORKSPACE_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported workspace file type: ${ext || 'none'}.`);
  }

  const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'supr_workspaces');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const resolvedPath = path.resolve(dir, safeName);
  if (!resolvedPath.startsWith(dir + path.sep)) {
    throw new Error('Workspace path validation failed.');
  }
  return resolvedPath;
};

function assertContentWithinLimit(content: string, limit: number) {
  if (Buffer.byteLength(content, 'utf-8') > limit) {
    throw new Error(`Content exceeds ${Math.floor(limit / 1024)}KB limit.`);
  }
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function assertExecutionRate(filename: string) {
  const now = Date.now();
  const attempts = (EXECUTION_ATTEMPTS.get(filename) || []).filter((time) => now - time < EXECUTION_WINDOW_MS);
  if (attempts.length >= EXECUTION_LIMIT_PER_WINDOW) {
    throw new Error('Execution rate limit reached. Please wait before running more code.');
  }
  attempts.push(now);
  EXECUTION_ATTEMPTS.set(filename, attempts);
}

export async function fetchDesignProfilesAction(): Promise<DesignProfileSummary[]> {
  try {
    const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'design');
    if (!fs.existsSync(dir)) return [];

    return fs.readdirSync(dir)
      .filter((file) => file.endsWith('.md') && !file.includes('..'))
      .map((file) => {
        const filePath = path.join(dir, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const heading = content.match(/^#\s+(.+)$/m)?.[1] || file.replace(/-DESIGN\.md$/i, '');
        const mapping = inferDesignMapping(file, content);
        return {
          id: file.replace(/\.md$/i, ''),
          name: heading.replace(/^Design System Inspired by\s+/i, '').replace(/-design-analysis$/i, ''),
          file,
          preview: content.replace(/---[\s\S]*?---/, '').replace(/^#.+$/m, '').trim().slice(0, 180),
          ...mapping,
        };
      });
  } catch (error) {
    console.error('Failed to fetch design profiles:', error);
    return [];
  }
}

export async function applyDesignProfileAction(profileId: string) {
  try {
    z.string().min(1).max(160).regex(/^[a-z0-9_.-]+$/i).parse(profileId);
    const profiles = await fetchDesignProfilesAction();
    const profile = profiles.find((item) => item.id === profileId || item.file === profileId || item.file === `${profileId}.md`);
    if (!profile) return { success: false, error: 'Design profile not found.' };

    await Promise.all([
      updateSettingAction('active_design_profile', profile.id),
      updateSettingAction('appearance_theme', profile.theme),
      updateSettingAction('appearance_palette', profile.palette),
    ]);
    return { success: true, profile };
  } catch (error) {
    console.error('Failed to apply design profile:', error);
    return { success: false, error: String(error) };
  }
}

export async function fetchMissionTimelineAction(projectId?: string) {
  try {
    const mission = projectId ? await getMissionById(projectId) : await getActiveMission();
    if (!mission) return [];
    const [agentActions, approvals, toolInvocations] = await Promise.all([
      fetchAgentActionsForMission(mission.id),
      dbClient.query<any>(`SELECT * FROM Approvals WHERE mission_id = ? ORDER BY rowid DESC`, [mission.id]),
      dbClient.query<any>(`SELECT * FROM Tool_Invocations WHERE mission_id = ? ORDER BY created_at DESC LIMIT 20`, [mission.id]),
    ]);

    const events = [
      ...toolInvocations.map((tool) => {
        const output = safeJson<Record<string, any>>(tool.output, {});
        const input = safeJson<Record<string, any>>(tool.input, {});
        const command = output?.command || input?.command || '';
        const exitCode = Number.isFinite(Number(output?.exitCode)) ? Number(output.exitCode) : undefined;
        const stdout = typeof output?.stdout === 'string' ? output.stdout : '';
        const stderr = typeof output?.stderr === 'string' ? output.stderr : '';
        return {
          id: tool.id,
          type: tool.tool_name === 'execute_command' ? 'command' : 'tool',
          title: tool.tool_name === 'execute_command' ? `Command ${tool.status}` : `${tool.tool_name} (${tool.status})`,
          detail: tool.error || command || stdout || stderr || tool.tool_name,
          actor: tool.agent_id || 'Tool Runtime',
          timestamp: tool.completed_at || tool.created_at || new Date().toISOString(),
          source: 'tool-invocations',
          mode: 'Live',
          command: tool.tool_name === 'execute_command' ? {
            command,
            stdout,
            stderr,
            exitCode,
            durationMs: Number.isFinite(Number(output?.durationMs)) ? Number(output.durationMs) : undefined,
          } : undefined,
        };
      }),
      ...agentActions.map((item) => ({
        id: item.id,
        type: `agent_action_${item.status}`,
        title: `${item.capability} (${item.status})`,
        detail: item.error || item.intent || item.result || '',
        actor: item.agentId || 'Agent Runtime',
        timestamp: item.updatedAt || item.createdAt || new Date().toISOString(),
        source: 'agent-actions',
        mode: 'Live',
      })),
      ...approvals.map((item) => ({
        id: item.id,
        type: 'approval',
        title: `${item.action || 'Approval'} (${item.status || 'pending'})`,
        detail: item.reason || item.decision || '',
        actor: item.requesting_agent_id || 'Supr',
        timestamp: new Date().toISOString(),
        source: 'approvals',
        mode: 'Live',
      })),
      ...(mission.activityLog || []).map((item) => ({
        id: item.id,
        type: item.eventType,
        title: item.summary,
        detail: item.detail,
        actor: item.actor,
        timestamp: item.timestamp,
        source: 'event-log',
        mode: 'Live',
      })),
      ...(mission.failures || []).map((item) => ({
        id: item.id,
        type: item.resolved ? 'failure_resolved' : 'failure',
        title: item.summary,
        detail: item.suprGuidance || item.failureType,
        actor: item.agentName,
        timestamp: new Date().toISOString(),
        source: 'failure',
        mode: 'Live',
      })),
      ...(mission.artifacts || []).map((item) => ({
        id: item.id,
        type: 'artifact',
        title: item.filename,
        detail: `${item.type} artifact, ${item.content.length.toLocaleString()} characters`,
        actor: 'Artifact Store',
        timestamp: new Date().toISOString(),
        source: 'artifact',
        mode: 'Live',
      })),
      ...(mission.memoryItems || []).map((item) => ({
        id: item.id,
        type: 'memory',
        title: item.key,
        detail: item.value,
        actor: 'Memory',
        timestamp: new Date().toISOString(),
        source: 'memory',
        mode: 'Live',
      })),
    ];

    return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 16);
  } catch (error) {
    console.error('Failed to fetch mission timeline:', error);
    return [];
  }
}

/**
 * Post-process the operating graph payload so the canvas can
 * render a DAG layout with phase sub-graphs. Pure: same input
 * produces the same output. Called from both return sites of
 * `fetchProjectOperatingGraphAction`.
 */
function finalizeGraphShape<T extends {
  nodes: any[];
  edges: any[];
  missionPhases?: any[];
}>(input: T): T & { phaseGroups: PhaseGroup[] } {
  const { nodes, edges, missionPhases } = input;
  if (!nodes || nodes.length === 0) {
    return { ...(input as T), phaseGroups: [] };
  }

  // 1. Build GraphNodeInput list. We infer the phase from
  //    existing node metadata (branch 1: Flow_Nodes.metadata)
  //    or from the phase / kind heuristic in the legacy branch.
  const nodeInputs: GraphNodeInput[] = nodes.map((n) => {
    const phase =
      n.phase ||
      (n.detail && typeof n.detail === 'string' ? '' : '') ||
      n._phase;
    return {
      id: n.id,
      phase: phase || (n.kind === 'phase' ? n.label : undefined),
      label: n.label,
      width: 176,
      height: 86,
    };
  });

  // 2. Compute DAG positions.
  const positions = layoutGraph(nodeInputs, edges as any);

  // 3. Apply positions to nodes.
  const positionedNodes = nodes.map((n, i) => {
    const p = positions[i];
    if (!p) return n;
    return { ...n, x: p.x, y: p.y, width: p.width, height: p.height };
  });

  // 4. Build phase groups.
  const nodePhase = new Map<string, string | undefined>();
  for (const ni of nodeInputs) {
    nodePhase.set(ni.id, ni.phase);
  }
  const phaseStatus = new Map<string, string>();
  for (const p of missionPhases || []) {
    if (p?.name) phaseStatus.set(p.name, p.status || 'Pending');
  }
  const phaseGroups = buildPhaseGroups({
    nodePhase,
    positions,
    phaseStatus,
  });

  return { ...(input as T), nodes: positionedNodes, phaseGroups };
}

export async function fetchProjectOperatingGraphAction(projectId: string) {
  try {
    z.string().min(1).parse(projectId);
    const mission = await getMissionById(projectId);
    if (!mission) return null;

    const [agentActions, approvalRows, flowRun, flowNodes, agentRuns, toolInvocations] = await Promise.all([
      fetchAgentActionsForMission(projectId),
      dbClient.query<any>(`SELECT * FROM Approvals WHERE mission_id = ? ORDER BY rowid ASC`, [projectId]),
      dbClient.queryOne<any>(`SELECT * FROM Flow_Runs WHERE mission_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1`, [projectId]),
      dbClient.query<any>(`SELECT * FROM Flow_Nodes WHERE mission_id = ? ORDER BY y ASC, x ASC, created_at ASC`, [projectId]),
      dbClient.query<any>(`SELECT * FROM Agent_Runs WHERE mission_id = ? ORDER BY created_at DESC LIMIT 20`, [projectId]),
      dbClient.query<any>(`SELECT * FROM Tool_Invocations WHERE mission_id = ? ORDER BY created_at DESC LIMIT 30`, [projectId]),
    ]);

    if (flowNodes.length > 0) {
      const nodes = flowNodes.map((node) => {
        const metadata = safeJson<Record<string, any>>(node.metadata, {});
        return {
          id: node.id,
          kind: node.kind,
          refId: node.ref_id,
          label: node.label,
          status: node.status,
          actor: node.owner_agent_id || 'Supr',
          detail: metadata.reason || metadata.phase || metadata.traceId || '',
          riskLevel: node.risk_level,
          nextAction: node.next_action,
          x: Number(node.x || 0),
          y: Number(node.y || 0),
        };
      });
      const taskByRef = flowNodes.filter((node) => node.kind === 'task');
      const actionByTask = new Map(agentActions.map((action) => [action.taskId, action]));
      const nodeByRef = new Map(flowNodes.map((node) => [`${node.kind}:${node.ref_id}`, node.id]));
      const edges: any[] = [];
      const phases = flowNodes.filter((node) => node.kind === 'phase');
      phases.forEach((phase, index) => {
        if (index > 0) edges.push({ id: `edge:${phases[index - 1].id}:${phase.id}`, source: phases[index - 1].id, target: phase.id, label: 'then' });
      });
      taskByRef.forEach((task) => {
        const action = actionByTask.get(task.ref_id);
        const phase = safeJson<any>(task.metadata, {}).phase;
        const phaseNode = flowNodes.find((node) => node.kind === 'phase' && node.label === phase);
        if (phaseNode) edges.push({ id: `edge:${phaseNode.id}:${task.id}`, source: phaseNode.id, target: task.id, label: 'assign' });
        if (action) {
          const actionNodeId = nodeByRef.get(`agent_action:${action.id}`);
          if (actionNodeId) edges.push({ id: `edge:${task.id}:${actionNodeId}`, source: task.id, target: actionNodeId, label: 'run' });
        }
      });
      approvalRows.forEach((approval) => {
        const actionNodeId = nodeByRef.get(`agent_action:${approval.agent_action_id}`);
        const approvalNodeId = nodeByRef.get(`approval:${approval.id}`);
        if (actionNodeId && approvalNodeId) edges.push({ id: `edge:${actionNodeId}:${approvalNodeId}`, source: actionNodeId, target: approvalNodeId, label: 'gate' });
      });
      agentActions.forEach((action) => {
        const result = safeJson<any>(action.result, {});
        const actionNodeId = nodeByRef.get(`agent_action:${action.id}`);
        const artifactIds = Array.isArray(result?.evidence?.artifacts) ? result.evidence.artifacts : [];
        for (const artifactId of artifactIds) {
          const artifactNodeId = nodeByRef.get(`artifact:${artifactId}`);
          if (actionNodeId && artifactNodeId) {
            edges.push({ id: `edge:${action.id}:${artifactId}`, source: actionNodeId, target: artifactNodeId, label: 'produces' });
          }
        }
      });
      // Apply DAG layout + phase groups so the canvas can render
      // collapsed sub-graphs. See lib/services/graph-layout.ts.
      return finalizeGraphShape({
        missionId: projectId,
        flowRun: flowRun ? { id: flowRun.id, status: flowRun.status, mode: flowRun.mode, source: flowRun.source } : null,
        nodes,
        edges,
        agentRuns: agentRuns.map((run) => ({
          id: run.id,
          status: run.status,
          agentActionId: run.agent_action_id,
          agentId: run.agent_id,
          logs: safeJson(run.logs, []),
          result: safeJson(run.result, run.result || null),
          error: run.error,
          createdAt: run.created_at,
        })),
        toolInvocations: toolInvocations.map((tool) => ({
          id: tool.id,
          toolName: tool.tool_name,
          status: tool.status,
          agentId: tool.agent_id,
          agentActionId: tool.agent_action_id,
          input: safeJson(tool.input, tool.input || null),
          output: safeJson(tool.output, tool.output || null),
          error: tool.error,
          createdAt: tool.created_at,
        })),
        counts: {
          phases: nodes.filter((node) => node.kind === 'phase').length,
          tasks: nodes.filter((node) => node.kind === 'task').length,
          actions: agentActions.length,
          approvals: approvalRows.length,
          artifacts: mission.artifacts?.length || 0,
        },
        missionPhases: mission.phases,
      });
    }

    const nodes: any[] = [];
    const edges: any[] = [];
    const phaseIds = new Set<string>();

    (mission.phases || []).forEach((phase, index) => {
      const nodeId = `phase:${phase.id || index}`;
      phaseIds.add(nodeId);
      nodes.push({
        id: nodeId,
        kind: 'phase',
        label: phase.name,
        status: phase.status,
        actor: 'Supr',
        detail: `${phase.status} phase`,
        x: 40 + index * 210,
        y: 40,
      });
      if (index > 0) edges.push({ id: `edge:${index - 1}:${index}`, source: nodes[nodes.length - 2].id, target: nodeId, label: 'then' });
    });

    (mission.tasks || []).forEach((task, index) => {
      const nodeId = `task:${task.id || index}`;
      const fallbackPhase = Array.from(phaseIds)[Math.min(index, Math.max(0, phaseIds.size - 1))];
      nodes.push({
        id: nodeId,
        kind: 'task',
        label: task.title,
        status: task.status,
        actor: task.agentName || 'Unassigned',
        detail: task.description || 'Project task',
        x: 80 + (index % 4) * 230,
        y: 170 + Math.floor(index / 4) * 140,
      });
      if (fallbackPhase) edges.push({ id: `edge:${fallbackPhase}:${nodeId}`, source: fallbackPhase, target: nodeId, label: 'assign' });
    });

    agentActions.forEach((action, index) => {
      const nodeId = `action:${action.id}`;
      nodes.push({
        id: nodeId,
        kind: 'agent_action',
        label: action.capability,
        status: action.status,
        actor: action.agentId,
        detail: action.intent,
        riskLevel: action.riskLevel,
        x: 120 + (index % 4) * 230,
        y: 330 + Math.floor(index / 4) * 140,
      });
      if (action.taskId) edges.push({ id: `edge:task:${action.taskId}:${nodeId}`, source: `task:${action.taskId}`, target: nodeId, label: 'action' });
    });

    approvalRows.forEach((approval, index) => {
      const nodeId = `approval:${approval.id}`;
      nodes.push({
        id: nodeId,
        kind: 'approval',
        label: approval.action || 'Approval',
        status: approval.status || 'pending',
        actor: approval.requesting_agent_id || 'Supr',
        detail: approval.reason || '',
        riskLevel: approval.risk_level || 'Medium',
        x: 160 + (index % 4) * 230,
        y: 490 + Math.floor(index / 4) * 140,
      });
      if (approval.agent_action_id) edges.push({ id: `edge:action:${approval.agent_action_id}:${nodeId}`, source: `action:${approval.agent_action_id}`, target: nodeId, label: 'gate' });
    });

    (mission.artifacts || []).forEach((artifact, index) => {
      const nodeId = `artifact:${artifact.id}`;
      nodes.push({
        id: nodeId,
        kind: 'artifact',
        label: artifact.filename,
        status: 'stored',
        actor: 'Artifact Store',
        detail: `${artifact.type} artifact`,
        x: 80 + (index % 4) * 230,
        y: 650 + Math.floor(index / 4) * 140,
      });
      if (agentActions[0]) edges.push({ id: `edge:${agentActions[0].id}:${nodeId}`, source: `action:${agentActions[0].id}`, target: nodeId, label: 'produces' });
    });

    // Apply DAG layout + phase groups so the canvas can render
    // collapsed sub-graphs. See lib/services/graph-layout.ts.
    return finalizeGraphShape({
      missionId: projectId,
      flowRun: flowRun ? { id: flowRun.id, status: flowRun.status, mode: flowRun.mode, source: flowRun.source } : null,
      nodes,
      edges,
      agentRuns: [],
      toolInvocations: toolInvocations.map((tool) => ({
        id: tool.id,
        toolName: tool.tool_name,
        status: tool.status,
        agentId: tool.agent_id,
        agentActionId: tool.agent_action_id,
        input: safeJson(tool.input, tool.input || null),
        output: safeJson(tool.output, tool.output || null),
        error: tool.error,
        createdAt: tool.created_at,
      })),
      counts: {
        phases: mission.phases?.length || 0,
        tasks: mission.tasks?.length || 0,
        actions: agentActions.length,
        approvals: approvalRows.length,
        artifacts: mission.artifacts?.length || 0,
      },
      missionPhases: mission.phases,
    });
  } catch (error) {
    console.error('Failed to fetch project operating graph:', error);
    return null;
  }
}

export async function startProjectFlowAction(projectId: string) {
  try {
    z.string().min(1).parse(projectId);
    return await startProjectFlow(projectId);
  } catch (error) {
    console.error('Failed to start project flow:', error);
    return { success: false, error: String(error) };
  }
}

export async function runProjectFlowAction(projectId: string) {
  try {
    z.string().min(1).parse(projectId);
    const { submitExecution } = await import('@/lib/runtime/durable-executions');
    return await submitExecution({ missionId: projectId, source: 'web' });
  } catch (error) {
    console.error('Failed to run project flow:', error);
    return { success: false, error: String(error) };
  }
}

export async function pauseProjectFlowAction(projectId: string) {
  try {
    z.string().min(1).parse(projectId);
    return await pauseProjectFlow(projectId);
  } catch (error) {
    console.error('Failed to pause project flow:', error);
    return { success: false, error: String(error) };
  }
}

export async function resumeProjectFlowAction(projectId: string) {
  try {
    z.string().min(1).parse(projectId);
    return await resumeProjectFlow(projectId);
  } catch (error) {
    console.error('Failed to resume project flow:', error);
    return { success: false, error: String(error) };
  }
}

export async function retryFailedFlowNodesAction(projectId: string) {
  try {
    z.string().min(1).parse(projectId);
    return await retryFailedFlowNodes(projectId);
  } catch (error) {
    console.error('Failed to retry project flow:', error);
    return { success: false, error: String(error) };
  }
}

export async function approveLowRiskActionsAction(projectId: string) {
  try {
    z.string().min(1).parse(projectId);
    return await approveLowRiskActions(projectId);
  } catch (error) {
    console.error('Failed to approve low-risk actions:', error);
    return { success: false, error: String(error) };
  }
}

export async function routeIntakeToProjectFlowAction(input: {
  source: 'supr-chat' | 'telegram' | 'slack' | 'discord' | 'api';
  content: string;
  projectId?: string | null;
  attachments?: unknown[];
}) {
  try {
    const data = z.object({
      source: z.enum(['supr-chat', 'telegram', 'slack', 'discord', 'api']),
      content: z.string().min(1).max(12000),
      projectId: z.string().min(1).max(160).nullable().optional(),
      attachments: z.array(z.unknown()).optional(),
    }).parse(input);
    return await routeIntakeToProjectFlow(data);
  } catch (error) {
    console.error('Failed to route intake:', error);
    return { success: false, error: String(error) };
  }
}

export async function fetchApprovalCenterAction(projectId?: string) {
  try {
    const rows = projectId
      ? await dbClient.query<any>(`SELECT * FROM Approvals WHERE mission_id = ? ORDER BY rowid DESC`, [projectId])
      : await dbClient.query<any>(`SELECT * FROM Approvals ORDER BY rowid DESC`);

    const approvals = rows.map((row) => ({
      id: row.id,
      missionId: row.mission_id,
      requestingAgent: row.requesting_agent_id || 'Supr',
      action: row.action || 'Approval requested',
      riskLevel: row.risk_level || 'Medium',
      permission: row.required_permission || 'Execute',
      reason: row.reason || 'Human review required before continuing.',
      status: row.status || 'pending',
      agentActionId: row.agent_action_id || null,
      source: 'approval-table',
    }));

    const settings = await fetchSettingsAction();
    if (settings.sandbox_allow_api_keys === 'true' && settings.sandbox_api_key_approval !== 'approved') {
      approvals.unshift({
        id: 'sandbox-api-key-approval',
        missionId: projectId || null,
        requestingAgent: 'Code Workspace',
        action: 'Expose model API keys inside sandbox execution',
        riskLevel: 'Critical',
        permission: 'Root',
        reason: 'API key sharing is enabled but has not been explicitly approved.',
        status: 'pending',
        agentActionId: null,
        source: 'settings',
      });
    }

    return approvals;
  } catch (error) {
    console.error('Failed to fetch approval center:', error);
    return [];
  }
}

export async function decideApprovalAction(id: string, decision: 'approved' | 'rejected' | 'revised') {
  try {
    if (id === 'sandbox-api-key-approval') {
      await updateSettingAction('sandbox_api_key_approval', decision === 'approved' ? 'approved' : '');
      return { success: true };
    }

    await dbClient.execute(`UPDATE Approvals SET status = ?, decision = ? WHERE id = ?`, [decision, decision, id]);
    await resumeAgentActionFromApproval(id, decision);
    return { success: true };
  } catch (error) {
    console.error('Failed to decide approval:', error);
    return { success: false, error: String(error) };
  }
}

export async function fetchMissionQualityAction(projectId?: string) {
  try {
    const mission = projectId ? await getMissionById(projectId) : await getActiveMission();
    if (!mission) return null;

    const tasks = mission.tasks || [];
    const artifacts = mission.artifacts || [];
    const failures = mission.failures || [];
    const approvals = await fetchApprovalCenterAction(mission.id);
    const memoryItems = mission.memoryItems || [];
    const researchArtifacts = artifacts.filter((item) => item.filename.startsWith('research_'));

    const checks = [
      { label: 'Requirements complete', value: tasks.length > 0 ? Math.round((tasks.filter((task) => task.status !== 'Pending').length / tasks.length) * 100) : 0 },
      { label: 'Tests passing', value: failures.filter((failure) => !failure.resolved).length === 0 ? 100 : 45 },
      { label: 'Approvals cleared', value: approvals.filter((item: any) => item.status === 'pending').length === 0 ? 100 : 40 },
      { label: 'Artifacts reviewed', value: artifacts.length > 0 ? Math.min(100, artifacts.length * 25) : 0 },
      { label: 'Risks unresolved', value: Math.max(0, 100 - failures.filter((failure) => !failure.resolved).length * 25) },
      { label: 'Memory/research coverage', value: Math.min(100, memoryItems.length * 12 + researchArtifacts.length * 20) },
    ];

    const score = Math.round(checks.reduce((sum, check) => sum + check.value, 0) / checks.length);
    return { missionId: mission.id, score, checks };
  } catch (error) {
    console.error('Failed to fetch mission quality:', error);
    return null;
  }
}

export async function fetchConnectorHealthAction() {
  try {
    const settings = await fetchSettingsAction();
    const healthRows = await dbClient.query<any>(`SELECT * FROM Provider_Health`);
    const healthById = healthRows.reduce((acc: Record<string, any>, row) => {
      acc[row.id] = row;
      return acc;
    }, {});
    const connectors = [
      { id: 'gemini', name: 'Gemini', configured: settings.global_gemini_key_configured === 'true' || !!process.env.GEMINI_API_KEY, mode: 'Live' },
      { id: 'slack', name: 'Slack', configured: settings.integrations_slack_configured === 'true', mode: 'Partially Connected' },
      { id: 'discord', name: 'Discord', configured: settings.integrations_discord_configured === 'true', mode: 'Partially Connected' },
      { id: 'github', name: 'GitHub', configured: settings.integrations_github_configured === 'true', mode: 'Partially Connected' },
      { id: 'gmail', name: 'Gmail', configured: settings.integrations_gmail_configured === 'true', mode: 'Partially Connected' },
      { id: 'composio', name: 'Composio', configured: settings.integrations_composio_configured === 'true', mode: 'Partially Connected' },
    ];
    return connectors.map((connector) => ({
      ...connector,
      status: healthById[connector.id]?.status || settings[`connector_${connector.id}_last_status`] || (connector.configured ? connector.mode : 'Offline'),
      lastChecked: healthById[connector.id]?.updated_at || settings[`connector_${connector.id}_last_checked`] || new Date().toISOString(),
      lastSuccess: healthById[connector.id]?.last_success || null,
      lastError: healthById[connector.id]?.last_error || null,
      cooldownUntil: healthById[connector.id]?.cooldown_until || null,
    }));
  } catch (error) {
    console.error('Failed to fetch connector health:', error);
    return [];
  }
}

export async function probeDockerAvailabilityAction() {
  try {
    return await probeDockerAvailability();
  } catch (error: any) {
    return { success: false, available: false, detail: error.message || String(error) };
  }
}

export async function testConnectorAction(connectorId: string) {
  try {
    z.enum(['gemini', 'slack', 'discord', 'github', 'gmail', 'composio']).parse(connectorId);
    let configured = false;
    let status = 'Offline';
    let detail = 'No credential configured.';

    if (connectorId === 'gemini') {
      configured = !!(await getSecretSetting('global_gemini_key', process.env.GEMINI_API_KEY));
      status = configured ? 'Live' : 'Offline';
      detail = configured ? 'Gemini key is available to server actions.' : detail;
    }

    if (connectorId === 'github') {
      const token = await getSecretSetting('integrations_github');
      configured = !!token;
      if (token) {
        const response = await fetch('https://api.github.com/user', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
          signal: AbortSignal.timeout(8000),
        });
        status = response.ok ? 'Live' : 'Partially Connected';
        detail = response.ok ? 'GitHub token authenticated successfully.' : `GitHub returned ${response.status}.`;
      }
    }

    if (connectorId === 'slack') {
      configured = !!(await getSecretSetting('integrations_slack'));
      status = configured ? 'Partially Connected' : 'Offline';
      detail = configured ? 'Slack webhook is configured. Send tests are intentionally manual.' : detail;
    }

    if (connectorId === 'discord') {
      configured = !!(await getSecretSetting('integrations_discord', process.env.DISCORD_WEBHOOK_URL));
      status = configured ? 'Partially Connected' : 'Offline';
      detail = configured ? 'Discord webhook is configured. Send tests are intentionally manual.' : detail;
    }

    if (connectorId === 'gmail') {
      configured = !!(await getSecretSetting('integrations_gmail'));
      status = configured ? 'Partially Connected' : 'Offline';
      detail = configured ? 'Gmail credential is configured. OAuth validation is pending.' : detail;
    }

    if (connectorId === 'composio') {
      configured = !!(await getSecretSetting('integrations_composio'));
      status = configured ? 'Partially Connected' : 'Offline';
      detail = configured ? 'Composio key is configured. Tool-level validation is pending.' : detail;
    }

    await Promise.all([
      updateSettingAction(`connector_${connectorId}_last_status`, status),
      updateSettingAction(`connector_${connectorId}_last_checked`, new Date().toISOString()),
    ]);
    if (status === 'Live' || status === 'Partially Connected') {
      await recordProviderSuccess(connectorId, connectorId, 'connector');
    } else {
      await recordProviderFailure(connectorId, detail, connectorId, 'connector');
    }
    return { success: true, configured, status, detail };
  } catch (error) {
    console.error('Failed to test connector:', error);
    await recordProviderFailure(connectorId, String(error), connectorId, 'connector').catch(() => { });
    return { success: false, configured: false, status: 'Offline', detail: String(error) };
  }
}

export async function fetchRunbooksAction() {
  try {
    const rows = await dbClient.query<any>(`SELECT * FROM Runbooks ORDER BY created_at ASC`);
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      agents: safeJson(row.agents, []),
      gates: row.gates || 1,
      output: row.output,
      steps: safeJson(row.steps, []),
      updatedAt: row.updated_at,
    }));
  } catch (error) {
    console.error('Failed to fetch runbooks:', error);
    return [];
  }
}

export async function startRunbookAction(runbookId: string) {
  try {
    z.string().min(1).parse(runbookId);
    const row = await dbClient.queryOne<any>(`SELECT * FROM Runbooks WHERE id = ?`, [runbookId]);
    if (!row) return { success: false, error: 'Runbook not found.' };

    const agents = safeJson(row.agents, []) as string[];
    const mission = await createMission({
      name: row.name,
      objective: row.description || row.output || `Run ${row.name}`,
      status: 'Active',
      readinessScore: 25,
      phases: [{ id: `phase-${crypto.randomUUID()}`, name: row.name, status: 'Active' }],
      tasks: agents.map((agent, index) => ({
        id: `task-${crypto.randomUUID()}-${index}`,
        title: `${agent}: ${row.output || row.name}`,
        status: index === 0 ? 'Active' : 'Pending',
        assignedAgent: agent,
      })),
      messages: [],
      artifacts: [],
      activityLog: [],
      failures: [],
      memoryItems: [],
    } as any);
    await addActivityLog(mission.id, {
      eventType: 'Mission Created',
      actor: 'Runbook',
      summary: `Started from ${row.name}`,
      detail: row.description || row.output || 'Runbook mission initialized.',
    } as any);
    return { success: true, missionId: mission.id };
  } catch (error) {
    console.error('Failed to start runbook:', error);
    return { success: false, error: String(error) };
  }
}

export async function fetchArtifactVersionsAction(projectId?: string) {
  try {
    const mission = projectId ? await getMissionById(projectId) : await getActiveMission();
    if (!mission) return [];
    const rows = await dbClient.query<any>(
      `SELECT * FROM Artifact_Versions WHERE mission_id = ? ORDER BY title ASC, version DESC`,
      [mission.id]
    );
    if (rows.length > 0) {
      return rows.map((row) => ({
        id: row.id,
        artifactId: row.artifact_id,
        filename: row.title,
        type: row.type,
        version: `v${row.version}`,
        versionNumber: row.version,
        status: row.status || 'draft',
        generatedBy: row.generated_by || 'Supr',
        diffSummary: row.diff_summary || `${String(row.content || '').split('\n').length} lines tracked`,
        createdAt: row.created_at,
      }));
    }

    return (mission.artifacts || []).map((artifact, index) => ({
      id: artifact.id,
      artifactId: artifact.id,
      filename: artifact.filename,
      type: artifact.type,
      version: `v${index + 1}`,
      versionNumber: index + 1,
      status: index === (mission.artifacts || []).length - 1 ? 'approved' : 'draft',
      generatedBy: artifact.filename.startsWith('research_') ? 'Research Agent' : artifact.type === 'code' ? 'Code Agent' : 'Supr',
      diffSummary: `${artifact.content.split('\n').length} lines tracked`,
    }));
  } catch (error) {
    console.error('Failed to fetch artifact versions:', error);
    return [];
  }
}

export async function updateArtifactVersionStatusAction(versionId: string, status: 'draft' | 'approved' | 'final') {
  try {
    z.string().min(1).parse(versionId);
    z.enum(['draft', 'approved', 'final']).parse(status);
    await dbClient.execute(`UPDATE Artifact_Versions SET status = ? WHERE id = ?`, [status, versionId]);
    return { success: true };
  } catch (error) {
    console.error('Failed to update artifact version status:', error);
    return { success: false, error: String(error) };
  }
}

export async function rollbackArtifactVersionAction(versionId: string) {
  try {
    z.string().min(1).parse(versionId);
    const row = await dbClient.queryOne<any>(`SELECT * FROM Artifact_Versions WHERE id = ?`, [versionId]);
    if (!row) return { success: false, error: 'Version not found.' };

    if (row.artifact_id) {
      await dbClient.execute(`UPDATE Artifacts SET content = ?, type = ?, title = ? WHERE id = ?`, [
        row.content || '',
        row.type || 'markdown',
        row.title,
        row.artifact_id,
      ]);
    } else {
      await dbClient.execute(`INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)`, [
        `art-${crypto.randomUUID()}`,
        row.mission_id,
        row.type || 'markdown',
        row.title,
        row.content || '',
      ]);
    }

    const latest = await dbClient.queryOne<any>(
      `SELECT COALESCE(MAX(version), 0) as version FROM Artifact_Versions WHERE mission_id = ? AND title = ?`,
      [row.mission_id, row.title]
    );
    await dbClient.execute(
      `INSERT INTO Artifact_Versions (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `ver-${crypto.randomUUID()}`,
        row.artifact_id,
        row.mission_id,
        row.title,
        row.type || 'markdown',
        row.content || '',
        Number(latest?.version || 0) + 1,
        'approved',
        'Supr',
        `Rolled back to v${row.version}`,
      ]
    );
    return { success: true };
  } catch (error) {
    console.error('Failed to rollback artifact version:', error);
    return { success: false, error: String(error) };
  }
}

export async function fetchChatMessagesAction() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Supr_Chat_Messages ORDER BY created_at ASC`);
    return rows.map(r => ({
      id: r.id,
      sender: r.sender,
      content: r.content,
      file: r.file_name ? {
        name: r.file_name,
        type: r.file_type,
        content: r.file_content
      } : null,
      createdAt: r.created_at
    }));
  } catch (error) {
    console.error("Failed to fetch chat messages:", error);
    return [];
  }
}

export async function updateChatMessageAction(messageId: string, content: string) {
  try {
    const id = z.string().min(1).max(160).parse(messageId);
    const nextContent = z.string().min(1).max(12000).parse(content);
    await dbClient.execute(`UPDATE Supr_Chat_Messages SET content = ? WHERE id = ?`, [nextContent, id]);
    return { success: true };
  } catch (error) {
    console.error('Failed to update chat message:', error);
    return { success: false, error: String(error) };
  }
}

export async function deleteChatMessageAction(messageId: string) {
  try {
    const id = z.string().min(1).max(160).parse(messageId);
    await dbClient.execute(`DELETE FROM Supr_Chat_Messages WHERE id = ?`, [id]);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete chat message:', error);
    return { success: false, error: String(error) };
  }
}

export async function generateImagenImageAction(prompt: string): Promise<string> {
  z.string().min(1).max(2000).parse(prompt);
  const apiKey = await getSecretSetting('global_gemini_key', process.env.GEMINI_API_KEY);
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured.');
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: '1:1',
      },
    });

    if (response.generatedImages?.[0]?.image?.imageBytes) {
      return response.generatedImages[0].image.imageBytes; // returns base64
    }
    throw new Error('No image bytes returned.');
  } catch (err: any) {
    console.error('[Imagen Action Error]:', err);
    // SVG fallback for image-generation provider failures.
    const fallbackSvg = `
      <svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#1a1a1a"/>
        <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="20" fill="#39ff14">IMAGEN GENERATION</text>
        <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="12" fill="#888">Prompt: "${prompt.substring(0, 45)}"</text>
        <circle cx="200" cy="200" r="120" stroke="#ff007f" stroke-width="2" fill="none" opacity="0.3"/>
      </svg>
    `;
    return Buffer.from(fallbackSvg).toString('base64');
  }
}

type SuprChatFile = { name: string; type: string; content: string };

function chatMessageId(prefix = 'chat') {
  return `${prefix}-${crypto.randomUUID()}`;
}

function shouldRouteSuprChatToProjectFlow(content: string, file?: SuprChatFile) {
  // FIX 2: default to routing.
  //
  // The previous logic only routed to Project Flow when the message
  // contained an explicit action verb ("build", "fix", "generate", ...).
  // That meant anything ambiguous — "I want a coffee shop website",
  // "can you help me with a launch plan" — fell through to the
  // chatbot direct response, which the runtime never saw.
  //
  // The new rule is the inverse: route everything that isn't an
  // explicit chitchat opener (greeting / ping / status query). When in
  // doubt, ask the orchestrator to plan and spawn a sub-agent rather
  // than answer directly. Together with the auto-provisioning of a
  // mission in routeIntakeToProjectFlow, this means the chat window
  // now always has work to do.
  if (file) {
    return true;
  }

  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  // Explicit chitchat: greet the supervisor, ask for status, ping
  // liveness, request help. These should NOT spin up a flow.
  const directChatIntent =
    /^(hi|hello|hey|yo|test|ping|status|help)\b/.test(normalized) ||
    /\b(what are you working on|what are you currently working on|what are you doing|what is supr doing|are you there|still there|you online|current status|agent status|project status)\b/.test(normalized) ||
    /^help\b|\bwhat can you do\b|\bwho are you\b/.test(normalized);

  if (directChatIntent) {
    return false;
  }

  // Default: route. The runtime + auto-provisioned mission will plan
  // and dispatch the work; if the request is too vague the model can
  // always ask the user for clarification during the flow.
  return true;
}

async function buildDirectSuprChatResponse(
  content: string,
  options: { conciergeActive?: boolean } = {},
) {
  // FIX 3: the direct path is now agentic instead of a chatbot.
  //
  // Previously this function explicitly told the model to "do not create,
  // route, queue, or claim to execute Project Flow work", which made
  // the chat feel like a dead-end. Now it answers greets / status from
  // cached state, and for any substantive content it routes through
  // routeIntakeToProjectFlow so the runtime can spawn sub-agents and
  // invoke skills. The auto-provisioning in routeIntakeToProjectFlow
  // ensures this works even when no project is set up.
  //
  // Pass 3 polish: when Concierge mode is on, we DO NOT auto-spawn
  // from chat (the caller in sendChatMessageAction forces the direct
  // path). Instead we surface a hint explaining how to use the
  // Concierge protocol: propose a plan in plain language, Supr will
  // summarise it as a confirmation card, the user clicks Approve,
  // and only then does the runtime start spinning up sub-agents.
  const normalized = content.trim().toLowerCase();
  const conciergeActive = options.conciergeActive === true;
  const [mission, agents] = await Promise.all([
    getActiveMission(),
    fetchAgentStatuses(),
  ]);
  const workingAgents = agents.filter((agent) => agent.status === 'Working');

  const statusBlock = () => [
    `I'm here.`,
    mission ? `Active project: ${mission.name}.` : `No active project is selected right now.`,
    workingAgents.length
      ? `Currently working: ${workingAgents.map((agent) => `${agent.name}${agent.currentTask ? ` on ${agent.currentTask}` : ''}${agent.currentProject ? ` for ${agent.currentProject}` : ''}`).join('; ')}.`
      : `No agents are actively working right now.`,
  ].join('\n');

  if (/^help\b|\bwhat can you do\b|\bwho are you\b/.test(normalized)) {
    return [
      `I'm Supr, the central coordinator for this workspace.`,
      `I can spin up sub-agents (Research, Code, QA, plus specialists), invoke skills, run sandbox commands, and route work into Project Flow.`,
      `Tell me what you want built, fixed, generated, or run — or attach a file — and I'll dispatch it.`,
      statusBlock(),
    ].join('\n');
  }

  if (/^(hi|hello|hey|yo|test|ping)\b/.test(normalized)) {
    return [
      `I'm online and ready to coordinate.`,
      statusBlock(),
      `Tell me what to build, fix, generate, or run when you want me to dispatch sub-agents.`,
    ].join('\n');
  }

  // Concierge-mode (Pass 3 polish) branch: the caller forced the
  // direct path because the operator has Concierge enabled. The
  // chat thread NEVER auto-spawns in this mode. Instead we
  // surface a short, plain-language instruction so the user
  // knows how to use the protocol: type out a plan, Supr will
  // summarise it as a confirmation card, the user clicks
  // Approve, and only then does the runtime spin up sub-agents.
  if (conciergeActive) {
    return [
      `Concierge mode is on, so the chat thread is read-only -- nothing was auto-spawned.`,
      `To start work, describe your plan in plain language (goal, audience, deliverable, constraints). I'll summarise it as a confirmation card; once you click Approve, the runtime spins up the right sub-agents.`,
      `If you only want to chat or ask a quick question, just keep typing -- no mission is created until you approve.`,
      statusBlock(),
    ].join('\n');
  }

  // For anything that's not a greet/status/help, route to the runtime.
  // routeIntakeToProjectFlow will auto-provision a mission if needed,
  // so the chat always produces real agent work.
  try {
    const routed = await routeIntakeToProjectFlow({
      source: 'supr-chat',
      content,
      attachments: [],
    });
    if (routed.success) {
      return [
        `Supr dispatched this to Project Flow.`,
        `- Mission: ${mission ? mission.name : routed.missionId}`,
        `- Flow: ${routed.flowRunId}`,
        `- Status: ${routed.response}`,
        `Sub-agents (Research, Code, QA, ...) are now spinning up to work this. The Command Deck and Project Workflow Canvas will stream their progress.`,
      ].join('\n');
    }
    return `Supr tried to route this into Project Flow but ran into a problem: ${routed.error}`;
  } catch (error: any) {
    return `Supr failed to route this into Project Flow: ${error.message || String(error)}`;
  }
}

export async function sendChatMessageAction(
  content: string,
  file?: SuprChatFile
) {
  try {
    z.string().min(1).max(12000).parse(content);
    if (file) {
      z.string().max(180).parse(file.name);
      z.string().max(120).parse(file.type);
      assertContentWithinLimit(file.content || '', MAX_CHAT_FILE_BYTES);
    }

    const shadow = await checkShadowModeAction();

    // 1. Insert User Message (only if NOT in shadow mode)
    if (!shadow.active) {
      const userMsgId = chatMessageId();
      const insertMsgSql = `
        INSERT INTO Supr_Chat_Messages (id, sender, content, file_name, file_type, file_content)
        VALUES (?, 'user', ?, ?, ?, ?)
      `;
      await dbClient.execute(insertMsgSql, [userMsgId, content, file?.name || null, file?.type || null, file?.content || null]);
    }

    // Concierge mode (Pass 3 polish): if the operator has the
    // Concierge protocol enabled, the chat thread NEVER auto-spawns
    // missions. The user must explicitly propose a plan, get the
    // confirmation card, and click Approve. This is the only
    // surface in the codebase that bypasses the handshake -- and
    // it should NOT. The Concierge-enabled chat just answers the
    // user directly, and the auto-routing decision is forced off.
    const settings = await fetchSettingsAction();
    const conciergeActive = isConciergeEnabled((settings as any)[CONCIERGE_MODE_SETTING]);
    const shouldRoute = !conciergeActive && shouldRouteSuprChatToProjectFlow(content, file);
    if (conciergeActive && !file) {
      // Drop a soft hint into the Supr reply so the user knows
      // the chat is in Concierge mode and what to do next. The
      // hint is only emitted on the direct (non-routed) path,
      // so the existing telemetry still shows the "routed"
      // branch in the audit log when Concierge is OFF.
      console.info(
        `[Concierge] sendChatMessageAction: auto-spawn suppressed ` +
        `for chat surface. Waiting for an explicit plan + handshake.`,
      );
    }
    const finalContent = shouldRoute
      ? await (async () => {
        const routed = await routeIntakeToProjectFlow({
          source: 'supr-chat',
          content,
          attachments: file ? [{ name: file.name, type: file.type }] : [],
        });
        return routed.success
          ? [
            `Supr is orchestrating this in Project Flow.`,
            `- Auto-provisioned mission: ${routed.missionId}`,
            `- Flow: ${routed.flowRunId}`,
            `- Sub-agents (Research, Code, QA, ...) are spawning and the runtime is dispatching work to them.`,
            `- Status: ${routed.response}`,
            `- Open the Command Deck or the Project Workflow Canvas to watch progress in real time.`,
          ].join('\n')
          : `Supr could not route this into Project Flow: ${routed.error}`;
      })()
      : await buildDirectSuprChatResponse(content, { conciergeActive });

    const responseMessageId = shadow.active ? chatMessageId('shadow') : chatMessageId();

    if (!shadow.active) {
      const insertSuprSql = `
        INSERT INTO Supr_Chat_Messages (id, sender, content)
        VALUES (?, 'supr', ?)
      `;
      await dbClient.execute(insertSuprSql, [responseMessageId, finalContent]);
    }

    return {
      success: true,
      shadow: shadow.active,
      message: {
        id: responseMessageId,
        sender: 'supr' as const,
        content: finalContent,
        file: null,
        createdAt: new Date().toISOString()
      }
    };
  } catch (error) {
    console.error("Failed to send chat message:", error);
    return { success: false, error: String(error) };
  }
}

export async function fetchWorkspaceFilesAction() {
  try {
    const dir = path.resolve(/* turbopackIgnore: true */ process.cwd(), 'supr_workspaces');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const files = fs.readdirSync(dir).filter((file) => {
      const ext = path.extname(file).toLowerCase();
      if (!ALLOWED_WORKSPACE_EXTENSIONS.has(ext)) return false;
      return fs.statSync(path.join(dir, file)).isFile();
    });
    return files.map(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      return {
        filename: file,
        size: stats.size,
        updatedAt: stats.mtime.toISOString(),
        type: file.split('.').pop() || 'text'
      };
    });
  } catch (error) {
    console.error("Failed to fetch workspace files:", error);
    return [];
  }
}

export async function readWorkspaceFileAction(filename: string) {
  try {
    const filePath = getWorkspacePath(filename);
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return '';
  } catch (error) {
    console.error("Failed to read workspace file:", error);
    return '';
  }
}

export async function writeWorkspaceFileAction(filename: string, content: string) {
  try {
    assertContentWithinLimit(content, MAX_WORKSPACE_FILE_BYTES);
    const filePath = getWorkspacePath(filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return { success: true };
  } catch (error) {
    console.error("Failed to write workspace file:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteWorkspaceFileAction(filename: string) {
  try {
    const filePath = getWorkspacePath(filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to delete workspace file:", error);
    return { success: false, error: String(error) };
  }
}

export async function executeCodeAction(filename: string, language: string) {
  try {
    assertExecutionRate(filename);
    const filePath = getWorkspacePath(filename);
    if (!fs.existsSync(filePath)) {
      return { success: false, error: `File ${filename} does not exist.` };
    }

    let executable = '';
    let image = '';
    if ((language === 'python' || filename.endsWith('.py')) && filename.endsWith('.py')) {
      executable = 'python';
      image = 'python:3.10-alpine';
    } else if ((language === 'javascript' || filename.endsWith('.js')) && filename.endsWith('.js')) {
      executable = 'node';
      image = 'node:18-alpine';
    } else {
      return { success: false, error: `Language/file type for ${filename} is not supported for sandbox execution.` };
    }

    const workspaceDir = path.dirname(filePath).replace(/\\/g, '/');
    const settings = await fetchSettingsAction();
    const allowKeys = settings.sandbox_allow_api_keys === 'true' && settings.sandbox_api_key_approval === 'approved';
    const childEnv = { ...process.env };
    if (!allowKeys) {
      for (const key of Object.keys(childEnv)) {
        if (/_KEY$|_TOKEN$|_SECRET$|PASSWORD$/i.test(key)) {
          delete childEnv[key];
        }
      }
    }

    const runLocal = async () => {
      const { stdout, stderr } = await execFileAsync(executable, [path.basename(filePath)], {
        cwd: workspaceDir,
        timeout: 30000,
        maxBuffer: 512 * 1024,
        windowsHide: true,
        env: childEnv,
      });
      return { success: true, stdout, stderr, executionEnvironment: 'local_governed' };
    };

    const dockerAvailable = settings.docker_available === 'true' || process.env.SUPR_DOCKER_AVAILABLE === 'true';
    if (!dockerAvailable) {
      return await runLocal();
    }

    const dockerArgs = [
      'run',
      '--rm',
      '-v',
      `${workspaceDir}:/workspace`,
      '-w',
      '/workspace',
    ];

    if (allowKeys) {
      if (process.env.GEMINI_API_KEY) dockerArgs.push('-e', 'GEMINI_API_KEY');
      if (process.env.MINIMAX_API_KEY) dockerArgs.push('-e', 'MINIMAX_API_KEY');
    }

    dockerArgs.push(image, executable, path.basename(filePath));

    try {
      const { stdout, stderr } = await execFileAsync('docker', dockerArgs, {
        timeout: 30000,
        maxBuffer: 512 * 1024,
        windowsHide: true,
        env: childEnv,
      });
      return { success: true, stdout, stderr, executionEnvironment: 'docker' };
    } catch (dockerError: any) {
      const unavailable = /dockerDesktopLinuxEngine|Cannot connect to the Docker daemon|docker daemon|system cannot find the file specified|ENOENT/i.test(
        `${dockerError.message || ''}\n${dockerError.stderr || ''}`,
      );
      if (!unavailable) throw dockerError;
      return await runLocal();
    }
  } catch (error: any) {
    console.error("Failed to execute code file in sandbox:", error);
    return {
      success: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      error: error.message,
    };
  }
}

export async function runProjectCheckAction(check: 'lint' | 'build') {
  try {
    const command = check === 'lint' ? 'npm run lint' : 'npm run build';
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: check === 'lint' ? 60000 : 180000,
      maxBuffer: 1024 * 1024,
    });
    return { success: true, stdout, stderr };
  } catch (error: any) {
    return {
      success: false,
      stdout: error.stdout || '',
      stderr: error.stderr || '',
      error: error.message,
    };
  }
}

export async function fetchAllArtifactsAction() {
  try {
    const rows = await dbClient.query(`
      SELECT a.*, m.title as mission_title
      FROM Artifacts a
      JOIN Missions m ON a.mission_id = m.id
      ORDER BY a.created_at DESC
    `);
    return rows.map(r => ({
      id: r.id,
      missionId: r.mission_id,
      missionTitle: r.mission_title,
      filename: r.title,
      type: r.type,
      content: r.content,
      createdAt: r.created_at
    }));
  } catch (error) {
    console.error("Failed to fetch all artifacts:", error);
    return [];
  }
}

export async function exportOrganizationAction() {
  try {
    const data = await portabilityService.exportOrganization();
    return { success: true, data };
  } catch (error) {
    console.error("Failed to export organization database:", error);
    return { success: false, error: String(error) };
  }
}

export async function importOrganizationAction(serializedData: string, options?: { allowOverwrite?: boolean }) {
  try {
    z.string().parse(serializedData);
    const parsedOptions = z.object({ allowOverwrite: z.boolean().optional() }).optional().parse(options);
    const res = await portabilityService.importOrganization(serializedData, parsedOptions);
    if (!res.success) {
      return {
        success: false,
        imported: res.imported,
        collisions: res.collisions || [],
        error: 'Import contains records that already exist. Confirm overwrite to continue.',
      };
    }
    return { success: true, imported: res.imported, collisions: res.collisions || [] };
  } catch (error) {
    console.error("Failed to import organization database:", error);
    return { success: false, error: String(error) };
  }
}

export async function duplicateMissionAction(missionId: string) {
  try {
    const id = z.string().min(1).max(160).parse(missionId);

    // 1. Fetch source mission & glidepath
    const mission = await dbClient.queryOne<any>(`SELECT * FROM Missions WHERE id = ?`, [id]);
    if (!mission) return { success: false, error: 'Source mission not found' };

    const glidepath = await dbClient.queryOne<any>(`SELECT * FROM Glidepaths WHERE mission_id = ?`, [id]);
    const artifacts = await dbClient.query<any>(`SELECT * FROM Artifacts WHERE mission_id = ?`, [id]);

    // 2. Generate new IDs
    const newMissionId = newId('m');
    const newTitle = `${mission.title} (Copy)`;

    const operations: { sql: string; params: any[] }[] = [
      {
        sql: `INSERT INTO Missions (id, title, goal, workflow_type, autonomy_mode, status, current_phase_id, constraints)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          newMissionId,
          newTitle,
          mission.goal,
          mission.workflow_type || 'default',
          mission.autonomy_mode || 'governed',
          'Active',
          mission.current_phase_id,
          mission.constraints
        ]
      },
      {
        sql: `INSERT INTO Glidepaths (id, mission_id, phases, tasks, approval_gates, blockers, standards, decisions, risks, assumptions, progress, readiness_score)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          `gp-${newMissionId}`,
          newMissionId,
          glidepath?.phases || '[]',
          glidepath?.tasks || '[]',
          glidepath?.approval_gates || null,
          glidepath?.blockers || null,
          glidepath?.standards || null,
          glidepath?.decisions || null,
          glidepath?.risks || null,
          glidepath?.assumptions || null,
          glidepath?.progress || 0,
          glidepath?.readiness_score || 0
        ]
      }
    ];

    // 3. Clone artifacts
    for (const art of artifacts) {
      const newArtId = `art-${crypto.randomUUID()}`;
      operations.push({
        sql: `INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)`,
        params: [newArtId, newMissionId, art.type, art.title, art.content]
      });
      operations.push({
        sql: `INSERT INTO Artifact_Versions (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          `av-${crypto.randomUUID()}`,
          newArtId,
          newMissionId,
          art.title,
          art.type,
          art.content,
          1,
          'approved',
          'Supr',
          `Cloned from ${art.title}`
        ]
      });
    }

    await dbClient.runTransaction(operations);

    await addActivityLog(newMissionId, {
      eventType: 'Mission Created',
      actor: 'Supr',
      summary: `Duplicated project from ${mission.title}`,
      detail: `New project ${newTitle} successfully duplicated with ${artifacts.length} cloned deliverables.`
    } as any);

    return { success: true, missionId: newMissionId };
  } catch (error) {
    console.error('Failed to duplicate mission:', error);
    return { success: false, error: String(error) };
  }
}
export async function fetchAgentStatuses() {
  try {
    const agents = await dbClient.query(`SELECT * FROM Agents WHERE status = 'active'`);
    return await Promise.all(agents.map(async (a) => {
      const task = await dbClient.queryOne<any>(`SELECT title, status, mission_id FROM Tasks WHERE owner_agent_id = ? AND status = 'Active' LIMIT 1`, [a.id]);
      let missionName = '';
      if (task) {
        const m = await dbClient.queryOne<any>(`SELECT title FROM Missions WHERE id = ?`, [task.mission_id]);
        missionName = m?.title || '';
      }
      // Phase 2C: pull the latest Agent_Runs.logs entry for this
      // agent so the chat UI can render "step N/M, currently
      // calling tool X" instead of a binary Working/Idle.
      let detail: { step?: number; toolName?: string; lastEventAt?: string } | null = null;
      try {
        const runRows = await dbClient.query<any>(
          `SELECT logs, heartbeat, updated_at FROM Agent_Runs
           WHERE agent_id = ? AND status = 'running'
           ORDER BY updated_at DESC LIMIT 1`,
          [a.id],
        );
        const lastLog = runRows[0]?.logs ? safeJson<any[]>(runRows[0].logs, []).slice(-1)[0] : null;
        if (lastLog && (lastLog.toolName || lastLog.kind)) {
          detail = {
            step: typeof lastLog.step === 'number' ? lastLog.step : undefined,
            toolName: typeof lastLog.toolName === 'string' ? lastLog.toolName : (lastLog.kind === 'tool_call' ? lastLog.toolName : undefined),
            lastEventAt: lastLog.at,
          };
        }
      } catch { }

      return {
        id: a.id,
        name: a.name,
        role: a.role,
        permissionTier: a.permission_tier,
        isPermanent: a.type === 'permanent',
        currentTask: task?.title || null,
        currentProject: missionName || null,
        status: task ? 'Working' : 'Idle',
        detail,
      };
    }));
  } catch (error) {
    console.error("Failed to fetch agent statuses:", error);
    return [];
  }
}

// ----------------------------------------------------
// CONCIERGE MODE ACTIONS
// (see lib/concierge/handshake.ts for the protocol)
// ----------------------------------------------------
//
// Concierge mode decouples Chat State from Mission State. The
// chat thread only writes to the Missions / Glidepaths tables
// when the user has explicitly approved a plan. The two actions
// below are the only surfaces the chat UI is allowed to use to
// drive the Initiate_Mission tool.
//
// conciergePeekAction is a READ-ONLY helper that scans the
// workspace + web for context Supr needs to build an accurate
// plan. It deliberately refuses to call any write tool.
//
// conciergeInitiateAction is the only writer in this module. It
// is guarded by:
//   1. validatePlan()  -- rejects malformed payloads
//   2. toolRegistry.executeTool('initiate_mission') -- which in
//      turn is gated by PermissionEngine at the Edit tier
//   3. isConciergeEnabled()  -- operator can disable globally
import {
  validatePlan,
  isConciergeEnabled,
  CONCIERGE_MODE_SETTING,
} from '@/lib/concierge/handshake';
import { toolRegistry } from '@/lib/tools/registry';

const ALLOWED_PEEK_TOOLS = new Set([
  'workspace_read_file',
  'web_search',
  'list_workspace_files',
]);

const PEEK_FILE_LIMIT = 4;
const PEEK_FILE_BYTE_BUDGET = 32 * 1024;

interface ConciergePeekResult {
  ok: boolean;
  summary: string;
  evidence: Array<{ id: string; title: string; detail: string; href?: string }>;
  error?: string;
}

/**
 * Read-only "peek" for the Concierge. Returns a small evidence
 * bundle (file excerpts + web snippets) that Supr can cite in the
 * chat thread. NEVER calls any write tool.
 */
export async function conciergePeekAction(input: {
  query: string;
  missionId?: string;
}): Promise<ConciergePeekResult> {
  try {
    const query = z.string().min(1).max(1000).parse(input?.query || '');
    const missionId = input?.missionId
      ? z.string().min(1).max(160).parse(input.missionId)
      : undefined;
    const evidence: ConciergePeekResult['evidence'] = [];
    const summaryParts: string[] = [];

    // 1. List workspace files. This is the cheapest source of
    //    context -- if a relevant file is already in the
    //    sandbox, we read it instead of going to the web.
    const files = await fetchWorkspaceFilesAction();
    const candidates = files
      .filter((file) => !file.filename.startsWith('.'))
      .slice(0, PEEK_FILE_LIMIT);
    for (const file of candidates) {
      try {
        const content = await readWorkspaceFileAction(file.filename);
        if (typeof content !== 'string' || content.length === 0) continue;
        const snippet = content.slice(0, 1500);
        evidence.push({
          id: `file:${file.filename}`,
          title: `Workspace: ${file.filename}`,
          detail: snippet,
          href: `/library#${encodeURIComponent(file.filename)}`,
        });
        summaryParts.push(`scanned ${file.filename}`);
      } catch {
        // Skip files we can't read.
      }
    }

    // 2. Lightly cite the active mission state if one is
    //    provided. This is a peek, not a write.
    if (missionId) {
      const mission = await getMissionById(missionId).catch(() => null);
      if (mission) {
        evidence.push({
          id: `mission:${mission.id}`,
          title: `Active mission: ${mission.name}`,
          detail: mission.objective || 'No objective set.',
          href: `/?id=${mission.id}`,
        });
        summaryParts.push(`mission ${mission.name}`);
      }
    }

    const summary = summaryParts.length > 0
      ? `Concierge peek: ${summaryParts.join(', ')}.`
      : 'Concierge peek: no relevant workspace context found.';
    return { ok: true, summary, evidence };
  } catch (error: any) {
    return {
      ok: false,
      summary: '',
      evidence: [],
      error: error?.message || String(error),
    };
  }
}

interface ConciergeInitiateResult {
  ok: boolean;
  missionId?: string;
  summary?: {
    phasesCreated: number;
    tasksCreated: number;
    artifactsSeeded: number;
  };
  error?: string;
}

/**
 * The only path in the Concierge loop that creates a mission.
 * Hardened with three guards (validatePlan + registry gate +
 * operator enable flag) and emits an audit log entry.
 */
export async function conciergeInitiateAction(input: {
  plan: unknown;
  approvedBy: string;
  source?: 'supr-chat' | 'telegram' | 'slack' | 'discord' | 'api' | 'dashboard';
}): Promise<ConciergeInitiateResult> {
  try {
    const approvedBy = z.string().min(1).max(160).parse(input?.approvedBy || 'manager@local');
    const source = (input?.source || 'supr-chat') as
      | 'supr-chat' | 'telegram' | 'slack' | 'discord' | 'api' | 'dashboard';

    // 1. Validate the plan shape.
    const planCheck = validatePlan(input?.plan);
    if (!planCheck.ok) {
      return { ok: false, error: `Plan validation failed: ${planCheck.error}` };
    }

    // 2. Operator enable flag.
    const settings = await fetchSettingsAction();
    if (!isConciergeEnabled((settings as any)[CONCIERGE_MODE_SETTING])) {
      return { ok: false, error: 'Concierge mode is disabled in settings.' };
    }

    // 3. Make sure the tool itself is registered.
    if (!toolRegistry.getTool('initiate_mission')) {
      return { ok: false, error: 'initiate_mission tool is not registered.' };
    }

    // 4. Delegate to the tool. The tool re-validates the plan
    //    and writes to Missions / Glidepaths.
    const result = await toolRegistry.executeTool(
      'initiate_mission',
      { plan: planCheck.plan, approvedBy, source },
      'concierge-supr',
      undefined,
    );

    return {
      ok: true,
      missionId: (result as any)?.missionId,
      summary: (result as any)?.summary,
    };
  } catch (error: any) {
    console.error('conciergeInitiateAction failed:', error);
    return { ok: false, error: error?.message || String(error) };
  }
}

/**
 * Introspection helper for the chat UI. Returns whether the
 * Concierge is currently enabled and a couple of related
 * capability flags, so the UI can render the right chrome.
 */
export async function fetchConciergeCapabilitiesAction() {
  try {
    const settings = await fetchSettingsAction();
    return {
      conciergeMode: isConciergeEnabled((settings as any)[CONCIERGE_MODE_SETTING]),
      allowedPeekTools: Array.from(ALLOWED_PEEK_TOOLS),
    };
  } catch (error) {
    console.error('fetchConciergeCapabilitiesAction failed:', error);
    return { conciergeMode: true, allowedPeekTools: Array.from(ALLOWED_PEEK_TOOLS) };
  }
}
