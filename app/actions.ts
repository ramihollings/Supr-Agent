"use server"

import { getActiveMission, getAgents } from '@/lib/db';
import { Mission, Agent } from '@/types';

export async function fetchMissionState(): Promise<Mission | undefined> {
  return await getActiveMission();
}

export async function fetchAgentsState(): Promise<Agent[]> {
  return await getAgents();
}
