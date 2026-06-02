"use server"

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
import { agentBlueprintService } from '@/src/services/agent-blueprints';
import { agentGroupService } from '@/src/services/agent-groups';
import { guidelinePackService } from '@/src/services/guideline-packs';
import { memorySectionService } from '@/src/services/memory-sections';
import { operationalMetrics } from '@/src/services/operational-metrics';
import { skillLearningService } from '@/src/services/skill-learning';
import { probeDockerAvailability } from '@/src/services/execution-environment';
import { PipelineGates } from '@/src/governance/PipelineGates';
import { portabilityService } from '@/src/services/portability';
import { getProductionHealth } from '@/lib/production-health';
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
    const operations = [
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
      dbClient.query<any>(`SELECT * FROM Approvals WHERE mission_id = ? ORDER BY rowid ASC`, [id]),
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
        `INSERT OR IGNORE INTO Agent_Capabilities (agent_id, capability_id, allowed) VALUES (?, ?, 1)`,
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
// ----------------------------------------------------
import dbClient from '@/lib/database/db_client';

export async function fetchSkillsState() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Skills ORDER BY created_at DESC`);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
      provider: r.provider,
      tools: JSON.parse(r.tools || '[]')
    }));
  } catch (error) {
    console.error("Failed to fetch skills:", error);
    return [];
  }
}

export async function createSkillAction(skill: { name: string, description: string, provider: string, tools: string[] }) {
  try {
    const id = `sk-${Date.now()}`;
    const sql = `
      INSERT INTO Skills (id, name, description, provider, tools)
      VALUES (?, ?, ?, ?, ?)
    `;
    await dbClient.execute(sql, [id, skill.name, skill.description, skill.provider, JSON.stringify(skill.tools)]);
    return { success: true, id };
  } catch (error) {
    console.error("Failed to create skill:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteSkillAction(id: string) {
  try {
    await dbClient.execute(`DELETE FROM Skills WHERE id = ?`, [id]);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete skill:", error);
    return { success: false, error: String(error) };
  }
}

export async function fetchCronJobsState() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Cron_Jobs ORDER BY created_at DESC`);
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      interval: r.interval,
      targetAction: r.target_action,
      lastRun: r.last_run,
      status: r.status,
      assignedAgentId: r.assigned_agent_id || null,
      associatedTaskId: r.associated_task_id || null
    }));
  } catch (error) {
    console.error("Failed to fetch cron jobs:", error);
    return [];
  }
}

export async function toggleCronJobAction(id: string, currentStatus: string) {
  try {
    const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
    await dbClient.execute(`UPDATE Cron_Jobs SET status = ? WHERE id = ?`, [newStatus, id]);
    return { success: true, newStatus };
  } catch (error) {
    console.error("Failed to toggle cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function triggerCronJobAction(id: string) {
  try {
    const timeNow = new Date().toISOString();
    await dbClient.execute(`UPDATE Cron_Jobs SET last_run = ? WHERE id = ?`, [timeNow, id]);
    return { success: true, lastRun: timeNow };
  } catch (error) {
    console.error("Failed to trigger cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function createCronJobAction(data: { name: string; interval: string; targetAction: string; assignedAgentId?: string; associatedTaskId?: string }) {
  try {
    const id = `cr-${Date.now()}`;
    const sql = `
      INSERT INTO Cron_Jobs (id, name, interval, target_action, last_run, status, assigned_agent_id, associated_task_id)
      VALUES (?, ?, ?, ?, NULL, 'Active', ?, ?)
    `;
    await dbClient.execute(sql, [id, data.name, data.interval, data.targetAction, data.assignedAgentId || null, data.associatedTaskId || null]);
    return { success: true, id };
  } catch (error) {
    console.error("Failed to create cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateCronJobAction(id: string, data: { name: string; interval: string; targetAction: string; assignedAgentId?: string; associatedTaskId?: string }) {
  try {
    const sql = `
      UPDATE Cron_Jobs SET name = ?, interval = ?, target_action = ?, assigned_agent_id = ?, associated_task_id = ? WHERE id = ?
    `;
    await dbClient.execute(sql, [data.name, data.interval, data.targetAction, data.assignedAgentId || null, data.associatedTaskId || null, id]);
    return { success: true };
  } catch (error) {
    console.error("Failed to update cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteCronJobAction(id: string) {
  try {
    await dbClient.execute(`DELETE FROM Cron_Jobs WHERE id = ?`, [id]);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete cron job:", error);
    return { success: false, error: String(error) };
  }
}

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
      try { const m = JSON.parse(r.metadata); detail = m.detail || ''; targetAgent = m.targetAgent || ''; } catch(e){}
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

export async function fetchAgentStatuses() {
  try {
    const agents = await dbClient.query(`SELECT * FROM Agents WHERE status = 'active'`);
    return await Promise.all(agents.map(async (a) => {
      // Find if agent has an active task
      const task = await dbClient.queryOne<any>(`SELECT title, status, mission_id FROM Tasks WHERE owner_agent_id = ? AND status = 'Active' LIMIT 1`, [a.id]);
      let missionName = '';
      if (task) {
        const m = await dbClient.queryOne<any>(`SELECT title FROM Missions WHERE id = ?`, [task.mission_id]);
        missionName = m?.title || '';
      }
      return {
        id: a.id,
        name: a.name,
        role: a.role,
        permissionTier: a.permission_tier,
        isPermanent: a.type === 'permanent',
        currentTask: task?.title || null,
        currentProject: missionName || null,
        status: task ? 'Working' : 'Idle',
      };
    }));
  } catch (error) {
    console.error("Failed to fetch agent statuses:", error);
    return [];
  }
}

// ----------------------------------------------------
// SETTINGS ACTIONS
// ----------------------------------------------------

export async function fetchSettingsAction() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Settings`);
    return redactSettings(rows);
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return {};
  }
}

/**
 * Resolve whether the SetupWizard still needs to be shown.
 *
 * The wizard should only force itself when there is real work to do:
 *   - the user has never completed the wizard before, AND
 *   - there is no live LLM provider available from env or stored keys.
 *
 * Previously the gate only looked at `global_minimax_key_configured`, which
 * missed valid VPS deployments where `MINIMAX_API_KEY` (or any other
 * provider key) is set via env. That kept the wizard popping up even
 * though the runtime was healthy.
 */
export async function fetchBootstrapStateAction(): Promise<{
  wizardRequired: boolean;
  hasProvider: boolean;
  wizardCompleted: boolean;
  reason: string;
}> {
  const [rows, hasProvider] = await Promise.all([
    dbClient.query<{ key: string; value: string }>(`SELECT * FROM Settings`).catch(() => [] as { key: string; value: string }[]),
    hasConfiguredModelProvider().catch(() => false),
  ]);

  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  const wizardCompleted = settings.has_completed_wizard === 'true';
  const wizardRequired = !wizardCompleted && !hasProvider;

  let reason: string;
  if (wizardRequired) {
    reason = 'No live LLM provider is configured and the bootstrap wizard has not been completed yet.';
  } else if (!wizardCompleted) {
    reason = 'A live LLM provider is already configured; the bootstrap wizard can be skipped.';
  } else {
    reason = 'Bootstrap wizard has been completed.';
  }

  return { wizardRequired, hasProvider, wizardCompleted, reason };
}

export async function updateSettingAction(key: string, value: string) {
  try {
    z.string().min(1).max(128).regex(/^[a-z0-9_]+$/i).parse(key);
    z.string().max(isSecretSettingKey(key) ? 8192 : 2048).parse(value);

    if (key.endsWith('_configured')) {
      return { success: false, error: 'Configured flags are read-only.' };
    }

    if (isSecretSettingKey(key) && value.trim() === '') {
      return { success: true, unchanged: true };
    }

    const sql = `
      INSERT INTO Settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `;
    await dbClient.execute(sql, [key, value]);
    return { success: true };
  } catch (error) {
    console.error(`Failed to update setting ${key}:`, error);
    return { success: false, error: String(error) };
  }
}

const LIVE_MODEL_PROVIDER_KEYS: Record<string, { setting: string; env?: string }> = {
  minimax: { setting: 'global_minimax_key', env: process.env.MINIMAX_API_KEY },
  openai: { setting: 'global_openai_key', env: process.env.OPENAI_API_KEY },
  anthropic: { setting: 'global_anthropic_key', env: process.env.ANTHROPIC_API_KEY },
  xai: { setting: 'global_xai_key', env: process.env.XAI_API_KEY },
  openrouter: { setting: 'global_openrouter_key', env: process.env.OPENROUTER_API_KEY },
  groq: { setting: 'global_groq_key', env: process.env.GROQ_API_KEY },
  mistral: { setting: 'global_mistral_key', env: process.env.MISTRAL_API_KEY },
  deepseek: { setting: 'global_deepseek_key', env: process.env.DEEPSEEK_API_KEY },
};

function normalizeModelRows(data: any): { label: string; value: string }[] {
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return rows
    .map((row: any) => {
      const id = String(row?.id || row?.name || '').replace(/^models\//, '').trim();
      return id ? { label: id, value: id } : null;
    })
    .filter(Boolean)
    .slice(0, 80) as { label: string; value: string }[];
}

export async function fetchLiveProviderModelsAction(provider: string): Promise<{ success: boolean; models: { label: string; value: string }[]; error?: string }> {
  try {
    const providerId = z.string().min(1).max(40).parse(provider);
    if (providerId === 'default' || providerId === 'openai_compat') return { success: true, models: [] };

    if (providerId === 'gemini') {
      const apiKey = await getSecretSetting('global_gemini_key', process.env.GEMINI_API_KEY);
      if (!apiKey) return { success: false, models: [], error: 'Gemini API key is not configured.' };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return { success: false, models: [], error: `Gemini models request failed: ${response.status}` };
      return { success: true, models: normalizeModelRows(await response.json()) };
    }

    if (providerId === 'anthropic') {
      const apiKey = await getSecretSetting('global_anthropic_key', process.env.ANTHROPIC_API_KEY);
      if (!apiKey) return { success: false, models: [], error: 'Anthropic API key is not configured.' };
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: { Accept: 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        cache: 'no-store',
      });
      if (!response.ok) return { success: false, models: [], error: `Anthropic models request failed: ${response.status}` };
      return { success: true, models: normalizeModelRows(await response.json()) };
    }

    const keySpec = LIVE_MODEL_PROVIDER_KEYS[providerId];
    const baseUrl = providerId === 'groq' ? 'https://api.groq.com/openai/v1' : OPENAI_COMPATIBLE_BASE_URLS[providerId];
    if (!keySpec || !baseUrl) return { success: false, models: [], error: `Live model refresh is not configured for ${providerId}.` };

    const apiKey = await getSecretSetting(keySpec.setting, keySpec.env);
    if (!apiKey) return { success: false, models: [], error: `${providerId} API key is not configured.` };
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (!response.ok) return { success: false, models: [], error: `${providerId} models request failed: ${response.status}` };
    return { success: true, models: normalizeModelRows(await response.json()) };
  } catch (error: any) {
    return { success: false, models: [], error: error.message || String(error) };
  }
}

export async function checkShadowModeAction(): Promise<{ active: boolean; expiresAt: string | null }> {
  try {
    const rows = await dbClient.query(`SELECT * FROM Settings WHERE key IN ('shadow_mode_active', 'shadow_mode_expires_at')`);
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    const active = settings.shadow_mode_active === 'true';
    const expiresAt = settings.shadow_mode_expires_at || null;

    if (active && expiresAt) {
      if (new Date().getTime() > new Date(expiresAt).getTime()) {
        // Expired! Auto-deactivate
        await updateSettingAction('shadow_mode_active', 'false');
        return { active: false, expiresAt: null };
      }
      return { active: true, expiresAt };
    }
    return { active: false, expiresAt: null };
  } catch (error) {
    console.error("Failed to check shadow mode:", error);
    return { active: false, expiresAt: null };
  }
}

export async function toggleShadowModeAction(active: boolean, durationMinutes: number = 5) {
  try {
    if (active) {
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      await Promise.all([
        updateSettingAction('shadow_mode_active', 'true'),
        updateSettingAction('shadow_mode_expires_at', expiresAt)
      ]);
      return { success: true, active: true, expiresAt };
    } else {
      await Promise.all([
        updateSettingAction('shadow_mode_active', 'false'),
        updateSettingAction('shadow_mode_expires_at', '')
      ]);
      return { success: true, active: false, expiresAt: null };
    }
  } catch (error) {
    console.error("Failed to toggle shadow mode:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateGlidepathAction(missionId: string, phases: Phase[], tasks: Task[]) {
  try {
    const shadow = await checkShadowModeAction();
    if (shadow.active) return { success: true };
    const sql = `UPDATE Glidepaths SET phases = ?, tasks = ? WHERE mission_id = ?`;
    await dbClient.execute(sql, [JSON.stringify(phases), JSON.stringify(tasks), missionId]);
    return { success: true };
  } catch (error) {
    console.error("Failed to update glidepath:", error);
    return { success: false, error: String(error) };
  }
}

// ----------------------------------------------------
// MEMORY BANK ACTIONS
// ----------------------------------------------------

export async function fetchMemoryItemsAction() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Memory_Items ORDER BY created_at DESC`);
    return rows.map(r => {
      let key = r.scope || 'General';
      let value = r.content || '';
      try {
        const parsed = JSON.parse(r.content);
        if (parsed.key) key = parsed.key;
        if (parsed.value) value = parsed.value;
      } catch (e) {}
      return {
        id: r.id,
        key,
        value,
        type: r.type || 'semantic',
        scope: r.scope || 'General',
        importance: r.importance >= 0.8 ? 'High' : r.importance >= 0.4 ? 'Medium' : 'Low',
        pinned: r.pinned === 1,
        reason: r.reason || `Used when ${r.scope || 'General'} context is active.`,
        reviewedAt: r.reviewed_at,
        stale: !r.reviewed_at && new Date(r.created_at).getTime() < Date.now() - 1000 * 60 * 60 * 24 * 30,
        createdAt: r.created_at,
      };
    });
  } catch (error) {
    console.error("Failed to fetch memory items:", error);
    return [];
  }
}

export async function purgeMemoryItemsAction(scope: string) {
  try {
    if (scope === 'all') {
      await dbClient.execute(`DELETE FROM Memory_Items`);
    } else {
      await dbClient.execute(`DELETE FROM Memory_Items WHERE scope = ? OR type = ?`, [scope, scope.toLowerCase()]);
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to purge memory items:", error);
    return { success: false, error: String(error) };
  }
}

export async function addGlobalMemoryItemAction(key: string, value: string, importance: string, scope: string = 'User') {
  try {
    const sql = `
      INSERT INTO Memory_Items (id, scope, type, content, importance, reason)
      VALUES (?, ?, ?, ?, ?, ?)
    `;
    const impVal = importance === 'High' ? 0.8 : importance === 'Medium' ? 0.5 : 0.2;
    await dbClient.execute(sql, [
      `mem-${Date.now()}`,
      scope,
      'semantic',
      JSON.stringify({ key, value }),
      impVal,
      `Manual ${scope} memory added from Settings.`
    ]);
    return { success: true };
  } catch (error) {
    console.error("Failed to add memory item:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateMemoryReviewAction(id: string, updates: { pinned?: boolean; reviewed?: boolean }) {
  try {
    z.string().min(1).parse(id);
    if (typeof updates.pinned === 'boolean') {
      await dbClient.execute(`UPDATE Memory_Items SET pinned = ? WHERE id = ?`, [updates.pinned ? 1 : 0, id]);
    }
    if (updates.reviewed) {
      await dbClient.execute(`UPDATE Memory_Items SET reviewed_at = ? WHERE id = ?`, [new Date().toISOString(), id]);
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to update memory review:", error);
    return { success: false, error: String(error) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPR-CHAT & WORKSPACE FILE SYSTEM ACTIONS
// ─────────────────────────────────────────────────────────────────────────────
import fs from 'fs';
import path from 'path';
import { exec, execFile } from 'child_process';
import { promisify } from 'util';
import { GoogleGenAI } from '@google/genai';
import { getActiveProvider } from '@/lib/providers/model';
import { getSecretSetting, isSecretSettingKey, redactSettings } from '@/lib/secrets';
import { DEFAULT_GEMINI_MODEL, OPENAI_COMPATIBLE_BASE_URLS } from '@/lib/providers/catalog';
import { hasConfiguredModelProvider } from '@/lib/runtime/runtime-mode';
import { stripModelThinking } from '@/lib/runtime/model-json';
import { createAgentAction as createRuntimeAgentAction, fetchAgentActionsForMission, resumeAgentActionFromApproval } from '@/lib/runtime/agent-actions';
import { recordProviderFailure, recordProviderSuccess } from '@/lib/runtime/provider-health';
import {
  approveLowRiskActions,
  pauseProjectFlow,
  resumeProjectFlow,
  retryFailedFlowNodes,
  routeIntakeToProjectFlow,
  runProjectFlow,
  startProjectFlow,
} from '@/lib/runtime/project-flow';

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
      return {
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
      };
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

    return {
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
    };
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
    return await runProjectFlow(projectId);
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
    await recordProviderFailure(connectorId, String(error), connectorId, 'connector').catch(() => {});
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
      phases: [{ id: `phase-${Date.now()}`, name: row.name, status: 'Active' }],
      tasks: agents.map((agent, index) => ({
        id: `task-${Date.now()}-${index}`,
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
        `art-${Date.now()}`,
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
        `ver-${Date.now()}`,
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
  if (file) {
    return true;
  }

  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const directChatIntent =
    /^(hi|hello|hey|yo|test|ping|status|help)\b/.test(normalized) ||
    /\b(what are you working on|what are you currently working on|what are you doing|what is supr doing|are you there|still there|you online|current status|agent status|project status)\b/.test(normalized);

  if (directChatIntent) {
    return false;
  }

  return /\b(start|create|build|generate|run|execute|deploy|design|implement|fix|repair|write|make|draft|research|analyze|scan|validate|launch|ship|plan|schedule|route|queue|assign|spawn|update|refactor|debug|test)\b/.test(normalized);
}

async function buildDirectSuprChatResponse(content: string) {
  const normalized = content.trim().toLowerCase();
  const [mission, agents] = await Promise.all([
    getActiveMission(),
    fetchAgentStatuses(),
  ]);
  const workingAgents = agents.filter((agent) => agent.status === 'Working');

  const fallbackStatus = () => [
    `I'm here.`,
    mission ? `Active project: ${mission.name}.` : `No active project is selected right now.`,
    workingAgents.length
      ? `Currently working: ${workingAgents.map((agent) => `${agent.name}${agent.currentTask ? ` on ${agent.currentTask}` : ''}${agent.currentProject ? ` for ${agent.currentProject}` : ''}`).join('; ')}.`
      : `No agents are actively working right now.`,
    `Say what you want built, fixed, generated, or run when you want me to route it into Project Flow.`,
  ].join('\n');

  if (/^help\b|\bwhat can you do\b/.test(normalized)) {
    return [
      `I'm here in Supr Chat for quick status, coordination, and routing decisions.`,
      `Use action language like "build", "fix", "generate", "run", or attach a file when you want me to send work into Project Flow.`,
      mission ? `Active project: ${mission.name}.` : `No active project is selected right now.`,
    ].join('\n');
  }

  if (/^(hi|hello|hey|yo|test|ping)\b/.test(normalized)) {
    return [
      `I'm online.`,
      mission ? `Active project: ${mission.name}.` : `No active project is selected right now.`,
      workingAgents.length
        ? `Working agents: ${workingAgents.map((agent) => `${agent.name}${agent.currentTask ? ` on ${agent.currentTask}` : ''}`).join('; ')}.`
      : `No agents are actively working right now.`,
    ].join('\n');
  }

  if (!await hasConfiguredModelProvider()) {
    return fallbackStatus();
  }

  try {
    const provider = await getActiveProvider('supr');
    const prompt = [
      `User message: ${content}`,
      '',
      'Current Supr context:',
      JSON.stringify({
        activeProject: mission ? {
          id: mission.id,
          name: mission.name,
          status: mission.status,
          objective: mission.objective || null,
        } : null,
        agents: agents.map((agent) => ({
          name: agent.name,
          role: agent.role,
          status: agent.status,
          currentTask: agent.currentTask,
          currentProject: agent.currentProject,
          permissionTier: agent.permissionTier,
        })),
      }),
      '',
      'Answer directly as Supr. Do not create, route, queue, or claim to execute Project Flow work.',
      'If the user is asking for work to be built, fixed, generated, run, or assigned, tell them to confirm the action so it can be routed.',
    ].join('\n');
    const response = await provider.generateContent(prompt, {
      systemInstruction: 'You are Supr, an agentic workspace coordinator. Answer concise direct chat questions with current context. Do not output JSON.',
      maxOutputTokens: 900,
    });
    return stripModelThinking(response).trim() || fallbackStatus();
  } catch (error) {
    console.warn('[SuprChat] Direct model response failed:', error);
    return fallbackStatus();
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

    const shouldRoute = shouldRouteSuprChatToProjectFlow(content, file);
    const finalContent = shouldRoute
      ? await (async () => {
          const routed = await routeIntakeToProjectFlow({
            source: 'supr-chat',
            content,
            attachments: file ? [{ name: file.name, type: file.type }] : [],
          });
          return routed.success
            ? [
                `Supr routed this into Project Flow.`,
                `- Spawned/updated the agent work graph.`,
                `- Queued agent-owned tasks instead of handling the work directly.`,
                `- Flow: ${routed.flowRunId}`,
                `- Status: ${routed.response}`,
              ].join('\n')
            : `Supr could not route this into Project Flow: ${routed.error}`;
        })()
      : await buildDirectSuprChatResponse(content);

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
    const newMissionId = `m-${Date.now()}`;
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
