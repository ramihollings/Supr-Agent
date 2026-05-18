"use server"

import { 
  getActiveMission, 
  getAgents, 
  addActivityLog, 
  recordFailure, 
  resolveFailure, 
  updateTaskStatus, 
  addArtifact, 
  addMemoryItem,
  getDb,
  saveDb,
  createMission,
  createAgent,
  archiveAgent,
  deleteAgent,
  extendAgent
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
