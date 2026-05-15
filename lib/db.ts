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
