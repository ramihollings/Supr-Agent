import { z } from "zod";
import crypto from "crypto";
import { exec } from "child_process";
import { promisify } from "util";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import { LocalNodeSandbox } from "../../lib/providers/local-node-sandbox";
import { resolveCommandExecutionPolicy } from "../services/command-execution-policy";

const execAsync = promisify(exec);

const ShellParams = z.object({
  command: z.string().describe("The shell command to execute."),
  sessionId: z.string().optional().describe("Optional persistent session ID for Docker sandbox execution."),
  timeoutMs: z.number().int().min(1000).max(120000).optional().describe("Maximum command runtime in milliseconds."),
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
  executionPolicy: Awaited<ReturnType<typeof resolveCommandExecutionPolicy>>;
  error?: string;
  evidence: { commands: string[] };
};

function commandId(command: string) {
  return `cmd-${crypto.createHash("sha256").update(command).digest("hex").slice(0, 16)}`;
}

type RawCommandOutput = {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  error?: string;
};

function toCommandResult(
  command: string,
  sessionId: string,
  result: RawCommandOutput,
  executionPolicy: Awaited<ReturnType<typeof resolveCommandExecutionPolicy>>,
): CommandResult {
  const id = commandId(`${sessionId}:${command}:${result.exitCode}:${result.durationMs}`);
  return {
    commandId: id,
    command,
    sessionId,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    executionPolicy,
    error: result.error || undefined,
    evidence: { commands: [id] },
  };
}

async function runLocalCommand(command: string, timeoutMs = 60000): Promise<RawCommandOutput> {
  const startTime = Date.now();
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: timeoutMs,
      windowsHide: true,
      maxBuffer: 1024 * 1024 * 4,
    });
    return {
      stdout: stdout || "",
      stderr: stderr || "",
      exitCode: 0,
      durationMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      stdout: error.stdout || "",
      stderr: error.stderr || "",
      exitCode: typeof error.code === "number" ? error.code : 1,
      durationMs: Date.now() - startTime,
      error: error.message,
    };
  }
}

async function runDockerSandboxCommand(params: ShellParamsType, executionPolicy: Awaited<ReturnType<typeof resolveCommandExecutionPolicy>>) {
  if (executionPolicy.selectedEnvironment !== "docker") {
    throw new Error(`Docker sandbox execution blocked by policy: ${executionPolicy.reason}`);
  }

  const sandbox = new LocalNodeSandbox();
  const sessionId = params.sessionId || await sandbox.createSession("ephemeral-shell");

  try {
    const result = await sandbox.executeCommand(sessionId, params.command);
    return toCommandResult(params.command, sessionId, result, executionPolicy);
  } finally {
    if (!params.sessionId) {
      await sandbox.destroySession(sessionId).catch(() => {});
    }
  }
}

function throwIfFailed(result: CommandResult) {
  if (result.exitCode !== 0) {
    const error = new Error(`Command failed with exit code ${result.exitCode}.`);
    (error as any).commandResult = result;
    throw error;
  }
  return result;
}

export const shellTool: ToolDefinition<ShellParamsType, CommandResult> = {
  name: "execute_command",
  description: "Runs a governed local shell command and records the selected execution policy.",
  parameters: ShellParams,
  requiredTier: "Execute",
  riskLevel: "High",
  execute: async (params) => {
    const executionPolicy = await resolveCommandExecutionPolicy({
      command: params.command,
      riskLevel: "High",
      requestedEnvironment: "local",
    });
    if (executionPolicy.selectedEnvironment !== "local") {
      throw new Error(`Command execution blocked by policy: ${executionPolicy.reason}`);
    }

    try {
      const result = await runLocalCommand(params.command, params.timeoutMs);
      const commandResult = toCommandResult(params.command, "local-process", result, executionPolicy);
      return throwIfFailed(commandResult);
    } catch (error: any) {
      if (error.commandResult) throw error;
      throw new Error(`Shell execution failed: ${error.message}`);
    }
  }
};

export const sandboxedShellTool: ToolDefinition<ShellParamsType, CommandResult> = {
  name: "execute_sandboxed_command",
  description: "Runs a governed command in the Docker sandbox only when Docker execution is explicitly available.",
  parameters: ShellParams,
  requiredTier: "Execute",
  riskLevel: "High",
  execute: async (params) => {
    const executionPolicy = await resolveCommandExecutionPolicy({
      command: params.command,
      riskLevel: "High",
      requestedEnvironment: "docker",
    });
    try {
      return throwIfFailed(await runDockerSandboxCommand(params, executionPolicy));
    } catch (error: any) {
      if (error.commandResult) throw error;
      throw new Error(`Sandbox shell execution failed: ${error.message}`);
    }
  },
};

export const remoteShellTool: ToolDefinition<ShellParamsType, CommandResult> = {
  name: "execute_remote",
  description: "Requests remote command execution. Disabled by default unless governance and host configuration allow it.",
  parameters: ShellParams,
  requiredTier: "External_Act",
  riskLevel: "Critical",
  execute: async (params) => {
    const executionPolicy = await resolveCommandExecutionPolicy({
      command: params.command,
      riskLevel: "Critical",
      requestedEnvironment: "remote",
    });
    if (executionPolicy.selectedEnvironment !== "remote") {
      throw new Error(`Remote execution blocked by policy: ${executionPolicy.reason}`);
    }
    throw new Error("Remote execution host adapter is not configured. Configure an explicit host adapter before enabling execute_remote.");
  },
};

toolRegistry.registerTool(shellTool);
toolRegistry.registerTool(sandboxedShellTool);
toolRegistry.registerTool(remoteShellTool);
