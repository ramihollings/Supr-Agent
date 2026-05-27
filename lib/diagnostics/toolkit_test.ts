import { createAgent } from '../db';
import { writeIdentityProfile } from '../agents';
import * as fs from 'fs';
import * as path from 'path';

async function runToolkitDiagnostic() {
  console.log('--- DIAGNOSTIC 10: Toolkit & AgentMemory Profile Generation ---');
  
  console.log('[+] Spawning a mock Code Agent to test Identity Injection...');
  const newAgent = await createAgent({
    name: "Senior Architect Node",
    role: "Senior Software Engineer",
    permissionTier: "Internal_Act",
    isPermanent: false
  } as any);

  console.log(`[+] Agent Created in SQLite: ${newAgent.id}`);
  
  writeIdentityProfile(newAgent as any);

  // getAgentFilePath formats it using the name
  const safeName = newAgent.name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const profilePath = path.resolve(process.cwd(), '.agents', `${safeName}.md`);
  
  if (!fs.existsSync(profilePath)) {
    throw new Error("Identity Profile markdown was not generated.");
  }

  const profileContent = fs.readFileSync(profilePath, 'utf-8');
  
  let passed = true;

  if (!profileContent.includes('[CLAUDE CODE TOOLKIT: core-rules]')) {
    console.error('[-] MISSING: Claude Code Toolkit rules were not injected.');
    passed = false;
  } else {
    console.log('[+] Verified: Claude Code Toolkit rules successfully injected.');
  }

  if (!profileContent.includes('<agentmemory>')) {
    console.error('[-] MISSING: AgentMemory compression block was not injected.');
    passed = false;
  } else {
    console.log('[+] Verified: AgentMemory context compression block successfully injected.');
  }

  // Cleanup
  fs.unlinkSync(profilePath);

  if (passed) {
    console.log('\n--- PASS: Identity Profile toolkit injection verified ---\n');
    return true;
  } else {
    console.error('\n--- FAIL: Toolkit injection diagnostic failed ---\n');
    return false;
  }
}

if (require.main === module) {
  runToolkitDiagnostic();
}
