"use client";

import { TopNav } from '@/components/TopNav';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { AgentWizard } from '@/components/AgentWizard';
import {
  fetchAgentsState,
  deleteAgentAction,
  archiveAgentAction,
  extendAgentAction,
  fetchAgentCapabilityPoliciesAction,
  updateAgentCapabilityPolicyAction
} from '@/app/actions';
import { Agent } from '@/types';
import { DEFAULT_GEMINI_MODEL, PROVIDER_MODEL_OPTIONS } from '@/lib/providers/catalog';

export default function AgentsPage() {
  const router = useRouter();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [viewMode, setViewMode] = useState<'active' | 'archived'>('active');

  // Agent custom LLM and capability policy overrides
  const [agentSettings, setAgentSettings] = useState<Record<string, {
    model: string;
    maxTokens: number;
    capabilities: string[];
    autonomy: string;
    scope: string;
    integrations: string[];
    escalation: string;
  }>>({});

  const loadAgents = useCallback(async () => {
    const [data, persistedPolicies] = await Promise.all([
      fetchAgentsState(),
      fetchAgentCapabilityPoliciesAction(),
    ]);
    if (data) {
      setAgents(data);
      // Initialize configurations if empty
      const initialSettings: typeof agentSettings = {};
      data.forEach(a => {
        const isHighTier = ['Root', 'Execute', 'External_Act'].includes(a.permissionTier);
        initialSettings[a.id] = {
          model: DEFAULT_GEMINI_MODEL,
          maxTokens: isHighTier ? 8192 : 4096,
          capabilities: getDefaultsForTier(a.permissionTier),
          autonomy: isHighTier ? 'approval-gated' : 'supervised',
          scope: 'project',
          integrations: [],
          escalation: 'approval-required',
        };
      });
      setAgentSettings(prev => ({ ...initialSettings, ...persistedPolicies, ...prev }));
    }
  }, []);

  const getDefaultsForTier = (tier: string): string[] => {
    switch (tier) {
      case 'Root': return ['read', 'write', 'sandbox', 'network', 'webhook'];
      case 'External_Act': return ['read', 'write', 'sandbox', 'network'];
      case 'Execute': return ['read', 'write', 'sandbox'];
      case 'Edit': return ['read', 'write'];
      case 'Draft': return ['read'];
      default: return [];
    }
  };

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const persistAgentPolicy = async (agentId: string, next: any) => {
    await updateAgentCapabilityPolicyAction(agentId, next);
  };

  const handleUpdateCapability = (agentId: string, cap: string) => {
    setAgentSettings(prev => {
      const currentCaps = prev[agentId]?.capabilities || [];
      const updatedCaps = currentCaps.includes(cap)
        ? currentCaps.filter(c => c !== cap)
        : [...currentCaps, cap];
      const next = { ...prev[agentId], capabilities: updatedCaps };
      persistAgentPolicy(agentId, next);
      showToast(`Capabilities re-aligned for sub-agent.`);
      return {
        ...prev,
        [agentId]: next
      };
    });
  };

  const handleUpdateLLM = (agentId: string, field: 'model' | 'maxTokens', value: any) => {
    setAgentSettings(prev => ({
      ...prev,
      [agentId]: {
        ...prev[agentId],
        [field]: value
      }
    }));
    const next = { ...agentSettings[agentId], [field]: value };
    persistAgentPolicy(agentId, next);
  };

  const handleUpdatePolicy = (agentId: string, field: 'autonomy' | 'scope' | 'escalation', value: string) => {
    setAgentSettings(prev => {
      const next = { ...prev[agentId], [field]: value };
      persistAgentPolicy(agentId, next);
      return { ...prev, [agentId]: next };
    });
  };

  const handleUpdateIntegration = (agentId: string, integration: string) => {
    setAgentSettings(prev => {
      const current = prev[agentId]?.integrations || [];
      const integrations = current.includes(integration)
        ? current.filter(item => item !== integration)
        : [...current, integration];
      const next = { ...prev[agentId], integrations };
      persistAgentPolicy(agentId, next);
      return { ...prev, [agentId]: next };
    });
  };

  const activeAgents = agents.filter(a => a.isActive);
  const archivedAgents = agents.filter(a => !a.isActive);

  // Derived display metrics for the roster cards
  const getMetrics = (name: string) => {
    const lname = name.toLowerCase();
    if (lname === 'supr') return { tasks: 48, time: '18.4h', tokens: '4.8M' };
    if (lname === 'research') return { tasks: 22, time: '8.1h', tokens: '2.1M' };
    if (lname.includes('crawler')) return { tasks: 12, time: '3.6h', tokens: '890k' };
    return { tasks: 5, time: '1.2h', tokens: '240k' };
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="AI Team Manager" />
      
      {toastMessage && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-5xl md:text-6xl font-black uppercase tracking-tighter text-primary">AI Agents Roster</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant max-w-2xl border-l-4 border-secondary pl-4">
              Allocate model weights, configure capability policies, and inspect historical tokens consumed by autonomous subagents.
            </p>
          </div>
          <button 
            onClick={() => setShowWizard(true)}
            className="bg-primary text-on-primary neo-border font-headline font-bold uppercase text-lg py-3.5 px-6 hover:bg-background hover:text-primary neo-shadow transition-all active:translate-x-1 active:translate-y-1 flex items-center gap-3 shrink-0"
          >
            <span className="material-symbols-outlined">add_circle</span>
            Deploy New Agent
          </button>
        </header>

        {/* View Mode Tabs */}
        <div className="flex gap-4 mb-8">
          <button 
            onClick={() => setViewMode('active')}
            className={`font-headline font-black uppercase tracking-tight text-lg py-2 px-6 border-4 border-primary transition-colors neo-shadow ${
              viewMode === 'active' ? 'bg-primary text-on-primary' : 'bg-surface hover:bg-primary-container'
            }`}
          >
            Active Squad
          </button>
          <button 
            onClick={() => setViewMode('archived')}
            className={`font-headline font-black uppercase tracking-tight text-lg py-2 px-6 border-4 border-primary transition-colors neo-shadow flex items-center gap-2 ${
              viewMode === 'archived' ? 'bg-primary text-on-primary' : 'bg-surface hover:bg-primary-container'
            }`}
          >
            <span className="material-symbols-outlined text-sm">inventory_2</span>
            Agent Archive ({archivedAgents.length})
          </button>
        </div>

        {viewMode === 'active' ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
            {activeAgents.map(agent => {
              const settings = agentSettings[agent.id] || {
                model: DEFAULT_GEMINI_MODEL,
                maxTokens: 4096,
                capabilities: [],
                autonomy: 'supervised',
                scope: 'project',
                integrations: [],
                escalation: 'approval-required',
              };
              const metrics = getMetrics(agent.name);
              const isSupr = agent.name.toLowerCase() === 'supr';

              return (
                <article key={agent.id} className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col relative overflow-hidden">
                  {/* Card Header */}
                  <div className={`border-b-4 border-primary p-4 flex justify-between items-center ${
                    isSupr ? 'bg-primary-container' : 'bg-surface-variant'
                  }`}>
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-3xl text-primary font-black">
                        {isSupr ? 'admin_panel_settings' : 'smart_toy'}
                      </span>
                      <div>
                        <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary">{agent.name}</h3>
                        <p className="font-body text-xs font-bold text-on-surface-variant uppercase">{agent.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <span className="bg-primary text-on-primary px-2.5 py-0.5 font-body text-[10px] font-bold uppercase neo-border">{agent.isPermanent ? 'Permanent' : 'Temporary'}</span>
                      <span className="bg-surface text-primary border-2 border-primary px-2.5 py-0.5 font-body text-[10px] font-bold uppercase">{agent.permissionTier}</span>
                    </div>
                  </div>

                  {/* Settings and Options Grid */}
                  <div className="p-6 flex-1 flex flex-col gap-6">
                    
                    {/* Part 1: LLM Configuration Panel */}
                    <div className="border-2 border-primary p-4 bg-surface-container">
                      <h4 className="font-headline font-bold text-xs uppercase text-primary mb-3 flex items-center gap-1.5 border-b border-primary/20 pb-1.5">
                        <span className="material-symbols-outlined text-xs">tune</span> LLM Weights & Parameters
                      </h4>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center text-xs">
                          <span className="font-body font-bold uppercase text-on-surface-variant">Active Model</span>
                          <select 
                            value={settings.model} 
                            onChange={(e) => handleUpdateLLM(agent.id, 'model', e.target.value)}
                            className="bg-background border-2 border-primary px-2 py-1 font-mono font-bold uppercase text-[10px]"
                          >
                            {PROVIDER_MODEL_OPTIONS.gemini.map((model) => (
                              <option key={model.value} value={model.value}>{model.label}</option>
                            ))}
                          </select>
                        </div>

                        <div className="flex justify-between items-center text-xs">
                          <span className="font-body font-bold uppercase text-on-surface-variant">Max Response Tokens</span>
                          <select 
                            value={settings.maxTokens} 
                            onChange={(e) => handleUpdateLLM(agent.id, 'maxTokens', parseInt(e.target.value))}
                            className="bg-background border-2 border-primary px-2 py-1 font-mono font-bold text-[10px]"
                          >
                            <option value="2048">2048 Tokens</option>
                            <option value="4096">4096 Tokens</option>
                            <option value="8192">8192 Tokens</option>
                            <option value="16384">16384 Tokens</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="border-2 border-primary p-4 bg-surface">
                      <h4 className="font-headline font-bold text-xs uppercase text-primary mb-3 flex items-center gap-1.5 border-b border-primary/20 pb-1.5">
                        <span className="material-symbols-outlined text-xs">policy</span> Autonomy & Escalation Rules
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <label className="flex flex-col gap-1">
                          <span className="font-body font-bold uppercase text-on-surface-variant text-[10px]">Scope</span>
                          <select value={settings.scope} onChange={(e) => handleUpdatePolicy(agent.id, 'scope', e.target.value)} className="bg-background border-2 border-primary px-2 py-1 font-mono font-bold uppercase text-[10px]">
                            <option value="project">Project</option>
                            <option value="global">Global</option>
                            <option value="sandbox-only">Sandbox Only</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-body font-bold uppercase text-on-surface-variant text-[10px]">Autonomy</span>
                          <select value={settings.autonomy} onChange={(e) => handleUpdatePolicy(agent.id, 'autonomy', e.target.value)} className="bg-background border-2 border-primary px-2 py-1 font-mono font-bold uppercase text-[10px]">
                            <option value="supervised">Supervised</option>
                            <option value="approval-gated">Approval Gated</option>
                            <option value="autonomous-low-risk">Autonomous Low Risk</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="font-body font-bold uppercase text-on-surface-variant text-[10px]">Escalation</span>
                          <select value={settings.escalation} onChange={(e) => handleUpdatePolicy(agent.id, 'escalation', e.target.value)} className="bg-background border-2 border-primary px-2 py-1 font-mono font-bold uppercase text-[10px]">
                            <option value="approval-required">Approval Required</option>
                            <option value="ask-on-risk">Ask On Risk</option>
                            <option value="block-critical">Block Critical</option>
                          </select>
                        </label>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] font-headline font-bold uppercase mt-4">
                        {['github', 'slack', 'gmail', 'composio'].map(integration => {
                          const isAllowed = settings.integrations.includes(integration);
                          return (
                            <label key={integration} className={`flex items-center gap-2 p-2 border-2 cursor-pointer ${isAllowed ? 'bg-tertiary text-on-tertiary border-primary' : 'bg-background border-outline-variant text-on-surface-variant'}`}>
                              <input type="checkbox" checked={isAllowed} onChange={() => handleUpdateIntegration(agent.id, integration)} className="w-3.5 h-3.5 border-2 border-primary accent-primary" />
                              <span>{integration}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Part 2: Granular Capability Safeguards */}
                    <div>
                      <h4 className="font-headline font-bold text-xs uppercase text-primary mb-2.5 tracking-wider">Capability Policies</h4>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-headline font-bold uppercase">
                        {[
                          { key: 'read', label: 'File System Read' },
                          { key: 'write', label: 'File System Write' },
                          { key: 'sandbox', label: 'Sandbox Execution' },
                          { key: 'network', label: 'Network Access' },
                          { key: 'webhook', label: 'Webhook Dispatches' }
                        ].map(cap => {
                          const isAllowed = settings.capabilities.includes(cap.key);
                          return (
                            <label 
                              key={cap.key} 
                              className={`flex items-center gap-2 p-2 border-2 cursor-pointer transition-colors ${
                                isAllowed ? 'bg-primary-container border-primary text-primary' : 'bg-surface border-outline-variant text-on-surface-variant'
                              }`}
                            >
                              <input 
                                type="checkbox" 
                                checked={isAllowed} 
                                onChange={() => handleUpdateCapability(agent.id, cap.key)}
                                className="w-3.5 h-3.5 border-2 border-primary accent-primary"
                              />
                              <span>{cap.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Part 3: Operational Metrics */}
                    <div className="grid grid-cols-3 gap-2 border-t-2 border-outline-variant pt-4 bg-surface-container-low p-3">
                      <div className="text-center">
                        <span className="font-headline font-bold text-[8px] uppercase text-on-surface-variant block">Tasks Run</span>
                        <span className="font-headline font-black text-base text-primary">{metrics.tasks}</span>
                      </div>
                      <div className="text-center border-x-2 border-outline-variant">
                        <span className="font-headline font-bold text-[8px] uppercase text-on-surface-variant block">Time Active</span>
                        <span className="font-headline font-black text-base text-secondary">{metrics.time}</span>
                      </div>
                      <div className="text-center">
                        <span className="font-headline font-bold text-[8px] uppercase text-on-surface-variant block">Tokens Spent</span>
                        <span className="font-headline font-black text-base text-tertiary">{metrics.tokens}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  {!isSupr && (
                    <div className="border-t-4 border-primary flex bg-surface-container-high">
                      <button 
                        onClick={async () => {
                          showToast(`Archiving and shutting down ${agent.name}...`);
                          await archiveAgentAction(agent.id);
                          loadAgents();
                        }}
                        className="flex-1 py-3 font-headline font-bold text-xs uppercase hover:bg-secondary hover:text-on-error transition-colors flex items-center justify-center gap-2 text-primary"
                      >
                        <span className="material-symbols-outlined text-sm">inventory_2</span> Archive Agent
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <section>
            <div className="flex items-center gap-4 mb-8">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-on-surface-variant">Central Agent Archive</h2>
              <div className="h-1 flex-1 bg-outline-variant"></div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              {archivedAgents.map(agent => (
                <article key={agent.id} className="neo-border bg-surface-container-high flex flex-col relative overflow-hidden grayscale opacity-80 hover:grayscale-0 hover:opacity-100 transition-all duration-300">
                  <div className="border-b-4 border-outline p-4 bg-surface-variant flex justify-between items-center">
                    <div className="flex items-center gap-3 text-on-surface-variant">
                      <span className="material-symbols-outlined text-3xl font-black">archive</span>
                      <div>
                        <h3 className="font-headline text-2xl font-black uppercase tracking-tight">{agent.name}</h3>
                        <p className="font-body text-[9px] text-on-surface-variant font-bold uppercase">{agent.role}</p>
                      </div>
                    </div>
                    <span className="bg-surface text-on-surface-variant px-3 py-1 font-body text-xs font-bold uppercase neo-border border-outline">Archived</span>
                  </div>
                  <div className="p-6 flex-1 flex flex-col gap-4 text-on-surface-variant">
                    <div>
                      <p className="font-body text-xs font-bold uppercase mb-1">Historical Permission</p>
                      <p className="font-headline text-sm font-bold uppercase border-l-4 border-outline pl-3">{agent.permissionTier}</p>
                    </div>
                    <div className="bg-surface p-3 text-[10px] font-mono leading-relaxed border border-outline">
                      Tasks executed: {getMetrics(agent.name).tasks}<br/>
                      Total Tokens: {getMetrics(agent.name).tokens}
                    </div>
                  </div>
                  <div className="border-t-4 border-outline flex bg-surface">
                    <button 
                      onClick={async () => {
                        showToast(`Restoring ${agent.name} back to active squad...`);
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
                  <h3 className="font-headline font-bold uppercase text-xl">Archive Registry Empty</h3>
                  <p className="font-body text-sm mt-2 max-w-sm">There are no deactivated sub-agents. Deactivating an agent moves them into the secure archive.</p>
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
