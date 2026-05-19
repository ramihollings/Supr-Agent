"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect, useRef } from 'react';
import { fetchOrchestrationFeed, fetchAgentStatuses, fetchMissionsAction } from '@/app/actions';
import { Mission } from '@/types';

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
  delegation:  { icon: 'assignment_ind', color: 'bg-primary text-on-primary', verb: 'DELEGATED' },
  handoff:     { icon: 'swap_horiz',     color: 'bg-tertiary text-on-tertiary', verb: 'HANDOFF' },
  review:      { icon: 'rate_review',    color: 'bg-secondary text-on-secondary', verb: 'REVIEWED' },
  approval:    { icon: 'check_circle',   color: 'bg-primary text-on-primary', verb: 'APPROVED' },
  escalation:  { icon: 'warning',        color: 'bg-error text-on-error', verb: 'ESCALATED' },
  governance:  { icon: 'shield',         color: 'bg-surface-tint text-on-primary', verb: 'GOVERNANCE' },
};

const LIVE_EVENTS = [
  { type: 'delegation', actor: 'Supr', target: 'Research Agent', summary: 'Dispatched Research Agent to scan new project intake backlog' },
  { type: 'review', actor: 'Supr', target: 'Code Agent', summary: 'Reviewing Code Agent workspace diff before merge approval' },
  { type: 'handoff', actor: 'Signal Agent', target: 'QA Agent', summary: 'Forwarding compiled telemetry payload to QA Agent for validation' },
  { type: 'governance', actor: 'Supr', target: 'Scout Agent', summary: 'Enforcing rate-limit on Scout Agent external API calls' },
  { type: 'approval', actor: 'Supr', target: 'Code Agent', summary: 'Approved sandbox deployment — all assertions passing' },
  { type: 'escalation', actor: 'Supr', target: 'Research Agent', summary: 'Research Agent timeout on OSINT crawl — extending deadline' },
  { type: 'delegation', actor: 'Supr', target: 'QA Agent', summary: 'Assigned QA Agent to run regression suite on latest artifact' },
  { type: 'handoff', actor: 'Code Agent', target: 'Signal Agent', summary: 'Passing build artifacts to Signal Agent for delivery packaging' },
];

export default function OrchestrationPage() {
  const [events, setEvents] = useState<OrchEvent[]>([]);
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      const [feed, statuses, missionList] = await Promise.all([
        fetchOrchestrationFeed(),
        fetchAgentStatuses(),
        fetchMissionsAction()
      ]);
      setEvents(feed);
      setAgentStatuses(statuses);
      setMissions(missionList);
      setIsLoading(false);
    }
    load();
  }, []);

  // Simulate live orchestration events ticking in
  useEffect(() => {
    const interval = setInterval(() => {
      const template = LIVE_EVENTS[Math.floor(Math.random() * LIVE_EVENTS.length)];
      const newEvent: OrchEvent = {
        id: `live-${Date.now()}`,
        eventType: template.type,
        actor: template.actor,
        targetAgent: template.target,
        summary: template.summary,
        detail: '',
        timestamp: new Date().toISOString(),
        missionId: missions[0]?.id || 'm1',
      };
      setEvents(prev => [newEvent, ...prev]);
    }, 6000);
    return () => clearInterval(interval);
  }, [missions]);

  const filteredEvents = filterType === 'all' ? events : events.filter(e => e.eventType === filterType);

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const getRelativeTime = (ts: string) => {
    const diff = Date.now() - new Date(ts).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Observance Hub" />

      <main className="flex-1 flex overflow-hidden">
        {/* LEFT: Live Delegation Feed */}
        <div className="flex-1 flex flex-col overflow-hidden border-r-4 border-primary">
          {/* Feed Header with Filters */}
          <div className="p-4 border-b-4 border-primary bg-background flex flex-col gap-3">
            <div className="flex justify-between items-center">
              <h2 className="font-headline text-2xl font-black uppercase tracking-tighter text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary animate-pulse">radio_button_checked</span>
                Live Orchestration Feed
              </h2>
              <span className="bg-primary text-on-primary px-3 py-1 text-[10px] font-bold uppercase neo-border">
                {filteredEvents.length} Events
              </span>
            </div>
            <div className="flex gap-2 flex-wrap">
              {['all', 'delegation', 'handoff', 'review', 'approval', 'escalation', 'governance'].map(type => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`px-3 py-1.5 text-[10px] font-headline font-bold uppercase neo-border transition-all ${
                    filterType === type
                      ? 'bg-primary text-on-primary neo-shadow'
                      : 'bg-surface hover:bg-surface-container'
                  }`}
                >
                  {type === 'all' ? 'All Events' : type}
                </button>
              ))}
            </div>
          </div>

          {/* Feed Stream */}
          <div ref={feedRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {isLoading ? (
              <div className="font-mono text-primary text-lg uppercase font-bold animate-pulse p-8">Connecting to orchestration bus...</div>
            ) : filteredEvents.length === 0 ? (
              <div className="p-12 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-5xl mb-4 block text-outline">visibility_off</span>
                <p className="font-headline font-bold uppercase">No orchestration events matching filter</p>
              </div>
            ) : (
              filteredEvents.map((ev, idx) => {
                const config = EVENT_CONFIG[ev.eventType] || EVENT_CONFIG.delegation;
                const isNew = idx === 0 && Date.now() - new Date(ev.timestamp).getTime() < 10000;
                return (
                  <article
                    key={ev.id}
                    className={`neo-border bg-background p-4 flex gap-4 relative overflow-hidden transition-all hover:neo-shadow group ${
                      isNew ? 'animate-pulse border-secondary' : ''
                    }`}
                  >
                    {/* Event Type Badge */}
                    <div className={`w-10 h-10 neo-border ${config.color} flex items-center justify-center shrink-0`}>
                      <span className="material-symbols-outlined text-lg">{config.icon}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Header Row */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 neo-border ${config.color}`}>
                          {config.verb}
                        </span>
                        <span className="font-headline font-black text-xs uppercase text-primary">
                          {ev.actor}
                        </span>
                        {ev.targetAgent && (
                          <>
                            <span className="material-symbols-outlined text-xs text-on-surface-variant">arrow_forward</span>
                            <span className="font-headline font-bold text-xs uppercase text-tertiary">
                              {ev.targetAgent}
                            </span>
                          </>
                        )}
                        <span className="ml-auto font-mono text-[9px] text-on-surface-variant shrink-0">
                          {formatTime(ev.timestamp)} · {getRelativeTime(ev.timestamp)}
                        </span>
                      </div>

                      {/* Summary */}
                      <p className="font-body text-sm font-semibold text-primary leading-snug">{ev.summary}</p>

                      {/* Detail (expandable on hover) */}
                      {ev.detail && (
                        <p className="font-body text-xs text-on-surface-variant mt-1.5 leading-relaxed border-l-4 border-outline-variant pl-3 opacity-70 group-hover:opacity-100 transition-opacity">
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

        {/* RIGHT: Team Status Board */}
        <aside className="w-80 bg-background flex flex-col overflow-y-auto custom-scrollbar shrink-0">
          {/* Team Status Header */}
          <div className="p-4 border-b-4 border-primary bg-surface-container-high">
            <h3 className="font-headline font-black uppercase text-sm tracking-tight text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">groups</span>
              Team Status Board
            </h3>
            <p className="font-body text-[10px] text-on-surface-variant mt-1">Real-time agent assignment and availability</p>
          </div>

          {/* Supr Supervisor Card (always first) */}
          <div className="m-4 neo-border bg-primary-container p-4 relative">
            <div className="absolute top-2 right-2">
              <span className="w-2.5 h-2.5 bg-secondary rounded-full inline-block animate-pulse"></span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 neo-border bg-primary text-on-primary flex items-center justify-center">
                <span className="material-symbols-outlined">psychology</span>
              </div>
              <div>
                <h4 className="font-headline font-black uppercase text-sm text-primary">Supr.</h4>
                <p className="font-body text-[10px] text-on-surface-variant">Supervisor Orchestrator</p>
              </div>
            </div>
            <div className="space-y-2 text-[10px]">
              <div className="flex justify-between">
                <span className="font-bold uppercase text-on-surface-variant">Status</span>
                <span className="font-bold text-primary bg-primary-container px-2 py-0.5 neo-border">Directing</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold uppercase text-on-surface-variant">Permission</span>
                <span className="font-bold text-secondary">Root</span>
              </div>
              <div className="flex justify-between">
                <span className="font-bold uppercase text-on-surface-variant">Active Delegations</span>
                <span className="font-bold text-primary">{events.filter(e => e.eventType === 'delegation').length}</span>
              </div>
            </div>
          </div>

          {/* Sub-Agent Cards */}
          <div className="px-4 pb-4 space-y-3">
            {agentStatuses.length === 0 && !isLoading && (
              // Show mock agents when DB has no active task assignments
              <>
                {[
                  { name: 'Research Agent', role: 'Context & OSINT', tier: 'Draft', status: 'Working', task: 'Context Scan', project: 'BUILDSIGNAL' },
                  { name: 'Code Agent', role: 'Sandbox Execution', tier: 'Execute', status: 'Waiting for Review', task: 'Schema Integration', project: 'BUILDSIGNAL' },
                  { name: 'QA Agent', role: 'Quality Validation', tier: 'Edit', status: 'Idle', task: null, project: null },
                  { name: 'Signal Agent', role: 'Delivery & Export', tier: 'External_Act', status: 'Working', task: 'Bundle Compilation', project: 'BUILDSIGNAL' },
                ].map(agent => (
                  <div key={agent.name} className="neo-border bg-surface p-3 relative">
                    <div className="absolute top-2 right-2">
                      <span className={`w-2 h-2 rounded-full inline-block ${
                        agent.status === 'Working' ? 'bg-secondary animate-pulse' :
                        agent.status === 'Waiting for Review' ? 'bg-tertiary animate-pulse' :
                        'bg-outline-variant'
                      }`}></span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 neo-border bg-surface-container flex items-center justify-center">
                        <span className="material-symbols-outlined text-sm text-primary">smart_toy</span>
                      </div>
                      <div>
                        <h4 className="font-headline font-bold uppercase text-xs text-primary">{agent.name}</h4>
                        <p className="font-body text-[9px] text-on-surface-variant">{agent.role}</p>
                      </div>
                    </div>
                    <div className="space-y-1.5 text-[9px]">
                      <div className="flex justify-between items-center">
                        <span className="font-bold uppercase text-on-surface-variant">Status</span>
                        <span className={`font-bold px-1.5 py-0.5 neo-border text-[8px] ${
                          agent.status === 'Working' ? 'bg-primary text-on-primary' :
                          agent.status === 'Waiting for Review' ? 'bg-tertiary text-on-tertiary' :
                          'bg-surface-container text-on-surface-variant'
                        }`}>{agent.status}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-bold uppercase text-on-surface-variant">Tier</span>
                        <span className="font-bold text-primary">{agent.tier}</span>
                      </div>
                      {agent.task && (
                        <div className="flex justify-between">
                          <span className="font-bold uppercase text-on-surface-variant">Task</span>
                          <span className="font-bold text-secondary truncate max-w-[120px]">{agent.task}</span>
                        </div>
                      )}
                      {agent.project && (
                        <div className="flex justify-between">
                          <span className="font-bold uppercase text-on-surface-variant">Project</span>
                          <span className="font-mono text-[8px] text-tertiary">{agent.project}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {agentStatuses.map(agent => (
              <div key={agent.id} className="neo-border bg-surface p-3 relative">
                <div className="absolute top-2 right-2">
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
                    <p className="font-body text-[9px] text-on-surface-variant">{agent.role}</p>
                  </div>
                </div>
                <div className="space-y-1.5 text-[9px]">
                  <div className="flex justify-between items-center">
                    <span className="font-bold uppercase text-on-surface-variant">Status</span>
                    <span className={`font-bold px-1.5 py-0.5 neo-border text-[8px] ${
                      agent.status === 'Working' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                    }`}>{agent.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-bold uppercase text-on-surface-variant">Tier</span>
                    <span className="font-bold text-primary">{agent.permissionTier}</span>
                  </div>
                  {agent.currentTask && (
                    <div className="flex justify-between">
                      <span className="font-bold uppercase text-on-surface-variant">Task</span>
                      <span className="font-bold text-secondary truncate max-w-[120px]">{agent.currentTask}</span>
                    </div>
                  )}
                  {agent.currentProject && (
                    <div className="flex justify-between">
                      <span className="font-bold uppercase text-on-surface-variant">Project</span>
                      <span className="font-mono text-[8px] text-tertiary">{agent.currentProject}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Supr Decision Log Strip */}
          <div className="mt-auto border-t-4 border-primary bg-surface-container-high p-4">
            <h4 className="font-headline font-black uppercase text-[10px] tracking-tight text-primary mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">gavel</span>
              Latest Governance Decisions
            </h4>
            <div className="space-y-2">
              {events
                .filter(e => ['approval', 'governance', 'escalation'].includes(e.eventType))
                .slice(0, 3)
                .map(ev => {
                  const config = EVENT_CONFIG[ev.eventType] || EVENT_CONFIG.governance;
                  return (
                    <div key={ev.id} className="flex items-start gap-2 p-2 bg-background neo-border text-[9px]">
                      <span className={`material-symbols-outlined text-xs shrink-0 mt-0.5 ${
                        ev.eventType === 'approval' ? 'text-primary' :
                        ev.eventType === 'escalation' ? 'text-error' : 'text-tertiary'
                      }`}>{config.icon}</span>
                      <div className="min-w-0">
                        <p className="font-bold text-primary leading-tight truncate">{ev.summary}</p>
                        <p className="text-on-surface-variant mt-0.5">{getRelativeTime(ev.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
