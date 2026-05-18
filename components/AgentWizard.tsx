'use client';

import { useState } from 'react';
import { createAgentAction } from '@/app/actions';
import { Agent } from '@/types';

export function AgentWizard({ onClose, onAgentCreated }: { onClose: () => void, onAgentCreated: () => void }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    type: 'temporary',
    permissionTier: 'Observe',
    systemPrompt: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      <div className="bg-surface-container w-full max-w-2xl neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col">
        {/* Header */}
        <div className="bg-primary p-4 border-b-4 border-primary flex justify-between items-center">
          <h2 className="font-headline font-black uppercase text-2xl text-primary-fixed tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined">precision_manufacturing</span>
            Agent Foundry
          </h2>
          <button onClick={onClose} className="text-primary-fixed hover:text-surface transition-colors">
            <span className="material-symbols-outlined text-3xl font-black">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-8 flex-1 overflow-y-auto">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Agent Designation</label>
                <input 
                  type="text" 
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
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
                  onChange={e => setFormData({...formData, role: e.target.value})}
                  className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  placeholder="e.g., Full-Stack Engineer, OSINT Gatherer"
                />
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Unit Type</label>
                <div className="grid grid-cols-2 gap-4">
                  <button 
                    onClick={() => setFormData({...formData, type: 'temporary'})}
                    className={`p-4 font-headline font-bold uppercase border-2 text-sm transition-all ${formData.type === 'temporary' ? 'bg-primary text-on-primary border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' : 'bg-background text-primary border-primary hover:bg-surface-variant'}`}
                  >
                    Temporary
                  </button>
                  <button 
                    onClick={() => setFormData({...formData, type: 'permanent'})}
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
