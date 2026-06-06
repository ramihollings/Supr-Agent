"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import type { PhaseGroup } from '@/lib/services/graph-layout';

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
  width?: number;
  height?: number;
  // Optional phase id used to bucket the node into a sub-graph.
  phaseId?: string;
  phaseName?: string;
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
    phaseGroups?: PhaseGroup[];
    flowRun?: { id: string; status: string; mode: string; source?: string } | null;
    agentRuns?: Array<{ id: string; status: string; agentId?: string; logs?: string[]; error?: string; createdAt?: string }>;
    toolInvocations?: Array<{
      id: string;
      status: string;
      toolName: string;
      agentId?: string;
      error?: string;
      createdAt?: string;
      output?: {
        command?: string;
        stdout?: string;
        stderr?: string;
        exitCode?: number;
        durationMs?: number;
      } | null;
    }>;
    counts?: Record<string, number>;
  } | null;
  onSpawnAgent: (draft: SpawnDraft) => Promise<void>;
  onStartFlow: () => Promise<void>;
  onRunFlow: () => Promise<void>;
  onPauseFlow: () => Promise<void>;
  onResumeFlow: () => Promise<void>;
  onRetryFailed: () => Promise<void>;
  onApproveLowRisk: () => Promise<void>;
  /**
   * Throttle: max one node-status transition per this many ms.
   * Set to 0 in tests to drain the queue immediately.
   */
  transitionMs?: number;
  isSpawning?: boolean;
  isBusy?: boolean;
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

const PHASE_BAND_TONE: Record<string, string> = {
  Active: 'border-tertiary bg-tertiary/5',
  Done: 'border-primary bg-primary/5',
  Pending: 'border-outline bg-surface-container/30 opacity-70',
  Blocked: 'border-secondary bg-secondary/5',
  Gate_Pending: 'border-secondary bg-secondary/5',
};

const PHASE_TONE: Record<string, string> = {
  Active: 'border-tertiary bg-tertiary text-on-tertiary animate-pulse',
  Done: 'border-primary bg-primary/30 text-primary',
  Pending: 'border-outline bg-surface text-on-surface-variant',
  Blocked: 'border-secondary bg-secondary/20 text-secondary',
  Gate_Pending: 'border-secondary bg-secondary/20 text-secondary',
};

/**
 * ProjectWorkflowCanvas -- the Live Work Graph view.
 *
 * Pass 2 changes (Live Work Graph cleanup):
 *   - Renders the DAG layout produced server-side by
 *     `lib/services/graph-layout.ts` (dagre with pure-JS fallback).
 *   - Renders collapsed phase sub-graphs (PhaseGroups) behind the
 *     nodes; clicking a phase header toggles expansion.
 *   - Throttles node-status transitions through a per-status queue
 *     so the human eye can follow the work without losing
 *     information when the SSE stream fires 10+ events at once.
 */
export function ProjectWorkflowCanvas({
  graph,
  onSpawnAgent,
  onStartFlow,
  onRunFlow,
  onPauseFlow,
  onResumeFlow,
  onRetryFailed,
  onApproveLowRisk,
  transitionMs = 600,
  isSpawning = false,
  isBusy = false,
}: Props) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedPhases, setExpandedPhases] = useState<Set<string>>(
    () => new Set(), // collapsed by default; user opts in
  );
  const [draft, setDraft] = useState<SpawnDraft>({
    role: 'Code',
    objective: '',
    permissionTier: 'Edit',
    capability: 'workspace_write_artifact',
    riskLevel: 'Medium',
  });

  // -------------------------------------------------------------------
  // Throttled status transitions. We diff incoming nodes against
  // the last rendered snapshot and push *changed statuses* onto a
  // queue. The drainer pops one entry every `transitionMs` and
  // updates the displayed node. A status change is just a colour
  // flash, so the user sees the work without losing context.
  // -------------------------------------------------------------------
  const [renderedNodes, setRenderedNodes] = useState<WorkflowNode[]>(graph?.nodes || []);
  const pendingStatusChangesRef = useRef<Array<{ id: string; status: string }>>([]);
  const drainingRef = useRef(false);
  const lastNodeMapRef = useRef<Map<string, WorkflowNode>>(new Map());

  useEffect(() => {
    if (!graph || !graph.nodes) {
      setRenderedNodes([]);
      return;
    }
    // First load: just take the snapshot wholesale.
    if (lastNodeMapRef.current.size === 0) {
      lastNodeMapRef.current = new Map(graph.nodes.map((n) => [n.id, n]));
      setRenderedNodes(graph.nodes);
      return;
    }
    // Diff statuses and push new ones onto the queue.
    const incomingById = new Map(graph.nodes.map((n) => [n.id, n]));
    for (const n of graph.nodes) {
      const prev = lastNodeMapRef.current.get(n.id);
      if (prev && prev.status !== n.status) {
        pendingStatusChangesRef.current.push({ id: n.id, status: n.status });
      }
    }
    // Remove queue entries for nodes that no longer exist.
    const liveIds = new Set(graph.nodes.map((n) => n.id));
    pendingStatusChangesRef.current = pendingStatusChangesRef.current.filter(
      (p) => liveIds.has(p.id),
    );
    // Update the last-seen map to the latest incoming positions so
    // the canvas can re-render positions in lock-step with
    // statuses.
    lastNodeMapRef.current = incomingById;
    setRenderedNodes(graph.nodes);
  }, [graph]);

  // Drainer: one node transition per `transitionMs`.
  useEffect(() => {
    if (transitionMs <= 0) {
      // Tests: drain everything synchronously.
      while (pendingStatusChangesRef.current.length > 0) {
        const next = pendingStatusChangesRef.current.shift()!;
        setRenderedNodes((prev) =>
          prev.map((n) => (n.id === next.id ? { ...n, status: next.status } : n)),
        );
      }
      return;
    }
    const drain = () => {
      if (drainingRef.current) return;
      const next = pendingStatusChangesRef.current.shift();
      if (!next) {
        drainingRef.current = false;
        return;
      }
      drainingRef.current = true;
      setRenderedNodes((prev) =>
        prev.map((n) => (n.id === next.id ? { ...n, status: next.status } : n)),
      );
      setTimeout(() => {
        drainingRef.current = false;
        drain();
      }, transitionMs);
    };
    // Kick off a drain whenever the queue is non-empty. The
    // drainer above is single-flight so we never overlap.
    const interval = setInterval(drain, transitionMs);
    return () => clearInterval(interval);
  }, [transitionMs]);

  // -------------------------------------------------------------------
  // Layout bookkeeping.
  // -------------------------------------------------------------------
  const selectedNode = useMemo(
    () =>
      renderedNodes.find((n) => n.id === selectedNodeId) ||
      renderedNodes.find((n) => n.status === 'Active' || n.status === 'running') ||
      renderedNodes[0],
    [renderedNodes, selectedNodeId],
  );

  const nodeMap = useMemo(() => {
    const map = new Map<string, WorkflowNode>();
    renderedNodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [renderedNodes]);

  // Canvas size: union of nodes AND phase bands. Use a small
  // margin so the rightmost band isn't clipped.
  const canvasSize = useMemo(() => {
    const xs: number[] = [];
    const ys: number[] = [];
    const xEnds: number[] = [];
    const yEnds: number[] = [];
    for (const n of renderedNodes) {
      const w = n.width ?? 176;
      const h = n.height ?? 86;
      xs.push(n.x);
      ys.push(n.y);
      xEnds.push(n.x + w);
      yEnds.push(n.y + h);
    }
    for (const g of graph?.phaseGroups || []) {
      xs.push(g.x);
      ys.push(g.y);
      xEnds.push(g.x + g.width);
      yEnds.push(g.y + g.height);
    }
    const minX = xs.length > 0 ? Math.min(...xs) : 0;
    const minY = ys.length > 0 ? Math.min(...ys) : 0;
    const maxX = xEnds.length > 0 ? Math.max(...xEnds) : 980;
    const maxY = yEnds.length > 0 ? Math.max(...yEnds) : 620;
    return {
      width: Math.max(980, maxX - minX + 80),
      height: Math.max(620, maxY - minY + 80),
      offsetX: minX - 40,
      offsetY: minY - 40,
    };
  }, [renderedNodes, graph?.phaseGroups]);

  const workEvents = useMemo(
    () => [
      ...(graph?.toolInvocations || []).map((tool) => ({
        id: tool.id,
        status: tool.status,
        actor: tool.agentId || 'Tool',
        detail: tool.error
          || (tool.toolName === 'execute_command' && tool.output
            ? `exitCode=${tool.output.exitCode ?? 'unknown'} stdout=${tool.output.stdout || ''} stderr=${tool.output.stderr || ''}`.trim()
            : tool.toolName),
        kind: 'tool',
      })),
      ...(graph?.agentRuns || []).map((run) => ({
        id: run.id,
        status: run.status,
        actor: run.agentId || 'Agent',
        detail: run.error || run.logs?.[0] || 'Heartbeat recorded.',
        kind: 'agent',
      })),
    ],
    [graph],
  );

  // -------------------------------------------------------------------
  // Phase sub-graph expansion logic.
  // -------------------------------------------------------------------
  const phaseGroups = graph?.phaseGroups || [];
  const togglePhase = useCallback((phaseId: string) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }, []);

  // Map node id -> phaseGroup id so we can hide/show nodes
  // based on the user's collapse state.
  const nodeToPhase = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of phaseGroups) {
      for (const nid of g.nodeIds) m.set(nid, g.id);
    }
    return m;
  }, [phaseGroups]);

  // Whether a node is "visible" given the current collapse state.
  // Future phases are always collapsed by default; the user can
  // expand a phase to peek at its pending work.
  const isNodeVisible = useCallback(
    (n: WorkflowNode) => {
      if (phaseGroups.length === 0) return true; // no sub-graphs, show all
      const phaseId = nodeToPhase.get(n.id) || n.phaseId;
      if (!phaseId) return true;
      // Active phase is always expanded. Future phases are
      // collapsed until the user clicks the band.
      const grp = phaseGroups.find((g) => g.id === phaseId);
      if (!grp) return true;
      if (grp.status === 'Active') return true;
      return expandedPhases.has(phaseId);
    },
    [phaseGroups, expandedPhases, nodeToPhase],
  );

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
            Live Work Graph
          </h3>
          <p className="font-body text-xs text-on-surface-variant font-bold">
            Supr directs agents through phases, tasks, approvals, run records, and deliverables.
          </p>
        </div>
        <div className="flex flex-col gap-2 min-w-full lg:min-w-[560px]">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <button onClick={onStartFlow} disabled={isBusy} className="bg-primary text-on-primary border border-primary px-2 py-2 font-headline font-black uppercase text-[9px] disabled:opacity-50">Start Project Flow</button>
            <button onClick={onRunFlow} disabled={isBusy} className="bg-background border border-primary px-2 py-2 font-headline font-black uppercase text-[9px] disabled:opacity-50">Run</button>
            <button onClick={onPauseFlow} disabled={isBusy} className="bg-background border border-primary px-2 py-2 font-headline font-black uppercase text-[9px] disabled:opacity-50">Pause</button>
            <button onClick={onResumeFlow} disabled={isBusy} className="bg-background border border-primary px-2 py-2 font-headline font-black uppercase text-[9px] disabled:opacity-50">Resume</button>
            <button onClick={onRetryFailed} disabled={isBusy} className="bg-background border border-secondary px-2 py-2 font-headline font-black uppercase text-[9px] disabled:opacity-50">Retry Failed</button>
            <button onClick={onApproveLowRisk} disabled={isBusy} className="bg-secondary text-on-secondary border border-secondary px-2 py-2 font-headline font-black uppercase text-[9px] disabled:opacity-50">Approve Low Risk</button>
          </div>
          <div className="grid grid-cols-6 gap-2">
            <div className="bg-surface-container border border-outline-variant p-2 text-center">
              <span className="block font-mono text-sm font-black text-primary">{graph?.flowRun?.status || 'idle'}</span>
              <span className="block font-headline text-[8px] font-bold uppercase text-on-surface-variant">flow</span>
            </div>
            {Object.entries(graph?.counts || { phases: 0, tasks: 0, actions: 0, approvals: 0, artifacts: 0 }).map(([key, value]) => (
              <div key={key} className="bg-surface-container border border-outline-variant p-2 text-center">
                <span className="block font-mono text-sm font-black text-primary">{value}</span>
                <span className="block font-headline text-[8px] font-bold uppercase text-on-surface-variant">{key}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1fr_340px] flex-1 min-h-0">
        <div className="relative overflow-auto custom-scrollbar bg-surface-container-low border-b-4 xl:border-b-0 xl:border-r-4 border-primary">
          {!graph || graph.nodes.length === 0 ? (
            <div className="p-8 font-body text-sm text-on-surface-variant">
              No work graph yet. Click Start Project Flow to let Supr decompose the project, spawn agents, and queue work.
            </div>
          ) : (
            <div className="relative" style={{ width: canvasSize.width, height: canvasSize.height }}>
              <svg
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <marker id="workflow-arrow" viewBox="0 0 10 10" refX="18" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a1a1a" />
                  </marker>
                </defs>
                {graph.edges.map((edge) => {
                  const source = nodeMap.get(edge.source);
                  const target = nodeMap.get(edge.target);
                  if (!source || !target) return null;
                  if (!isNodeVisible(source) || !isNodeVisible(target)) return null;
                  const sw = source.width ?? 176;
                  const sh = source.height ?? 86;
                  const tw = target.width ?? 176;
                  const th = target.height ?? 86;
                  const x1 = source.x - canvasSize.offsetX + sw / 2;
                  const y1 = source.y - canvasSize.offsetY + sh / 2;
                  const x2 = target.x - canvasSize.offsetX + tw / 2;
                  const y2 = target.y - canvasSize.offsetY + th / 2;
                  return (
                    <g key={edge.id}>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#1a1a1a"
                        strokeWidth="2"
                        markerEnd="url(#workflow-arrow)"
                        opacity={0.6}
                      />
                      {edge.label && (
                        <text
                          x={(x1 + x2) / 2}
                          y={(y1 + y2) / 2 - 8}
                          textAnchor="middle"
                          className="fill-primary font-headline text-[9px] font-black uppercase"
                        >
                          {edge.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {/* Phase sub-graph bands (rendered behind the nodes). */}
              {phaseGroups.map((g) => {
                const tone = PHASE_BAND_TONE[g.status] || PHASE_BAND_TONE.Pending;
                const isExpanded = expandedPhases.has(g.id) || g.status === 'Active';
                return (
                  <div
                    key={g.id}
                    data-phase-band={g.id}
                    className={`absolute border-4 border-dashed ${tone} pointer-events-none`}
                    style={{
                      left: g.x - canvasSize.offsetX,
                      top: g.y - canvasSize.offsetY,
                      width: g.width,
                      height: g.height,
                    }}
                  />
                );
              })}

              {/* Phase band headers (clickable, rendered in front of bands). */}
              {phaseGroups.map((g) => {
                const tone = PHASE_TONE[g.status] || PHASE_TONE.Pending;
                const isExpanded = expandedPhases.has(g.id) || g.status === 'Active';
                const nodeCount = g.nodeIds.length;
                return (
                  <button
                    key={`${g.id}-header`}
                    type="button"
                    onClick={() => togglePhase(g.id)}
                    className={`absolute neo-border ${tone} font-headline font-black uppercase text-[10px] flex items-center gap-1.5 px-2 py-1 cursor-pointer z-10`}
                    style={{
                      left: g.x - canvasSize.offsetX + 8,
                      top: g.y - canvasSize.offsetY - 18,
                    }}
                    title={`${isExpanded ? 'Collapse' : 'Expand'} ${g.name} phase (${nodeCount} node${nodeCount === 1 ? '' : 's'})`}
                  >
                    <span className="material-symbols-outlined text-[12px]">
                      {isExpanded ? 'expand_less' : 'expand_more'}
                    </span>
                    {g.name}
                    <span className="ml-1 px-1.5 py-0.5 bg-background/40 text-[8px] font-mono">{nodeCount}</span>
                  </button>
                );
              })}

              {/* Nodes (filtered by collapse state). */}
              {renderedNodes.filter(isNodeVisible).map((node) => {
                const w = node.width ?? 176;
                const h = node.height ?? 86;
                const active = selectedNode?.id === node.id;
                // Flash a border-colour transition when a status
                // change is applied. The CSS `transition` is
                // on the border colour; the JS just toggles
                // the class.
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={`absolute neo-border p-3 text-left transition-colors duration-500 ${statusTone[node.status] || 'border-outline bg-background'} ${active
                        ? 'shadow-[5px_5px_0px_0px_rgba(0,85,255,1)] -translate-x-0.5 -translate-y-0.5'
                        : 'hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                      }`}
                    style={{ left: node.x - canvasSize.offsetX, top: node.y - canvasSize.offsetY, width: w, height: h }}
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
            <select
              value={draft.capability}
              onChange={(event) => setDraft((prev) => ({ ...prev, capability: event.target.value }))}
              className="bg-surface-container neo-border px-3 py-2 font-headline font-bold uppercase text-[10px]"
            >
              {[
                'web_scrape',
                'workspace_write_artifact',
                'workspace_write_file',
                'workspace_validate_outputs',
                'governance_review',
                'delivery_package',
                'execute_command',
              ].map((capability) => <option key={capability} value={capability}>{capability}</option>)}
            </select>
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
                {selectedNode.phaseName && (
                  <p className="font-body text-xs"><strong>Phase:</strong> {selectedNode.phaseName}</p>
                )}
              </div>
            ) : (
              <p className="font-body text-xs text-on-surface-variant">Select a node to inspect it.</p>
            )}
          </div>

          <div className="neo-border bg-background p-4 min-h-48">
            <h4 className="font-headline font-black uppercase text-sm text-primary flex items-center gap-1.5 border-b-2 border-primary pb-2 mb-3">
              <span className="material-symbols-outlined text-sm text-tertiary">receipt_long</span>
              What Happened
            </h4>
            <div className="space-y-2 max-h-56 overflow-y-auto custom-scrollbar">
              {workEvents.length > 0 ? workEvents.map((run) => (
                <div key={run.id} className="border-l-4 border-tertiary pl-3 py-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-headline font-black uppercase text-[10px]">{run.actor}</span>
                    <span className="font-mono text-[8px] uppercase text-on-surface-variant">{run.status}</span>
                  </div>
                  <p className="font-body text-[10px] text-on-surface-variant line-clamp-2">{run.kind === 'tool' ? `Tool: ${run.detail}` : run.detail}</p>
                </div>
              )) : (
                <p className="font-body text-xs text-on-surface-variant">No agent or tool runs yet.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
