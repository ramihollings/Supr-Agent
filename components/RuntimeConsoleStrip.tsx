"use client";

type RuntimeAgent = {
  id: string;
  name: string;
  role?: string;
  status: string;
  permissionTier?: string;
  currentProject?: string | null;
};

type RuntimeConsoleStripProps = {
  agents: RuntimeAgent[];
  approvals: { id: string; status?: string; riskLevel?: string }[];
  metrics?: { id: string; eventType?: string; outcome?: string; durationMs?: number; costUsd?: number }[];
  onForceRecycle?: (agent: RuntimeAgent) => void;
};

export function RuntimeConsoleStrip({ agents, approvals, metrics = [], onForceRecycle }: RuntimeConsoleStripProps) {
  const runningAgents = agents.filter((agent) => agent.status !== 'Archived').slice(0, 5);
  const pendingApprovals = approvals.filter((approval) => approval.status === 'pending').length;
  const failureCount = metrics.filter((metric) => String(metric.outcome || '').includes('fail')).length;
  const totalCost = metrics.reduce((sum, metric) => sum + Number(metric.costUsd || 0), 0);

  return (
    <section className="bg-background neo-border">
      <header className="p-3 border-b-4 border-primary bg-surface-container-high">
        <h3 className="font-headline font-black uppercase text-xs text-primary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">monitor_heart</span>
          Runtime Console
        </h3>
      </header>

      <div className="grid grid-cols-3 divide-x-2 divide-primary border-b-2 border-primary">
        <Metric label="Active" value={runningAgents.length} />
        <Metric label="Approvals" value={pendingApprovals} />
        <Metric label="Failures" value={failureCount} />
      </div>

      <div className="p-3 space-y-2">
        {runningAgents.length === 0 ? (
          <p className="font-body text-xs text-on-surface-variant">No active runtime agents.</p>
        ) : runningAgents.map((agent) => (
          <article key={agent.id} className="border-2 border-primary bg-surface p-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-headline font-bold uppercase text-[10px] text-primary truncate">{agent.name}</h4>
                <p className="font-mono text-[9px] uppercase text-on-surface-variant truncate">{agent.role || 'Agent'} / {agent.permissionTier || 'tier unset'}</p>
              </div>
              <span className={`font-mono text-[8px] uppercase border border-primary px-1.5 py-0.5 ${agent.status === 'Active' ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-surface-container text-on-surface-variant'}`}>
                {agent.status}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="font-body text-[10px] text-on-surface-variant truncate">Step: {agent.currentProject ? 'Project flow attached' : 'Standing by'}</span>
              <button
                onClick={() => onForceRecycle?.(agent)}
                className="border border-primary px-2 py-1 font-headline font-bold uppercase text-[8px] hover:bg-primary hover:text-on-primary"
                title="Force recycle agent runtime"
              >
                Recycle
              </button>
            </div>
          </article>
        ))}
      </div>

      <footer className="p-3 border-t-2 border-primary font-mono text-[9px] uppercase text-on-surface-variant">
        Cost visible: ${totalCost.toFixed(4)} / prompt bodies are not stored by default.
      </footer>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-2 bg-surface">
      <p className="font-headline font-black text-xl text-secondary">{value}</p>
      <p className="font-headline font-bold uppercase text-[8px] text-on-surface-variant">{label}</p>
    </div>
  );
}
