import { LocalNodeSandbox } from '../../lib/providers/local-node-sandbox';
import { getSqliteDb, initDatabase } from '../../lib/database/init';

async function testKeysSandbox() {
  console.log('--- TEST: Sandbox Key Isolation and Toggle Logic ---');
  
  // 1. Initialize database to make sure tables exist
  initDatabase();
  const db = getSqliteDb();
  const sandbox = new LocalNodeSandbox();

  // Save the original setting to restore later
  const originalRow = db.prepare("SELECT value FROM Settings WHERE key = 'sandbox_allow_api_keys'").get() as { value: string } | undefined;
  const originalValue = originalRow ? originalRow.value : 'false';
  console.log(`[+] Original setting value: ${originalValue}`);

  // Mock the environment variables on the host process
  process.env.MINIMAX_API_KEY = 'test_minimax_secret_123';
  process.env.GEMINI_API_KEY = 'test_gemini_secret_456';

  const sessionId = await sandbox.createSession('test-keys-ws');
  console.log(`[+] Session created: ${sessionId}`);

  try {
    // Write python test script that displays the environment keys
    const pyScript = `
import os
print("MINIMAX_API_KEY=" + str(os.environ.get("MINIMAX_API_KEY")))
print("GEMINI_API_KEY=" + str(os.environ.get("GEMINI_API_KEY")))
`;
    await sandbox.writeArtifact(sessionId, 'check_keys.py', pyScript);

    // TEST CASE 1: Setting = false (keys must NOT be injected)
    console.log('\n[Case 1] Setting sandbox_allow_api_keys to false...');
    db.prepare("UPDATE Settings SET value = 'false' WHERE key = 'sandbox_allow_api_keys'").run();

    console.log('Executing check_keys.py...');
    const result1 = await sandbox.executeCommand(sessionId, 'python check_keys.py');
    console.log('Exit Code:', result1.exitCode);
    console.log('Stdout:\n' + result1.stdout.trim());
    if (result1.stderr) console.error('Stderr:', result1.stderr);

    const hasMinimax1 = result1.stdout.includes('MINIMAX_API_KEY=test_minimax_secret_123');
    const hasGemini1 = result1.stdout.includes('GEMINI_API_KEY=test_gemini_secret_456');

    if (hasMinimax1 || hasGemini1) {
      throw new Error('FAIL: Keys were leaked to the sandbox even though sandbox_allow_api_keys was false!');
    }
    console.log('✅ Success: No keys leaked in Case 1.');

    // TEST CASE 2: Setting = true (keys MUST be injected)
    console.log('\n[Case 2] Setting sandbox_allow_api_keys to true...');
    db.prepare("UPDATE Settings SET value = 'true' WHERE key = 'sandbox_allow_api_keys'").run();

    console.log('Executing check_keys.py...');
    const result2 = await sandbox.executeCommand(sessionId, 'python check_keys.py');
    console.log('Exit Code:', result2.exitCode);
    console.log('Stdout:\n' + result2.stdout.trim());
    if (result2.stderr) console.error('Stderr:', result2.stderr);

    const hasMinimax2 = result2.stdout.includes('MINIMAX_API_KEY=test_minimax_secret_123');
    const hasGemini2 = result2.stdout.includes('GEMINI_API_KEY=test_gemini_secret_456');

    if (!hasMinimax2 || !hasGemini2) {
      throw new Error('FAIL: Keys were not injected into the sandbox even though sandbox_allow_api_keys was true!');
    }
    console.log('✅ Success: Keys successfully injected in Case 2.');

  } finally {
    // Restore original DB setting
    console.log(`\n[+] Restoring original setting value: ${originalValue}`);
    db.prepare("UPDATE Settings SET value = ? WHERE key = 'sandbox_allow_api_keys'").run(originalValue);

    console.log(`[+] Cleaning up session ${sessionId}...`);
    await sandbox.destroySession(sessionId);
    console.log('[-] Finished.');
  }
}

testKeysSandbox().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
