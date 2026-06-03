import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { getSqliteDb } from '../database/init';

const execAsync = promisify(exec);

/**
 * Strict allowlist for sandbox session / workspace ids. The id is
 * used as a directory name under `supr_workspaces/`, so it must be a
 * safe filesystem token. The previous implementation accepted any
 * string and relied on a `startsWith` check, which is vulnerable to
 * prefix-sibling bugs (e.g. session "abc" passes containment for
 * sessionDir "abc-evil"). A regex allowlist makes that impossible.
 */
const SANDBOX_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;

export function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && SANDBOX_ID_PATTERN.test(id);
}

export abstract class AbstractSandboxProvider {
  abstract createSession(workspaceId: string): Promise<string>;
  abstract executeCommand(sessionId: string, command: string): Promise<{ stdout: string; stderr: string; exitCode: number; durationMs: number; error?: string }>;
  abstract readArtifact(sessionId: string, path: string): Promise<string>;
  abstract writeArtifact(sessionId: string, path: string, content: string): Promise<void>;
  abstract destroySession(sessionId: string): Promise<void>;
}

export class LocalNodeSandbox extends AbstractSandboxProvider {
  private baseSandboxDir: string;

  constructor() {
    super();
    this.baseSandboxDir = path.join(/* turbopackIgnore: true */ process.cwd(), 'supr_workspaces');
    if (!fs.existsSync(this.baseSandboxDir)) {
      fs.mkdirSync(this.baseSandboxDir, { recursive: true });
    }
  }

  private getSessionPath(sessionId: string): string {
    return path.join(this.baseSandboxDir, sessionId);
  }

  private resolveAndValidatePath(sessionId: string, targetPath: string): string {
    // Validate the session id itself before doing any path math. The
    // id is used to derive a directory name, so it must be a safe
    // filesystem token.
    if (!isValidSessionId(sessionId)) {
      throw new Error(`Security Exception: Invalid session id '${sessionId}'.`);
    }
    const sessionDir = this.getSessionPath(sessionId);
    const absoluteTargetPath = path.resolve(sessionDir, targetPath);
    // Use path.relative to verify containment: relative path must not
    // start with `..` and must not be an absolute path. The previous
    // `startsWith` check was vulnerable to prefix-sibling bugs (e.g.
    // session "abc" would pass containment for sessionDir "abc-evil").
    const rel = path.relative(sessionDir, absoluteTargetPath);
    if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
      return absoluteTargetPath;
    }
    throw new Error(`Security Exception: Path traversal attempt detected. Access denied to ${targetPath}`);
  }

  /**
   * Validate a sessionId and return the session directory.
   *
   * `resolveAndValidatePath` checks the *sessionId* format and uses
   * `path.relative` to verify the *target path* stays inside the
   * session, but it doesn't help for paths that *are* the session
   * root (executeCommand mounts it into Docker, destroySession does a
   * recursive rm). This helper centralizes the sessionId allowlist
   * check and the path.relative containment against baseSandboxDir so
   * the two "use the session as a whole" paths can reuse it.
   */
  private getValidatedSessionDir(sessionId: string): string {
    if (!isValidSessionId(sessionId)) {
      throw new Error(`Security Exception: Invalid session id '${sessionId}'.`);
    }
    const sessionDir = path.resolve(this.baseSandboxDir, sessionId);
    const rel = path.relative(this.baseSandboxDir, sessionDir);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Security Exception: Session '${sessionId}' escapes the sandbox directory.`);
    }
    return sessionDir;
  }

  async createSession(workspaceId: string): Promise<string> {
    if (!isValidSessionId(workspaceId)) {
      throw new Error(`Invalid workspace id '${workspaceId}'.`);
    }
    const sessionId = `sbx-${workspaceId}-${crypto.randomUUID()}`;
    const sessionDir = this.getValidatedSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionId;
  }

  async executeCommand(sessionId: string, command: string) {
    // Validate the sessionId and resolve the session directory through
    // the central containment helper. The previous version called
    // getSessionPath() directly, so a hostile id like
    // `../../etc/supr_workspaces_admin` would have been used as-is
    // and then mounted into Docker as the workspace — letting the
    // container read or overwrite files outside the sandbox.
    const sessionDir = this.getValidatedSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      throw new Error(`Session ${sessionId} does not exist.`);
    }

    const absoluteSessionDir = path.resolve(sessionDir);
    let hostPath = absoluteSessionDir.replace(/\\/g, '/');

    if (process.env.HOST_WORKSPACE_PATH) {
      const containerBase = path.resolve(process.env.CONTAINER_WORKSPACE_PATH || '/app/supr_workspaces').replace(/\\/g, '/');
      const resolvedSessionDir = absoluteSessionDir.replace(/\\/g, '/');
      if (resolvedSessionDir.startsWith(containerBase)) {
        const relativePart = resolvedSessionDir.slice(containerBase.length);
        const hostBase = process.env.HOST_WORKSPACE_PATH.replace(/\\/g, '/');
        hostPath = hostBase + relativePart;
        console.log(`[DockerSandbox] Remapped container path ${resolvedSessionDir} to host path ${hostPath}`);
      }
    }

    let envFlags = '';
    try {
      const db = getSqliteDb();
      const settingRow = db.prepare("SELECT value FROM Settings WHERE key = 'sandbox_allow_api_keys'").get() as { value: string } | undefined;
      const approvalRow = db.prepare("SELECT value FROM Settings WHERE key = 'sandbox_api_key_approval'").get() as { value: string } | undefined;
      const allowKeys = settingRow?.value === 'true' && approvalRow?.value === 'approved';

      if (allowKeys) {
        if (process.env.GEMINI_API_KEY) envFlags += ' -e GEMINI_API_KEY';
        if (process.env.MINIMAX_API_KEY) envFlags += ' -e MINIMAX_API_KEY';
      }
    } catch (dbErr) {
      console.warn('[DockerSandbox] Failed to query Settings DB for sandbox_allow_api_keys:', dbErr);
    }

    let image = 'python:3.10-alpine';
    const lowerCmd = command.toLowerCase();
    if (lowerCmd.includes('node') || lowerCmd.includes('npm')) {
      image = 'node:18-alpine';
    } else if (lowerCmd.includes('python') || lowerCmd.includes('pip') || lowerCmd.includes('pytest')) {
      image = 'python:3.10-alpine';
    } else {
      image = 'alpine:latest';
    }

    let containerCommand = command
      .replace(new RegExp(absoluteSessionDir.replace(/\\/g, '\\\\'), 'g'), '.')
      .replace(new RegExp(hostPath, 'g'), '.');
    containerCommand = containerCommand.replace(/\\/g, '/');

    const dockerCmd = `docker run --rm -v "${hostPath}:/workspace" -w /workspace${envFlags} ${image} sh -c ${JSON.stringify(containerCommand)}`;
    const startTime = Date.now();

    try {
      const { stdout, stderr } = await execAsync(dockerCmd);
      return {
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: 0,
        durationMs: Date.now() - startTime,
      };
    } catch (error: any) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || '',
        exitCode: error.code || 1,
        durationMs: Date.now() - startTime,
        error: error.message,
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
    // Validate the sessionId before doing a recursive rm. Without
    // this check, a hostile id like `../../etc` would resolve to a
    // directory outside the sandbox and `rmSync(..., { recursive:
    // true, force: true })` would happily delete it.
    const sessionDir = this.getValidatedSessionDir(sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  }
}
