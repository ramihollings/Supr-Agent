const { LocalNodeSandbox } = require('../../lib/providers/local-node-sandbox');
const sandbox = new LocalNodeSandbox();

async function runTest() {
  try {
    const sessionId = await sandbox.createSession('test-ws');
    console.log('Created Session:', sessionId);

    console.log('Writing test.py...');
    await sandbox.writeArtifact(sessionId, 'test.py', 'import os\nprint("Hello from Docker Sandbox!")\nprint("API KEY:", os.environ.get("GEMINI_API_KEY"))');

    console.log('Executing test.py inside Docker sandbox...');
    const result = await sandbox.executeCommand(sessionId, 'python test.py');
    console.log('Result:', result);

    console.log('Cleaning up session...');
    await sandbox.destroySession(sessionId);
    console.log('Cleanup done!');
  } catch (error) {
    console.error('Test execution failed:', error);
  }
}

runTest();
