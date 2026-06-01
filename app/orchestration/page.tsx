"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect, useRef, startTransition, Suspense, useCallback } from 'react';
import { fetchOrchestrationFeed, fetchAgentStatuses, fetchMissionsAction } from '@/app/actions';
import { Mission } from '@/types';
import { useSearchParams, useRouter } from 'next/navigation';

interface OrchEvent {
  id: string;
  eventType: string;
  actor: string;
  targetAgent: string;
  summary: string;
  detail: string;
  timestamp: string;
  missionId: string;
}

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  permissionTier: string;
  isPermanent: boolean;
  currentTask: string | null;
  currentProject: string | null;
  status: string;
}

const EVENT_CONFIG: Record<string, { icon: string; color: string; verb: string }> = {
  delegation:    { icon: 'assignment_ind', color: 'bg-primary text-on-primary', verb: 'DELEGATION' },
  handoff:       { icon: 'swap_horiz',     color: 'bg-tertiary text-on-tertiary', verb: 'HANDOFF' },
  review:        { icon: 'rate_review',    color: 'bg-secondary text-on-secondary', verb: 'REVIEW' },
  approval:      { icon: 'check_circle',   color: 'bg-primary text-on-primary', verb: 'APPROVAL' },
  escalation:    { icon: 'warning',        color: 'bg-error text-on-error', verb: 'ESCALATION' },
  governance:    { icon: 'shield',         color: 'bg-surface-tint text-on-primary', verb: 'GOVERNANCE' },
  supr_decision: { icon: 'psychology',     color: 'bg-primary-container text-primary border-primary', verb: 'DECISION' },
  agent_action:  { icon: 'smart_toy',      color: 'bg-surface-container-high text-primary border-primary', verb: 'ACTION' },
  task_complete: { icon: 'task_alt',       color: 'bg-tertiary-container text-on-tertiary-container', verb: 'COMPLETE' },
  failure:       { icon: 'error',          color: 'bg-error-container text-error border-error', verb: 'FAILURE' },
  permission:    { icon: 'gavel',          color: 'bg-secondary-container text-secondary', verb: 'PERMISSION' }
};

function OrchestrationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [events, setEvents] = useState<OrchEvent[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const [now, setNow] = useState<number>(Date.now());
  const feedRef = useRef<HTMLDivElement>(null);

  // Sync initial project ID from URL if present
  useEffect(() => {
    const urlProjId = searchParams.get('id');
    if (urlProjId) {
      setSelectedProjectId(urlProjId);
    }
  }, [searchParams]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = useCallback(async () => {
    const [feed, statuses, missionList] = await Promise.all([
      fetchOrchestrationFeed(selectedProjectId === 'all' ? undefined : selectedProjectId),
      fetchAgentStatuses(),
      fetchMissionsAction()
    ]);
    setEvents(feed);
    setAgentStatuses(statuses);
    setMissions(missionList);
    setIsLoading(false);
  }, [selectedProjectId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Poll persisted orchestration state. The feed must reflect stored runtime events only.
  useEffect(() => {
    const interval = setInterval(() => {
      void loadData();
    }, 8000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleProjectFilterChange = (id: string) => {
    setSelectedProjectId(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === 'all') {
      params.delete('id');
    } else {
      params.set('id', id);
    }
    router.push(`/orchestration?${params.toString()}`);
  };

  // Filter events client-side based on search + type
  const filteredEvents = events.filter(e => {
    const matchesType = selectedType === 'all' || e.eventType === selectedType;
    const matchesSearch = searchQuery === '' || 
      e.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.actor.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.targetAgent?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSearch;
  });

  const getRelativeTime = (ts: string) => {
    const baseTime = now;
    const diff = Math.max(0, baseTime - new Date(ts).getTime());
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Observance & Activity Hub" />

      <main className="flex-1 flex overflow-hidden">
        {/* LEFT: Unified scannable timeline feed */}
        <div className="flex-1 flex flex-col overflow-hidden border-r-4 border-primary">
          
          {/* Timeline Header and Filter Toolbar */}
          <div className="p-4 border-b-4 border-primary bg-background flex flex-col gap-3">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <div>
                <h2 className="font-headline text-xl font-black uppercase tracking-tighter text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary animate-pulse">radio_button_checked</span>
                  Central Observability Log
                </h2>
                <p className="font-body text-[10px] text-on-surface-variant font-bold uppercase mt-0.5">CENTRAL ACTIVITY FEED tracking actions, approvals, and decisions.</p>
              </div>
              <span className="bg-primary text-on-primary px-2.5 py-0.5 text-[9px] font-bold uppercase neo-border">
                {filteredEvents.length} Events Listed
              </span>
            </div>

            {/* Filter controls row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t-2 border-outline-variant pt-3">
              <div>
                <label className="block text-[9px] font-black uppercase text-primary mb-1">Project Workspace</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => handleProjectFilterChange(e.target.value)}
                  className="w-full bg-surface border-2 border-primary px-2.5 py-1.5 font-headline font-bold uppercase text-[10px] cursor-pointer focus:outline-none"
                >
                  <option value="all">All Projects</option>
                  {missions.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-primary mb-1">Event Group</label>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full bg-surface border-2 border-primary px-2.5 py-1.5 font-headline font-bold uppercase text-[10px] cursor-pointer focus:outline-none"
                >
                  <option value="all">All Categories</option>
                  {Object.keys(EVENT_CONFIG).map(type => (
                    <option key={type} value={type}>{EVENT_CONFIG[type].verb}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase text-primary mb-1">Search Keywords</label>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter logs by summary/actor..."
                  className="w-full bg-surface border-2 border-primary px-2.5 py-1.5 font-body text-[10px] focus:outline-none focus:border-tertiary"
                />
              </div>
            </div>
          </div>

          {/* Timeline Feed Stream */}
          <div ref={feedRef} className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-surface-container-low">
            {isLoading ? (
              <div className="font-mono text-primary text-xs uppercase font-bold animate-pulse p-4">Syncing Central Trace Bus...</div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-12 text-center text-on-surface-variant bg-background neo-border">
                <span className="material-symbols-outlined text-4xl mb-2 text-outline">visibility_off</span>
                <p className="font-headline text-xs font-bold uppercase">No records found matching filters</p>
              </div>
            ) : (
              filteredEvents.map((ev, idx) => {
                const config = EVENT_CONFIG[ev.eventType] || EVENT_CONFIG.delegation;
                const isNew = idx === 0 && (Date.now() - new Date(ev.timestamp).getTime() < 10000);
                return (
                  <article
                    key={ev.id}
                    className={`neo-border bg-background p-2.5 flex gap-3 relative transition-all hover:bg-surface-bright group ${
                      isNew ? 'border-secondary bg-primary-container/10' : ''
                    }`}
                  >
                    {/* Compact Icon */}
                    <div className={`w-8 h-8 neo-border ${config.color} flex items-center justify-center shrink-0`}>
                      <span className="material-symbols-outlined text-base font-bold">{config.icon}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Sub-Header Row */}
                      <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 border border-primary ${config.color}`}>
                          {config.verb}
                        </span>
                        <span className="font-headline font-black text-[10px] uppercase text-primary">
                          {ev.actor}
                        </span>
                        {ev.targetAgent && (
                          <>
                            <span className="material-symbols-outlined text-[10px] text-on-surface-variant">arrow_forward</span>
                            <span className="font-headline font-bold text-[10px] uppercase text-tertiary">
                              {ev.targetAgent}
                            </span>
                          </>
                        )}
                        <span className="ml-auto font-mono text-[8px] text-on-surface-variant shrink-0">
                          {formatTime(ev.timestamp)} · {getRelativeTime(ev.timestamp)}
                        </span>
                      </div>

                      {/* Log text (concise) */}
                      <p className="font-body text-xs text-primary leading-tight font-semibold">{ev.summary}</p>
                      {ev.detail && (
                        <p className="font-body text-[10px] text-on-surface-variant mt-1 leading-normal border-l-2 border-outline-variant pl-2 opacity-80 group-hover:opacity-100 transition-opacity">
                          {ev.detail}
                        </p>
                      )}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT: Team status board (Compact Summary) */}
        <aside className="w-72 bg-background flex flex-col overflow-y-auto custom-scrollbar shrink-0">
          <div className="p-3.5 border-b-4 border-primary bg-surface-container-high">
            <h3 className="font-headline font-black uppercase text-xs tracking-tight text-primary flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">groups</span>
              Active Agent Statuses
            </h3>
            <p className="font-body text-[9px] text-on-surface-variant mt-0.5">Governor status monitor loops</p>
          </div>

          <div className="p-3.5 space-y-3 flex-1">
            {/* Supr Supervisor Status */}
            <div className="neo-border bg-primary-container p-3 relative">
              <div className="absolute top-2.5 right-2.5">
                <span className="w-2 h-2 bg-secondary rounded-full inline-block animate-pulse"></span>
              </div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 neo-border bg-primary text-on-primary flex items-center justify-center">
                  <span className="material-symbols-outlined text-sm">psychology</span>
                </div>
                <div>
                  <h4 className="font-headline font-black uppercase text-xs text-primary">Supr.</h4>
                  <p className="font-body text-[8px] text-on-surface-variant font-bold uppercase">Supervisor Orchestrator</p>
                </div>
              </div>
              <div className="space-y-1 text-[8px] font-semibold text-on-surface-variant uppercase">
                <div className="flex justify-between"><span>Status</span><span className="text-primary font-bold">Directing</span></div>
                <div className="flex justify-between"><span>Active Traces</span><span className="text-secondary font-bold">{events.length}</span></div>
              </div>
            </div>

            {/* Subagent Statuses */}
            {agentStatuses.map(agent => (
              <div key={agent.id} className="neo-border bg-surface p-3 relative">
                <div className="absolute top-2.5 right-2.5">
                  <span className={`w-2 h-2 rounded-full inline-block ${
                    agent.status === 'Working' ? 'bg-secondary animate-pulse' : 'bg-outline-variant'
                  }`}></span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-8 h-8 neo-border bg-surface-container flex items-center justify-center">
                    <span className="material-symbols-outlined text-sm text-primary">smart_toy</span>
                  </div>
                  <div>
                    <h4 className="font-headline font-bold uppercase text-xs text-primary">{agent.name}</h4>
                    <p className="font-body text-[8px] text-on-surface-variant font-bold uppercase">{agent.role}</p>
                  </div>
                </div>
                <div className="space-y-1 text-[8px] font-semibold text-on-surface-variant uppercase">
                  <div className="flex justify-between"><span>Status</span><span>{agent.status}</span></div>
                  <div className="flex justify-between"><span>Tier</span><span className="text-primary">{agent.permissionTier}</span></div>
                  {agent.currentTask && <div className="flex justify-between"><span>Task</span><span className="text-secondary truncate max-w-[100px]">{agent.currentTask}</span></div>}
                </div>
              </div>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

export default function OrchestrationPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container items-center justify-center">
        <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Syncing Observance Hub...</p>
      </div>
    }>
      <OrchestrationContent />
    </Suspense>
  );
}
