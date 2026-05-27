"use client";

import React, { useState, useEffect } from 'react';
import { Mission, Phase, Task, PhaseStatus } from '@/types';
import { updateGlidepathAction } from '@/app/actions';

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
  mission: Mission | null;
  onNodeSteered?: (nodeId: string, instructions: string) => void;
  onNodeRollback?: (nodeId: string) => void;
  onCheckpointAdded?: (label: string, beforeNodeId: string) => void;
}

const generateUniqueId = () => `p-${Date.now()}`;

export function SteerableCanvas({ mission, onNodeSteered, onNodeRollback, onCheckpointAdded }: Props) {
  // Sync state with mission props
  const [localPhases, setLocalPhases] = useState<Phase[]>([]);
  const [localTasks, setLocalTasks] = useState<Task[]>([]);
  const [activeNode, setActiveNode] = useState<DAGNode | null>(null);
  const [editPhaseName, setEditPhaseName] = useState('');
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [steerInstructions, setSteerInstructions] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  // Fallback structures if no active mission is loaded
  const fallbackPhases: Phase[] = [
    { id: 'n1', name: 'Intake', status: 'Done' },
    { id: 'n2', name: 'Ingestion', status: 'Done' },
    { id: 'n3', name: 'Clustering', status: 'Done' },
    { id: 'n4', name: 'Context Scan', status: 'Done' },
    { id: 'n5', name: 'Cognitive Debt', status: 'Done' },
    { id: 'n6', name: 'Prioritization', status: 'Done' },
    { id: 'n7', name: 'Brief Gen', status: 'Active' },
    { id: 'n8', name: 'QA Gate', status: 'Gate_Pending' },
    { id: 'n9', name: 'Code Sandbox', status: 'Blocked' },
    { id: 'n10', name: 'Export', status: 'Pending' }
  ];

  const fallbackTasks: Task[] = [
    { id: 't1', title: 'Context Indexing Audit', description: '', agentName: 'Research Agent', agentIcon: 'travel_explore', status: 'Done' },
    { id: 't2', title: 'AST sandbox caching compilation', description: '', agentName: 'Code Agent', agentIcon: 'code', status: 'Active' }
  ];

  useEffect(() => {
    if (mission) {
      setLocalPhases(mission.phases || []);
      setLocalTasks(mission.tasks || []);
    } else {
      setLocalPhases(fallbackPhases);
      setLocalTasks(fallbackTasks);
    }
  }, [mission]);

  // Save changes to database
  const persistChanges = async (phases: Phase[], tasks: Task[]) => {
    if (mission) {
      await updateGlidepathAction(mission.id, phases, tasks);
    }
  };

  const getCoordinates = (index: number) => {
    const row = Math.floor(index / 5);
    const col = index % 5;
    // Row wrapping snake layout (left-to-right then right-to-left)
    const x = row % 2 === 0 ? 60 + col * 160 : 60 + (4 - col) * 160;
    const y = 70 + row * 140;
    return { x, y };
  };

  // Convert Phase Status to visual node status enum
  const getVisualStatus = (status: PhaseStatus) => {
    switch (status) {
      case 'Done': return 'COMPLETED';
      case 'Active': return 'IN_PROGRESS';
      case 'Gate_Pending': return 'WAITING_FOR_APPROVAL';
      case 'Blocked': return 'FAILED_RETRYING';
      default: return 'PENDING';
    }
  };

  // Convert visual status back to Phase Status
  const getPhaseStatusFromVisual = (status: DAGNode['status']): PhaseStatus => {
    switch (status) {
      case 'COMPLETED': return 'Done';
      case 'IN_PROGRESS': return 'Active';
      case 'WAITING_FOR_APPROVAL': return 'Gate_Pending';
      case 'FAILED_RETRYING': return 'Blocked';
      default: return 'Pending';
    }
  };

  // Calculate nodes dynamically from localPhases
  const nodes: DAGNode[] = localPhases.map((phase, idx) => {
    const coords = getCoordinates(idx);
    
    // Find active task or agent for this phase
    const phaseTasks = localTasks.filter(t => t.id.startsWith(phase.id) || t.title.toLowerCase().includes(phase.name.toLowerCase()));
    const activeTask = phaseTasks.find(t => t.status === 'Active' || t.status === 'Blocked') || phaseTasks[0];
    
    let agent = undefined;
    if (activeTask) {
      agent = {
        name: activeTask.agentName,
        avatar: activeTask.agentIcon || 'smart_toy',
        color: activeTask.agentName === 'QA Agent' ? 'bg-primary' : activeTask.agentName === 'Code Agent' ? 'bg-secondary' : 'bg-tertiary'
      };
    } else {
      // Design fallbacks for default nodes to keep visual look premium
      if (phase.id === 'n7' || phase.id === 'p7') agent = { name: 'Signal Agent', avatar: 'sensors', color: 'bg-tertiary' };
      if (phase.id === 'n8' || phase.id === 'p8') agent = { name: 'QA Agent', avatar: 'verified_user', color: 'bg-primary' };
      if (phase.id === 'n9' || phase.id === 'p9') agent = { name: 'Code Agent', avatar: 'code', color: 'bg-secondary' };
    }

    return {
      id: phase.id,
      name: phase.name,
      status: getVisualStatus(phase.status),
      agent,
      x: coords.x,
      y: coords.y
    };
  });

  // Calculate edges sequentially between nodes
  const edges = localPhases.slice(0, -1).map((phase, idx) => ({
    id: `e-${phase.id}-${localPhases[idx + 1].id}`,
    source: phase.id,
    target: localPhases[idx + 1].id,
    isHighlighted: phase.status === 'Active' || phase.status === 'Gate_Pending'
  }));

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Drop checkpoint preset onto connections
  const handleDropOnEdge = (edgeId: string, edgeSource: string, edgeTarget: string) => {
    const sourceIdx = localPhases.findIndex(p => p.id === edgeSource);
    if (sourceIdx === -1) return;

    const newId = generateUniqueId();
    const newPhase: Phase = {
      id: newId,
      name: 'Manual Gate',
      status: 'Gate_Pending'
    };

    const updated = [...localPhases];
    updated.splice(sourceIdx + 1, 0, newPhase);

    setLocalPhases(updated);
    persistChanges(updated, localTasks);

    if (onCheckpointAdded) {
      onCheckpointAdded('Manual Gate Checkpoint', edgeTarget);
    }
  };

  const handleNodeClick = (node: DAGNode) => {
    setActiveNode(node);
    setEditPhaseName(node.name);
    setIsPaused(false);
    setSteerInstructions('');
    setNewTaskTitle('');
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

  // Interactive controls: Rename Phase
  const handleRenamePhase = () => {
    if (!activeNode || !editPhaseName.trim()) return;
    const updated = localPhases.map(p => p.id === activeNode.id ? { ...p, name: editPhaseName } : p);
    setLocalPhases(updated);
    persistChanges(updated, localTasks);
    setActiveNode(prev => prev ? { ...prev, name: editPhaseName } : null);
  };

  // Interactive controls: Delete Phase
  const handleDeletePhase = () => {
    if (!activeNode) return;
    if (confirm(`Are you sure you want to delete phase "${activeNode.name}"?`)) {
      const updated = localPhases.filter(p => p.id !== activeNode.id);
      setLocalPhases(updated);
      persistChanges(updated, localTasks);
      setActiveNode(null);
    }
  };

  // Interactive controls: Change Status
  const handleStatusChange = (status: PhaseStatus) => {
    if (!activeNode) return;
    const updated = localPhases.map(p => p.id === activeNode.id ? { ...p, status } : p);
    setLocalPhases(updated);
    persistChanges(updated, localTasks);
    setActiveNode(prev => prev ? { ...prev, status: getVisualStatus(status) } : null);
  };

  // Interactive controls: Add Task under Phase
  const handleAddTask = () => {
    if (!activeNode || !newTaskTitle.trim()) return;
    const newT: Task = {
      id: `${activeNode.id}-t-${Date.now()}`,
      title: newTaskTitle,
      description: '',
      agentName: 'Code Agent',
      agentIcon: 'code',
      status: 'Pending'
    };
    const updated = [...localTasks, newT];
    setLocalTasks(updated);
    persistChanges(localPhases, updated);
    setNewTaskTitle('');
  };

  // Interactive controls: Delete Task
  const handleDeleteTask = (taskId: string) => {
    const updated = localTasks.filter(t => t.id !== taskId);
    setLocalTasks(updated);
    persistChanges(localPhases, updated);
  };

  // Add new phase at the end of the roadmap
  const handleAddNewPhase = () => {
    const name = prompt("Enter new phase name:");
    if (!name) return;
    const newId = generateUniqueId();
    const newPhase: Phase = {
      id: newId,
      name: name,
      status: 'Pending'
    };
    const updated = [...localPhases, newPhase];
    setLocalPhases(updated);
    persistChanges(updated, localTasks);
  };

  // Filter tasks belonging to currently active node
  const activeNodeTasks = activeNode
    ? localTasks.filter(t => t.id.startsWith(activeNode.id) || t.title.toLowerCase().includes(activeNode.name.toLowerCase()))
    : [];

  return (
    <div className="bg-background neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-6 flex flex-col relative overflow-hidden h-[460px]">
      {/* Header */}
      <div className="flex justify-between items-center border-b-4 border-primary pb-3 mb-4">
        <div>
          <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">hub</span> Active Glidepath DAG Canvas
          </h3>
          <p className="font-body text-xs text-on-surface-variant font-bold">Steer sub-agent trajectories. Drag templates onto edges or customize phases directly.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleAddNewPhase}
            className="bg-primary text-on-primary px-3 py-1 font-headline text-[10px] font-bold uppercase neo-border hover:bg-tertiary hover:text-on-tertiary transition-colors"
          >
            + Add Phase
          </button>
          <span className="bg-primary text-on-primary px-3 py-1 font-body text-[10px] font-bold uppercase neo-border flex items-center gap-1">
            <span className="material-symbols-outlined text-xs animate-spin">refresh</span> Real-Time Graph
          </span>
        </div>
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
                  <span className={`text-[8px] font-bold uppercase tracking-wider truncate max-w-[85px] ${
                    isCompleted ? 'text-primary' : isInProgress ? 'text-tertiary' : isFailed ? 'text-secondary' : 'text-on-surface-variant'
                  }`}>
                    {node.name}
                  </span>
                  
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
              </div>
            );
          })}
        </div>
      </div>

      {/* Node Steering Dashboard Drawer */}
      {activeNode && (
        <div className="absolute right-0 top-0 bottom-0 w-80 bg-surface-container border-l-4 border-primary z-20 p-5 flex flex-col justify-between shadow-[-4px_0_15px_rgba(26,26,26,0.15)] animate-slide-in overflow-y-auto custom-scrollbar">
          <div className="space-y-4">
            <div className="flex justify-between items-center border-b-2 border-primary pb-2">
              <h4 className="font-headline font-black uppercase text-sm text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">settings_input_composite</span>
                Steer Phase
              </h4>
              <button onClick={() => setActiveNode(null)} className="text-primary hover:text-secondary">
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 font-body text-xs">
              {/* Rename Action */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-on-surface-variant font-mono">Rename Phase</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editPhaseName}
                    onChange={e => setEditPhaseName(e.target.value)}
                    className="flex-1 bg-surface neo-border p-1.5 font-bold uppercase text-[10px] focus:outline-none"
                  />
                  <button
                    onClick={handleRenamePhase}
                    className="px-3 py-1.5 bg-primary text-on-primary font-headline text-[10px] font-bold uppercase neo-border"
                  >
                    Save
                  </button>
                </div>
              </div>

              {/* Status Action */}
              <div className="space-y-1">
                <label className="block text-[9px] font-black uppercase text-on-surface-variant font-mono">Change Status</label>
                <select
                  value={localPhases.find(p => p.id === activeNode.id)?.status || 'Pending'}
                  onChange={e => handleStatusChange(e.target.value as any)}
                  className="w-full bg-surface neo-border p-1.5 font-bold text-[10px] focus:outline-none"
                >
                  <option value="Pending">Pending (Awaiting)</option>
                  <option value="Active">Active (In Progress)</option>
                  <option value="Gate_Pending">Gate Pending (Gov Gate)</option>
                  <option value="Blocked">Blocked (Error/Hold)</option>
                  <option value="Done">Done (Completed)</option>
                </select>
              </div>

              {/* Tasks Sub-Manager inside Phase */}
              <div className="bg-background border-2 border-primary p-3 space-y-2 mt-4">
                <h5 className="font-headline font-black text-[10px] uppercase text-primary border-b border-primary pb-1">Tasks in Phase</h5>
                {activeNodeTasks.length === 0 ? (
                  <p className="text-[9px] italic text-on-surface-variant p-1">No tasks configured under this phase.</p>
                ) : (
                  <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar pr-1">
                    {activeNodeTasks.map(t => (
                      <div key={t.id} className="flex justify-between items-center bg-surface p-1.5 border border-primary text-[9px] gap-2">
                        <div className="truncate flex-1 pr-1">
                          <span className="font-bold block truncate">{t.title}</span>
                          <span className="text-[7px] text-on-surface-variant font-mono uppercase block">{t.agentName} • {t.status}</span>
                        </div>
                        <button
                          onClick={() => handleDeleteTask(t.id)}
                          className="text-error hover:text-red-700 font-bold text-[8px] uppercase shrink-0"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Inline task creator */}
                <div className="flex gap-1.5 pt-2 border-t border-dashed border-outline-variant mt-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={e => setNewTaskTitle(e.target.value)}
                    placeholder="New task name..."
                    className="flex-1 bg-surface neo-border-sm px-2 py-1 text-[9px] focus:outline-none"
                  />
                  <button
                    onClick={handleAddTask}
                    className="px-2.5 py-1 bg-tertiary text-on-tertiary font-headline font-bold text-[9px] uppercase neo-border"
                  >
                    Add
                  </button>
                </div>
              </div>

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

              {/* Dynamic Override (Pause & Inject) */}
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
                      isPaused ? 'bg-primary text-on-primary' : 'bg-secondary text-on-secondary'
                    }`}
                  >
                    {isPaused ? 'Inject & Resume Worker' : 'Pause & Manual Intercept'}
                  </button>
                </div>
              )}

              {/* Delete Phase Node entirely */}
              <button
                onClick={handleDeletePhase}
                className="w-full py-2 bg-error text-on-error neo-border text-[10px] font-headline font-bold uppercase hover:bg-red-700 transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] mt-4"
              >
                Delete Phase Node
              </button>
            </div>
          </div>

          <div className="pt-4 text-right border-t border-outline-variant mt-4">
            <span className="font-mono text-[9px] text-on-surface-variant uppercase">Supr Orchestration Engine v3.5</span>
          </div>
        </div>
      )}
    </div>
  );
}
