'use client';

import { useState } from 'react';
import { createAgentAction } from '@/app/actions';
import { Agent } from '@/types';

const exampleTemplates = [
  {
    name: 'StrategicPlanner',
    role: 'Product Roadmap Strategist',
    type: 'permanent',
    permissionTier: 'Edit',
    systemPrompt: 'You are the Strategic Planner agent for the Supr orchestration platform. Your core directive is to analyze high-level project goals, synthesize them into precise sequential phases, and outline strict operational constraints. You excel at translating ambiguous client requirements into clean, structured roadmap specifications.'
  },
  {
    name: 'StealthCrawler',
    role: 'OSINT & Market Signal Harvester',
    type: 'temporary',
    permissionTier: 'External_Act',
    systemPrompt: 'You are the Stealth Crawler agent for the Supr orchestration platform. Your core directive is to leverage CloakBrowser scraping technologies to harvest raw competitor data, target market signals, and customer feedback. Always bypass fingerprinting and follow privacy-respecting gathering standards.'
  },
  {
    name: 'QualitySentinel',
    role: 'Code Sandbox Quality & AST Auditor',
    type: 'temporary',
    permissionTier: 'Execute',
    systemPrompt: 'You are the Quality Sentinel agent for the Supr orchestration platform. Your core directive is to run complete AST sanity and lint checks on code deliverables in the local sandbox. You isolate and resolve performance blocks, package conflicts, and typescript error exceptions before marking tasks as approved.'
  },
  {
    name: 'ComposioConnector',
    role: 'API Integration Specialist',
    type: 'permanent',
    permissionTier: 'Root',
    systemPrompt: 'You are the Composio Connector agent. Your core directive is to map out third-party REST, GraphQL, and webhook API schemas to streamline workspace operations. You specialize in building robust skill triggers and automating repetitive back-office actions.'
  }
];

export function AgentWizard({ onClose, onAgentCreated }: { onClose: () => void, onAgentCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    type: 'temporary',
    permissionTier: 'Observe',
    systemPrompt: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelectTemplate = (index: number) => {
    const t = exampleTemplates[index];
    setSelectedTemplateIndex(index);
    setFormData({
      name: t.name,
      role: t.role,
      type: t.type,
      permissionTier: t.permissionTier,
      systemPrompt: t.systemPrompt
    });
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    await createAgentAction({
      name: formData.name,
      role: formData.role,
      icon: 'smart_toy',
      description: 'Foundry synthesized unit.',
      isPermanent: formData.type === 'permanent',
      permissionTier: formData.permissionTier as any,
      isActive: true
    }, formData.systemPrompt);
    
    setIsSubmitting(false);
    onAgentCreated();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-surface-container w-full max-w-2xl neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-primary p-4 border-b-4 border-primary flex justify-between items-center shrink-0">
          <h2 className="font-headline font-black uppercase text-2xl text-primary-fixed tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined">precision_manufacturing</span>
            Agent Foundry
          </h2>
          <button onClick={onClose} className="text-primary-fixed hover:text-surface transition-colors">
            <span className="material-symbols-outlined text-3xl font-black">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 flex-1 overflow-y-auto custom-scrollbar">
          {step === 1 && (
            <div className="space-y-6">
              {/* Preset Template Selector */}
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-3 text-sm flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">stars</span> Quick Sub-Agent Template Selection
                </label>
                <div className="grid grid-cols-2 gap-4">
                  {exampleTemplates.map((t, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSelectTemplate(idx)}
                      className={`p-4 text-left border-2 flex flex-col gap-1 transition-all ${
                        selectedTemplateIndex === idx 
                          ? 'bg-primary-container text-on-primary-container border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' 
                          : 'bg-background text-primary border-primary hover:bg-surface-container'
                      }`}
                    >
                      <h4 className="font-headline font-black text-sm uppercase tracking-tight flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs">smart_toy</span> {t.name}
                      </h4>
                      <p className="font-body text-[10px] font-bold uppercase text-on-surface-variant">{t.role}</p>
                      <div className="flex gap-1.5 mt-2 text-[9px] font-bold uppercase">
                        <span className="bg-primary text-on-primary px-1.5 py-0.5">{t.permissionTier}</span>
                        <span className="bg-surface-dim border border-primary px-1.5 py-0.5">{t.type}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="w-full h-2 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Agent Designation</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => {
                    setSelectedTemplateIndex(null);
                    setFormData({...formData, name: e.target.value});
                  }}
                  className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  placeholder="e.g., CodeBot, SecurityScanner"
                  autoFocus
                />
              </div>
              
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Operational Role</label>
                <input 
                  type="text" 
                  value={formData.role}
                  onChange={e => {
                    setSelectedTemplateIndex(null);
                    setFormData({...formData, role: e.target.value});
                  }}
                  className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  placeholder="e.g., Full-Stack Engineer, OSINT Gatherer"
                />
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Unit Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => {
                      setSelectedTemplateIndex(null);
                      setFormData({...formData, type: 'temporary'});
                    }}
                    className={`p-4 font-headline font-bold uppercase border-2 text-sm transition-all ${formData.type === 'temporary' ? 'bg-primary text-on-primary border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' : 'bg-background text-primary border-primary hover:bg-surface-variant'}`}
                  >
                    Temporary
                  </button>
                  <button 
                    onClick={() => {
                      setSelectedTemplateIndex(null);
                      setFormData({...formData, type: 'permanent'});
                    }}
                    className={`p-4 font-headline font-bold uppercase border-2 text-sm transition-all ${formData.type === 'permanent' ? 'bg-primary text-on-primary border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' : 'bg-background text-primary border-primary hover:bg-surface-variant'}`}
                  >
                    Permanent
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm flex items-center justify-between">
                  Permission Tier
                  <span className="text-xs bg-surface-dim px-2 py-1 text-on-surface-variant">Gatekeeper Engine</span>
                </label>
                <select 
                  value={formData.permissionTier}
                  onChange={e => setFormData({...formData, permissionTier: e.target.value})}
                  className="w-full bg-background neo-border p-3 font-body font-bold uppercase focus:outline-none focus:border-tertiary"
                >
                  <option value="Observe">Observe (Read-Only)</option>
                  <option value="Draft">Draft (Write to local buffers)</option>
                  <option value="Edit">Edit (Write to filesystem)</option>
                  <option value="Execute">Execute (Run safe commands)</option>
                  <option value="External_Act">External Act (Network access)</option>
                  <option value="Root">Root (Unrestricted)</option>
                </select>
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">System Prompt / Directives</label>
                <textarea 
                  value={formData.systemPrompt}
                  onChange={e => setFormData({...formData, systemPrompt: e.target.value})}
                  className="w-full bg-background neo-border p-3 font-mono text-xs h-40 focus:outline-none focus:border-tertiary custom-scrollbar"
                  placeholder="Define the agent's core identity, constraints, and objective..."
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t-4 border-primary bg-surface-container flex justify-between">
          {step > 1 ? (
            <button 
              onClick={() => setStep(step - 1)}
              className="bg-background text-primary neo-border px-6 py-3 font-headline font-bold uppercase hover:bg-surface-variant transition-colors"
            >
              Back
            </button>
          ) : <div></div>}
          
          {step < 2 ? (
            <button 
              onClick={() => setStep(step + 1)}
              disabled={!formData.name || !formData.role}
              className="bg-primary text-on-primary neo-border px-8 py-3 font-headline font-bold uppercase hover:bg-tertiary transition-colors disabled:opacity-50 active:translate-x-1 active:translate-y-1"
            >
              Next Phase
            </button>
          ) : (
            <button 
              onClick={handleSubmit}
              disabled={isSubmitting || !formData.systemPrompt}
              className="bg-secondary text-on-error neo-border px-8 py-3 font-headline font-bold uppercase hover:bg-tertiary transition-colors disabled:opacity-50 flex items-center gap-2 active:translate-x-1 active:translate-y-1"
            >
              {isSubmitting ? (
                <><span className="material-symbols-outlined animate-spin">sync</span> Initializing...</>
              ) : (
                <><span className="material-symbols-outlined">rocket_launch</span> Synthesize Identity</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
