import { registerComposioTool, initializeCoreComposioSuite } from '../tools/composio';
import { toolRegistry } from '../tools/registry';

async function runComposioDiagnostic() {
  console.log('--- DIAGNOSTIC 8: Composio Enterprise Tool Bridge ---');
  
  console.log('[+] Initializing Core Composio Suite (GitHub, Slack, Notion)...');
  await initializeCoreComposioSuite();

  const toolName = 'github_create_issue';
  const ghTool = toolRegistry.getTool(toolName);

  if (!ghTool) {
    throw new Error(`Composio tool ${toolName} failed to register natively!`);
  }

  console.log(`[+] Validated ToolRegistry mapped ${toolName} with Risk Level: ${ghTool.riskLevel}`);
  console.log(`[+] Attempting Execution payload...`);

  try {
    const result = await ghTool.execute({
      repo: "ComposioHQ/skills",
      title: "[Supr Agent] Automated Issue via Tool Bridge",
      body: "Testing the native Governance interception pipeline."
    });

    console.log(`\n[+] Execution Result: ${result}\n`);
    console.log('--- PASS: Composio Bridge mapped and executed successfully ---\n');
    return true;
  } catch (error: any) {
    console.error('\n--- FAIL: Composio Tool threw an exception ---\n', error.message);
    return false;
  }
}

if (require.main === module) {
  runComposioDiagnostic();
}
