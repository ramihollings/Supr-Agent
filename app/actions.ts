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
import { 
  ActivityEvent, 
  FailureEvent, 
  TaskStatus, 
  Artifact, 
  MemoryItem, 
  Mission, 
  Agent 
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

export async function logActivityAction(missionId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>) {
  try {
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
    const schema = FailureEventSchema.omit({ id: true, resolved: true });
    schema.parse(failure);
    await recordFailure(missionId, failure);
  } catch (error) {
    handleActionError(error);
  }
}

export async function resolveFailureAction(missionId: string, failureId: string, guidance: string) {
  try {
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
    await updateTaskStatus(missionId, taskId, status);
  } catch (error) {
    handleActionError(error);
  }
}

export async function addArtifactAction(missionId: string, artifact: Omit<Artifact, 'id'>) {
  try {
    const schema = ArtifactSchema.omit({ id: true });
    schema.parse(artifact);
    await addArtifact(missionId, artifact);
  } catch (error) {
    handleActionError(error);
  }
}

export async function updateArtifactAction(missionId: string, filename: string, content: string) {
  try {
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
import db from '@/lib/database/init';

export async function fetchSkillsState() {
  try {
    const rows = db.prepare(`SELECT * FROM Skills ORDER BY created_at DESC`).all() as any[];
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
    const stmt = db.prepare(`
      INSERT INTO Skills (id, name, description, provider, tools)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(id, skill.name, skill.description, skill.provider, JSON.stringify(skill.tools));
    return { success: true, id };
  } catch (error) {
    console.error("Failed to create skill:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteSkillAction(id: string) {
  try {
    db.prepare(`DELETE FROM Skills WHERE id = ?`).run(id);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete skill:", error);
    return { success: false, error: String(error) };
  }
}

export async function fetchCronJobsState() {
  try {
    const rows = db.prepare(`SELECT * FROM Cron_Jobs ORDER BY created_at DESC`).all() as any[];
    return rows.map(r => ({
      id: r.id,
      name: r.name,
      interval: r.interval,
      targetAction: r.target_action,
      lastRun: r.last_run,
      status: r.status
    }));
  } catch (error) {
    console.error("Failed to fetch cron jobs:", error);
    return [];
  }
}

export async function toggleCronJobAction(id: string, currentStatus: string) {
  try {
    const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
    db.prepare(`UPDATE Cron_Jobs SET status = ? WHERE id = ?`).run(newStatus, id);
    return { success: true, newStatus };
  } catch (error) {
    console.error("Failed to toggle cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function triggerCronJobAction(id: string) {
  try {
    const timeNow = new Date().toISOString();
    db.prepare(`UPDATE Cron_Jobs SET last_run = ? WHERE id = ?`).run(timeNow, id);
    return { success: true, lastRun: timeNow };
  } catch (error) {
    console.error("Failed to trigger cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function createCronJobAction(data: { name: string; interval: string; targetAction: string }) {
  try {
    const id = `cr-${Date.now()}`;
    db.prepare(`
      INSERT INTO Cron_Jobs (id, name, interval, target_action, last_run, status)
      VALUES (?, ?, ?, ?, NULL, 'Active')
    `).run(id, data.name, data.interval, data.targetAction);
    return { success: true, id };
  } catch (error) {
    console.error("Failed to create cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateCronJobAction(id: string, data: { name: string; interval: string; targetAction: string }) {
  try {
    db.prepare(`
      UPDATE Cron_Jobs SET name = ?, interval = ?, target_action = ? WHERE id = ?
    `).run(data.name, data.interval, data.targetAction, id);
    return { success: true };
  } catch (error) {
    console.error("Failed to update cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteCronJobAction(id: string) {
  try {
    db.prepare(`DELETE FROM Cron_Jobs WHERE id = ?`).run(id);
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
    const query = projectId
      ? `SELECT * FROM Event_Log WHERE mission_id = ? AND event_type IN ('delegation','handoff','review','approval','escalation','governance') ORDER BY timestamp DESC`
      : `SELECT * FROM Event_Log WHERE event_type IN ('delegation','handoff','review','approval','escalation','governance') ORDER BY timestamp DESC`;
    const rows = projectId
      ? db.prepare(query).all(projectId) as any[]
      : db.prepare(query).all() as any[];
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
    const agents = db.prepare(`SELECT * FROM Agents WHERE status = 'active'`).all() as any[];
    return agents.map(a => {
      // Find if agent has an active task
      const task = db.prepare(`SELECT title, status, mission_id FROM Tasks WHERE owner_agent_id = ? AND status = 'Active' LIMIT 1`).get(a.id) as any;
      let missionName = '';
      if (task) {
        const m = db.prepare(`SELECT title FROM Missions WHERE id = ?`).get(task.mission_id) as any;
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
    });
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
    const rows = db.prepare(`SELECT * FROM Settings`).all() as { key: string; value: string }[];
    const settingsObj: Record<string, string> = {};
    for (const r of rows) {
      settingsObj[r.key] = r.value;
    }
    return settingsObj;
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return {};
  }
}

export async function updateSettingAction(key: string, value: string) {
  try {
    db.prepare(`
      INSERT INTO Settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
    return { success: true };
  } catch (error) {
    console.error(`Failed to update setting ${key}:`, error);
    return { success: false, error: String(error) };
  }
}

// ----------------------------------------------------
// MEMORY BANK ACTIONS
// ----------------------------------------------------

export async function fetchMemoryItemsAction() {
  try {
    const rows = db.prepare(`SELECT * FROM Memory_Items ORDER BY created_at DESC`).all() as any[];
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
      db.prepare(`DELETE FROM Memory_Items`).run();
    } else {
      db.prepare(`DELETE FROM Memory_Items WHERE scope = ? OR type = ?`).run(scope, scope.toLowerCase());
    }
    return { success: true };
  } catch (error) {
    console.error("Failed to purge memory items:", error);
    return { success: false, error: String(error) };
  }
}

export async function addGlobalMemoryItemAction(key: string, value: string, importance: string, scope: string = 'User') {
  try {
    const stmt = db.prepare(`
      INSERT INTO Memory_Items (id, scope, type, content, importance)
      VALUES (?, ?, ?, ?, ?)
    `);
    const impVal = importance === 'High' ? 0.8 : importance === 'Medium' ? 0.5 : 0.2;
    stmt.run(
      `mem-${Date.now()}`,
      scope,
      'semantic',
      JSON.stringify({ key, value }),
      impVal
    );
    return { success: true };
  } catch (error) {
    console.error("Failed to add memory item:", error);
    return { success: false, error: String(error) };
  }
}


