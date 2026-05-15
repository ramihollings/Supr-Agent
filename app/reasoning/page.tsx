import { TopNav } from '@/components/TopNav';

export default function ReasoningPage() {
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Reasoning & Memory Core" />
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col md:flex-row gap-8">
        
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
               <div className="bg-surface-container p-2 border border-outline-variant font-mono text-[10px] break-all">
                  KEY: pain_cluster_1<br/>
                  VAL: JSON export latency causing churn.
               </div>
               <div className="bg-surface-container p-2 border border-outline-variant font-mono text-[10px] break-all">
                  KEY: spec_status<br/>
                  VAL: V2 passing QA gate.
               </div>
            </div>
          </div>

          <div className="bg-surface neo-border p-4 flex flex-col gap-2 opacity-80 border-dashed">
            <div className="flex justify-between items-center border-b-2 border-outline-variant pb-2">
              <span className="font-headline font-bold uppercase text-sm">Workspace Memory</span>
              <span className="material-symbols-outlined text-sm">folder_shared</span>
            </div>
            <p className="font-body text-xs text-on-surface-variant">Cross-mission standards.</p>
          </div>
        </section>

        {/* Right Col: Reasoning Logs */}
        <section className="flex-1 flex flex-col gap-6">
          <header className="border-b-4 border-primary pb-4">
            <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Decision Matrix</h2>
          </header>

          <div className="space-y-6">
            
            <article className="bg-background neo-border p-6 shadow-[6px_6px_0px_0px_rgba(0,85,255,1)] border-tertiary">
              <div className="flex justify-between mb-4 pb-2 border-b-2 border-outline-variant">
                <span className="font-headline font-bold uppercase text-sm text-tertiary flex items-center gap-2">
                  <span className="material-symbols-outlined shrink-0 text-[18px]">account_tree</span> Planner Delegation
                </span>
                <span className="font-mono text-xs font-bold bg-tertiary-container px-2 py-0.5 text-primary">Conf: High</span>
              </div>
              <p className="font-body text-sm font-bold mb-2">Assigning context scan to Context Agent instead of Research Agent.</p>
              <div className="bg-surface-container p-3 border-l-4 border-tertiary">
                <p className="font-body text-sm italic text-on-surface-variant">"Research Agent is occupied with scraping external JSON telemetry. Context Agent has direct access to the GitHub issues cache. Splitting task avoids bottleneck."</p>
              </div>
            </article>

            <article className="bg-background neo-border p-6 shadow-[6px_6px_0px_0px_rgba(230,59,46,1)] border-secondary">
              <div className="flex justify-between mb-4 pb-2 border-b-2 border-outline-variant">
                <span className="font-headline font-bold uppercase text-sm text-secondary flex items-center gap-2">
                  <span className="material-symbols-outlined shrink-0 text-[18px]">gavel</span> QA Rejection
                </span>
                <span className="font-mono text-xs font-bold bg-error-container px-2 py-0.5 text-error border border-error">Blocking</span>
              </div>
              <p className="font-body text-sm font-bold mb-2">Sent Spec Draft V1 back to Code Agent.</p>
              <div className="bg-surface-container p-3 border-l-4 border-secondary">
                <p className="font-body text-sm italic text-on-surface-variant">"Operational standards require all drafts to include acceptance criteria and test cases. The submitted brief lacked both. Re-prompting Code Agent with standard reinforcement."</p>
              </div>
            </article>

          </div>
        </section>

      </main>
    </div>
  );
}
