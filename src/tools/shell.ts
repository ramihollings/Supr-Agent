import { z } from "zod";
import crypto from "crypto";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import { LocalNodeSandbox } from "../../lib/providers/local-node-sandbox";

const ShellParams = z.object({
  command: z.string().describe("The shell command to execute inside the sandboxed environment."),
  sessionId: z.string().optional().describe("Optional persistent session ID for the execution environment.")
});

type ShellParamsType = z.infer<typeof ShellParams>;

type CommandResult = {
  commandId: string;
  command: string;
  sessionId: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  error?: string;
  evidence: { commands: string[] };
};

function commandId(command: string) {
  return `cmd-${crypto.createHash("sha256").update(command).digest("hex").slice(0, 16)}`;
}

function toCommandResult(command: string, sessionId: string, result: Awaited<ReturnType<LocalNodeSandbox["executeCommand"]>>): CommandResult {
  const id = commandId(`${sessionId}:${command}:${result.exitCode}:${result.durationMs}`);
  return {
    commandId: id,
    command,
    sessionId,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    error: result.error || undefined,
    evidence: { commands: [id] },
  };
}

export const shellTool: ToolDefinition<ShellParamsType, CommandResult> = {
  name: "execute_command",
  description: "Runs a shell command securely within the isolated sandboxed environment.",
  parameters: ShellParams,
  requiredTier: "Execute",
  riskLevel: "High",
  execute: async (params) => {
    const sandbox = new LocalNodeSandbox();
    const sessionId = params.sessionId || await sandbox.createSession("ephemeral-shell");
    
    try {
      const result = await sandbox.executeCommand(sessionId, params.command);
      const commandResult = toCommandResult(params.command, sessionId, result);
      if (result.exitCode !== 0) {
        const error = new Error(`Command failed with exit code ${result.exitCode}.`);
        (error as any).commandResult = commandResult;
        throw error;
      }
      return commandResult;
    } catch (error: any) {
      if (error.commandResult) throw error;
      throw new Error(`Shell execution failed: ${error.message}`);
    } finally {
      if (!params.sessionId) {
        // Destroy the ephemeral session
        await sandbox.destroySession(sessionId).catch(() => {});
      }
    }
  }
};

// Auto-register the tool
toolRegistry.registerTool(shellTool);
