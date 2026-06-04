"use client";

import { useEffect, useState } from 'react';
import { TopNav } from '@/components/TopNav';

interface McpServer {
  id: string;
  name: string;
  transport: string;
  description: string;
  required_tier: string;
  enabled: boolean;
}

interface McpTool {
  name: string;
  description: string;
  required_tier: string;
  server_id: string;
  server_name: string;
}

interface McpResource {
  server_id: string;
  server_name: string;
  items: Array<{ uri: string; name: string; description?: string }>;
}

interface McpStatus {
  ok: boolean;
  version: number;
  servers: McpServer[];
  tool_count: number;
  resource_count: number;
  tools: McpTool[];
  resources: McpResource[];
}

export default function McpPage() {
  const [status, setStatus] = useState<McpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await fetch('/api/mcp/status');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setStatus(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load MCP status');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStatus(); }, []);

  const toggleServer = async (id: string, enabled: boolean) => {
    setToggling(id);
    try {
      const res = await fetch('/api/mcp/servers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await loadStatus();
    } catch (err: any) {
      setError(`Toggle failed: ${err.message}`);
    } finally {
      setToggling(null);
    }
  };

  return (
    <div className="flex-1 md:ml-64 min-h-screen bg-surface-container text-on-surface overflow-hidden">
      <TopNav title="MCP Control Plane" />
      <div className="p-8 max-w-6xl mx-auto">
        <header className="mb-8 border-b-4 border-primary pb-4">
          <h1 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">
            Model Context Protocol
          </h1>
          <p className="font-body text-sm text-on-surface-variant mt-2">
            Unified router for MCP servers. Subagents must go through these routes — direct
            server connections bypass governance. In-process servers are live; stdio
            servers are planned and disabled until enabled.
          </p>
        </header>

        {loading && <p className="font-body">Loading...</p>}
        {error && <p className="font-body text-error mb-4">Error: {error}</p>}

        {status && (
          <div className="space-y-6">
            <section>
              <h2 className="font-headline text-xl font-bold uppercase mb-3 text-primary">
                Servers ({status.servers.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {status.servers.map((s) => (
                  <div key={s.id} className="border-4 border-primary p-4 bg-surface neo-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3 className="font-headline font-bold text-base">{s.name}</h3>
                        <p className="font-mono text-[10px] text-on-surface-variant">{s.id} · {s.transport}</p>
                      </div>
                      <button
                        onClick={() => toggleServer(s.id, !s.enabled)}
                        disabled={toggling === s.id}
                        className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary ${
                          s.enabled ? 'bg-primary text-on-primary' : 'bg-surface-dim text-on-surface-variant'
                        }`}
                      >
                        {toggling === s.id ? '...' : s.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                    </div>
                    <p className="font-body text-xs text-on-surface-variant mb-2">{s.description}</p>
                    <p className="font-mono text-[10px] text-tertiary">Required tier: {s.required_tier}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold uppercase mb-3 text-primary">
                Tools ({status.tool_count})
              </h2>
              <div className="border-4 border-primary bg-surface">
                {status.tools.slice(0, 50).map((t) => (
                  <div key={`${t.server_id}.${t.name}`} className="p-3 border-b-2 border-primary last:border-b-0">
                    <p className="font-mono text-xs">
                      <span className="font-bold text-primary">{t.name}</span>
                      <span className="text-on-surface-variant"> · {t.server_name} · tier {t.required_tier}</span>
                    </p>
                    <p className="font-body text-xs text-on-surface-variant mt-1">{t.description}</p>
                  </div>
                ))}
                {status.tools.length === 0 && (
                  <p className="p-3 font-body text-xs text-on-surface-variant">No tools registered.</p>
                )}
              </div>
            </section>

            <section>
              <h2 className="font-headline text-xl font-bold uppercase mb-3 text-primary">
                Resources ({status.resource_count})
              </h2>
              {status.resources.length === 0 && (
                <p className="font-body text-xs text-on-surface-variant">No resources exposed.</p>
              )}
              {status.resources.map((r) => (
                <div key={r.server_id} className="border-4 border-primary p-4 bg-surface mb-3">
                  <p className="font-headline font-bold text-sm mb-2">{r.server_name}</p>
                  <ul className="space-y-1">
                    {r.items.map((item) => (
                      <li key={item.uri} className="font-mono text-xs">
                        <span className="text-primary">{item.uri}</span>
                        {item.description && <span className="text-on-surface-variant"> — {item.description}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
