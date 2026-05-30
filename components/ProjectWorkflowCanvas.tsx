"use client";

import { useMemo, useState } from 'react';

type WorkflowNode = {
  id: string;
  kind: 'phase' | 'task' | 'agent_action' | 'approval' | 'artifact';
  label: string;
  status: string;
  actor?: string;
  detail?: string;
  riskLevel?: string;
  x: number;
  y: number;
};

type WorkflowEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

type SpawnDraft = {
  role: string;
  objective: string;
  permissionTier: string;
  capability: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
};

type Props = {
  graph: {
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    counts?: Record<string, number>;
  } | null;
  onSpawnAgent: (draft: SpawnDraft) => Promise<void>;
  isSpawning?: boolean;
};

const statusTone: Record<string, string> = {
  Active: 'border-tertiary bg-tertiary/10',
  Done: 'border-primary bg-primary/10',
  Pending: 'border-outline bg-background',
  Blocked: 'border-secondary bg-secondary/10',
  Gate_Pending: 'border-secondary bg-secondary/10',
  draft: 'border-outline bg-background',
  approved: 'border-primary bg-primary/10',
  pending_approval: 'border-secondary bg-secondary/10',
  running: 'border-tertiary bg-tertiary/10',
  completed: 'border-primary bg-primary/10',
  failed: 'border-secondary bg-secondary/10',
  pending: 'border-secondary bg-secondary/10',
  stored: 'border-primary bg-primary/10',
};

const kindIcon: Record<WorkflowNode['kind'], string> = {
  phase: 'flag',
  task: 'task_alt',
  agent_action: 'smart_toy',
  approval: 'approval_delegation',
  artifact: 'description',
};

export function ProjectWorkflowCanvas({ graph, onSpawnAgent, isSpawning = false }: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SpawnDraft>({
    role: 'Code',
    objective: '',
    permissionTier: 'Edit',
    capability: 'project.execute_task',
    riskLevel: 'Medium',
  });

  const selectedNode = useMemo(
    () => graph?.nodes.find((node) => node.id === selectedNodeId) || graph?.nodes.find((node) => node.status === 'Active' || node.status === 'running') || graph?.nodes[0],
    [graph, selectedNodeId],
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, WorkflowNode>();
    graph?.nodes.forEach((node) => map.set(node.id, node));
    return map;
  }, [graph]);

  const canvasSize = useMemo(() => {
    const nodes = graph?.nodes || [];
    return {
      width: Math.max(980, ...nodes.map((node) => node.x + 220)),
      height: Math.max(620, ...nodes.map((node) => node.y + 140)),
    };
  }, [graph]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft.objective.trim()) return;
    await onSpawnAgent(draft);
    setDraft((prev) => ({ ...prev, objective: '' }));
  };

  return (
    <section className="bg-background neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col min-h-[680px]">
      <div className="border-b-4 border-primary p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">account_tree</span>
            Project Agent Workflow
          </h3>
          <p className="font-body text-xs text-on-surface-variant font-bold">
            Live graph from mission phases, tasks, agent actions, approvals, and artifacts.
          </p>
        </div>
        <div className="grid grid-cols-5 gap-2 min-w-full lg:min-w-[460px]">
          {Object.entries(graph?.counts || { phases: 0, tasks: 0, actions: 0, approvals: 0, artifacts: 0 }).map(([key, value]) => (
            <div key={key} className="bg-surface-container border border-outline-variant p-2 text-center">
              <span className="block font-mono text-sm font-black text-primary">{value}</span>
              <span className="block font-headline text-[8px] font-bold uppercase text-on-surface-variant">{key}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] flex-1 min-h-0">
        <div className="relative overflow-auto custom-scrollbar bg-surface-container-low border-b-4 xl:border-b-0 xl:border-r-4 border-primary">
          {!graph || graph.nodes.length === 0 ? (
            <div className="p-8 font-body text-sm text-on-surface-variant">
              No operating graph yet. Spawn an agent or start a runbook to create actionable nodes.
            </div>
          ) : (
            <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                <defs>
                  <marker id="workflow-arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a1a1a" />
                  </marker>
                </defs>
                {(graph.edges || []).map((edge) => {
                  const source = nodeMap.get(edge.source);
                  const target = nodeMap.get(edge.target);
                  if (!source || !target) return null;
                  const x1 = source.x + 88;
                  const y1 = source.y + 42;
                  const x2 = target.x + 88;
                  const y2 = target.y + 42;
                  const midX = (x1 + x2) / 2;
                  const midY = (y1 + y2) / 2;
                  return (
                    <g key={edge.id}>
                      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#1a1a1a" strokeWidth="2" markerEnd="url(#workflow-arrow)" />
                      {edge.label && (
                        <text x={midX} y={midY - 8} textAnchor="middle" className="fill-primary font-headline text-[9px] font-black uppercase">
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {graph.nodes.map((node) => {
                const active = selectedNode?.id === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`absolute w-44 min-h-[86px] text-left neo-border p-3 transition-all ${statusTone[node.status] || 'border-outline bg-background'} ${
                      active ? 'shadow-[5px_5px_0px_0px_rgba(0,85,255,1)] -translate-x-0.5 -translate-y-0.5' : 'hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                    }`}
                    style={{ left: node.x, top: node.y }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="material-symbols-outlined text-base text-primary">{kindIcon[node.kind]}</span>
                      <span className="font-mono text-[8px] uppercase text-on-surface-variant">{node.status}</span>
                    </div>
                    <span className="block font-headline font-black uppercase text-[11px] leading-tight mt-2 line-clamp-2">{node.label}</span>
                    <span className="block font-body text-[10px] text-on-surface-variant mt-1 truncate">{node.actor || 'Supr'}</span>
                    {node.riskLevel && <span className="inline-block mt-2 border border-secondary px-1.5 py-0.5 font-mono text-[8px] uppercase text-secondary">{node.riskLevel}</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <aside className="bg-surface p-4 flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="neo-border bg-background p-4 flex flex-col gap-3">
            <h4 className="font-headline font-black uppercase text-sm text-primary flex items-center gap-1.5 border-b-2 border-primary pb-2">
              <span className="material-symbols-outlined text-sm text-tertiary">add_task</span>
              Spawn Agent
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={draft.role}
                onChange={(event) => setDraft((prev) => ({ ...prev, role: event.target.value }))}
                className="bg-surface-container neo-border px-2 py-2 font-headline font-bold uppercase text-[10px]"
              >
                {['Research', 'Code', 'QA', 'Frontend', 'Security', 'Signal'].map((role) => <option key={role}>{role}</option>)}
              </select>
              <select
                value={draft.permissionTier}
                onChange={(event) => setDraft((prev) => ({ ...prev, permissionTier: event.target.value }))}
                className="bg-surface-container neo-border px-2 py-2 font-headline font-bold uppercase text-[10px]"
              >
                {['Observe', 'Draft', 'Edit', 'Execute', 'External_Act'].map((tier) => <option key={tier}>{tier}</option>)}
              </select>
            </div>
            <input
              value={draft.capability}
              onChange={(event) => setDraft((prev) => ({ ...prev, capability: event.target.value }))}
              className="bg-surface-container neo-border px-3 py-2 font-body text-xs"
              placeholder="Capability"
            />
            <textarea
              value={draft.objective}
              onChange={(event) => setDraft((prev) => ({ ...prev, objective: event.target.value }))}
              className="bg-surface-container neo-border px-3 py-2 font-body text-xs min-h-24 custom-scrollbar"
              placeholder="Give the agent a concrete task..."
            />
            <select
              value={draft.riskLevel}
              onChange={(event) => setDraft((prev) => ({ ...prev, riskLevel: event.target.value as SpawnDraft['riskLevel'] }))}
              className="bg-surface-container neo-border px-2 py-2 font-headline font-bold uppercase text-[10px]"
            >
              {['Low', 'Medium', 'High', 'Critical'].map((risk) => <option key={risk}>{risk}</option>)}
            </select>
            <button
              type="submit"
              disabled={isSpawning || !draft.objective.trim()}
              className="bg-primary text-on-primary neo-border py-2 font-headline font-black uppercase text-xs hover:bg-tertiary hover:text-on-tertiary disabled:opacity-50"
            >
              {isSpawning ? 'Spawning...' : 'Spawn and Queue Action'}
            </button>
          </form>

          <div className="neo-border bg-background p-4 min-h-48">
            <h4 className="font-headline font-black uppercase text-sm text-primary flex items-center gap-1.5 border-b-2 border-primary pb-2 mb-3">
              <span className="material-symbols-outlined text-sm text-secondary">info</span>
              Selected Node
            </h4>
            {selectedNode ? (
              <div className="space-y-2">
                <p className="font-headline font-black uppercase text-base leading-tight">{selectedNode.label}</p>
                <p className="font-mono text-[10px] uppercase text-on-surface-variant">{selectedNode.kind} / {selectedNode.status}</p>
                <p className="font-body text-xs text-on-surface-variant leading-relaxed">{selectedNode.detail || 'No detail recorded yet.'}</p>
                <p className="font-body text-xs"><strong>Owner:</strong> {selectedNode.actor || 'Supr'}</p>
              </div>
            ) : (
              <p className="font-body text-xs text-on-surface-variant">Select a node to inspect it.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
