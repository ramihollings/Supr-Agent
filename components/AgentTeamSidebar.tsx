import React from 'react';
import { AgentCard, AgentInfo } from './AgentCard';

interface Props {
  agents: AgentInfo[];
  reasoningText: string;
  gateRequiredText?: string;
  onReviewGate?: () => void;
}

export function AgentTeamSidebar({ agents, reasoningText, gateRequiredText, onReviewGate }: Props) {
  return (
    <section className="w-80 border-l-4 border-primary bg-background hidden xl:flex flex-col overflow-y-auto custom-scrollbar">
      <div className="p-6">
        <h2 className="font-headline font-black uppercase text-2xl tracking-tight border-b-4 border-primary pb-2 mb-6">Agent Team</h2>
        <div className="space-y-4">
          {agents.map(agent => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      </div>
      
      <div className="p-6 bg-surface-container-high border-t-4 border-primary flex-1">
        <h2 className="font-headline font-black uppercase text-xl tracking-tight border-b-4 border-primary pb-2 mb-4">Why Supr Chose This</h2>
        <div className="neo-border bg-background p-4 mb-4">
          <h4 className="font-headline font-bold uppercase text-sm mb-2 text-tertiary flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">lightbulb</span> Current Action Focus
          </h4>
          <p className="font-body text-sm leading-relaxed text-on-surface">
            {reasoningText}
          </p>
        </div>
        
        {gateRequiredText && (
          <div className="bg-secondary-container neo-border p-4">
            <h4 className="font-headline font-bold uppercase text-sm mb-2 text-on-secondary-container flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">warning</span> Gate Required
            </h4>
            <p className="font-body text-sm leading-relaxed text-on-secondary-container mb-4">
              {gateRequiredText}
            </p>
            {onReviewGate && (
              <button 
                onClick={onReviewGate}
                className="w-full bg-secondary text-on-secondary neo-border py-2 font-headline font-bold uppercase hover:bg-error hover:text-on-error transition-colors"
              >
                Review Gate
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
