"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect, startTransition, Suspense } from 'react';
import { Mission, MemoryItem } from '@/types';
import { getActiveMissionAction, fetchMissionsAction } from '@/app/actions';
import { useSearchParams, useRouter } from 'next/navigation';

function ReasoningPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [projects, setProjects] = useState<Mission[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [mission, setMission] = useState<Mission | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load all projects first
  useEffect(() => {
    async function loadProjects() {
      const data = await fetchMissionsAction();
      setProjects(data);
      
      // Determine initial selection from URL or active mission
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

  // Load selected project state
  const loadSelectedProject = async (id: string) => {
    if (!id) return;
    startTransition(() => {
      setIsRefreshing(true);
    });
    const data = await getActiveMissionAction(id);
    setMission(data || null);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    if (selectedProjectId) {
      let active = true;
      Promise.resolve().then(() => {
        if (active) {
          setIsRefreshing(true);
        }
      });
      getActiveMissionAction(selectedProjectId).then(data => {
        if (active) {
          setMission(data || null);
          setTimeout(() => {
            if (active) {
              setIsRefreshing(false);
            }
          }, 500);
        }
      });
      return () => {
        active = false;
      };
    }
  }, [selectedProjectId]);

  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('id', id);
    router.push(`/reasoning?${params.toString()}`);
  };

  const handleRefresh = () => {
    if (selectedProjectId) {
      loadSelectedProject(selectedProjectId);
    }
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Reasoning & Memory Core">
         <button 
          onClick={handleRefresh}
          className={`bg-background neo-border px-4 py-2 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-all active:translate-x-1 active:translate-y-1 flex items-center gap-2 ${isRefreshing ? 'animate-pulse' : ''}`}
         >
           <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>refresh</span>
           {isRefreshing ? 'Syncing...' : 'Sync Memory'}
         </button>
      </TopNav>
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col gap-8">
        <header className="border-b-4 border-primary pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Reasoning Core</h1>
            <p className="font-body text-sm font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Active logic trace and contextual RRF memory bank logs.</p>
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

        <div className="flex flex-col md:flex-row gap-8">
          {/* Left Col: Memory Banks */}
          <section className="w-full md:w-1/3 flex flex-col gap-6">
            <header className="border-b-4 border-primary pb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Memory Banks</h2>
            </header>

            <div className="bg-surface neo-border p-4 flex flex-col gap-2">
              <div className="flex justify-between items-center border-b-2 border-primary pb-2">
                <span className="font-headline font-bold uppercase text-sm">Mission Memory</span>
                <span className="material-symbols-outlined text-sm">storage</span>
              </div>
              <p className="font-body text-xs text-on-surface-variant">Active path dependencies and findings.</p>
              <div className="mt-2 space-y-2">
                 {mission?.memoryItems && mission.memoryItems.length > 0 ? (
                   mission.memoryItems.map((item: MemoryItem) => (
                     <div key={item.id} className="bg-surface-container p-2 border border-outline-variant font-mono text-[10px] break-all group relative">
                        <span className="text-secondary font-bold uppercase block mb-1">{item.key}</span>
                        {item.value}
                     </div>
                   ))
                 ) : (
                   <div className="bg-surface-container p-4 border border-outline-variant font-body text-xs italic text-on-surface-variant text-center">
                      No active mission memory detected.
                   </div>
                 )}
              </div>
            </div>

            <div className="bg-surface neo-border p-4 flex flex-col gap-2 opacity-80 border-dashed">
              <div className="flex justify-between items-center border-b-2 border-outline-variant pb-2">
                <span className="font-headline font-bold uppercase text-sm">Workspace Memory</span>
                <span className="material-symbols-outlined text-sm">folder_shared</span>
              </div>
              <p className="font-body text-xs text-on-surface-variant">Cross-mission standards.</p>
              <div className="mt-2 p-2 bg-surface-container-low border border-outline-variant font-mono text-[10px] text-on-surface-variant">
                 SYSTEM_ROLE: Supervisor<br/>
                 OUTPUT_FORMAT: Neo-Brutalist<br/>
                 VERIFICATION: Multi-Agent
              </div>
            </div>
          </section>

          {/* Right Col: Reasoning Logs */}
          <section className="flex-1 flex flex-col gap-6">
            <header className="border-b-4 border-primary pb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Decision Matrix</h2>
            </header>

            <div className="space-y-6">
              {mission?.activityLog && mission.activityLog.filter(e => e.eventType === 'supr_decision' || e.eventType === 'failure' || e.eventType === 'escalation' || e.eventType === 'governance').length > 0 ? (
                mission.activityLog.filter(e => e.eventType === 'supr_decision' || e.eventType === 'failure' || e.eventType === 'escalation' || e.eventType === 'governance').map(event => (
                  <article key={event.id} className={`bg-background neo-border p-6 ${
                    event.eventType === 'supr_decision' ? 'shadow-[6px_6px_0px_0px_rgba(0,85,255,1)] border-tertiary' :
                    event.eventType === 'escalation' ? 'shadow-[6px_6px_0px_0px_rgba(230,59,46,1)] border-secondary' :
                    event.eventType === 'governance' ? 'shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] border-primary' :
                    'shadow-[6px_6px_0px_0px_rgba(230,59,46,1)] border-secondary'
                  }`}>
                    <div className="flex justify-between mb-4 pb-2 border-b-2 border-outline-variant">
                      <span className={`font-headline font-bold uppercase text-sm flex items-center gap-2 ${
                        event.eventType === 'supr_decision' ? 'text-tertiary' :
                        event.eventType === 'escalation' ? 'text-secondary' :
                        event.eventType === 'governance' ? 'text-primary' :
                        'text-secondary'
                      }`}>
                        <span className="material-symbols-outlined shrink-0 text-[18px]">
                          {event.eventType === 'supr_decision' ? 'account_tree' :
                           event.eventType === 'escalation' ? 'error' :
                           event.eventType === 'governance' ? 'gavel' :
                           'warning'}
                        </span> 
                        {event.eventType === 'supr_decision' ? 'Supr Delegation' :
                         event.eventType === 'escalation' ? 'Escalation' :
                         event.eventType === 'governance' ? 'Governance Override' :
                         'QA Rejection'}
                      </span>
                      <span className={`font-mono text-xs font-bold px-2 py-0.5 ${
                        event.eventType === 'supr_decision' ? 'bg-tertiary-container text-primary' :
                        event.eventType === 'governance' ? 'bg-surface-container-high text-primary border border-primary' :
                        'bg-error-container text-error border border-error'
                      }`}>
                        {event.eventType === 'supr_decision' ? 'Conf: High' :
                         event.eventType === 'governance' ? 'Cleared' :
                         'Blocking'}
                      </span>
                    </div>
                    <p className="font-body text-sm font-bold mb-2">{event.summary}</p>
                    <div className={`bg-surface-container p-3 border-l-4 ${
                      event.eventType === 'supr_decision' ? 'border-tertiary' :
                      event.eventType === 'escalation' ? 'border-secondary' :
                      event.eventType === 'governance' ? 'border-primary' :
                      'border-secondary'
                    }`}>
                      <p className="font-body text-sm italic text-on-surface-variant">&ldquo;{event.detail}&rdquo;</p>
                    </div>
                  </article>
                ))
              ) : (
                <div className="text-center p-12 bg-surface-container border-4 border-dashed border-outline-variant text-on-surface-variant">
                  <span className="material-symbols-outlined text-5xl mb-4 block opacity-50">account_tree</span>
                  <p className="font-headline font-bold uppercase">No Strategic Decisions Logged</p>
                  <p className="font-body text-sm mt-2">This workspace project is pending major operational shifts.</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function ReasoningPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
        <TopNav title="Reasoning & Memory Core" />
        <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full flex items-center justify-center">
          <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Syncing Memory Core...</p>
        </main>
      </div>
    }>
      <ReasoningPageContent />
    </Suspense>
  );
}
