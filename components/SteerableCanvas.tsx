"use client";

import React, { useState } from 'react';

export interface DAGNode {
  id: string;
  name: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'WAITING_FOR_APPROVAL' | 'FAILED_RETRYING' | 'PENDING';
  agent?: {
    name: string;
    avatar: string;
    color: string;
  };
  retryCount?: number;
  maxRetries?: number;
  x: number;
  y: number;
}

interface Props {
  onNodeSteered?: (nodeId: string, instructions: string) => void;
  onNodeRollback?: (nodeId: string) => void;
  onCheckpointAdded?: (label: string, beforeNodeId: string) => void;
}

const generateUniqueId = () => `cp-${Date.now()}`;

export function SteerableCanvas({ onNodeSteered, onNodeRollback, onCheckpointAdded }: Props) {
  // 10 Glidepath DAG nodes
  const [nodes, setNodes] = useState<DAGNode[]>([
    { id: 'n1', name: 'Intake', status: 'COMPLETED', x: 60, y: 70 },
    { id: 'n2', name: 'Ingestion', status: 'COMPLETED', x: 200, y: 70 },
    { id: 'n3', name: 'Clustering', status: 'COMPLETED', x: 340, y: 70 },
    { id: 'n4', name: 'Context Scan', status: 'COMPLETED', x: 480, y: 70 },
    { id: 'n5', name: 'Cognitive Debt', status: 'COMPLETED', x: 620, y: 70 },
    { id: 'n6', name: 'Prioritization', status: 'COMPLETED', x: 760, y: 70 },
    { id: 'n7', name: 'Brief Gen', status: 'IN_PROGRESS', agent: { name: 'Signal Agent', avatar: 'sensors', color: 'bg-tertiary' }, x: 760, y: 220 },
    { id: 'n8', name: 'QA Gate', status: 'WAITING_FOR_APPROVAL', agent: { name: 'QA Agent', avatar: 'verified_user', color: 'bg-primary' }, x: 620, y: 220 },
    { id: 'n9', name: 'Code Sandbox', status: 'FAILED_RETRYING', agent: { name: 'Code Agent', avatar: 'code', color: 'bg-secondary' }, retryCount: 2, maxRetries: 3, x: 480, y: 220 },
    { id: 'n10', name: 'Export', status: 'PENDING', x: 340, y: 220 },
  ]);

  // Edges mapping source to target
  const [edges, setEdges] = useState<{ id: string; source: string; target: string; isHighlighted?: boolean }[]>([
    { id: 'e1', source: 'n1', target: 'n2' },
    { id: 'e2', source: 'n2', target: 'n3' },
    { id: 'e3', source: 'n3', target: 'n4' },
    { id: 'e4', source: 'n4', target: 'n5' },
    { id: 'e5', source: 'n5', target: 'n6' },
    { id: 'e6', source: 'n6', target: 'n7', isHighlighted: true },
    { id: 'e7', source: 'n7', target: 'n8' },
    { id: 'e8', source: 'n8', target: 'n9' },
    { id: 'e9', source: 'n9', target: 'n10' },
  ]);

  const [activeNode, setActiveNode] = useState<DAGNode | null>(null);
  const [steerInstructions, setSteerInstructions] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Handles dragover to allow dropping custom checkpoints
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Handles drop of presets onto active connection lines (edges)
  const handleDropOnEdge = (edgeId: string, edgeSource: string, edgeTarget: string) => {
    const label = 'Manual Review Checkpoint';
    
    // Insert new checkpoint node
    const sourceNode = nodes.find(n => n.id === edgeSource);
    const targetNode = nodes.find(n => n.id === edgeTarget);
    if (!sourceNode || !targetNode) return;

    const newId = generateUniqueId();
    const newCheckpointNode: DAGNode = {
      id: newId,
      name: 'Manual Gate',
      status: 'WAITING_FOR_APPROVAL',
      agent: { name: 'Supervisor', avatar: 'account_circle', color: 'bg-primary' },
      x: (sourceNode.x + targetNode.x) / 2,
      y: (sourceNode.y + targetNode.y) / 2 + 30
    };

    setNodes(prev => [...prev, newCheckpointNode]);
    setEdges(prev => {
      // Remove old edge, add two new connection edges
      const filtered = prev.filter(e => e.id !== edgeId);
      return [
        ...filtered,
        { id: `e-cp1-${newId}`, source: edgeSource, target: newId },
        { id: `e-cp2-${newId}`, source: newId, target: edgeTarget }
      ];
    });

    if (onCheckpointAdded) {
      onCheckpointAdded(label, edgeTarget);
    }
  };

  const handleNodeClick = (node: DAGNode) => {
    setActiveNode(node);
    setIsPaused(false);
    setSteerInstructions('');
  };

  const handlePauseSteer = () => {
    setIsPaused(!isPaused);
    if (onNodeSteered && activeNode && steerInstructions) {
      onNodeSteered(activeNode.id, steerInstructions);
    }
  };

  const handleRollback = () => {
    if (onNodeRollback && activeNode) {
      onNodeRollback(activeNode.id);
    }
  };

  return (
    <div className="bg-background neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-6 flex flex-col relative overflow-hidden h-[460px]">
      {/* Header */}
      <div className="flex justify-between items-center border-b-4 border-primary pb-3 mb-4">
        <div>
          <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">hub</span> Active Glidepath DAG Canvas
          </h3>
          <p className="font-body text-xs text-on-surface-variant font-bold">Steer sub-agent trajectories. Drag templates onto edges to drop manual checkpoint gates.</p>
        </div>
        <span className="bg-primary text-on-primary px-3 py-1 font-body text-[10px] font-bold uppercase neo-border flex items-center gap-1">
          <span className="material-symbols-outlined text-xs animate-spin">refresh</span> Real-Time Graph
        </span>
      </div>

      {/* Canvas viewport */}
      <div 
        className="flex-1 border-4 border-dashed border-primary/25 bg-surface-container-low relative p-2 overflow-auto custom-scrollbar select-none"
        onDragOver={handleDragOver}
      >
        {/* Draw edges as SVG lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0 min-w-[900px] min-h-[350px]">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="22" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#1a1a1a" />
            </marker>
          </defs>
          {edges.map(edge => {
            const sourceNode = nodes.find(n => n.id === edge.source);
            const targetNode = nodes.find(n => n.id === edge.target);
            if (!sourceNode || !targetNode) return null;

            // Simple line coordinate calculations
            const x1 = sourceNode.x + 60;
            const y1 = sourceNode.y + 25;
            const x2 = targetNode.x + 60;
            const y2 = targetNode.y + 25;

            return (
              <g key={edge.id}>
                {/* Invisible thicker line for easier hover & drop detection */}
                <line 
                  x1={x1} y1={y1} x2={x2} y2={y2} 
                  stroke="transparent" 
                  strokeWidth="24"
                  className="cursor-pointer pointer-events-auto"
                  onMouseEnter={() => setHoveredEdgeId(edge.id)}
                  onMouseLeave={() => setHoveredEdgeId(null)}
                  onDragOver={handleDragOver}
                  onDrop={() => handleDropOnEdge(edge.id, edge.source, edge.target)}
                />
                <line 
                  x1={x1} y1={y1} x2={x2} y2={y2} 
                  stroke="#1a1a1a" 
                  strokeWidth={edge.isHighlighted ? "4" : "2"}
                  strokeDasharray={edge.isHighlighted ? "5,5" : "none"}
                  markerEnd="url(#arrow)"
                  className="transition-all duration-300"
                />
                {hoveredEdgeId === edge.id && (
                  <text 
                    x={(x1+x2)/2} y={(y1+y2)/2 - 10} 
                    className="font-headline font-bold text-[9px] uppercase fill-secondary bg-background px-1 border"
                    textAnchor="middle"
                  >
                    Drop Checkpoint Gate Here
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Render interactive DAG Nodes */}
        <div className="absolute inset-0 z-10 min-w-[900px] min-h-[350px]">
          {nodes.map(node => {
            const isCompleted = node.status === 'COMPLETED';
            const isInProgress = node.status === 'IN_PROGRESS';
            const isWaiting = node.status === 'WAITING_FOR_APPROVAL';
            const isFailed = node.status === 'FAILED_RETRYING';
            const isActive = activeNode?.id === node.id;

            return (
              <div
                key={node.id}
                onClick={() => handleNodeClick(node)}
                className={`absolute w-32 min-h-[50px] neo-border bg-background p-2.5 cursor-pointer transition-all flex flex-col justify-between group select-none ${
                  isActive ? 'shadow-[4px_4px_0px_0px_rgba(0,85,255,1)] translate-x-[-1px] translate-y-[-1px]' : 'hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]'
                } ${
                  isInProgress ? 'border-tertiary animate-pulse shadow-[0_0_12px_rgba(0,85,255,0.2)]' : ''
                } ${
                  isFailed ? 'border-secondary' : ''
                }`}
                style={{ left: `${node.x}px`, top: `${node.y}px` }}
              >
                {/* Node Top bar */}
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-[8px] font-bold uppercase tracking-wider ${
                    isCompleted ? 'text-primary' : isInProgress ? 'text-tertiary' : isFailed ? 'text-secondary' : 'text-on-surface-variant'
                  }`}>
                    {node.name}
                  </span>
                  
                  {/* Status Indicator Badge */}
                  {isCompleted && (
                    <span className="material-symbols-outlined text-xs text-primary font-bold">check_circle</span>
                  )}
                  {isInProgress && (
                    <span className="material-symbols-outlined text-xs text-tertiary font-bold animate-spin">sync</span>
                  )}
                  {isWaiting && (
                    <span className="material-symbols-outlined text-xs text-amber-500 font-bold">lock</span>
                  )}
                  {isFailed && (
                    <span className="material-symbols-outlined text-xs text-secondary font-bold">warning</span>
                  )}
                </div>

                {/* Agent avatar badge mapping */}
                {node.agent ? (
                  <div className="flex items-center gap-1.5 mt-1 border-t-2 border-outline-variant pt-1">
                    <div className={`w-5 h-5 rounded-full ${node.agent.color} flex items-center justify-center neo-border-sm shrink-0`}>
                      <span className="material-symbols-outlined text-[10px] text-on-primary font-bold">{node.agent.avatar}</span>
                    </div>
                    <span className="font-headline font-bold text-[8px] uppercase text-primary truncate leading-none">
                      {node.agent.name}
                    </span>
                  </div>
                ) : (
                  <div className="h-4"></div>
                )}

                {/* Retry Counter badge */}
                {isFailed && node.retryCount && (
                  <div className="mt-1 bg-secondary text-on-error text-[8px] font-bold uppercase text-center px-1 py-0.5 border border-primary">
                    Attempt {node.retryCount}/{node.maxRetries}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Node Steering Dashboard Modal / Sidebar Panel inside Canvas */}
      {activeNode && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-surface-container border-l-4 border-primary z-20 p-5 flex flex-col justify-between shadow-[-4px_0_15px_rgba(26,26,26,0.15)] animate-slide-in">
          <div>
            <div className="flex justify-between items-center border-b-2 border-primary pb-2 mb-3">
              <h4 className="font-headline font-black uppercase text-sm text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">settings_input_composite</span>
                Steer Node: {activeNode.name}
              </h4>
              <button onClick={() => setActiveNode(null)} className="text-primary hover:text-secondary">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 font-body text-xs">
              <p><strong>Status:</strong> <span className="font-mono bg-surface px-1 border">{activeNode.status}</span></p>
              {activeNode.agent && (
                <p><strong>Active Unit:</strong> <span className="font-headline font-bold text-tertiary uppercase">{activeNode.agent.name}</span></p>
              )}

              {/* Time Travel Snapshot Reversion */}
              {activeNode.status === 'COMPLETED' && (
                <div className="bg-surface border-2 border-dashed border-primary p-3 space-y-2 mt-4">
                  <h5 className="font-headline font-bold text-[10px] uppercase text-secondary flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">history</span> Time Travel Rollback
                  </h5>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed">Clique parameter reversion allows restoring the file tree to this snapshot node state and truncating future execution paths.</p>
                  <button 
                    onClick={handleRollback}
                    className="w-full py-2 bg-secondary text-on-secondary neo-border text-[10px] font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5"
                  >
                    Rollback to this state
                  </button>
                </div>
              )}

              {/* Interactive Override: PAUSE & INTERCEPT active nodes */}
              {(activeNode.status === 'IN_PROGRESS' || activeNode.status === 'FAILED_RETRYING') && (
                <div className="bg-background border-2 border-primary p-3 space-y-2.5 mt-4">
                  <h5 className="font-headline font-bold text-[10px] uppercase text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">pan_tool</span> AG-UI Interactive Override
                  </h5>
                  <p className="text-[10px] text-on-surface-variant leading-relaxed">Pauses live execution threads and allows injecting manual directions directly into agent prompt buffers.</p>
                  
                  {isPaused && (
                    <textarea 
                      value={steerInstructions}
                      onChange={e => setSteerInstructions(e.target.value)}
                      className="w-full h-20 bg-surface neo-border p-2 text-[10px] font-body focus:outline-none custom-scrollbar"
                      placeholder="Inject custom prompts instructions here..."
                    />
                  )}

                  <button 
                    onClick={handlePauseSteer}
                    className={`w-full py-2 neo-border text-[10px] font-headline font-bold uppercase transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 ${
                      isPaused ? 'bg-primary text-on-primary hover:bg-tertiary' : 'bg-secondary text-on-secondary hover:bg-primary'
                    }`}
                  >
                    {isPaused ? 'Inject & Resume Worker' : 'Pause & Manual Intercept'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="text-right">
            <span className="font-mono text-[9px] text-on-surface-variant uppercase">Supr Orchestration Engine v3.5</span>
          </div>
        </div>
      )}
    </div>
  );
}
