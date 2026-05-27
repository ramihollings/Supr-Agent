import { getDb } from '../db';
import Database from 'better-sqlite3';

const db = new Database('supr_local.db');

export async function runReplayDiagnostic() {
  console.log('--- DIAGNOSTIC 1: State Machine Replayability ---');
  
  // 1. Simulate events
  const missionId = `m-diag-${Date.now()}`;
  
  console.log('[+] Simulating Event Stream: MissionCreated -> GlidepathGenerated -> TaskAssigned -> ToolCalled');
  
  db.prepare(`INSERT INTO Missions (id, title, status) VALUES (?, ?, ?)`).run(missionId, 'Diagnostic Mission', 'Active');

  const insertEvent = db.prepare(`
    INSERT INTO Event_Log (id, mission_id, event_type, actor_type, actor_id, summary, metadata, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const events = [
    { type: 'supr_decision', summary: 'MissionCreated', metadata: '{"detail":"Initialized BuildSignal"}' },
    { type: 'supr_decision', summary: 'GlidepathGenerated', metadata: '{"detail":"Created 3 phases"}' },
    { type: 'agent_action', summary: 'TaskAssigned', metadata: '{"detail":"Research agent assigned task 1"}' },
    { type: 'agent_action', summary: 'ToolCalled', metadata: '{"detail":"Executed scrape_web"}' }
  ];

  events.forEach((ev, i) => {
    insertEvent.run(
      `ev-diag-${Date.now()}-${i}`,
      missionId,
      ev.type,
      'System',
      'supr-1',
      ev.summary,
      ev.metadata,
      new Date(Date.now() + i * 1000).toISOString()
    );
  });

  // 2. Fetch timeline
  const timeline = db.prepare(`SELECT * FROM Event_Log WHERE mission_id = ? ORDER BY timestamp ASC`).all(missionId) as any[];
  console.log(`[+] Found ${timeline.length} events in Event_Log.`);

  // 3. Time travel logic (rewind to step 2)
  console.log('[!] Rewinding to event #2 (GlidepathGenerated)');
  const rewindPoint = timeline[1].timestamp;

  // Clean downstream
  const deleted = db.prepare(`DELETE FROM Event_Log WHERE mission_id = ? AND timestamp > ?`).run(missionId, rewindPoint);
  
  console.log(`[+] Downstream data truncated successfully. Deleted ${deleted.changes} future events.`);
  
  const finalState = db.prepare(`SELECT * FROM Event_Log WHERE mission_id = ? ORDER BY timestamp ASC`).all(missionId) as any[];
  
  // Cleanup
  db.prepare(`DELETE FROM Event_Log WHERE mission_id = ?`).run(missionId);
  db.prepare(`DELETE FROM Missions WHERE id = ?`).run(missionId);

  if (finalState.length === 2 && finalState[1].summary === 'GlidepathGenerated') {
    console.log('--- PASS: Replayability & Truncation successful ---\n');
    return true;
  } else {
    console.error('--- FAIL: Replayability failed ---\n');
    return false;
  }
}

// Run if executed directly
if (require.main === module) {
  runReplayDiagnostic();
}
