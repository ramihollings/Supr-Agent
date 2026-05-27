import { LocalNodeSandbox } from '../providers/sandbox';

async function runSandboxDiagnostic() {
  console.log('--- DIAGNOSTIC 6: Local Node Sandbox Integration ---');
  const sandbox = new LocalNodeSandbox();

  console.log('[+] Creating isolated sandbox session...');
  const sessionId = await sandbox.createSession('test-mission-1');
  console.log(`[+] Session Active: ${sessionId}`);

  try {
    // 1. Valid Artifact Write & Read
    console.log('[+] Testing artifact I/O...');
    const testCode = `console.log("Hello from inside the Sandbox!");`;
    await sandbox.writeArtifact(sessionId, 'hello.js', testCode);
    const readBack = await sandbox.readArtifact(sessionId, 'hello.js');
    if (readBack !== testCode) throw new Error("I/O mismatch.");
    console.log('  -> Write & Read verified.');

    // 2. Execution Testing
    console.log('[+] Testing restricted code execution...');
    const result = await sandbox.executeCommand(sessionId, 'node hello.js');
    console.log(`  -> Execution Output: ${result.stdout.trim()}`);
    console.log(`  -> Duration: ${result.durationMs}ms`);

    if (result.exitCode !== 0) throw new Error(`Execution failed: ${result.stderr}`);

    // 3. Adversarial Traversal Check
    console.log('[+] Testing adversarial path traversal breakout...');
    let breakoutBlocked = false;
    try {
      await sandbox.writeArtifact(sessionId, '../../system32.dll', 'malicious payload');
    } catch (e: any) {
      console.log(`  -> Blocked! Error caught: ${e.message}`);
      breakoutBlocked = true;
    }

    if (!breakoutBlocked) {
      throw new Error("Sandbox failed to block path traversal attack!");
    }

    console.log('\n--- PASS: Local Node Sandbox logic verified ---\n');

  } catch (error) {
    console.error('\n--- FAIL: Sandbox diagnostic failed ---\n', error);
  } finally {
    console.log(`[+] Destroying session ${sessionId}...`);
    await sandbox.destroySession(sessionId);
  }
}

if (require.main === module) {
  runSandboxDiagnostic();
}
