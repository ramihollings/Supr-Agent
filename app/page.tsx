import { TopNav } from '@/components/TopNav';
import Link from 'next/link';

export default function WorkspacePage() {
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container">
      <TopNav title="Workspace Overview" />
      
      <div className="p-6 lg:p-8 flex-1 overflow-y-auto space-y-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Workspace</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Active projects, artifacts, and general supervisor state.</p>
          </div>
          <button className="bg-primary text-on-primary neo-border neo-shadow font-headline font-bold uppercase py-3 px-6 hover:bg-primary-fixed hover:text-primary transition-all active:translate-x-1 active:translate-y-1">
            <span className="flex items-center gap-2"><span className="material-symbols-outlined">add</span> New Mission</span>
          </button>
        </header>

        {/* Active Missions */}
        <section>
          <h2 className="font-headline text-2xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">rocket_launch</span> Active Missions
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-background neo-border neo-shadow p-6 group cursor-pointer hover:bg-surface-bright transition-colors">
              <div className="flex justify-between items-start mb-4">
                <Link href="/mission-control" className="font-headline text-2xl font-bold uppercase group-hover:text-tertiary transition-colors">BuildSignal: Q3 Planning</Link>
                <span className="bg-primary-container text-on-primary-container px-3 py-1 font-body text-xs font-bold uppercase neo-border">In Progress</span>
              </div>
              <p className="font-body text-sm text-on-surface-variant mb-6">Aggregate customer feedback, analyze drops, and construct the Q3 engineering roadmap.</p>
              
              <div className="flex items-center justify-between border-t-2 border-outline-variant pt-4">
                <div className="flex -space-x-2">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center neo-border z-30" title="Supr Planner"><span className="material-symbols-outlined text-on-primary text-sm">psychology</span></div>
                  <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center neo-border z-20" title="Research Agent"><span className="material-symbols-outlined text-primary text-sm">travel_explore</span></div>
                  <div className="w-8 h-8 rounded-full bg-tertiary text-on-tertiary flex items-center justify-center neo-border z-10" title="Signal Agent"><span className="material-symbols-outlined tracking-tighter text-sm">sensors</span></div>
                </div>
                <div className="text-right">
                  <span className="font-headline font-bold text-xs uppercase text-on-surface-variant block">Mission Readiness</span>
                  <span className="font-headline font-black text-2xl text-secondary">87%</span>
                </div>
              </div>
            </div>

            <div className="bg-surface-variant neo-border p-6 shadow-sm opacity-80 border-dashed">
               <div className="flex items-center justify-center h-full min-h-[160px] text-on-surface-variant">
                  <p className="font-headline font-bold uppercase text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined">add_circle</span> Assign New Mission
                  </p>
               </div>
            </div>
          </div>
        </section>

        {/* Recent Artifacts */}
        <section>
          <h2 className="font-headline text-2xl font-black uppercase tracking-tight mb-4 border-b-4 border-primary pb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">folder_open</span> Artifact Library
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <Link href="/mission-packet" className="bg-background neo-border p-5 hover:bg-surface transition-colors hover:neo-shadow-lg flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-secondary text-3xl">picture_as_pdf</span>
                  <span className="text-xs font-bold uppercase text-on-surface-variant">Just Now</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold uppercase">BuildSignal Mission Packet</h3>
                  <p className="font-body text-xs mt-1 text-on-surface-variant">Final aggregated analysis & roadmap.</p>
                </div>
             </Link>
             
             <div className="bg-background neo-border p-5 hover:bg-surface transition-colors hover:neo-shadow-lg flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-tertiary text-3xl">dataset</span>
                  <span className="text-xs font-bold uppercase text-on-surface-variant">2h ago</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold uppercase">Competitor Telemetry JSON</h3>
                  <p className="font-body text-xs mt-1 text-on-surface-variant">Extracted from 50 competitors.</p>
                </div>
             </div>

             <div className="bg-background neo-border p-5 hover:bg-surface transition-colors hover:neo-shadow-lg flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-primary-fixed-dim text-3xl">description</span>
                  <span className="text-xs font-bold uppercase text-on-surface-variant">1d ago</span>
                </div>
                <div>
                  <h3 className="font-headline font-bold uppercase">Feature Spec Draft V1</h3>
                  <p className="font-body text-xs mt-1 text-on-surface-variant">Pending QA Agent review.</p>
                </div>
             </div>
          </div>
        </section>

      </div>
    </div>
  );
}
