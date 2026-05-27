import React from 'react';

export type PhaseStatus = 'Pending' | 'Active' | 'Done' | 'Blocked' | 'Gate_Pending';

export interface Phase {
  id: string;
  name: string;
  status: PhaseStatus;
}

interface Props {
  phases: Phase[];
  readinessScore: number;
}

export function Glidepath({ phases, readinessScore }: Props) {
  const getStatusUI = (status: PhaseStatus) => {
    switch (status) {
      case 'Done':
        return { icon: 'check', containerClass: 'bg-primary border-primary', iconClass: 'text-on-primary', glow: '' };
      case 'Active':
        return { icon: 'radar', containerClass: 'bg-tertiary border-tertiary w-12 h-12', iconClass: 'text-on-tertiary animate-pulse', glow: 'shadow-[0_0_15px_rgba(0,85,255,0.6)]' };
      case 'Gate_Pending':
        return { icon: 'lock', containerClass: 'bg-primary-container border-primary', iconClass: 'text-on-primary-container', glow: '' };
      case 'Blocked':
        return { icon: 'warning', containerClass: 'bg-error border-error', iconClass: 'text-on-error', glow: 'shadow-[0_0_15px_rgba(255,0,0,0.6)]' };
      default:
        return { icon: 'radio_button_unchecked', containerClass: 'bg-surface border-outline', iconClass: 'text-outline-variant', glow: '' };
    }
  };

  const doneCount = phases.filter(p => p.status === 'Done').length;
  const progressPercent = phases.length > 0 ? (doneCount / (phases.length - 1)) * 100 : 0;

  return (
    <div className="bg-background neo-border neo-shadow p-6">
      <div className="flex justify-between items-end mb-8 border-b-4 border-primary pb-4">
        <div>
          <h1 className="font-headline font-black text-4xl uppercase tracking-tighter text-primary">BuildSignal</h1>
          <p className="font-headline font-bold text-lg text-tertiary uppercase mt-1">Active Mission Glidepath</p>
        </div>
        <div className="text-right">
          <span className="block font-headline font-bold text-sm uppercase mb-1">Mission Readiness</span>
          <div className="text-5xl font-black font-headline text-secondary">{readinessScore}<span className="text-2xl">%</span></div>
        </div>
      </div>
      
      <div className="relative flex justify-between items-center px-4 mt-12 mb-8 overflow-x-auto custom-scrollbar pb-6 pt-2">
        <div className="absolute top-1/2 left-4 right-4 h-1 bg-outline-variant -z-10 -translate-y-1/2"></div>
        <div className="absolute top-1/2 left-4 h-2 bg-primary -z-10 -translate-y-1/2 transition-all duration-500" style={{ width: `calc(${progressPercent}% - 2rem)` }}></div>
        
        {phases.map((phase) => {
          const ui = getStatusUI(phase.status);
          return (
            <div key={phase.id} className="flex flex-col items-center gap-3 z-10 bg-background px-2 relative min-w-[80px]">
              <div className={`w-10 h-10 flex items-center justify-center neo-border transition-all duration-300 ${ui.containerClass} ${ui.glow}`}>
                <span className={`material-symbols-outlined ${ui.iconClass}`}>{ui.icon}</span>
                {phase.status === 'Gate_Pending' && (
                  <span className="absolute -top-2 -right-2 w-4 h-4 bg-secondary border-2 border-primary z-20"></span>
                )}
              </div>
              <span className={`font-headline font-bold text-xs uppercase text-center ${phase.status === 'Active' ? 'text-tertiary' : 'text-primary'}`}>
                {phase.name}
              </span>
              {phase.status === 'Gate_Pending' && (
                <span className="absolute -bottom-6 font-body text-[10px] whitespace-nowrap font-bold text-secondary uppercase bg-secondary-fixed px-1 border border-secondary">Gate Pending</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
