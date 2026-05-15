import React from 'react';

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  icon: string;
  isActive: boolean;
  permissionTier: string;
}

export function AgentCard({ agent }: { agent: AgentInfo }) {
  return (
    <div className={`flex items-center justify-between p-3 neo-border ${agent.isActive ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-surface text-on-surface'}`}>
      <div className="flex items-center gap-3">
        <span className="material-symbols-outlined text-3xl">{agent.icon}</span>
        <div>
          <div className="font-headline font-bold uppercase text-sm flex items-center gap-2">
            {agent.name}
            <span className={`text-[9px] px-1 py-0.5 border ${agent.isActive ? 'border-on-tertiary-fixed' : 'border-outline'} uppercase`}>{agent.permissionTier}</span>
          </div>
          <div className="font-body text-xs">{agent.role}</div>
        </div>
      </div>
      {agent.isActive && (
        <div className="w-3 h-3 bg-tertiary animate-pulse border-2 border-primary"></div>
      )}
    </div>
  );
}
