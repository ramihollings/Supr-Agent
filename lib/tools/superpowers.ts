import { z } from 'zod';
import { ToolDefinition, toolRegistry } from './registry';
import { LocalNodeSandbox } from '../providers/local-node-sandbox';

// The Superpowers concept relies on giving the agent full CLI capabilities.
// We proxy this through our LocalNodeSandbox to ensure path-traversal security.

const SuperpowersParams = z.object({
  action: z.enum(['tree', 'exec', 'file_replace']),
  target: z.string().describe("The file path, directory, or command to execute."),
  payload: z.string().optional().describe("Used for replacement or specific execution parameters.")
});

type SuperpowersParamsType = z.infer<typeof SuperpowersParams>;

export const superpowersTool: ToolDefinition<SuperpowersParamsType, string> = {
  name: 'obra_superpowers',
  description: 'Advanced CLI utility for deep directory scanning, smart code replacement, and sandbox shell execution.',
  parameters: SuperpowersParams,
  requiredTier: 'External_Act',
  riskLevel: 'High', // High risk because it allows arbitrary CLI execution within the sandbox
  execute: async (params) => {
    const sandbox = new LocalNodeSandbox();
    
    // We create an ephemeral session for this execution just for the tool.
    // In production, this would use the mission's active sandbox ID.
    const sessionId = await sandbox.createSession('superpowers-session');
    let output = '';

    try {
      if (params.action === 'tree') {
        // Execute a tree-like command (cross-platform compatible fallback to ls/dir)
        // Note: For actual Windows vs Linux, we use cross-platform node or safe shell scripts.
        const res = await sandbox.executeCommand(sessionId, `npx tree-cli -l 3 -o output.txt`);
        output = await sandbox.readArtifact(sessionId, 'output.txt').catch(() => "Tree generation failed.");
        
      } else if (params.action === 'exec') {
        const res = await sandbox.executeCommand(sessionId, params.target);
        output = res.exitCode === 0 ? res.stdout : `Error: ${res.stderr}`;
        
      } else if (params.action === 'file_replace' && params.payload) {
        // Simulates the smart 'sed' replacement superpower
        const content = await sandbox.readArtifact(sessionId, params.target);
        // Extremely simplified replace for demonstration. 
        // Real implementation would use diff patching or AST replacing.
        const updatedContent = content + '\n' + params.payload;
        await sandbox.writeArtifact(sessionId, params.target, updatedContent);
        output = `Successfully patched ${params.target}`;
      }
      return output;
    } catch (error: any) {
       throw new Error(`Superpowers execution failed: ${error.message}`);
    } finally {
       // Cleanup the ephemeral session
       await sandbox.destroySession(sessionId);
    }
  }
};

// Register the tool
toolRegistry.registerTool(superpowersTool);
