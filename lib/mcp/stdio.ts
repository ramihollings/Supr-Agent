/**
 * MCP stdio transport.
 *
 * Spawns a child process running the configured MCP stdio server
 * (e.g. `@modelcontextprotocol/server-github`,
 * `@modelcontextprotocol/server-postgres`) and exposes a
 * JSON-RPC `tools/list` and `tools/call` interface over its
 * stdin/stdout.
 *
 * We use the `node-jsonrpc-stdio` convention: one JSON request
 * per line on stdin, one JSON response per line on stdout.
 * Notifications from the server are also one JSON object per
 * line and are forwarded to subscribers.
 */
import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import crypto from 'node:crypto';
import type { McpServerEntry } from './registry';

export interface StdioToolDescriptor {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface StdioCallResult {
  content: Array<{ type: 'text' | 'image' | 'resource'; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REPO_ROOT = process.cwd();
const TSX_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');

/**
 * Env vars that every spawned MCP server gets, regardless of
 * its `env_keys` declaration. PATH is required for the OS to
 * resolve binaries; HOME/USER/TMPDIR are required by many
 * stdlib and SDK initialization paths (e.g. ~/.npmrc,
 * ~/.config, /tmp scratch files).
 */
const ALWAYS_ALLOWED = new Set(['PATH', 'HOME', 'USER', 'TMPDIR']);

/**
 * Build the scoped environment for a child MCP server.
 *
 * The host's full `process.env` is intentionally NOT passed
 * through. Only:
 *   1. The `ALWAYS_ALLOWED` keys (PATH, HOME, USER, TMPDIR)
 *   2. The keys explicitly listed in `server.env_keys`
 *
 * Without this scoping, a malicious or careless server could
 * exfiltrate `OPENAI_API_KEY`, `AUTH_SECRET`, `APP_PASSWORD`,
 * or any other host secret just by reading `process.env`.
 *
 * Exported as a pure function so tests can assert the scoping
 * without spawning an actual child process.
 */
export function buildScopedEnv(
  server: McpServerEntry,
  hostEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  // Start with a non-empty object so TS doesn't infer the
  // empty-object-literal type and reject later assignments to
  // optional ProcessEnv keys (e.g. NODE_ENV).
  const out: NodeJS.ProcessEnv = { ...hostEnv };
  const allowedKeys = new Set(server.env_keys || []);
  for (const key of Object.keys(hostEnv)) {
    if (!ALWAYS_ALLOWED.has(key) && !allowedKeys.has(key)) {
      delete out[key];
    }
  }
  return out;
}

export class StdioMcpSession {
  private child: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<string | number, PendingRequest>();
  private nextId = 1;
  private buffer = '';
  private notificationHandlers = new Set<(notification: any) => void>();
  private startedAt = 0;
  private crashed = false;

  constructor(public readonly server: McpServerEntry) {}

  isRunning(): boolean {
    return this.child !== null && !this.crashed;
  }

  uptimeMs(): number {
    return this.startedAt > 0 ? Date.now() - this.startedAt : 0;
  }

  /**
   * Spawn the child process and perform the MCP `initialize`
   * handshake. Returns once the server reports a protocol
   * version — the session is then ready to list/call tools.
   */
  async start(): Promise<void> {
    if (this.isRunning()) return;
    if (this.server.transport !== 'stdio') {
      throw new Error(`Server '${this.server.id}' is not a stdio server.`);
    }
    if (!this.server.command) {
      throw new Error(`Server '${this.server.id}' has no command configured.`);
    }
    const env = buildScopedEnv(this.server);
    // If tsx is required (e.g. for a TypeScript MCP server), use
    // it. Otherwise the command is invoked directly.
    const needsTsx = (this.server.args || []).some((a) => a.endsWith('.ts'));
    const command = needsTsx && existsSync(TSX_BIN) ? TSX_BIN : this.server.command;
    const args = needsTsx && existsSync(TSX_BIN)
      ? [...(this.server.args || [])]
      : (this.server.args || []);
    this.child = spawn(command, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
    this.startedAt = Date.now();
    this.child.stdout.on('data', (data) => this.handleStdout(data.toString()));
    this.child.stderr.on('data', (data) => {
      // Forward server stderr to the application log at
      // debug level; do not crash the session on stderr.
      console.debug(`[MCP:${this.server.id}] ${data.toString().trim()}`);
    });
    this.child.on('exit', (code, signal) => {
      this.crashed = true;
      // Reject any in-flight requests.
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`MCP server '${this.server.id}' exited (code=${code}, signal=${signal}) before responding to request ${id}.`));
      }
      this.pending.clear();
    });
    // Send the MCP initialize handshake.
    await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'supr', version: '0.1.0' },
    });
    // Notify the server we're initialized.
    this.sendNotification('notifications/initialized', {});
  }

  async listTools(): Promise<StdioToolDescriptor[]> {
    const result = await this.sendRequest('tools/list', {});
    return (result?.tools || []) as StdioToolDescriptor[];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<StdioCallResult> {
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    return result as StdioCallResult;
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    try {
      this.child.stdin.end();
    } catch {}
    const child = this.child;
    this.child = null;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { child.kill('SIGTERM'); } catch {}
        resolve();
      }, 2_000);
      child.on('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  onNotification(handler: (notification: any) => void): () => void {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  private sendNotification(method: string, params: any) {
    if (!this.child) return;
    const message = { jsonrpc: '2.0', method, params };
    try {
      this.child.stdin.write(JSON.stringify(message) + '\n');
    } catch (err: any) {
      console.warn(`[MCP:${this.server.id}] Failed to send notification '${method}': ${err.message}`);
    }
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.child || this.crashed) {
      throw new Error(`MCP server '${this.server.id}' is not running.`);
    }
    const id = this.nextId++;
    const message = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`MCP request '${method}' timed out after 30s.`));
        }
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child!.stdin.write(JSON.stringify(message) + '\n');
      } catch (err: any) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error(`Failed to write to MCP server stdin: ${err.message}`));
      }
    });
  }

  private handleStdout(chunk: string) {
    this.buffer += chunk;
    // MCP stdio is one JSON message per line. Split on newlines
    // and process each complete message.
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      let msg: any;
      try { msg = JSON.parse(trimmed); }
      catch (err: any) {
        console.warn(`[MCP:${this.server.id}] Discarding non-JSON line: ${trimmed.slice(0, 200)}`);
        continue;
      }
      if (msg.id !== undefined && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        } else {
          p.resolve(msg.result);
        }
      } else if (msg.method) {
        // Notification from the server (e.g. resources/updated).
        for (const handler of this.notificationHandlers) {
          try { handler(msg); } catch {}
        }
      }
    }
  }
}

/**
 * Process-level registry of live stdio sessions. The lifecycle
 * is tied to the Next.js process — sessions are spawned on
 * first use and reaped on shutdown.
 */
const sessions = new Map<string, StdioMcpSession>();

export async function getOrStartSession(server: McpServerEntry): Promise<StdioMcpSession> {
  let session = sessions.get(server.id);
  if (session && session.isRunning()) return session;
  if (session) {
    // Crashed — clean it up.
    await session.stop();
    sessions.delete(server.id);
  }
  session = new StdioMcpSession(server);
  await session.start();
  sessions.set(server.id, session);
  return session;
}

export async function stopSession(serverId: string): Promise<void> {
  const session = sessions.get(serverId);
  if (!session) return;
  await session.stop();
  sessions.delete(serverId);
}

export async function stopAllSessions(): Promise<void> {
  const all = Array.from(sessions.values());
  await Promise.all(all.map((s) => s.stop()));
  sessions.clear();
}
