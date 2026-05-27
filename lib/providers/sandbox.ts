export interface ExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
  error?: string;
}

export abstract class SandboxProvider {
  /**
   * Initializes a secure sandbox session (e.g. starting a gVisor/Docker container).
   * @param workspaceId The unique ID of the workspace/mission to mount.
   * @returns A unique session ID for the sandbox.
   */
  abstract createSession(workspaceId: string): Promise<string>;

  /**
   * Executes a shell command inside the sandbox.
   * @param sessionId The ID of the active sandbox session.
   * @param command The shell command to run.
   */
  abstract executeCommand(sessionId: string, command: string): Promise<ExecutionResult>;

  /**
   * Reads a file artifact generated within the sandbox.
   * @param sessionId The active sandbox session.
   * @param path The relative path to the file inside the sandbox.
   */
  abstract readArtifact(sessionId: string, path: string): Promise<string>;

  /**
   * Writes a file into the sandbox.
   */
  abstract writeArtifact(sessionId: string, path: string, content: string): Promise<void>;

  /**
   * Terminates and cleans up the sandbox session.
   */
  abstract destroySession(sessionId: string): Promise<void>;
}

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export class LocalNodeSandbox extends SandboxProvider {
  private baseSandboxDir: string;

  constructor() {
    super();
    // Use an absolute path to the sandbox workspace at the project root
    this.baseSandboxDir = path.resolve(process.cwd(), 'supr_workspaces');
    if (!fs.existsSync(this.baseSandboxDir)) {
      fs.mkdirSync(this.baseSandboxDir, { recursive: true });
    }
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.baseSandboxDir, sessionId);
  }

  private resolveAndValidatePath(sessionId: string, targetPath: string): string {
    const sessionDir = this.getSessionPath(sessionId);
    // path.resolve computes absolute path based on sessionDir
    const absoluteTargetPath = path.resolve(sessionDir, targetPath);
    
    // Security Guard: Check if the resulting path breaks out of the session directory
    if (!absoluteTargetPath.startsWith(sessionDir)) {
      throw new Error(`Security Exception: Path traversal attempt detected. Access denied to ${targetPath}`);
    }
    
    return absoluteTargetPath;
  }

  async createSession(workspaceId: string): Promise<string> {
    const sessionId = `sbx-${workspaceId}-${Date.now()}`;
    const sessionDir = this.getSessionPath(sessionId);
    
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    return sessionId;
  }

  async executeCommand(sessionId: string, command: string): Promise<ExecutionResult> {
    const sessionDir = this.getSessionPath(sessionId);
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session ${sessionId} does not exist.`);
    }

    const startTime = Date.now();
    try {
      // Execute within the restricted directory context
      const { stdout, stderr } = await execAsync(command, { cwd: sessionDir });
      return {
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        durationMs: Date.now() - startTime
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        durationMs: Date.now() - startTime,
        error: error.message
      };
    }
  }

  async readArtifact(sessionId: string, targetPath: string): Promise<string> {
    const safePath = this.resolveAndValidatePath(sessionId, targetPath);
    if (!fs.existsSync(safePath)) {
      throw new Error(`Artifact not found: ${targetPath}`);
    }
    return fs.readFileSync(safePath, 'utf-8');
  }

  async writeArtifact(sessionId: string, targetPath: string, content: string): Promise<void> {
    const safePath = this.resolveAndValidatePath(sessionId, targetPath);
    const dir = path.dirname(safePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(safePath, content, 'utf-8');
  }

  async destroySession(sessionId: string): Promise<void> {
    const sessionDir = this.getSessionPath(sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }
}

