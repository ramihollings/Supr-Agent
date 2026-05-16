"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect } from 'react';
import { fetchMissionState } from '@/app/actions';
import { ActivityEvent } from '@/types';

const EVENT_STYLE: Record<string, { icon: string; badgeClass: string; borderClass: string; iconBgClass: string; label: string }> = {
  approval:      { icon: 'check_circle', badgeClass: 'text-primary bg-primary-container border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-primary-container', label: 'Approval Granted' },
  failure:       { icon: 'warning',      badgeClass: 'text-error bg-error-container border-error',       borderClass: 'border-2 border-error', iconBgClass: 'border-error bg-error-container', label: 'QA Failure' },
  task_complete:  { icon: 'task_alt',     badgeClass: 'text-tertiary bg-tertiary-container border-tertiary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-tertiary-container', label: 'Task Complete' },
  agent_action:  { icon: 'smart_toy',    badgeClass: 'text-on-surface bg-surface-container-high border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-surface-container-high', label: 'Agent Action' },
  supr_decision: { icon: 'psychology',   badgeClass: 'text-primary bg-primary-fixed border-primary', borderClass: 'neo-border', iconBgClass: 'border-primary bg-primary-fixed', label: 'Supr Decision' },
  permission:    { icon: 'shield',       badgeClass: 'text-secondary bg-error-container border-secondary', borderClass: 'neo-border', iconBgClass: 'border-secondary bg-error-container', label: 'Permission Change' },
};

export default function ActivityPage() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    async function load() {
      const mission = await fetchMissionState();
      if (mission?.activityLog) setEvents(mission.activityLog);
    }
    load();
  }, []);

  const filteredEvents = filter === 'all' ? events : events.filter(e => e.eventType === filter);

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Activity & Audit Trail" />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
        <header className="mb-12 border-b-4 border-primary pb-6">
          <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Activity Log</h1>
          <p className="font-body text-lg font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Immutable audit trail of agent actions, approvals, and system events.</p>
        </header>

        <div className="bg-background neo-border p-6 shadow-md">
          {/* Filters */}
          <div className="flex flex-wrap gap-4 mb-8 pb-4 border-b-2 border-outline-variant">
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="bg-surface neo-border px-3 py-2 font-headline font-bold uppercase text-sm"
            >
              <option value="all">All Events</option>
              <option value="supr_decision">Supr Decisions</option>
              <option value="agent_action">Agent Actions</option>
              <option value="task_complete">Task Completions</option>
              <option value="approval">Approvals</option>
              <option value="failure">Failures</option>
              <option value="permission">Permissions</option>
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
                      <span className={`font-headline font-bold uppercase text-xs px-2 py-0.5 border ${style.badgeClass}`}>{style.label}</span>
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
                No events matching the current filter.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
