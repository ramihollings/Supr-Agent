import db from './init';
import fs from 'fs';
import path from 'path';

const DB_JSON_PATH = path.join(process.cwd(), 'data', 'db.json');

export function migrate() {
  if (!fs.existsSync(DB_JSON_PATH)) {
    console.log('No db.json found, skipping migration.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(DB_JSON_PATH, 'utf-8'));

  db.pragma('foreign_keys = OFF');

  db.transaction(() => {
    // 1. Migrate Agents
    const insertAgent = db.prepare(`
      INSERT OR REPLACE INTO Agents (id, name, role, type, permission_tier, status)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const agent of data.agents || []) {
      insertAgent.run(
        agent.id,
        agent.name,
        agent.role,
        agent.isPermanent ? 'permanent' : 'temporary',
        agent.permissionTier,
        agent.isActive ? 'active' : 'inactive'
      );
    }

    // 2. Migrate Missions
    const insertMission = db.prepare(`
      INSERT OR REPLACE INTO Missions (id, title, goal, status)
      VALUES (?, ?, ?, ?)
    `);
    
    const insertGlidepath = db.prepare(`
      INSERT OR REPLACE INTO Glidepaths (id, mission_id, phases, tasks, readiness_score)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertTask = db.prepare(`
      INSERT OR REPLACE INTO Tasks (id, mission_id, title, status, owner_agent_id)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertEvent = db.prepare(`
      INSERT OR REPLACE INTO Event_Log (id, mission_id, event_type, actor_type, actor_id, summary, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertFailure = db.prepare(`
      INSERT OR REPLACE INTO Failure_Events (id, mission_id, task_id, agent_id, failure_type, attempt_number, failure_summary, supr_guidance, resolution_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertArtifact = db.prepare(`
      INSERT OR REPLACE INTO Artifacts (id, mission_id, type, title, content)
      VALUES (?, ?, ?, ?, ?)
    `);

    const insertMemory = db.prepare(`
      INSERT OR REPLACE INTO Memory_Items (id, mission_id, type, content, importance)
      VALUES (?, ?, ?, ?, ?)
    `);

    for (const mission of data.missions || []) {
      insertMission.run(
        mission.id,
        mission.name,
        mission.objective,
        mission.status
      );

      insertGlidepath.run(
        `gp-${mission.id}`,
        mission.id,
        JSON.stringify(mission.phases || []),
        JSON.stringify(mission.tasks || []),
        mission.readinessScore || 0
      );

      for (const task of mission.tasks || []) {
        const agent = data.agents?.find((a: any) => a.name === task.agentName);
        insertTask.run(
          task.id,
          mission.id,
          task.title,
          task.status,
          agent ? agent.id : task.agentName
        );
      }

      for (const ev of mission.activityLog || []) {
        insertEvent.run(
          ev.id || `ev-${Date.now()}-${Math.random()}`,
          mission.id,
          ev.eventType,
          'agent',
          ev.actor,
          ev.summary,
          JSON.stringify({ detail: ev.detail }),
          new Date().toISOString()
        );
      }

      for (const fail of mission.failures || []) {
        insertFailure.run(
          fail.id,
          mission.id,
          fail.taskId,
          fail.agentName,
          fail.failureType,
          fail.attemptNumber,
          fail.summary,
          fail.suprGuidance,
          fail.resolved ? 'resolved' : 'unresolved'
        );
      }

      for (const art of mission.artifacts || []) {
        insertArtifact.run(
          art.id,
          mission.id,
          art.type,
          art.filename,
          art.content
        );
      }

      for (const mem of mission.memoryItems || []) {
        insertMemory.run(
          mem.id,
          mission.id,
          'semantic',
          JSON.stringify({ key: mem.key, value: mem.value }),
          mem.importance === 'High' ? 0.8 : 0.5
        );
      }
    }
  })();
  
  console.log('Migration complete!');
}

if (require.main === module) {
  migrate();
}
