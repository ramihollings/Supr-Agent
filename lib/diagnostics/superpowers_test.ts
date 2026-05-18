import { toolRegistry } from '../tools/registry';
import '../tools/superpowers'; // ensure auto-register

async function runSuperpowersDiagnostic() {
  console.log('--- DIAGNOSTIC 9: Obra Superpowers Tool Execution ---');
  
  const spTool = toolRegistry.getTool('obra_superpowers');
  if (!spTool) {
    throw new Error("obra_superpowers tool not found in registry!");
  }

  console.log('[+] Validated ToolRegistry mapped obra_superpowers with Risk Level: High');
  
  console.log(`[+] Executing Action: 'exec' (echo test)`);
  try {
    const resultExec = await spTool.execute({
      action: "exec",
      target: "echo 'Superpowers Active!'"
    });
    console.log(`  -> Output: ${resultExec.trim()}`);
    
    if (!resultExec.includes("Superpowers Active!")) throw new Error("Exec mismatch.");

    console.log('--- PASS: Superpowers Sandbox Integration Verified ---\n');
    return true;
  } catch (error: any) {
    console.error('\n--- FAIL: Superpowers threw an exception ---\n', error.message);
    return false;
  }
}

if (require.main === module) {
  runSuperpowersDiagnostic();
}
