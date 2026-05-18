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
