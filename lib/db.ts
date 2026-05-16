import fs from 'fs/promises';
import path from 'path';
import { DatabaseSchema, Mission, Agent } from '@/types';

const DB_PATH = path.join(process.cwd(), 'data', 'db.json');

async function ensureDbExists() {
  try {
    await fs.access(DB_PATH);
  } catch {
    const dir = path.dirname(DB_PATH);
    await fs.mkdir(dir, { recursive: true });
    const initialData: DatabaseSchema = { missions: [], agents: [] };
    await fs.writeFile(DB_PATH, JSON.stringify(initialData, null, 2));
  }
}

export async function getDb(): Promise<DatabaseSchema> {
  await ensureDbExists();
  const data = await fs.readFile(DB_PATH, 'utf-8');
  return JSON.parse(data) as DatabaseSchema;
}

export async function saveDb(data: DatabaseSchema): Promise<void> {
  await ensureDbExists();
  await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// Helpers
export async function getActiveMission(): Promise<Mission | undefined> {
  const db = await getDb();
  return db.missions.find(m => m.status === 'Active');
}

export async function getAgents(): Promise<Agent[]> {
  const db = await getDb();
  return db.agents;
}

export async function addActivityLog(missionId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>): Promise<void> {
  const db = await getDb();
  const mission = db.missions.find(m => m.id === missionId);
  if (!mission) return;

  if (!mission.activityLog) mission.activityLog = [];
  mission.activityLog.push({
    ...event,
    id: `ev-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  });

  await saveDb(db);
}

export async function recordFailure(missionId: string, failure: Omit<FailureEvent, 'id' | 'resolved'>): Promise<void> {
  const db = await getDb();
  const mission = db.missions.find(m => m.id === missionId);
  if (!mission) return;

  if (!mission.failures) mission.failures = [];
  mission.failures.push({
    ...failure,
    id: `f-${Date.now()}`,
    resolved: false
  });

  await saveDb(db);
}

export async function resolveFailure(missionId: string, failureId: string, suprGuidance: string): Promise<void> {
  const db = await getDb();
  const mission = db.missions.find(m => m.id === missionId);
  if (!mission) return;

  const failure = mission.failures?.find(f => f.id === failureId);
  if (failure) {
    failure.suprGuidance = suprGuidance;
    failure.resolved = true;
  }

  await saveDb(db);
}

export async function updateTaskStatus(missionId: string, taskId: string, status: TaskStatus): Promise<void> {
  const db = await getDb();
  const mission = db.missions.find(m => m.id === missionId);
  if (!mission) return;

  const task = mission.tasks.find(t => t.id === taskId);
  if (task) {
    task.status = status;
  }

  await saveDb(db);
}
