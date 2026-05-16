"use server"

import { getActiveMission, getAgents } from '@/lib/db';
import { Mission, Agent } from '@/types';

export async function fetchMissionState(): Promise<Mission | undefined> {
  return await getActiveMission();
}

export async function fetchAgentsState(): Promise<Agent[]> {
  return await getAgents();
}

import { addActivityLog, recordFailure, resolveFailure, updateTaskStatus } from '@/lib/db';
import { ActivityEvent, FailureEvent, TaskStatus } from '@/types';

export async function logActivityAction(missionId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>) {
  await addActivityLog(missionId, event);
}

export async function recordFailureAction(missionId: string, failure: Omit<FailureEvent, 'id' | 'resolved'>) {
  await recordFailure(missionId, failure);
}

export async function resolveFailureAction(missionId: string, failureId: string, guidance: string) {
  await resolveFailure(missionId, failureId, guidance);
}

export async function updateTaskStatusAction(missionId: string, taskId: string, status: TaskStatus) {
  await updateTaskStatus(missionId, taskId, status);
}
