import dbClient from './database/db_client';
import crypto from 'crypto';
import { DatabaseSchema, Mission, Agent, TaskStatus, ActivityEvent, FailureEvent, Artifact, MemoryItem, Phase, Task } from '@/types';

// Backward compatibility stub for initialization
export async function ensureDbExists() {
  // Handled by dbClient natively
}

/**
 * Generate a unique prefixed ID. Uses crypto.randomUUID() so parallel
 * writers (rapid agent runs, concurrent artifact saves) never collide
 * on the primary key. Previously these IDs used `Date.now()` which can
 * produce duplicate values when two writes happen in the same millisecond.
 */
function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function getDb(): Promise<DatabaseSchema> {
  const agents = await getAgents();
  const missions = await dbClient.query<{ id: string }>(`SELECT id FROM Missions`);
  const fullMissions = await getMissionsBatch(missions.map((m) => m.id));
  return { agents, missions: fullMissions };
}

/**
 * Load many missions in a fixed number of queries, regardless of the
 * number of missions.
 *
 * The previous implementation called getMissionById once per mission,
 * which itself does 7-8 queries (Missions, Glidepaths, Tasks,
 * Event_Log, Failure_Events, Artifacts, Memory_Items). For 50
 * missions that was ~400 round-trips on every dashboard mount.
 *
 * This implementation issues 7 batched queries (one per related
 * table) keyed by the IN list of mission ids, then assembles the
 * Mission objects in JavaScript. Cost is O(1) in mission count.
 *
 * Self-healing seed artifacts (the markdown / python / json stubs
 * that getMissionById inserts when a mission has no Artifacts rows)
 * are NOT applied here. getDb() is used as a read snapshot; a
 * mission that happens to have no Artifacts is just returned with an
 * empty list, which the UI already handles.
 */
export async function getMissionsBatch(missionIds: string[]): Promise<Mission[]> {
  if (missionIds.length === 0) return [];
  const placeholders = missionIds.map(() => '?').join(',');

  const [missionRows, glideRows, taskRows, eventRows, failureRows, artifactRows, memoryRows] = await Promise.all([
    dbClient.query<any>(`SELECT * FROM Missions WHERE id IN (${placeholders})`, missionIds),
    dbClient.query<any>(`SELECT * FROM Glidepaths WHERE mission_id IN (${placeholders})`, missionIds),
    dbClient.query<any>(`SELECT * FROM Tasks WHERE mission_id IN (${placeholders})`, missionIds),
    dbClient.query<any>(`SELECT * FROM Event_Log WHERE mission_id IN (${placeholders})`, missionIds),
    dbClient.query<any>(`SELECT * FROM Failure_Events WHERE mission_id IN (${placeholders})`, missionIds),
    dbClient.query<any>(`SELECT * FROM Artifacts WHERE mission_id IN (${placeholders})`, missionIds),
    dbClient.query<any>(`SELECT * FROM Memory_Items WHERE mission_id IN (${placeholders})`, missionIds),
  ]);

  const glideById = new Map<string, any>();
  for (const row of glideRows) glideById.set(row.mission_id, row);

  const tasksById = new Map<string, any[]>();
  for (const row of taskRows) {
    const list = tasksById.get(row.mission_id) || [];
    list.push(row);
    tasksById.set(row.mission_id, list);
  }

  const eventsById = new Map<string, any[]>();
  for (const row of eventRows) {
    const list = eventsById.get(row.mission_id) || [];
    list.push(row);
    eventsById.set(row.mission_id, list);
  }

  const failuresById = new Map<string, any[]>();
  for (const row of failureRows) {
    const list = failuresById.get(row.mission_id) || [];
    list.push(row);
    failuresById.set(row.mission_id, list);
  }

  const artifactsById = new Map<string, any[]>();
  for (const row of artifactRows) {
    const list = artifactsById.get(row.mission_id) || [];
    list.push(row);
    artifactsById.set(row.mission_id, list);
  }

  const memoryById = new Map<string, any[]>();
  for (const row of memoryRows) {
    const list = memoryById.get(row.mission_id) || [];
    list.push(row);
    memoryById.set(row.mission_id, list);
  }

  const out: Mission[] = [];
  for (const row of missionRows) {
    const dbTasks = tasksById.get(row.id) || [];
    const mappedTasks = dbTasks.map((t: any) => ({
      id: t.id,
      title: t.title,
      description: '',
      agentName: t.owner_agent_id || 'Supr',
      agentIcon: 'smart_toy',
      status: t.status,
    }));

    let phases: Phase[] = dbTasks.length > 0 ? phaseListFromStatuses(phaseStatusFromTaskStatuses(dbTasks)) : [];
    if (phases.length === 0) {
      const gp = glideById.get(row.id);
      if (gp) {
        try { phases = JSON.parse(gp.phases || '[]'); } catch { /* ignore */ }
      }
    }
    if (phases.length === 0) {
      phases = ['Intake', 'Research', 'Build', 'Verify', 'Deliver'].map((name) => ({
        id: `phase-${name.toLowerCase()}`,
        name,
        status: 'Pending' as const,
      }));
    }

    const gp = glideById.get(row.id);
    const legacyTasks: Task[] = gp
      ? (() => { try { return JSON.parse(gp.tasks || '[]'); } catch { return []; } })()
      : [];

    const events = eventsById.get(row.id) || [];
    const failures = failuresById.get(row.id) || [];
    const artifacts = artifactsById.get(row.id) || [];
    const memoryItems = memoryById.get(row.id) || [];

    out.push({
      id: row.id,
      name: row.title,
      objective: row.goal || '',
      status: row.status,
      readinessScore: gp ? gp.readiness_score : 0,
      phases,
      tasks: mappedTasks.length > 0 ? mappedTasks : legacyTasks,
      messages: [],
      activityLog: events.map((e: any) => {
        let det = '';
        try { det = JSON.parse(e.metadata).detail; } catch { /* ignore */ }
        return {
          id: e.id,
          eventType: e.event_type,
          actor: e.actor_id,
          actorIcon: 'smart_toy',
          summary: e.summary,
          detail: det,
          timestamp: e.timestamp,
        };
      }),
      failures: failures.map((f: any) => ({
        id: f.id,
        taskId: f.task_id,
        agentName: f.agent_id,
        failureType: f.failure_type,
        attemptNumber: f.attempt_number,
        summary: f.failure_summary,
        suprGuidance: f.supr_guidance,
        resolved: f.resolution_status === 'resolved',
      })),
      artifacts: artifacts.map((a: any) => ({
        id: a.id,
        filename: a.title,
        type: a.type,
        content: a.content,
      })),
      memoryItems: memoryItems.map((m: any) => ({
        id: m.id,
        key: m.key,
        value: m.value,
        category: m.category,
        importance: m.importance,
        pinned: !!m.pinned,
      })),
    });
  }
  return out;
}

export async function saveDb(data: DatabaseSchema): Promise<void> {
  console.warn("saveDb is deprecated. Supr writes directly to the database.");
}

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * In-process TTL cache for getMissionById.
 *
 * getMissionById does 7-8 SELECTs per call. The /api/mission/stream
 * route calls it on its 10s safety-net poll AND on every bus event;
 * the chat calls it on every loadData() invocation; the actions
 * router calls it on every fetchMissionByIdAction. Without a cache
 * a single dashboard with an active stream can drive 5-10
 * multi-query calls per second.
 *
 * The TTL is 1 second -- short enough that a 1s-old read on a fresh
 * mutation is fine, long enough to absorb the burst pattern of "the
 * stream hits /api/mission/state, then 100ms later the chat hits it
 * too." Invalidating on every write is not necessary at this TTL.
 */
const MISSION_CACHE_TTL_MS = 1_000;
interface MissionCacheEntry {
  mission: Mission | undefined;
  expiresAt: number;
}
const missionCache = new Map<string, MissionCacheEntry>();

export function invalidateMissionCache(missionId?: string): void {
  if (missionId) {
    missionCache.delete(missionId);
  } else {
    missionCache.clear();
  }
}

const PHASE_NAMES = ['Intake', 'Research', 'Build', 'Verify', 'Deliver'] as const;

function phaseListFromStatuses(statuses: Map<string, 'Done' | 'Active' | 'Pending'>): Phase[] {
  return PHASE_NAMES.map((name) => ({
    id: `phase-${name.toLowerCase()}`,
    name,
    status: statuses.get(name) || 'Pending',
  }));
}

/**
 * Derive the mission's phase list from the relational Tasks table.
 *
 * The Glidepaths.phases JSON column was previously the source of
 * truth for the 5 hardcoded mission phases. The runtime wrote a
 * constant shape into it on every flow event, which made the JSON a
 * no-op round-trip and the Tasks table the actual source of truth.
 *
 * The derivation is a small GROUP BY over Tasks.phase_id: any phase
 * with at least one pending task is "Active", all-completed is
 * "Done", no-tasks-yet is "Pending". Phases are emitted in the
 * canonical Intake -> Deliver order.
 *
 * If a mission has no Tasks rows yet (e.g. freshly created and the
 * runtime has not run), this returns an all-Pending skeleton so the
 * UI still renders the phase rail.
 */
export function phaseStatusFromTaskStatuses(tasks: Array<{ phase_id: string | null; status: string | null }>): Map<string, 'Done' | 'Active' | 'Pending'> {
  const result = new Map<string, 'Done' | 'Active' | 'Pending'>();
  for (const name of PHASE_NAMES) result.set(name, 'Pending');
  for (const task of tasks) {
    const phase = (task.phase_id || '').trim();
    if (!result.has(phase)) continue;
    const status = (task.status || '').toLowerCase();
    if (status === 'failed' || status === 'pending' || status === 'running' || status === 'in_progress') {
      // Mark this phase Active as soon as any task in it is in flight.
      result.set(phase, 'Active');
    } else if (status === 'completed') {
      // A task is only Done after the phase is no longer Active. We
      // check the current value via the Map and skip if Active is set.
      if (result.get(phase) !== 'Active') {
        result.set(phase, 'Done');
      }
    }
  }
  return result;
}

export async function derivePhasesFromTasks(missionId: string): Promise<Phase[]> {
  const rows = await dbClient.query<{ phase_id: string | null; status: string | null }>(
    `SELECT phase_id, status FROM Tasks WHERE mission_id = ?`,
    [missionId],
  );
  return phaseListFromStatuses(phaseStatusFromTaskStatuses(rows));
}

export async function getMissionById(id: string): Promise<Mission | undefined> {
  const cached = missionCache.get(id);
  if (cached && cached.expiresAt > Date.now()) return cached.mission;
  const result = await getMissionByIdUncached(id);
  missionCache.set(id, { mission: result, expiresAt: Date.now() + MISSION_CACHE_TTL_MS });
  return result;
}

async function getMissionByIdUncached(id: string): Promise<Mission | undefined> {
  const row = await dbClient.queryOne<any>(`SELECT * FROM Missions WHERE id = ?`, [id]);
  if (!row) return undefined;

  const gp = await dbClient.queryOne<any>(`SELECT * FROM Glidepaths WHERE mission_id = ?`, [id]);
  let tasks: Task[] = [];
  if (gp) {
     try { tasks = JSON.parse(gp.tasks || '[]'); } catch(e){}
  }

  const dbTasks = await dbClient.query<any>(`SELECT * FROM Tasks WHERE mission_id = ?`, [id]);
  const mappedTasks = dbTasks.map(t => ({
    id: t.id,
    title: t.title,
    description: '',
    agentName: t.owner_agent_id || 'Supr',
    agentIcon: 'smart_toy',
    status: t.status
  }));

  // Phases are derived from the relational Tasks table. Falls back to
  // the Glidepaths JSON column for legacy data where the table was
  // empty but the JSON was still authoritative.
    let phases: Phase[] = dbTasks.length > 0
      ? phaseListFromStatuses(phaseStatusFromTaskStatuses(dbTasks))
      : [];
  if (phases.length === 0 && gp) {
    try { phases = JSON.parse(gp.phases || '[]'); } catch(e){}
  }
  if (phases.length === 0) {
    phases = (await derivePhasesFromTasks(id)).map(p => ({ ...p, status: 'Pending' as const }));
  }

  const events = await dbClient.query<any>(`SELECT * FROM Event_Log WHERE mission_id = ?`, [id]);
  const failures = await dbClient.query<any>(`SELECT * FROM Failure_Events WHERE mission_id = ?`, [id]);
  let artifacts = await dbClient.query<any>(`SELECT * FROM Artifacts WHERE mission_id = ?`, [id]);
  
  if (artifacts.length === 0) {
    const timeNow = Date.now();
    const briefingContent = `# Strategic Briefing: ${row.title}\n\n## Core Objective\n${row.goal || 'No goal set'}\n\n## Architectural Execution Plan\n1. Establish robust semantic and lexical context indexing using Local Node Sandboxing.\n2. Leverage Anthropic skills (frontend-design and mcp-builder) to compile modern, reactive Web components.\n3. Execute complete AST verification lints prior to deployment.`;
    const pythonContent = `import json\n\ndef audit_project_integrity(name, status):\n    print(f"[AUDIT] Starting integrity validation for: {name}")\n    print(f"[AUDIT] Status check: {status}")\n    return {"integrity_status": "PASS", "score": 1.0}\n\ncheck = audit_project_integrity("${row.title}", "${row.status}")\nprint(json.dumps(check, indent=2))`;
    const jsonContent = JSON.stringify({
      project: row.title,
      readiness_threshold: 0.85,
      milestones: [
        { name: "Initial Context Scan", complete: true },
        { name: "Pain Group Analysis", complete: true },
        { name: "Implementation Sandbox Auditing", complete: false },
        { name: "Production Deployment", complete: false }
      ]
    }, null, 2);

    try {
      await dbClient.runTransaction([
        {
          sql: `INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)`,
          params: [`art-brief-${timeNow}`, id, 'markdown', 'strategic_briefing.md', briefingContent]
        },
        {
          sql: `INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)`,
          params: [`art-audit-${timeNow}`, id, 'code', 'integrity_audit.py', pythonContent]
        },
        {
          sql: `INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)`,
          params: [`art-check-${timeNow}`, id, 'json', 'project_checklists.json', jsonContent]
        }
      ]);
      artifacts = await dbClient.query<any>(`SELECT * FROM Artifacts WHERE mission_id = ?`, [id]);
    } catch (e) {
      console.error("Failed to self-heal seed artifacts:", e);
    }
  }

  const memoryItems = await dbClient.query<any>(`SELECT * FROM Memory_Items WHERE mission_id = ?`, [id]);

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
  const row = await dbClient.queryOne<any>(`SELECT id FROM Missions WHERE status = 'Active' LIMIT 1`);
  if (!row) return undefined;
  return getMissionById(row.id);
}

export async function getAgents(): Promise<Agent[]> {
  const rows = await dbClient.query<any>(`SELECT * FROM Agents`);
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
  const sql = `
    INSERT INTO Event_Log (id, mission_id, event_type, actor_type, actor_id, summary, metadata, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await dbClient.execute(sql, [
    id('ev'),
    missionId,
    event.eventType,
    'agent',
    event.actor,
    event.summary,
    JSON.stringify({ detail: event.detail }),
    new Date().toISOString()
  ]);
}

export async function recordFailure(missionId: string, failure: Omit<FailureEvent, 'id' | 'resolved'>): Promise<void> {
  const sql = `
    INSERT INTO Failure_Events (id, mission_id, task_id, agent_id, failure_type, attempt_number, failure_summary, supr_guidance, resolution_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  await dbClient.execute(sql, [
    newId('f'),
    missionId,
    failure.taskId,
    failure.agentName,
    failure.failureType,
    failure.attemptNumber,
    failure.summary,
    failure.suprGuidance || '',
    'unresolved'
  ]);
}

export async function resolveFailure(missionId: string, failureId: string, suprGuidance: string): Promise<void> {
  const sql = `UPDATE Failure_Events SET supr_guidance = ?, resolution_status = 'resolved' WHERE id = ?`;
  await dbClient.execute(sql, [suprGuidance, failureId]);
}

export async function updateTaskStatus(missionId: string, taskId: string, status: TaskStatus): Promise<void> {
  const sql = `UPDATE Tasks SET status = ? WHERE id = ?`;
  await dbClient.execute(sql, [status, taskId]);
}

export async function addArtifact(missionId: string, artifact: Omit<Artifact, 'id'>): Promise<void> {
  const id = newId('art');
  const sql = `
    INSERT INTO Artifacts (id, mission_id, type, title, content)
    VALUES (?, ?, ?, ?, ?)
  `;
  await dbClient.execute(sql, [id, missionId, artifact.type, artifact.filename, artifact.content]);
  await dbClient.execute(
    `INSERT INTO Artifact_Versions (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [newId('av'), id, missionId, artifact.filename, artifact.type, artifact.content, 1, 'draft', 'Supr', `${artifact.content.split('\n').length} lines created`]
  );
}

export async function updateArtifact(missionId: string, title: string, content: string): Promise<void> {
  const artifact = await dbClient.queryOne<any>(`SELECT * FROM Artifacts WHERE mission_id = ? AND title = ?`, [missionId, title]);
  const latest = await dbClient.queryOne<any>(`SELECT MAX(version) as version FROM Artifact_Versions WHERE mission_id = ? AND title = ?`, [missionId, title]);
  const sql = `UPDATE Artifacts SET content = ? WHERE mission_id = ? AND title = ?`;
  await dbClient.execute(sql, [content, missionId, title]);
  await dbClient.execute(
    `INSERT INTO Artifact_Versions (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      newId('av'),
      artifact?.id || null,
      missionId,
      title,
      artifact?.type || 'markdown',
      content,
      Number(latest?.version || 0) + 1,
      'draft',
      'Code Agent',
      `${content.split('\n').length} lines updated`
    ]
  );
}

export async function addMemoryItem(missionId: string, item: Omit<MemoryItem, 'id'>): Promise<void> {
  const sql = `
    INSERT INTO Memory_Items (id, mission_id, type, content, importance)
    VALUES (?, ?, ?, ?, ?)
  `;
  await dbClient.execute(sql, [
    newId('mem'),
    missionId, 
    'semantic', 
    JSON.stringify({ key: item.key, value: item.value }),
    item.importance === 'High' ? 0.8 : 0.5
  ]);
}

export async function createMission(missionData: Omit<Mission, 'id'>): Promise<Mission> {
  const newMissionId = newId('m');

  await dbClient.runTransaction([
    {
      sql: `INSERT INTO Missions (id, title, goal, status) VALUES (?, ?, ?, ?)`,
      params: [newMissionId, missionData.name, missionData.objective, missionData.status]
    },
    {
      sql: `INSERT INTO Glidepaths (id, mission_id, tasks, readiness_score) VALUES (?, ?, ?, ?)`,
      params: [`gp-${newMissionId}`, newMissionId, JSON.stringify(missionData.tasks || []), missionData.readinessScore || 0]
    },
    {
      sql: `INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)`,
      params: [
        newId('art-brief'),
        newMissionId,
        'markdown',
        'strategic_briefing.md',
        `# Strategic Briefing: ${missionData.name}\n\n## Objective\n${missionData.objective}\n\n## Implementation Steps\n1. Ingest customer and market feedback signals.\n2. Analyze core bottlenecks in serialization layers.\n3. Validate test quality in the Local Sandbox.\n4. Trigger QA validation before final product delivery.`
      ]
    },
    {
      sql: `INSERT INTO Artifacts (id, mission_id, type, title, content) VALUES (?, ?, ?, ?, ?)`,
      params: [
        newId('art-check'),
        newMissionId,
        'json',
        'project_checklists.json',
        JSON.stringify({
          project: missionData.name,
          readiness_threshold: 0.85,
          milestones: [
            { name: "Initial Context Scan", complete: true },
            { name: "Pain Group Analysis", complete: true },
            { name: "Implementation Sandbox Auditing", complete: false },
            { name: "Production Deployment", complete: false }
          ]
        }, null, 2)
      ]
    }
  ]);

  const newMission = await getMissionById(newMissionId);
  if (!newMission) throw new Error("Failed to create mission in database.");
  return newMission;
}

export async function createAgent(agentData: Omit<Agent, 'id'>): Promise<any> {
  const newAgentId = id('a');
  
  const sql = `
    INSERT INTO Agents (id, workspace_id, name, role, type, permission_tier, tools, status, retry_limit, retry_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  let defaultTools = '[]';
  let injectedSkills = '';
  const roleLower = agentData.role.toLowerCase();
  
  if (roleLower.includes('research')) {
    defaultTools = '["web_scrape"]';
  } else if (roleLower.includes('engineer') || roleLower.includes('code') || roleLower.includes('developer')) {
    defaultTools = '["github_create_issue", "slack_send_message", "obra_superpowers"]';
  }

  // Anthropic Skill Injection Mappings
  if (roleLower.includes('frontend')) {
    injectedSkills = `[ANTHROPIC SKILL: frontend-design]
- Use Tailwind CSS exclusively.
- Implement accessible, semantic HTML5.
- Optimize for mobile-first responsive design.`;
  } else if (roleLower.includes('architect') || roleLower.includes('tool')) {
    injectedSkills = `[ANTHROPIC SKILL: mcp-builder]
- Implement Model Context Protocol (MCP) compatible server schemas.
- Ensure all tool outputs return JSON-RPC 2.0 structures.
[ANTHROPIC SKILL: skill-creator]
- System prompts must be deterministic and declarative.`;
  } else if (roleLower.includes('engineer') || roleLower.includes('code') || roleLower.includes('developer')) {
    injectedSkills = `[CLAUDE CODE TOOLKIT: core-rules]
- Perform Architecture Audits before writing executing CLI code.
- Enforce strict test-quality checks and security linting in the Local Sandbox.
- Maintain persistent context. Avoid redundant operations. Stop loops early.`;
  }

  const memoryContext = `[LIVE MEMORY CONTEXT]
- New agent initialized with current role, tools, and permission tier.
- Runtime memory will be populated from persisted project events and approved evidence.`;

  await dbClient.execute(sql, [
    newAgentId,
    null,
    agentData.name,
    agentData.role,
    agentData.isPermanent ? 'permanent' : 'temporary',
    agentData.permissionTier,
    defaultTools,
    'active',
    3,
    0
  ]);

  return { ...agentData, id: newAgentId, isActive: true, injectedSkills, memoryContext, tools: JSON.parse(defaultTools) };
}

export async function archiveAgent(agentId: string): Promise<void> {
  const sql = `UPDATE Agents SET status = 'archived' WHERE id = ?`;
  await dbClient.execute(sql, [agentId]);
}

export async function deleteAgent(agentId: string): Promise<void> {
  const sql = `DELETE FROM Agents WHERE id = ?`;
  await dbClient.execute(sql, [agentId]);
}

export async function extendAgent(agentId: string): Promise<void> {
  const sql = `UPDATE Agents SET status = 'active' WHERE id = ?`;
  await dbClient.execute(sql, [agentId]);
}
