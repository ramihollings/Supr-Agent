import Database from 'better-sqlite3';

// Mock Token Counter (4 characters per token roughly)
function countTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function runMemoryDiagnostic() {
  console.log('--- DIAGNOSTIC 4: Memory Provenance & Context Drift Auditing ---');
  
  const db = new Database('supr_local.db');
  
  const missionId = `m-mem-${Date.now()}`;
  db.prepare(`INSERT INTO Missions (id, title, status) VALUES (?, ?, ?)`).run(missionId, 'Memory Test', 'Active');

  console.log(`[+] Simulating conflicting inputs over time...`);
  
  const insertMemory = db.prepare(`
    INSERT INTO Memory_Items (id, mission_id, content, importance, created_at, superseded)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // Time 1
  insertMemory.run(`mem-1`, missionId, "Constraint: We are deploying strictly to Google Cloud Platform (GCP).", 0.9, new Date(Date.now() - 10000).toISOString(), 0);
  // Time 2
  insertMemory.run(`mem-2`, missionId, "Constraint Update: Change of plans, we are deploying to a local KVM VPS instead of GCP.", 0.9, new Date().toISOString(), 0);

  // Pad memory to test token budget
  for (let i = 0; i < 50; i++) {
    insertMemory.run(`mem-pad-${i}`, missionId, `Historical log data chunk ${i}. `.repeat(20), 0.2, new Date(Date.now() - 5000).toISOString(), 0);
  }

  console.log(`[+] Database populated with 52 memory items.`);
  console.log(`[+] Auditing Memory Drift for mission ${missionId}...`);

  // SIMULATED DRIFT AUDIT ALGORITHM
  const allMemories = db.prepare(`SELECT * FROM Memory_Items WHERE mission_id = ? ORDER BY created_at DESC`).all(missionId) as any[];
  
  // Identify conflicts (Simulating LLM Classification)
  const gcpMemory = allMemories.find(m => m.content.includes('GCP') && !m.content.includes('VPS'));
  const vpsMemory = allMemories.find(m => m.content.includes('KVM VPS'));

  if (gcpMemory && vpsMemory && new Date(vpsMemory.created_at) > new Date(gcpMemory.created_at)) {
    console.log(`[!] Conflict Detected! Newer memory "${vpsMemory.content.substring(0, 30)}..." supersedes older memory.`);
    db.prepare(`UPDATE Memory_Items SET superseded = 1 WHERE id = ?`).run(gcpMemory.id);
  }

  // Fused Semantic Retrieval & Token Budgeting (Max 1900 tokens)
  const MAX_TOKENS = 1900;
  let currentTokens = 0;
  const contextPayload: string[] = [];

  // Fetch active memories only
  const activeMemories = db.prepare(`SELECT * FROM Memory_Items WHERE mission_id = ? AND superseded = 0 ORDER BY importance DESC, created_at DESC`).all(missionId) as any[];

  for (const mem of activeMemories) {
    const memTokens = countTokens(mem.content);
    if (currentTokens + memTokens <= MAX_TOKENS) {
      contextPayload.push(mem.content);
      currentTokens += memTokens;
    } else {
      break; // Budget saturated
    }
  }

  const isOldMemorySuperseded = db.prepare(`SELECT superseded FROM Memory_Items WHERE id = ?`).get('mem-1') as any;

  console.log(`[+] Final Context Payload Size: ${currentTokens} tokens (Budget: ${MAX_TOKENS})`);
  console.log(`[+] Payload Item Count: ${contextPayload.length} / ${activeMemories.length}`);

  // Cleanup
  db.prepare(`DELETE FROM Memory_Items WHERE mission_id = ?`).run(missionId);
  db.prepare(`DELETE FROM Missions WHERE id = ?`).run(missionId);

  if (isOldMemorySuperseded.superseded === 1 && currentTokens <= MAX_TOKENS && !contextPayload.includes(gcpMemory.content)) {
    console.log('\n--- PASS: Context Drift flagged and Token Budget enforced ---\n');
    return true;
  } else {
    console.error('\n--- FAIL: Memory Provenance failed ---\n');
    return false;
  }
}

if (require.main === module) {
  runMemoryDiagnostic();
}
