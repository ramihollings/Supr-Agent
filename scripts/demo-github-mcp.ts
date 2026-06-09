import { runAgentRuntimeAction } from '../lib/runtime/agent-runtime-runner';
import { v4 as uuidv4 } from 'uuid';
import dbClient from '../lib/database/db_client';

async function runDemo() {
  console.log('--- Supr B2B Demo: Automated Code Review Agent ---');
  console.log('Validating environment...');

  if (!process.env.GITHUB_PERSONAL_ACCESS_TOKEN) {
    console.error('ERROR: GITHUB_PERSONAL_ACCESS_TOKEN is required in .env for this demo.');
    process.exit(1);
  }

  const missionId = uuidv4();
  const actionId = uuidv4();

  // Seed the dummy mission
  await dbClient.execute(
    `INSERT INTO Missions (id, title, status) VALUES (?, ?, 'active')`,
    [missionId, 'Automated Code Review via MCP']
  );

  console.log('Initializing LangGraph Runtime Loop (Hackathon Track 1 Compliant)...');

  const action = {
    id: actionId,
    missionId,
    agentId: 'code-reviewer-agent',
    capability: 'gemini-2.5-pro', // Vertex AI model
    intent: 'URGENT: Production API is throwing 500 errors regarding a missing database column in the `users` table. Use the GitHub MCP to scan the schema files in the `backend/db` repository, identify the missing migration, and generate the SQL fix. Halt for human approval before applying.',
    payload: {
      owner: 'startup-corp',
      repo: 'backend-db',
      issue_number: 911
    },
    status: 'running',
    startedAt: Date.now(),
  };

  try {
    const result = await runAgentRuntimeAction(action as any);

    console.log('\n--- Demo Complete ---');
    console.log('Result Summary:', (result as any).summary || result);
  } catch (err: any) {
    console.error('Demo Failed:', err.message);
  }
}

runDemo().catch(console.error);
