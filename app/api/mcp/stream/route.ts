import { NextRequest } from 'next/server';
import { requireApiAuth } from '@/lib/auth';
import { loadMcpRegistry } from '@/lib/mcp/registry';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const HEARTBEAT_MS = 5_000;
const TICK_MS = 1_000;

/**
 * GET /api/mcp/stream — Server-Sent Events stream of MCP
 * server health and tool-list changes. The UI page subscribes
 * to this so toggling a server, or a stdio child crashing,
 * appears live without a manual refresh.
 *
 * Events emitted:
 *   - event: hello
 *     data: { serverCount: N }
 *   - event: tick
 *     data: { ts: ISO_TIMESTAMP, ok: K, degraded: D }
 *   - event: change
 *     data: { type: 'registry' | 'health', payload: {...} }
 *   - comment lines (': keep-alive') every HEARTBEAT_MS so
 *     intermediate proxies don't close the connection.
 */
export async function GET(req: NextRequest) {
  const authError = await requireApiAuth(req);
  if (authError) return authError;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      // Initial hello
      const initial = loadMcpRegistry();
      safeEnqueue(`event: hello\ndata: ${JSON.stringify({ serverCount: initial.servers.length })}\n\n`);

      let lastServerCount = initial.servers.length;
      let lastToolCount = -1;
      const tick = setInterval(async () => {
        if (closed) return;
        try {
          const reg = loadMcpRegistry();
          if (reg.servers.length !== lastServerCount) {
            lastServerCount = reg.servers.length;
            safeEnqueue(`event: change\ndata: ${JSON.stringify({ type: 'registry', serverCount: reg.servers.length })}\n\n`);
          }
          // Periodic health check (skip in-process which is
          // always-ok; only ping enabled external servers).
          const extServers = reg.servers.filter((s) => s.enabled && s.transport !== 'in-process');
          if (extServers.length > 0 && Date.now() - lastHealthCheck > HEARTBEAT_MS) {
            lastHealthCheck = Date.now();
            const summary = { ts: new Date().toISOString(), ok: 0, degraded: 0 };
            for (const server of extServers) {
              try {
                if (server.transport === 'stdio') {
                  const { getOrStartSession } = await import('@/lib/mcp/stdio');
                  const session = await getOrStartSession(server);
                  await session.listTools();
                } else if (server.transport === 'http') {
                  const { getOrStartHttpSession } = await import('@/lib/mcp/http');
                  const session = await getOrStartHttpSession(server);
                  await session.listTools();
                }
                summary.ok += 1;
              } catch {
                summary.degraded += 1;
              }
            }
            safeEnqueue(`event: tick\ndata: ${JSON.stringify(summary)}\n\n`);
          } else {
            safeEnqueue(`event: tick\ndata: ${JSON.stringify({ ts: new Date().toISOString(), ok: 0, degraded: 0 })}\n\n`);
          }
        } catch {}
      }, TICK_MS);
      const heartbeat = setInterval(() => {
        safeEnqueue(`: keep-alive\n\n`);
      }, HEARTBEAT_MS);
      // Clean up on abort
      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(tick);
        clearInterval(heartbeat);
        try { controller.close(); } catch {}
      });
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

let lastHealthCheck = 0;
