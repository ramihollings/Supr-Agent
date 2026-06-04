/**
 * MCP HTTP transport.
 *
 * For remote MCP servers that speak the protocol over HTTP+SSE
 * instead of stdio. Each request is a single HTTP POST to the
 * server's `endpoint` URL with a JSON-RPC body, the server
 * responds with either a JSON object or (for long-running
 * operations) an SSE stream.
 *
 * The transport is intentionally simple — it does not maintain a
 * persistent connection or push notifications. Tools that need
 * streaming can opt in by checking `accept: text/event-stream`
 * in the headers; for now we always request JSON.
 */
import type { McpServerEntry } from './registry';
import { StdioCallResult, StdioToolDescriptor } from './stdio';

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpMcpSession {
  private nextId = 1;
  private endpoint: string;
  private headers: Record<string, string>;

  constructor(public readonly server: McpServerEntry) {
    // The server's `endpoint` is a free-form field in the
    // registry. We validate it on construction so a malformed
    // URL fails the first call rather than the second.
    const raw = (server as any).endpoint as string | undefined;
    if (!raw) {
      throw new Error(`HTTP MCP server '${server.id}' has no endpoint configured.`);
    }
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error(`HTTP MCP server '${server.id}' endpoint must be http or https.`);
    }
    this.endpoint = raw;
    this.headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
    // Inject only the env vars the server's manifest declares.
    if (server.env_keys) {
      for (const key of server.env_keys) {
        if (process.env[key]) {
          this.headers['X-' + key] = process.env[key]!;
        }
      }
    }
  }

  async initialize(): Promise<{ protocolVersion: string; serverInfo?: { name: string; version: string } }> {
    return await this.send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'supr', version: '0.1.0' },
    });
  }

  async listTools(): Promise<StdioToolDescriptor[]> {
    const result = await this.send('tools/list', {});
    return (result?.tools || []) as StdioToolDescriptor[];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<StdioCallResult> {
    return await this.send('tools/call', { name, arguments: args });
  }

  private async send(method: string, params: any): Promise<any> {
    const id = this.nextId++;
    const body = { jsonrpc: '2.0', id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`HTTP MCP request '${method}' timed out after ${DEFAULT_TIMEOUT_MS}ms.`)), DEFAULT_TIMEOUT_MS);
      // Use undici's fetch so we get the same TLS/SNI guarantees
      // the rest of the app uses. We do NOT add any agent override
      // because the HTTP MCP server is a public endpoint by
      // design; the registry is responsible for declaring
      // whether a server is trustworthy.
      fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(body),
      })
        .then(async (response) => {
          clearTimeout(timer);
          if (!response.ok) {
            reject(new Error(`HTTP MCP server '${this.server.id}' returned ${response.status} ${response.statusText}.`));
            return;
          }
          const text = await response.text();
          let parsed: any;
          try { parsed = JSON.parse(text); }
          catch {
            reject(new Error(`HTTP MCP server '${this.server.id}' returned non-JSON: ${text.slice(0, 200)}`));
            return;
          }
          if (parsed.error) {
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
            return;
          }
          resolve(parsed.result);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        });
    });
  }
}

const httpSessions = new Map<string, HttpMcpSession>();

export async function getOrStartHttpSession(server: McpServerEntry): Promise<HttpMcpSession> {
  let session = httpSessions.get(server.id);
  if (session) return session;
  session = new HttpMcpSession(server);
  await session.initialize();
  httpSessions.set(server.id, session);
  return session;
}

export async function stopHttpSession(serverId: string): Promise<void> {
  httpSessions.delete(serverId);
}
