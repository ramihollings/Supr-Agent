"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect } from 'react';
import { fetchMissionsAction, fetchMissionByIdAction, fetchMissionState } from '@/app/actions';
import { ActivityEvent, Mission } from '@/types';
import { useSearchParams, useRouter } from 'next/navigation';

const EVENT_STYLE: Record<string, { icon: string; badgeClass: string; borderClass: string; iconBgClass: string; label: string }> = {
  approval:      { icon: 'check_circle', badgeClass: 'text-primary bg-primary-container border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-primary-container', label: 'Approval Granted' },
  failure:       { icon: 'warning',      badgeClass: 'text-error bg-error-container border-error',       borderClass: 'border-2 border-error', iconBgClass: 'border-error bg-error-container', label: 'QA Failure' },
  task_complete:  { icon: 'task_alt',     badgeClass: 'text-tertiary bg-tertiary-container border-tertiary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-tertiary-container', label: 'Task Complete' },
  agent_action:  { icon: 'smart_toy',    badgeClass: 'text-on-surface bg-surface-container-high border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-surface-container-high', label: 'Agent Action' },
  supr_decision: { icon: 'psychology',   badgeClass: 'text-primary bg-primary-fixed border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-primary-fixed', label: 'Supr Decision' },
  permission:    { icon: 'shield',       badgeClass: 'text-secondary bg-error-container border-secondary', borderClass: 'neo-border', iconBgClass: 'border-secondary bg-error-container', label: 'Permission Change' },
  delegation:    { icon: 'person_add',   badgeClass: 'text-primary bg-primary-container border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-primary-container', label: 'Delegation' },
  handoff:       { icon: 'move_up',      badgeClass: 'text-tertiary bg-tertiary-container border-tertiary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-tertiary-container', label: 'Handoff' },
  review:        { icon: 'rate_review',  badgeClass: 'text-secondary bg-surface-container-high border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-surface-container-high', label: 'Review' },
  escalation:    { icon: 'error',        badgeClass: 'text-error bg-error-container border-error', borderClass: 'border-2 border-error', iconBgClass: 'border-error bg-error-container', label: 'Escalation' },
  governance:    { icon: 'gavel',        badgeClass: 'text-on-surface bg-surface-container-high border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-surface-container-high', label: 'Governance' },
};

export default function ActivityPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [projects, setProjects] = useState<Mission[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filter, setFilter] = useState('all');

  // Load all projects first
  useEffect(() => {
    async function loadProjects() {
      const data = await fetchMissionsAction();
      setProjects(data);
      
      // Determine initial project selection from URL or active mission
      const urlProjectId = searchParams.get('id');
      if (urlProjectId) {
        setSelectedProjectId(urlProjectId);
      } else if (data.length > 0) {
        const active = data.find(m => m.status === 'Active') || data[0];
        setSelectedProjectId(active.id);
      }
    }
    loadProjects();
  }, [searchParams]);

  // Load events for the selected project
  useEffect(() => {
    if (!selectedProjectId) return;
    async function loadEvents() {
      const mission = await fetchMissionByIdAction(selectedProjectId);
      if (mission?.activityLog) {
        setEvents(mission.activityLog);
      } else {
        setEvents([]);
      }
    }
    loadEvents();
  }, [selectedProjectId]);

  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('id', id);
    router.push(`/activity?${params.toString()}`);
  };

  const filteredEvents = filter === 'all' ? events : events.filter(e => e.eventType === filter);

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Activity & Audit Trail" />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
        <header className="mb-8 border-b-4 border-primary pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Activity Log</h1>
            <p className="font-body text-sm font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Immutable audit trail of agent actions, approvals, and system events.</p>
          </div>

          {/* Project Switcher Toolbar */}
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-headline text-xs font-bold uppercase text-primary">Workspace:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="bg-surface border-4 border-primary px-3 py-2 font-headline font-bold uppercase text-xs neo-shadow cursor-pointer focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status})
                </option>
              ))}
            </select>
          </div>
        </header>

        <div className="bg-background neo-border p-6 shadow-md">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-8 pb-4 border-b-2 border-outline-variant">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-surface neo-border px-3 py-2 font-headline font-bold uppercase text-sm focus:outline-none"
            >
              <option value="all">All Events</option>
              <option value="supr_decision">Supr Decisions</option>
              <option value="agent_action">Agent Actions</option>
              <option value="task_complete">Task Completions</option>
              <option value="approval">Approvals</option>
              <option value="failure">Failures</option>
              <option value="permission">Permissions</option>
              <option value="delegation">Delegations</option>
              <option value="handoff">Handoffs</option>
              <option value="review">Reviews</option>
              <option value="escalation">Escalations</option>
              <option value="governance">Governance</option>
            </select>
            <div className="flex-1 flex items-center justify-end">
              <span className="font-body text-sm font-bold text-on-surface-variant">{filteredEvents.length} event{filteredEvents.length !== 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-outline before:to-transparent">
            {filteredEvents.map((event) => {
              const style = EVENT_STYLE[event.eventType] || EVENT_STYLE.agent_action;
              return (
                <div key={event.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${style.iconBgClass} z-10 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 neo-shadow`}>
                    <span className="material-symbols-outlined text-sm font-bold">{event.actorIcon || style.icon}</span>
                  </div>
                  <div className={`w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-surface p-4 ${style.borderClass} hover:bg-surface-container transition-colors`}>
                    <div className="flex justify-between items-start mb-2">
                      <span className={`font-headline font-bold uppercase text-[10px] px-2 py-0.5 border ${style.badgeClass}`}>{style.label}</span>
                      <span className="font-body text-xs font-bold text-on-surface-variant">{event.timestamp}</span>
                    </div>
                    <p className="font-body font-bold text-sm">{event.summary}</p>
                    <p className="font-body text-xs text-on-surface-variant mt-1">{event.detail}</p>
                  </div>
                </div>
              );
            })}

            {filteredEvents.length === 0 && (
              <div className="text-center py-12 font-body text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl mb-4 block">history</span>
                No events matching the current filter in this project.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
