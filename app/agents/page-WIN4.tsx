"use client";

import { TopNav } from '@/components/TopNav';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { AgentWizard } from '@/components/AgentWizard';
import { fetchAgentsState, deleteAgentAction, archiveAgentAction, extendAgentAction } from '@/app/actions';
import { Agent } from '@/types';

export default function AgentsPage() {
  const router = useRouter();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

  const loadAgents = async () => {
    const data = await fetchAgentsState();
    if (data) setAgents(data);
  };

  useEffect(() => {
    let active = true;
    fetchAgentsState().then(data => {
      if (active && data) setAgents(data);
    });
    return () => { active = false; };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // The database `status` column determines if they are active or archived
  // Note: in our Agent type it may not have `status` explicitly typed, so we filter by `isActive`.
  // Wait, in lib/db.ts, extendAgent updates status='active', archiveAgent updates status='archived'.
  // However, getAgents() currently returns isActive = true for all loaded if not mapped correctly.
  // Actually, getAgents() in lib/db.ts maps status === 'active' to isActive.
  const activeAgents = agents.filter(a => a.isActive);
  const archivedAgents = agents.filter(a => !a.isActive);

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Agent Team Manager" />
      
      {toastMessage && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-5xl md:text-7xl font-black uppercase tracking-tighter text-primary">Task Force Roster</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant max-w-2xl border-l-4 border-secondary pl-4">Manage autonomous and temporary agents. Allocate permissions, monitor statuses, and instantiate new operational units.</p>
          </div>
          <button 
            onClick={() => setShowWizard(true)}
            className="bg-primary text-on-primary neo-border font-headline font-bold uppercase text-xl py-4 px-8 hover:bg-background hover:text-primary neo-shadow transition-all active:translate-x-1 active:translate-y-1 flex items-center gap-3 shrink-0"
          >
            <span className="material-symbols-outlined">add_circle</span>
            Create New Agent
          </button>
        </header>

        {/* View Mode Tabs */}
        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setViewMode('active')}
            className={`font-headline font-black uppercase tracking-tight text-xl py-2 px-6 border-4 border-primary transition-colors neo-shadow ${
              viewMode === 'active' ? 'bg-primary text-on-primary' : 'bg-surface hover:bg-primary-container'
            }`}
          >
            Active Task Force
          </button>
          <button 
            onClick={() => setViewMode('archived')}
            className={`font-headline font-black uppercase tracking-tight text-xl py-2 px-6 border-4 border-primary transition-colors neo-shadow flex items-center gap-2 ${
              viewMode === 'archived' ? 'bg-primary text-on-primary' : 'bg-surface hover:bg-primary-container'
            }`}
          >
            <span className="material-symbols-outlined">inventory_2</span>
            Onboarding Registry
          </button>
        </div>

        {viewMode === 'active' ? (
          <>
            {/* Permanent Agents Section */}
            <section className="mb-16">
              <div className="flex items-center gap-4 mb-8">
                <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Permanent Units</h2>
                <div className="h-1 flex-1 bg-primary"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {activeAgents.filter(a => a.isPermanent).map(agent => (
                  <article key={agent.id} className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col relative overflow-hidden">
                    <div className={`border-b-4 border-primary p-4 flex justify-between items-center ${agent.name.toLowerCase() === 'supr' ? 'bg-primary-container' : agent.name.toLowerCase() === 'research' ? 'bg-tertiary-container' : 'bg-inverse-primary'}`}>
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-3xl text-primary font-black">
                          {agent.name.toLowerCase() === 'supr' ? 'admin_panel_settings' : agent.name.toLowerCase() === 'research' ? 'travel_explore' : 'terminal'}
                        </span>
                        <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary">{agent.name}</h3>
                      </div>
                      <span className="bg-primary text-primary-container px-3 py-1 font-body text-xs font-bold uppercase neo-border">Active</span>
                    </div>
                    <div className="p-6 flex-1 flex flex-col gap-6">
                      <div>
                        <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-1">Role</p>
                        <p className="font-headline text-xl font-bold uppercase text-primary border-l-4 border-primary pl-3">{agent.role}</p>
                      </div>
                      <div>
                        <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2">Permission Tier</p>
                        <div className="flex gap-2 font-headline text-sm font-bold uppercase">
                          <span className="bg-primary text-on-primary px-2 py-1">{agent.permissionTier}</span>
                        </div>
                      </div>
                      <div className="mt-auto">
                        <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2 border-b-2 border-primary pb-1">Context Integration</p>
                        <p className="font-body text-sm font-medium italic text-primary bg-surface-container p-3 border-l-4 border-primary">Core persistent unit integrated via workspace SQLite context loops.</p>
                      </div>
                    </div>
                    <div className="border-t-4 border-primary flex">
                      <button 
                        onClick={() => router.push('/settings')}
                        className="flex-1 py-3 font-headline font-bold uppercase border-r-4 border-primary hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">settings</span> Configure
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            {/* Temporary Agents Section */}
            <section>
              <div className="flex items-center gap-4 mb-8">
                <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Temporary Units</h2>
                <div className="h-1 flex-1 bg-secondary border-t-2 border-b-2 border-primary border-dashed"></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
                {activeAgents.filter(a => !a.isPermanent).map(agent => (
                  <article key={agent.id} className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(230,59,46,1)] flex flex-col relative overflow-hidden">
                    <div className="border-b-4 border-primary p-4 bg-surface-variant flex justify-between items-center">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-3xl text-secondary font-black">sensors</span>
                        <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary">{agent.name}</h3>
                      </div>
                      <span className="bg-primary text-primary-fixed px-3 py-1 font-body text-xs font-bold uppercase neo-border">Deployed</span>
                    </div>
                    <div className="p-6 flex-1 flex flex-col gap-6">
                      <div>
                        <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-1">Role</p>
                        <p className="font-headline text-xl font-bold uppercase text-primary border-l-4 border-primary pl-3">{agent.role}</p>
                      </div>
                      <div>
                        <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2">Permission Tier</p>
                        <div className="flex gap-2 font-headline text-sm font-bold uppercase flex-wrap">
                          <span className="bg-primary text-on-primary px-2 py-1">{agent.permissionTier}</span>
                        </div>
                      </div>
                    </div>
                    <div className="border-t-4 border-primary flex">
                      <button 
                        onClick={async () => {
                          showToast(`Deactivating & Archiving ${agent.name}...`);
                          await archiveAgentAction(agent.id);
                          loadAgents();
                        }}
                        className="flex-1 py-3 font-headline font-bold uppercase hover:bg-secondary hover:text-on-error transition-colors flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined">inventory_2</span> Deactivate
                      </button>
                    </div>
                  </article>
                ))}
                {activeAgents.filter(a => !a.isPermanent).length === 0 && (
                  <p className="font-body text-sm font-bold text-on-surface-variant italic p-4 bg-surface-container border-l-4 border-primary neo-border">No temporary units currently deployed.</p>
                )}
              </div>
            </section>
          </>
        ) : (
          <section>
            <div className="flex items-center gap-4 mb-8">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-on-surface-variant">Evaluation Sandbox</h2>
              <div className="h-1 flex-1 bg-outline-variant"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {archivedAgents.map(agent => (
                <article key={agent.id} className="neo-border bg-surface-container-high flex flex-col relative overflow-hidden grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-300">
                  <div className="border-b-4 border-outline p-4 bg-surface-variant flex justify-between items-center">
                    <div className="flex items-center gap-3 text-on-surface-variant">
                      <span className="material-symbols-outlined text-3xl font-black">archive</span>
                      <h3 className="font-headline text-2xl font-black uppercase tracking-tight">{agent.name}</h3>
                    </div>
                    <span className="bg-surface text-on-surface-variant px-3 py-1 font-body text-xs font-bold uppercase neo-border border-outline">Archived</span>
                  </div>
                  <div className="p-6 flex-1 flex flex-col gap-4 text-on-surface-variant">
                    <div>
                      <p className="font-body text-xs font-bold uppercase mb-1">Historical Role</p>
                      <p className="font-headline text-lg font-bold uppercase border-l-4 border-outline pl-3">{agent.role}</p>
                    </div>
                  </div>
                  <div className="border-t-4 border-outline flex bg-surface">
                    <button 
                      onClick={async () => {
                        showToast(`Reactivating ${agent.name}...`);
                        await extendAgentAction(agent.id);
                        loadAgents();
                      }}
                      className="flex-1 py-3 font-headline font-bold uppercase border-r-4 border-outline hover:bg-tertiary hover:text-on-tertiary transition-colors flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined">restart_alt</span> Reactivate
                    </button>
                    <button 
                      onClick={async () => {
                        showToast(`Permanently deleting ${agent.name}...`);
                        await deleteAgentAction(agent.id, agent.name);
                        loadAgents();
                      }}
                      className="flex-1 py-3 font-headline font-bold uppercase hover:bg-error hover:text-on-error transition-colors flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined">delete_forever</span> Delete
                    </button>
                  </div>
                </article>
              ))}
              
              {archivedAgents.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center p-12 text-on-surface-variant text-center bg-surface-container border-4 border-dashed border-outline-variant">
                  <span className="material-symbols-outlined text-6xl mb-4 text-outline">inventory_2</span>
                  <h3 className="font-headline font-bold uppercase text-xl">Sandbox Empty</h3>
                  <p className="font-body text-sm mt-2 max-w-sm">When external agents are added under a zero-trust model, they must be audited in the evaluation sandbox before deployment.</p>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      {showWizard && (
        <AgentWizard 
          onClose={() => setShowWizard(false)} 
          onAgentCreated={() => {
            showToast("Agent Profile Synthesized and Deployed.");
            loadAgents();
          }} 
        />
      )}
    </div>
  );
}
