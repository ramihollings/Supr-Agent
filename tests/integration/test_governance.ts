import { toolRegistry } from '../../lib/tools/registry';
import { getSqliteDb, initDatabase } from '../../lib/database/init';

// Make sure the tools are imported and registered
import '../../lib/tools/browser';
import '../../lib/tools/superpowers';

async function testGovernance() {
  console.log('--- TEST: Database-Driven MateClaw Governance & Policy Auditing ---');
  
  // 1. Initialize database and load default seed data
  initDatabase();
  const db = getSqliteDb();

  // Clear policy decisions from previous runs so we have a clean test slate
  db.prepare("DELETE FROM Policy_Decisions").run();

  // Ensure agent a2 (Research Agent) exists and is set to 'Observe' tier
  db.prepare(`
    INSERT OR REPLACE INTO Agents (id, name, role, type, permission_tier)
    VALUES ('a2', 'Research Agent', 'Research', 'permanent', 'Observe')
  `).run();

  // Ensure Capabilities are populated
  db.prepare(`
    INSERT OR REPLACE INTO Capabilities (id, name, type, required_permission, risk_level, description)
    VALUES ('web_scrape', 'web_scrape', 'direct', 'Observe', 'Low', 'Stealth Web Scraping')
  `).run();
  db.prepare(`
    INSERT OR REPLACE INTO Capabilities (id, name, type, required_permission, risk_level, description)
    VALUES ('obra_superpowers', 'obra_superpowers', 'direct', 'Root', 'Critical', 'Superpowers execution')
  `).run();

  // Allow agent a2 to execute web_scrape
  db.prepare(`
    INSERT OR REPLACE INTO Agent_Capabilities (agent_id, capability_id, allowed)
    VALUES ('a2', 'web_scrape', 1)
  `).run();

  // Case 1: Approved Tool Execution (web_scrape)
  console.log('\n[Case 1] Research Agent (a2, Observe tier) executing web_scrape (Requires Observe, Low risk)...');
  try {
    const result = await toolRegistry.executeTool('web_scrape', { url: 'https://example.com' }, 'a2');
    console.log('✅ Tool Execution Success!');
    console.log('Result preview:', typeof result === 'string' ? result.substring(0, 100) : result);
  } catch (err: any) {
    console.error('❌ Case 1 failed unexpectedly:', err.message);
  }

  // Case 2: RequiresApproval/Denied Tool Execution (obra_superpowers)
  console.log('\n[Case 2] Research Agent (a2, Observe tier) executing obra_superpowers (Requires Root, Critical risk)...');
  try {
    await toolRegistry.executeTool('obra_superpowers', { action: 'exec', target: 'whoami' }, 'a2');
    console.error('❌ Fail: Expected execution to be intercepted or denied, but it succeeded.');
  } catch (err: any) {
    console.log('✅ Intercepted successfully as expected!');
    console.log('Intercept Error Message:', err.message);
  }

  // 2. Query Policy Decisions to verify they were audited in DB
  console.log('\n[Auditing] Querying Policy_Decisions table...');
  const decisions = db.prepare("SELECT * FROM Policy_Decisions").all() as any[];
  console.log(`Found ${decisions.length} policy decision records:`);
  for (const dec of decisions) {
    console.log(`- ID: ${dec.id}`);
    console.log(`  Agent: ${dec.agent_id}`);
    console.log(`  Capability ID: ${dec.capability_id}`);
    console.log(`  Decision: ${dec.decision}`);
    console.log(`  Reason: ${dec.reason}`);
    console.log(`  Timestamp: ${dec.created_at}`);
    console.log('--------------------------------------------');
  }

  if (decisions.length !== 2) {
    throw new Error(`Expected exactly 2 logged policy decisions, but found ${decisions.length}.`);
  }

  console.log('\n--- PASS: Governance pipeline and database auditing verified ---\n');
}

testGovernance().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
