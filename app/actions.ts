"use server"

import dbClient from '@/lib/database/db_client';
import {
  getActiveMission,
  getAgents,
  addActivityLog,
  recordFailure,
  resolveFailure,
  updateTaskStatus,
  addArtifact,
  updateArtifact,
  addMemoryItem,
  getDb,
  saveDb,
  createMission,
  createAgent,
  archiveAgent,
  deleteAgent,
  extendAgent,
  getMissionById
} from '@/lib/db';
import { writeIdentityProfile, deleteIdentityProfile } from '@/lib/agents';
import { agentBlueprintService } from '@/lib/services/agent-blueprints';
import { agentGroupService } from '@/lib/services/agent-groups';
import { guidelinePackService } from '@/lib/services/guideline-packs';
import { memorySectionService } from '@/lib/services/memory-sections';
import { operationalMetrics } from '@/lib/services/operational-metrics';
import { skillLearningService } from '@/lib/services/skill-learning';
import { PipelineGates } from '@/lib/governance/PipelineGates';
import { getProductionHealth } from '@/lib/production-health';
import { DEFAULT_GEMINI_MODEL } from '@/lib/providers/catalog';
import { createAgentAction as createRuntimeAgentAction } from '@/lib/runtime/agent-actions';
import crypto from 'crypto';
import {
  ActivityEvent,
  FailureEvent,
  TaskStatus,
  Artifact,
  MemoryItem,
  Mission,
  Agent,
  Phase,
  Task
} from '@/types';
import {
  ActivityEventSchema,
  FailureEventSchema,
  ArtifactSchema,
  MemoryItemSchema,
  TaskStatusSchema,
  MissionSchema
} from '@/lib/validations';
import { z } from 'zod';

// Helper for generating unique persisted primary keys. Uses
// crypto.randomUUID() so parallel writers (concurrent skill saves,
// duplicate missions, etc.) never collide on the primary key.
// `Date.now()` is fine for UI state and timestamps, but never for
// database IDs â€” two writes in the same millisecond would collide.
function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

// Project-flow capability set. This mirrors the canonical list in
// `app/actions/chat-workspace.ts`; the spawn-agent schema here is
// the only consumer that still lives in `actions.ts` and predates
// the split, so we keep a small local copy rather than depend on
// the chat-workspace module.
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

// Local helper for parsing JSON-encoded columns. The chat-workspace
// module also defines its own `safeJson`, but this file's
// `fetchSupervisorConsoleAction` reads the same kind of columns
// (replan/decision rows) and predates the extraction, so it needs
// its own copy rather than a cross-module import.
function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

// Helper for error handling in production
function handleActionError(error: unknown) {
  console.error('[Action Error]:', error);
  if (error instanceof z.ZodError) {
    throw new Error(`Validation failed: ${(error as any).errors.map((e: any) => e.message).join(', ')}`);
  }
  throw new Error('An unexpected error occurred. Please try again.');
}

export async function fetchMissionState(): Promise<Mission | undefined> {
  try {
    return await getActiveMission();
  } catch (error) {
    handleActionError(error);
  }
}

export async function fetchMissionByIdAction(id: string): Promise<Mission | undefined> {
  try {
    return await getMissionById(id);
  } catch (error) {
    handleActionError(error);
  }
}

export async function fetchMissionsAction(): Promise<Mission[]> {
  try {
    const data = await getDb();
    return data.missions;
  } catch (error) {
    handleActionError(error);
    return [];
  }
}

export async function fetchAgentsState(): Promise<Agent[]> {
  try {
    return await getAgents();
  } catch (error) {
    handleActionError(error);
    return []; // Fallback for TS
  }
}

export async function fetchSupervisorConsoleAction(projectId?: string) {
  try {
    const mission = projectId ? await getMissionById(projectId) : await getActiveMission();
    const missionId = mission?.id || null;
    const [
      agents,
      groups,
      blueprints,
      memorySections,
      metrics,
      guidelinePacks,
      learnedSkillDrafts,
      replanDecisions,
      providerRouteDecisions,
      outboundMessages,
      executionSettings,
      productionHealth,
    ] = await Promise.all([
      getAgents(),
      missionId ? agentGroupService.listForMission(missionId) : Promise.resolve([]),
      agentBlueprintService.list(missionId),
      memorySectionService.list(missionId),
      operationalMetrics.listRecent(25, missionId),
      guidelinePackService.list(),
      skillLearningService.listDrafts(missionId),
      missionId
        ? dbClient.query<any>(`SELECT * FROM Replan_Decisions WHERE mission_id = ? ORDER BY created_at DESC LIMIT 12`, [missionId])
        : Promise.resolve([]),
      missionId
        ? dbClient.query<any>(`SELECT * FROM Provider_Route_Decisions WHERE mission_id = ? ORDER BY created_at DESC LIMIT 12`, [missionId])
        : Promise.resolve([]),
      missionId
        ? dbClient.query<any>(`SELECT * FROM Outbound_Messages WHERE mission_id = ? ORDER BY created_at DESC LIMIT 12`, [missionId])
        : Promise.resolve([]),
      dbClient.query<any>(
        `SELECT key, value FROM Settings
         WHERE key IN ('runtime_mode','docker_available','remote_execution_enabled','channels_slack','channels_discord','channels_telegram')`,
      ),
      getProductionHealth(),
    ]);

    const executionSettingsMap = Object.fromEntries(executionSettings.map((row: any) => [row.key, row.value]));
    executionSettingsMap.runtime_mode = 'real';

    const runtimeDecisions = {
      replanDecisions: replanDecisions.map((row: any) => ({
        id: row.id,
        trigger: row.trigger,
        flowRunId: row.flow_run_id,
        plannerSource: row.planner_source,
        affectedNodeIds: safeJson<string[]>(row.affected_node_ids, []),
        insertedActionIds: safeJson<string[]>(row.inserted_action_ids, []),
        removedActionIds: safeJson<string[]>(row.removed_action_ids, []),
        createdAt: row.created_at,
      })),
      providerRouteDecisions: providerRouteDecisions.map((row: any) => ({
        id: row.id,
        agentRunId: row.agent_run_id,
        agentRole: row.agent_role,
        provider: row.provider,
        model: row.model,
        fallbackProvider: row.fallback_provider,
        runtimeMode: row.runtime_mode,
        failureReason: row.failure_reason,
        createdAt: row.created_at,
      })),
      outboundMessages: outboundMessages.map((row: any) => ({
        id: row.id,
        source: row.source,
        actorId: row.actor_id,
        reason: row.reason,
        status: row.status,
        error: row.error,
        sentAt: row.sent_at,
        createdAt: row.created_at,
      })),
      executionSettings: executionSettingsMap,
      productionHealth,
    };

    return { mission, agents, groups, blueprints, memorySections, metrics, guidelinePacks, learnedSkillDrafts, runtimeDecisions };
  } catch (error: any) {
    console.error('[fetchSupervisorConsoleAction]', error);
    return {
      mission: null,
      agents: [],
      groups: [],
      blueprints: [],
      memorySections: [],
      metrics: [],
      guidelinePacks: [],
      learnedSkillDrafts: [],
      runtimeDecisions: { replanDecisions: [], providerRouteDecisions: [], outboundMessages: [], executionSettings: {} },
      error: error.message,
    };
  }
}

export async function fetchProductionHealthAction(options?: { probeModel?: boolean }) {
  try {
    return await getProductionHealth({ probeModel: options?.probeModel === true });
  } catch (error: any) {
    return {
      status: 'fail',
      generatedAt: new Date().toISOString(),
      runtime: { mode: 'real', liveOnly: true },
      failures: [error.message || String(error)],
      warnings: [],
    };
  }
}

export async function requestLearnedSkillReviewAction(draftId: string) {
  try {
    const id = z.string().min(1).max(180).parse(draftId);
    const approvalId = await skillLearningService.requestSecurityReview(id);
    return { success: true, approvalId };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

export async function promoteLearnedSkillDraftAction(draftId: string) {
  try {
    const id = z.string().min(1).max(180).parse(draftId);
    const path = await skillLearningService.promoteApprovedDraft(id);
    return { success: true, path };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

export async function rejectLearnedSkillDraftAction(draftId: string) {
  try {
    const id = z.string().min(1).max(180).parse(draftId);
    const draft = await skillLearningService.rejectDraft(id);
    return { success: true, draft };
  } catch (error: any) {
    return { success: false, error: error.message || String(error) };
  }
}

export async function createAgentBlueprintAction(prompt: string, projectId?: string) {
  try {
    const blueprint = await agentBlueprintService.create({ prompt, missionId: projectId || null });
    await operationalMetrics.record({
      missionId: projectId || null,
      eventType: 'agent',
      outcome: 'blueprint_created',
      metadata: { role: blueprint.role, provider: blueprint.provider },
    });
    return { success: true, blueprint };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function createAgentGroupAction(input: {
  projectId: string;
  name: string;
  supervisorAgentId: string;
  memberAgentIds: string[];
  sharedContext: string;
}) {
  try {
    const agents = await getAgents();
    const group = await agentGroupService.createGroup({
      missionId: input.projectId,
      name: input.name,
      supervisorAgentId: input.supervisorAgentId,
      sharedContext: input.sharedContext,
      members: input.memberAgentIds.map((agentId) => ({
        agentId,
        role: agents.find((agent) => agent.id === agentId)?.role || 'Contributor',
      })),
    });
    await operationalMetrics.record({
      missionId: input.projectId,
      agentId: input.supervisorAgentId,
      eventType: 'agent',
      outcome: 'group_created',
      metadata: { members: input.memberAgentIds.length },
    });
    return { success: true, group };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function upsertMemorySectionAction(input: {
  id?: string;
  projectId?: string;
  title: string;
  content: string;
  injectionStatus: 'active' | 'inactive';
}) {
  try {
    const section = await memorySectionService.upsert({
      id: input.id,
      missionId: input.projectId || null,
      title: input.title,
      content: input.content,
      provenance: 'user',
      injectionStatus: input.injectionStatus,
      userEdited: true,
    });
    await operationalMetrics.record({
      missionId: input.projectId || null,
      eventType: 'mission',
      outcome: 'memory_section_saved',
      metadata: { sectionId: section.id, injectionStatus: section.injectionStatus },
    });
    return { success: true, section };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function fetchAgentCapabilityPoliciesAction() {
  try {
    const rows = await dbClient.query<any>(`SELECT key, value FROM Settings WHERE key LIKE 'agent_policy_%'`);
    return rows.reduce((acc: Record<string, any>, row) => {
      const agentId = row.key.replace('agent_policy_', '');
      acc[agentId] = safeJson(row.value, {});
      return acc;
    }, {});
  } catch (error) {
    console.error('Failed to fetch agent policies:', error);
    return {};
  }
}

export async function updateAgentCapabilityPolicyAction(agentId: string, policy: Record<string, unknown>) {
  try {
    z.string().min(1).max(120).parse(agentId);
    const sanitized = {
      model: String(policy.model || DEFAULT_GEMINI_MODEL).slice(0, 120),
      maxTokens: Math.max(256, Math.min(32768, Number(policy.maxTokens ?? 4096))),
      capabilities: Array.isArray(policy.capabilities) ? policy.capabilities.map(String).slice(0, 16) : [],
      autonomy: String(policy.autonomy || 'supervised').slice(0, 60),
      scope: String(policy.scope || 'project').slice(0, 60),
      integrations: Array.isArray(policy.integrations) ? policy.integrations.map(String).slice(0, 16) : [],
      escalation: String(policy.escalation || 'approval-required').slice(0, 80),
    };
    await updateSettingAction(`agent_policy_${agentId}`, JSON.stringify(sanitized));
    return { success: true, policy: sanitized };
  } catch (error) {
    console.error('Failed to update agent policy:', error);
    return { success: false, error: String(error) };
  }
}

export async function logActivityAction(missionId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>) {
  try {
    const shadow = await checkShadowModeAction();
    if (shadow.active) return;
    // Partial validation for Omit types
    const schema = ActivityEventSchema.omit({ id: true, timestamp: true });
    schema.parse(event);
    await addActivityLog(missionId, event);
  } catch (error) {
    handleActionError(error);
  }
}

export async function recordFailureAction(missionId: string, failure: Omit<FailureEvent, 'id' | 'resolved'>) {
  try {
    const shadow = await checkShadowModeAction();
    if (shadow.active) return;
    const schema = FailureEventSchema.omit({ id: true, resolved: true });
    schema.parse(failure);
    await recordFailure(missionId, failure);
  } catch (error) {
    handleActionError(error);
  }
}

export async function resolveFailureAction(missionId: string, failureId: string, guidance: string) {
  try {
    const shadow = await checkShadowModeAction();
    if (shadow.active) return;
    z.string().parse(missionId);
    z.string().parse(failureId);
    z.string().parse(guidance);
    await resolveFailure(missionId, failureId, guidance);
  } catch (error) {
    handleActionError(error);
  }
}

export async function updateTaskStatusAction(missionId: string, taskId: string, status: TaskStatus) {
  try {
    z.string().parse(missionId);
    z.string().parse(taskId);
    TaskStatusSchema.parse(status);

    if (status === 'Done') {
      const reviewGate = await PipelineGates.verifyReviewGate(missionId, taskId);
      if (!reviewGate.passed) {
        // Fallback: check if there are any artifact versions for this mission
        const hasArtifact = await dbClient.queryOne<any>(
          `SELECT id FROM Artifact_Versions WHERE mission_id = ? LIMIT 1`,
          [missionId]
        );
        if (!hasArtifact) {
          throw new Error(reviewGate.message || "Hard Gate Block: Task requires approved review or associated deliverables (artifacts) before it can be marked as complete.");
        }
      }
    }

    await updateTaskStatus(missionId, taskId, status);
  } catch (error) {
    handleActionError(error);
  }
}

export async function addArtifactAction(missionId: string, artifact: Omit<Artifact, 'id'>) {
  try {
    const shadow = await checkShadowModeAction();
    if (shadow.active) return;
    const schema = ArtifactSchema.omit({ id: true });
    schema.parse(artifact);
    await addArtifact(missionId, artifact);
  } catch (error) {
    handleActionError(error);
  }
}

export async function updateArtifactAction(missionId: string, filename: string, content: string) {
  try {
    const shadow = await checkShadowModeAction();
    if (shadow.active) return;
    z.string().parse(missionId);
    z.string().parse(filename);
    z.string().parse(content);
    await updateArtifact(missionId, filename, content);
  } catch (error) {
    handleActionError(error);
  }
}

export async function addMemoryItemAction(missionId: string, item: Omit<MemoryItem, 'id'>) {
  try {
    const shadow = await checkShadowModeAction();
    if (shadow.active) return;
    const schema = MemoryItemSchema.omit({ id: true });
    schema.parse(item);
    await addMemoryItem(missionId, item);
  } catch (error) {
    handleActionError(error);
  }
}

export async function createMissionAction(missionData: Omit<Mission, 'id'>) {
  try {
    const schema = MissionSchema.omit({ id: true });
    schema.parse(missionData);

    return await createMission(missionData);
  } catch (error) {
    handleActionError(error);
  }
}

export async function updateMissionAction(
  missionId: string,
  updates: { name?: string; objective?: string; status?: Mission['status'] }
) {
  try {
    const id = z.string().min(1).max(160).parse(missionId);
    const data = z.object({
      name: z.string().min(1).max(160).optional(),
      objective: z.string().max(4000).optional(),
      status: z.enum(['Active', 'Done', 'Failed']).optional(),
    }).parse(updates);

    const fields: string[] = [];
    const params: any[] = [];
    if (data.name !== undefined) {
      fields.push('title = ?');
      params.push(data.name);
    }
    if (data.objective !== undefined) {
      fields.push('goal = ?');
      params.push(data.objective);
    }
    if (data.status !== undefined) {
      fields.push('status = ?');
      params.push(data.status);
    }
    if (fields.length === 0) return { success: true };

    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(id);
    await dbClient.execute(`UPDATE Missions SET ${fields.join(', ')} WHERE id = ?`, params);
    return { success: true };
  } catch (error) {
    console.error('Failed to update mission:', error);
    return { success: false, error: String(error) };
  }
}

export async function deleteMissionAction(missionId: string) {
  try {
    const id = z.string().min(1).max(160).parse(missionId);
    const groups = await dbClient.query<{ id: string }>(`SELECT id FROM Agent_Groups WHERE mission_id = ?`, [id]);
    const sessions = await dbClient.query<{ id: string }>(`SELECT id FROM agent_sessions WHERE mission_id = ?`, [id]);
    const operations = [
      ...sessions.map((session) => ({ sql: `DELETE FROM job_executions WHERE session_id = ?`, params: [session.id] })),
      ...groups.map((group) => ({ sql: `DELETE FROM Agent_Group_Members WHERE group_id = ?`, params: [group.id] })),
      { sql: `DELETE FROM Agent_Groups WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Agent_Blueprints WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Memory_Sections WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Operational_Metrics WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Tool_Invocations WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Agent_Runs WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Flow_Nodes WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Flow_Runs WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Agent_Actions WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Approvals WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Artifact_Versions WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Artifacts WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Memory_Items WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Knowledge_Pages WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Event_Log WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Failure_Events WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Tasks WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Glidepaths WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM agent_sessions WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM learned_skill_drafts WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM outbound_messages WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM provider_route_decisions WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM replan_decisions WHERE mission_id = ?`, params: [id] },
      { sql: `DELETE FROM Missions WHERE id = ?`, params: [id] },
    ];
    await dbClient.runTransaction(operations);
    return { success: true };
  } catch (error) {
    console.error('Failed to delete mission:', error);
    return { success: false, error: String(error) };
  }
}

export async function exportMissionBundleAction(missionId: string) {
  try {
    const id = z.string().min(1).max(160).parse(missionId);
    const [mission, approvals, actions, flowRuns, flowNodes, agentRuns, tools, artifactVersions, memorySections, groups, metrics, events] = await Promise.all([
      getMissionById(id),
      dbClient.query<any>(`SELECT * FROM Approvals WHERE mission_id = ? ORDER BY created_at ASC, id ASC`, [id]),
      dbClient.query<any>(`SELECT * FROM Agent_Actions WHERE mission_id = ? ORDER BY created_at ASC`, [id]),
      dbClient.query<any>(`SELECT * FROM Flow_Runs WHERE mission_id = ? ORDER BY created_at ASC`, [id]),
      dbClient.query<any>(`SELECT * FROM Flow_Nodes WHERE mission_id = ? ORDER BY created_at ASC`, [id]),
      dbClient.query<any>(`SELECT * FROM Agent_Runs WHERE mission_id = ? ORDER BY created_at ASC`, [id]),
      dbClient.query<any>(`SELECT * FROM Tool_Invocations WHERE mission_id = ? ORDER BY created_at ASC`, [id]),
      dbClient.query<any>(`SELECT * FROM Artifact_Versions WHERE mission_id = ? ORDER BY created_at ASC`, [id]),
      dbClient.query<any>(`SELECT * FROM Memory_Sections WHERE mission_id = ? ORDER BY created_at ASC`, [id]),
      agentGroupService.listForMission(id),
      dbClient.query<any>(`SELECT * FROM Operational_Metrics WHERE mission_id = ? ORDER BY created_at ASC`, [id]),
      dbClient.query<any>(`SELECT * FROM Event_Log WHERE mission_id = ? ORDER BY timestamp ASC`, [id]),
    ]);
    return {
      success: true,
      bundle: {
        exportedAt: new Date().toISOString(),
        mission,
        approvals,
        actions,
        flowRuns,
        flowNodes,
        agentRuns,
        toolInvocations: tools,
        artifactVersions,
        memorySections,
        agentGroups: groups,
        operationalMetrics: metrics,
        eventLog: events,
      },
    };
  } catch (error) {
    console.error('Failed to export mission bundle:', error);
    return { success: false, error: String(error) };
  }
}

export async function getActiveMissionAction(id: string): Promise<Mission | undefined> {
  try {
    const db = await getDb();
    return db.missions.find(m => m.id === id);
  } catch (error) {
    handleActionError(error);
  }
}

export async function createAgentAction(agentData: Omit<Agent, 'id'>, systemPrompt: string) {
  try {
    // 1. Write the Identity .md file
    writeIdentityProfile({
      name: agentData.name,
      role: agentData.role,
      permissionTier: agentData.permissionTier,
      type: agentData.isPermanent ? 'permanent' : 'temporary',
      systemPrompt: systemPrompt,
      tools: []
    });

    // 2. Persist to SQLite
    return await createAgent(agentData);
  } catch (error) {
    handleActionError(error);
  }
}

export async function spawnProjectAgentAction(input: {
  missionId: string;
  role: string;
  objective: string;
  permissionTier?: string;
  capability?: string;
  riskLevel?: 'Low' | 'Medium' | 'High' | 'Critical';
}) {
  try {
    const data = z.object({
      missionId: z.string().min(1).max(160),
      role: z.string().min(2).max(80),
      objective: z.string().min(4).max(500),
      permissionTier: z.enum(['Observe', 'Draft', 'Edit', 'Execute', 'External_Act', 'Root']).default('Edit'),
      capability: z.enum(PROJECT_FLOW_CAPABILITIES).default('workspace_write_artifact'),
      riskLevel: z.enum(['Low', 'Medium', 'High', 'Critical']).default('Medium'),
    }).parse(input);

    const mission = await getMissionById(data.missionId);
    if (!mission) return { success: false, error: 'Mission not found.' };

    const agentName = `${data.role.replace(/\s+/g, ' ').trim()} Agent`;
    const createdAgent = await createAgent({
      name: agentName,
      role: data.role,
      icon: 'smart_toy',
      isActive: true,
      permissionTier: data.permissionTier,
      isPermanent: false,
      description: data.objective,
      reportsTo: 'Supr',
    } as Omit<Agent, 'id'>);

    writeIdentityProfile({
      name: createdAgent.name,
      role: createdAgent.role,
      permissionTier: data.permissionTier,
      type: 'temporary',
      systemPrompt: `You are ${createdAgent.name}. Your project objective is: ${data.objective}. Work through Supr Agent_Actions, stay inside your permission tier, and request approval for risky steps.`,
      tools: createdAgent.tools || [],
      memoryContext: createdAgent.memoryContext,
    });

    const taskId = `task-${crypto.randomUUID()}`;
    await dbClient.execute(
      `INSERT INTO Tasks (id, mission_id, title, status, owner_agent_id, required_permission)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [taskId, data.missionId, data.objective, 'Active', createdAgent.id, data.permissionTier],
    );

    const nextTasks = [
      ...(mission.tasks || []),
      {
        id: taskId,
        title: data.objective,
        description: `Spawned for ${createdAgent.name}`,
        agentName: createdAgent.name,
        agentIcon: 'smart_toy',
        status: 'Active',
      },
    ];
    await dbClient.execute(`UPDATE Glidepaths SET tasks = ? WHERE mission_id = ?`, [
      JSON.stringify(nextTasks),
      data.missionId,
    ]);

    const action = await createRuntimeAgentAction({
      missionId: data.missionId,
      taskId,
      agentId: createdAgent.id,
      capability: data.capability,
      intent: data.objective,
      riskLevel: data.riskLevel,
      requiredPermission: data.permissionTier as any,
      inputs: { objective: data.objective, spawnedFrom: 'dashboard' },
      metadata: { spawnedBy: 'Supr', agentName: createdAgent.name, requiresEvidence: true },
    });

    const capabilityRow = await dbClient.queryOne<any>(`SELECT id FROM Capabilities WHERE name = ?`, [data.capability]);
    if (capabilityRow) {
      await dbClient.execute(
        `INSERT INTO Agent_Capabilities (agent_id, capability_id, allowed) VALUES (?, ?, 1) ON CONFLICT DO NOTHING`,
        [createdAgent.id, capabilityRow.id],
      );
    }

    await addActivityLog(data.missionId, {
      eventType: 'delegation',
      actor: 'Supr',
      actorIcon: 'psychology',
      summary: `Spawned ${createdAgent.name}`,
      detail: data.objective,
    });

    return { success: true, agent: createdAgent, taskId, actionId: action.id };
  } catch (error) {
    console.error('Failed to spawn project agent:', error);
    return { success: false, error: String(error) };
  }
}

export async function archiveAgentAction(agentId: string) {
  try {
    await archiveAgent(agentId);
  } catch (error) {
    handleActionError(error);
  }
}

export async function deleteAgentAction(agentId: string, agentName: string) {
  try {
    // 1. Remove physical .md file
    deleteIdentityProfile(agentName);

    // 2. Remove from SQLite
    await deleteAgent(agentId);
  } catch (error) {
    handleActionError(error);
  }
}

export async function extendAgentAction(agentId: string) {
  try {
    await extendAgent(agentId);
  } catch (error) {
    handleActionError(error);
  }
}

// ----------------------------------------------------
// ENTERPRISE SKILLS & CRON AUTOMATION ACTIONS
// (moved to app/actions/skills.ts)
// ----------------------------------------------------
// Re-export wrappers â€” `use server` files can only export async
// functions, so each domain action is wrapped in a pass-through
// async function. The implementations live in app/actions/skills.ts.
import * as skills from './actions/skills';
export const fetchSkillsState = skills.fetchSkillsState;
export const createSkillAction = skills.createSkillAction;
export const deleteSkillAction = skills.deleteSkillAction;
export const fetchCronJobsState = skills.fetchCronJobsState;
export const toggleCronJobAction = skills.toggleCronJobAction;
export const triggerCronJobAction = skills.triggerCronJobAction;
export const createCronJobAction = skills.createCronJobAction;
export const updateCronJobAction = skills.updateCronJobAction;
export const deleteCronJobAction = skills.deleteCronJobAction;

// ----------------------------------------------------
// ORCHESTRATION HUB ACTIONS
// ----------------------------------------------------

export async function fetchOrchestrationFeed(projectId?: string) {
  try {
    const sql = projectId
      ? `SELECT * FROM Event_Log WHERE mission_id = ? ORDER BY timestamp DESC`
      : `SELECT * FROM Event_Log ORDER BY timestamp DESC`;
    const rows = projectId
      ? await dbClient.query(sql, [projectId])
      : await dbClient.query(sql);
    return rows.map(r => {
      let detail = '', targetAgent = '';
      try { const m = JSON.parse(r.metadata); detail = m.detail || ''; targetAgent = m.targetAgent || ''; } catch (e) { }
      return {
        id: r.id,
        eventType: r.event_type,
        actor: r.actor_id,
        targetAgent,
        summary: r.summary,
        detail,
        timestamp: r.timestamp,
        missionId: r.mission_id,
      };
    });
  } catch (error) {
    console.error("Failed to fetch orchestration feed:", error);
    return [];
  }
}


// ----------------------------------------------------
// SETTINGS ACTIONS
// (moved to app/actions/settings.ts)
// ----------------------------------------------------
import * as settings from './actions/settings';
export const fetchSettingsAction = settings.fetchSettingsAction;
export const fetchBootstrapStateAction = settings.fetchBootstrapStateAction;
export const updateSettingAction = settings.updateSettingAction;
export const fetchLiveProviderModelsAction = settings.fetchLiveProviderModelsAction;
export const checkShadowModeAction = settings.checkShadowModeAction;
export const toggleShadowModeAction = settings.toggleShadowModeAction;
export const updateGlidepathAction = settings.updateGlidepathAction;

// ----------------------------------------------------
// MEMORY BANK ACTIONS
// (moved to app/actions/memory.ts)
// ----------------------------------------------------
// MEMORY BANK ACTIONS
// (moved to app/actions/memory.ts)
// ----------------------------------------------------
import * as memory from './actions/memory';
export const fetchMemoryItemsAction = memory.fetchMemoryItemsAction;
export const purgeMemoryItemsAction = memory.purgeMemoryItemsAction;
export const addGlobalMemoryItemAction = memory.addGlobalMemoryItemAction;
export const updateMemoryReviewAction = memory.updateMemoryReviewAction;

// ----------------------------------------------------
// SUPR-CHAT & WORKSPACE FILE SYSTEM ACTIONS
// (moved to app/actions/chat-workspace.ts)
// ----------------------------------------------------
import * as chatWorkspace from './actions/chat-workspace';
export const fetchDesignProfilesAction = chatWorkspace.fetchDesignProfilesAction;
export const applyDesignProfileAction = chatWorkspace.applyDesignProfileAction;
export const fetchMissionTimelineAction = chatWorkspace.fetchMissionTimelineAction;
export const fetchProjectOperatingGraphAction = chatWorkspace.fetchProjectOperatingGraphAction;
export const startProjectFlowAction = chatWorkspace.startProjectFlowAction;
export const runProjectFlowAction = chatWorkspace.runProjectFlowAction;
export const pauseProjectFlowAction = chatWorkspace.pauseProjectFlowAction;
export const resumeProjectFlowAction = chatWorkspace.resumeProjectFlowAction;
export const retryFailedFlowNodesAction = chatWorkspace.retryFailedFlowNodesAction;
export const approveLowRiskActionsAction = chatWorkspace.approveLowRiskActionsAction;
export const routeIntakeToProjectFlowAction = chatWorkspace.routeIntakeToProjectFlowAction;
export const fetchApprovalCenterAction = chatWorkspace.fetchApprovalCenterAction;
export const decideApprovalAction = chatWorkspace.decideApprovalAction;
export const fetchMissionQualityAction = chatWorkspace.fetchMissionQualityAction;
export const fetchConnectorHealthAction = chatWorkspace.fetchConnectorHealthAction;
export const probeDockerAvailabilityAction = chatWorkspace.probeDockerAvailabilityAction;
export const testConnectorAction = chatWorkspace.testConnectorAction;
export const fetchRunbooksAction = chatWorkspace.fetchRunbooksAction;
export const startRunbookAction = chatWorkspace.startRunbookAction;
export const fetchArtifactVersionsAction = chatWorkspace.fetchArtifactVersionsAction;
export const updateArtifactVersionStatusAction = chatWorkspace.updateArtifactVersionStatusAction;
export const rollbackArtifactVersionAction = chatWorkspace.rollbackArtifactVersionAction;
export const fetchChatMessagesAction = chatWorkspace.fetchChatMessagesAction;
export const updateChatMessageAction = chatWorkspace.updateChatMessageAction;
export const deleteChatMessageAction = chatWorkspace.deleteChatMessageAction;
export const generateImagenImageAction = chatWorkspace.generateImagenImageAction;
export const sendChatMessageAction = chatWorkspace.sendChatMessageAction;
export const fetchWorkspaceFilesAction = chatWorkspace.fetchWorkspaceFilesAction;
export const readWorkspaceFileAction = chatWorkspace.readWorkspaceFileAction;
export const writeWorkspaceFileAction = chatWorkspace.writeWorkspaceFileAction;
export const deleteWorkspaceFileAction = chatWorkspace.deleteWorkspaceFileAction;
export const executeCodeAction = chatWorkspace.executeCodeAction;
export const runProjectCheckAction = chatWorkspace.runProjectCheckAction;
export const fetchAllArtifactsAction = chatWorkspace.fetchAllArtifactsAction;
export const exportOrganizationAction = chatWorkspace.exportOrganizationAction;
export const importOrganizationAction = chatWorkspace.importOrganizationAction;
export const duplicateMissionAction = chatWorkspace.duplicateMissionAction;
export const fetchAgentStatuses = chatWorkspace.fetchAgentStatuses;

// ----------------------------------------------------
// CONCIERGE MODE ACTIONS
// (re-exported from chat-workspace.ts -- see lib/concierge/handshake.ts)
// ----------------------------------------------------
export const conciergePeekAction = chatWorkspace.conciergePeekAction;
export const conciergeInitiateAction = chatWorkspace.conciergeInitiateAction;
export const fetchConciergeCapabilitiesAction = chatWorkspace.fetchConciergeCapabilitiesAction;
