import { TopNav } from '@/components/TopNav';
import Link from 'next/link';

export default function MissionControlPage() {
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Mission Control" />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Command Channel */}
        <section className="w-80 border-r-4 border-primary bg-background hidden lg:flex flex-col">
          <div className="p-4 border-b-4 border-primary bg-primary text-primary-fixed">
            <h2 className="font-headline font-black uppercase text-xl tracking-tight">Command Channel</h2>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 flex flex-col">
            <div className="neo-border p-3 bg-surface">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-sm">smart_toy</span>
                <span className="font-headline font-bold text-sm uppercase">Supr</span>
              </div>
              <p className="text-sm font-medium">Mission BuildSignal initialized. Target data ingested.</p>
            </div>
            <div className="neo-border p-3 bg-primary-container text-on-primary-container self-end max-w-[85%]">
              <div className="flex items-center justify-end gap-2 mb-1">
                <span className="font-headline font-bold text-sm uppercase">You</span>
                <span className="material-symbols-outlined text-sm">account_circle</span>
              </div>
              <p className="text-sm font-medium">Proceed to context scan.</p>
            </div>
            <div className="neo-border p-3 bg-surface">
              <div className="flex items-center gap-2 mb-1">
                <span className="material-symbols-outlined text-sm">smart_toy</span>
                <span className="font-headline font-bold text-sm uppercase">Supr</span>
              </div>
              <p className="text-sm font-medium">Context scan running. Waiting on approval gate for prioritization.</p>
            </div>
          </div>
          <div className="p-4 border-t-4 border-primary bg-surface-container-high">
            <div className="flex items-center gap-2">
              <input type="text" placeholder="Issue command..." className="flex-1 bg-background neo-border px-3 py-2 font-body text-sm focus:outline-none focus:border-tertiary focus:ring-0" />
              <button className="bg-primary text-primary-fixed neo-border p-2 hover:bg-tertiary hover:text-on-tertiary transition-colors active:translate-x-1 active:translate-y-1">
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        </section>

        {/* Center Column: Glidepath & Board */}
        <section className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 lg:p-8 gap-8">
          {/* Glidepath */}
          <div className="bg-background neo-border neo-shadow p-6">
            <div className="flex justify-between items-end mb-8 border-b-4 border-primary pb-4">
              <div>
                <h1 className="font-headline font-black text-4xl uppercase tracking-tighter text-primary">BuildSignal</h1>
                <p className="font-headline font-bold text-lg text-tertiary uppercase mt-1">Active Mission Glidepath</p>
              </div>
              <div className="text-right">
                <span className="block font-headline font-bold text-sm uppercase mb-1">Mission Readiness</span>
                <div className="text-5xl font-black font-headline text-secondary">87<span className="text-2xl">%</span></div>
              </div>
            </div>
            <div className="relative flex justify-between items-center px-4 mt-12 mb-8">
              <div className="absolute top-1/2 left-0 w-full h-1 bg-outline-variant -z-10 -translate-y-1/2"></div>
              <div className="absolute top-1/2 left-0 w-3/5 h-2 bg-primary -z-10 -translate-y-1/2"></div>
              
              {/* Nodes */}
              {['Intake', 'Signal Ingest', 'Pain Clustering'].map(step => (
                <div key={step} className="flex flex-col items-center gap-3 z-10 bg-background px-2">
                  <div className="w-8 h-8 bg-primary flex items-center justify-center neo-border">
                    <span className="material-symbols-outlined text-on-primary text-sm">check</span>
                  </div>
                  <span className="font-headline font-bold text-xs uppercase text-primary">{step}</span>
                </div>
              ))}
              
              <div className="flex flex-col items-center gap-3 z-10 bg-background px-2">
                <div className="w-12 h-12 bg-tertiary flex items-center justify-center neo-border shadow-[0_0_15px_rgba(0,85,255,0.6)] animate-pulse">
                  <span className="material-symbols-outlined text-on-tertiary">radar</span>
                </div>
                <span className="font-headline font-bold text-sm uppercase text-tertiary">Context Scan</span>
              </div>
              
              <div className="flex flex-col items-center gap-3 z-10 bg-background px-2 relative">
                <div className="w-10 h-10 bg-primary-container flex items-center justify-center neo-border relative">
                  <span className="material-symbols-outlined text-on-primary-container">lock</span>
                  <span className="absolute -top-2 -right-2 w-4 h-4 bg-secondary border-2 border-primary"></span>
                </div>
                <span className="font-headline font-bold text-xs uppercase text-primary">Prioritize</span>
                <span className="absolute -bottom-6 font-body text-[10px] whitespace-nowrap font-bold text-secondary uppercase bg-secondary-fixed px-1 border border-secondary">Gate Pending</span>
              </div>
            </div>
          </div>

          {/* Task Board */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-background neo-border p-5 neo-shadow border-t-8 border-t-primary">
              <div className="flex justify-between items-start mb-4">
                <h3 className="font-headline font-bold uppercase text-lg leading-tight w-4/5">Analyze competitor telemetry</h3>
                <span className="bg-surface-dim px-2 py-1 text-xs font-bold uppercase border-2 border-primary">Done</span>
              </div>
              <p className="font-body text-sm mb-4">Extracted signals from 3 major competitors indicating vulnerability in Q3 metrics.</p>
              <div className="flex items-center gap-2 text-xs font-bold font-headline uppercase">
                <span className="material-symbols-outlined text-base">travel_explore</span> Research Agent
              </div>
            </div>

            <div className="bg-background neo-border p-5 neo-shadow border-t-8 border-t-tertiary relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-tertiary text-on-tertiary px-3 py-1 font-headline text-xs font-bold uppercase border-l-4 border-b-4 border-primary">Active</div>
              <div className="flex justify-between items-start mb-4 mt-2">
                <h3 className="font-headline font-bold uppercase text-lg leading-tight w-4/5">Cross-reference feature usage</h3>
              </div>
              <p className="font-body text-sm mb-4">Scanning internal logs to match competitor feature gaps with our high-usage modules.</p>
              <div className="flex items-center gap-2 text-xs font-bold font-headline uppercase text-tertiary">
                <span className="material-symbols-outlined text-base">psychology</span> Supr
              </div>
            </div>
          </div>
        </section>

        {/* Right Column: Reasoning / Agents */}
        <section className="w-80 border-l-4 border-primary bg-background hidden xl:flex flex-col overflow-y-auto custom-scrollbar">
          <div className="p-6">
            <h2 className="font-headline font-black uppercase text-2xl tracking-tight border-b-4 border-primary pb-2 mb-6">Agent Team</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 neo-border bg-tertiary-fixed text-on-tertiary-fixed">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl">psychology</span>
                  <div>
                    <div className="font-headline font-bold uppercase text-sm">Supr</div>
                    <div className="font-body text-xs">Orchestrator</div>
                  </div>
                </div>
                <div className="w-3 h-3 bg-tertiary animate-pulse border-2 border-primary"></div>
              </div>
              {/* Additional agents... */}
            </div>
          </div>
          
          <div className="p-6 bg-surface-container-high border-t-4 border-primary flex-1">
            <h2 className="font-headline font-black uppercase text-xl tracking-tight border-b-4 border-primary pb-2 mb-4">Why Supr Chose This</h2>
            <div className="neo-border bg-background p-4 mb-4">
              <h4 className="font-headline font-bold uppercase text-sm mb-2 text-tertiary flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">lightbulb</span> Current Action Focus
              </h4>
              <p className="font-body text-sm leading-relaxed">
                Context Scan prioritized because "Pain Clustering" revealed anomalous spikes in user complaints regarding competitor data export features.
              </p>
            </div>
            
            <div className="bg-secondary-container neo-border p-4">
              <h4 className="font-headline font-bold uppercase text-sm mb-2 text-on-secondary-container flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">warning</span> Gate Required
              </h4>
              <p className="font-body text-sm leading-relaxed text-on-secondary-container mb-4">
                Prioritization phase requires human approval.
              </p>
              <button className="w-full bg-secondary text-on-secondary neo-border py-2 font-headline font-bold uppercase hover:bg-error hover:text-on-error transition-colors">
                Review Gate
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
