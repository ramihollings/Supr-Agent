import db from './database/init';
import { DatabaseSchema, Mission, Agent, TaskStatus, ActivityEvent, FailureEvent, Artifact, MemoryItem, Phase, Task } from '@/types';

// Backward compatibility stub for initialization
export async function ensureDbExists() {
  // Handled by init.ts natively
}

export async function getDb(): Promise<DatabaseSchema> {
  const agents = await getAgents();
  const missions = db.prepare(`SELECT id FROM Missions`).all() as {id: string}[];
  const fullMissions = await Promise.all(missions.map(m => getMissionById(m.id)));
  return { agents, missions: fullMissions.filter(Boolean) as Mission[] };
}

export async function saveDb(data: DatabaseSchema): Promise<void> {
  console.warn("saveDb is deprecated. Supr v3.5 writes directly to SQLite.");
}

async function getMissionById(id: string): Promise<Mission | undefined> {
  const row = db.prepare(`SELECT * FROM Missions WHERE id = ?`).get(id) as any;
  if (!row) return undefined;
  
  const gp = db.prepare(`SELECT * FROM Glidepaths WHERE mission_id = ?`).get(id) as any;
  let phases: Phase[] = [];
  let tasks: Task[] = [];
  if (gp) {
     try { phases = JSON.parse(gp.phases || '[]'); } catch(e){}
     try { tasks = JSON.parse(gp.tasks || '[]'); } catch(e){}
  }
  
  const dbTasks = db.prepare(`SELECT * FROM Tasks WHERE mission_id = ?`).all(id) as any[];
  const mappedTasks = dbTasks.map(t => ({
    id: t.id,
    title: t.title,
    description: '',
    agentName: t.owner_agent_id || 'Supr',
    agentIcon: 'smart_toy',
    status: t.status
  }));

  const events = db.prepare(`SELECT * FROM Event_Log WHERE mission_id = ?`).all(id) as any[];
  const failures = db.prepare(`SELECT * FROM Failure_Events WHERE mission_id = ?`).all(id) as any[];
  const artifacts = db.prepare(`SELECT * FROM Artifacts WHERE mission_id = ?`).all(id) as any[];
  const memoryItems = db.prepare(`SELECT * FROM Memory_Items WHERE mission_id = ?`).all(id) as any[];

  return {
    id: row.id,
    name: row.title,
    objective: row.goal || '',
    status: row.status,
    readinessScore: gp ? gp.readiness_score : 0,
    phases,
    tasks: mappedTasks.length > 0 ? mappedTasks : tasks,
    messages: [], 
    activityLog: events.map(e => {
       let det = '';
       try { det = JSON.parse(e.metadata).detail; } catch(err){}
       return {
         id: e.id,
         eventType: e.event_type,
         actor: e.actor_id,
         actorIcon: 'smart_toy',
         summary: e.summary,
         detail: det,
         timestamp: e.timestamp
       }
    }),
    failures: failures.map(f => ({
       id: f.id,
       taskId: f.task_id,
       agentName: f.agent_id,
       failureType: f.failure_type,
       attemptNumber: f.attempt_number,
       summary: f.failure_summary,
       suprGuidance: f.supr_guidance,
       resolved: f.resolution_status === 'resolved'
    })),
    artifacts: artifacts.map(a => ({
       id: a.id,
       filename: a.title,
       type: a.type,
       content: a.content
    })),
    memoryItems: memoryItems.map(m => {
       let key = ''; let val = '';
       try { const p = JSON.parse(m.content); key = p.key; val = p.value; } catch(err){}
       return {
         id: m.id,
         key: key,
         value: val,
         importance: m.importance > 0.7 ? 'High' : 'Medium'
       }
    })
  } as Mission;
}

export async function getActiveMission(): Promise<Mission | undefined> {
  const row = db.prepare(`SELECT id FROM Missions WHERE status = 'Active' LIMIT 1`).get() as any;
  if (!row) return undefined;
  return getMissionById(row.id);
}

export async function getAgents(): Promise<Agent[]> {
  const rows = db.prepare(`SELECT * FROM Agents`).all() as any[];
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    role: r.role,
    icon: 'smart_toy',
    isActive: r.status === 'active',
    permissionTier: r.permission_tier,
    isPermanent: r.type === 'permanent',
    description: '',
  }));
}

export async function addActivityLog(missionId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO Event_Log (id, mission_id, event_type, actor_type, actor_id, summary, metadata, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    `ev-${Date.now()}`,
    missionId,
    event.eventType,
    'agent',
    event.actor,
    event.summary,
    JSON.stringify({ detail: event.detail }),
    new Date().toISOString()
  );
}

export async function recordFailure(missionId: string, failure: Omit<FailureEvent, 'id' | 'resolved'>): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO Failure_Events (id, mission_id, task_id, agent_id, failure_type, attempt_number, failure_summary, supr_guidance, resolution_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    `f-${Date.now()}`,
    missionId,
    failure.taskId,
    failure.agentName,
    failure.failureType,
    failure.attemptNumber,
    failure.summary,
    failure.suprGuidance || '',
    'unresolved'
  );
}

export async function resolveFailure(missionId: string, failureId: string, suprGuidance: string): Promise<void> {
  const stmt = db.prepare(`
    UPDATE Failure_Events SET supr_guidance = ?, resolution_status = 'resolved' WHERE id = ?
  `);
  stmt.run(suprGuidance, failureId);
}

export async function updateTaskStatus(missionId: string, taskId: string, status: TaskStatus): Promise<void> {
  const stmt = db.prepare(`UPDATE Tasks SET status = ? WHERE id = ?`);
  stmt.run(status, taskId);
}

export async function addArtifact(missionId: string, artifact: Omit<Artifact, 'id'>): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO Artifacts (id, mission_id, type, title, content)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(`art-${Date.now()}`, missionId, artifact.type, artifact.filename, artifact.content);
}

export async function addMemoryItem(missionId: string, item: Omit<MemoryItem, 'id'>): Promise<void> {
  const stmt = db.prepare(`
    INSERT INTO Memory_Items (id, mission_id, type, content, importance)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    `mem-${Date.now()}`, 
    missionId, 
    'semantic', 
    JSON.stringify({ key: item.key, value: item.value }),
    item.importance === 'High' ? 0.8 : 0.5
  );
}

export async function createMission(missionData: Omit<Mission, 'id'>): Promise<Mission> {
  const newMissionId = `m-${Date.now()}`;
  
  // Optional: Set existing active missions to 'Done' if new one is active
  if (missionData.status === 'Active') {
    db.prepare(`UPDATE Missions SET status = 'Done' WHERE status = 'Active'`).run();
  }

  const insertMission = db.prepare(`
    INSERT INTO Missions (id, title, goal, status)
    VALUES (?, ?, ?, ?)
  `);
  
  const insertGlidepath = db.prepare(`
    INSERT INTO Glidepaths (id, mission_id, phases, tasks, readiness_score)
    VALUES (?, ?, ?, ?, ?)
  `);

  db.transaction(() => {
    insertMission.run(
      newMissionId,
      missionData.name,
      missionData.objective,
      missionData.status
    );

    insertGlidepath.run(
      `gp-${newMissionId}`,
      newMissionId,
      JSON.stringify(missionData.phases || []),
      JSON.stringify(missionData.tasks || []),
      missionData.readinessScore || 0
    );
  })();

  const newMission = await getMissionById(newMissionId);
  if (!newMission) throw new Error("Failed to create mission in database.");
  return newMission;
}

export async function createAgent(agentData: Omit<Agent, 'id'>): Promise<Agent> {
  const newAgentId = `a-${Date.now()}`;
  
  const insertAgent = db.prepare(`
    INSERT INTO Agents (id, workspace_id, name, role, type, permission_tier, tools, status, retry_limit, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAgent.run(
    newAgentId,
    null,
    agentData.name,
    agentData.role,
    agentData.isPermanent ? 'permanent' : 'temporary',
    agentData.permissionTier,
    '[]',
    'active',
    3,
    0
  );

  return { ...agentData, id: newAgentId, isActive: true };
}

export async function archiveAgent(agentId: string): Promise<void> {
  db.prepare(`UPDATE Agents SET status = 'archived' WHERE id = ?`).run(agentId);
}

export async function deleteAgent(agentId: string): Promise<void> {
  db.prepare(`DELETE FROM Agents WHERE id = ?`).run(agentId);
}

export async function extendAgent(agentId: string): Promise<void> {
  // Simple representation of extending a temporary agent's life.
  // We can track expiration dates, but for now we reset the status or log it.
  db.prepare(`UPDATE Agents SET status = 'active' WHERE id = ?`).run(agentId);
}
