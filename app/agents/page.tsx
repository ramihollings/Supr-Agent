import { TopNav } from '@/components/TopNav';

export default function AgentsPage() {
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Agent Team Manager" />
      
      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-5xl md:text-7xl font-black uppercase tracking-tighter text-primary">Team Roster</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant max-w-2xl border-l-4 border-secondary pl-4">Manage autonomous and temporary agents. Allocate permissions, monitor statuses, and instantiate new operational units.</p>
          </div>
          <button className="bg-primary text-on-primary neo-border font-headline font-bold uppercase text-xl py-4 px-8 hover:bg-background hover:text-primary neo-shadow transition-all active:translate-x-1 active:translate-y-1 flex items-center gap-3 shrink-0">
            <span className="material-symbols-outlined">add_circle</span>
            Create New Agent
          </button>
        </header>

        {/* Permanent Agents Section */}
        <section className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Permanent Units</h2>
            <div className="h-1 flex-1 bg-primary"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {/* Agent Card: Supr */}
            <article className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col">
              <div className="border-b-4 border-primary p-4 bg-primary-container flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl text-primary font-black">admin_panel_settings</span>
                  <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary">Supr</h3>
                </div>
                <span className="bg-primary text-primary-container px-3 py-1 font-body text-xs font-bold uppercase neo-border">Active</span>
              </div>
              <div className="p-6 flex-1 flex flex-col gap-6">
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-1">Role</p>
                  <p className="font-headline text-xl font-bold uppercase text-primary border-l-4 border-primary pl-3">Supervisor / Orchestrator</p>
                </div>
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2">Permission Tier</p>
                  <div className="flex gap-2 font-headline text-sm font-bold uppercase">
                    <span className="bg-primary text-on-primary px-2 py-1">Execute</span>
                    <span className="bg-surface-dim text-on-surface-variant px-2 py-1 border-2 border-outline-variant">Edit</span>
                  </div>
                </div>
                <div className="mt-auto">
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2 border-b-2 border-primary pb-1">Last Reasoning</p>
                  <p className="font-body text-sm font-medium italic text-primary bg-surface-container p-3 border-l-4 border-primary">"Analyzed mission 'BuildSignal'. Delegating sub-tasks to Research and Code agents."</p>
                </div>
              </div>
              <div className="border-t-4 border-primary flex">
                <button className="flex-1 py-3 font-headline font-bold uppercase border-r-4 border-primary hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">settings</span> Configure
                </button>
                <button className="flex-1 py-3 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">history</span> Logs
                </button>
              </div>
            </article>

            {/* Agent Card: Research */}
            <article className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col">
              <div className="border-b-4 border-primary p-4 bg-tertiary-container flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl text-primary font-black">travel_explore</span>
                  <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary">Research</h3>
                </div>
                <span className="bg-primary text-tertiary-container px-3 py-1 font-body text-xs font-bold uppercase neo-border">Active</span>
              </div>
              <div className="p-6 flex-1 flex flex-col gap-6">
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-1">Role</p>
                  <p className="font-headline text-xl font-bold uppercase text-primary border-l-4 border-primary pl-3">Data Gatherer</p>
                </div>
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2">Permission Tier</p>
                  <div className="flex gap-2 font-headline text-sm font-bold uppercase">
                    <span className="bg-surface-dim text-on-surface-variant px-2 py-1 border-2 border-outline-variant">Observe</span>
                    <span className="bg-primary text-on-primary px-2 py-1">Draft</span>
                  </div>
                </div>
                <div className="mt-auto">
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2 border-b-2 border-primary pb-1">Last Reasoning</p>
                  <p className="font-body text-sm font-medium italic text-primary bg-surface-container p-3 border-l-4 border-primary">"Scraped 50 competitors. Compiling metrics into Draft report for Planner."</p>
                </div>
              </div>
              <div className="border-t-4 border-primary flex">
                <button className="flex-1 py-3 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">settings</span> Configure
                </button>
              </div>
            </article>

            {/* Agent Card: Code */}
            <article className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col">
              <div className="border-b-4 border-primary p-4 bg-inverse-primary flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl text-primary font-black">terminal</span>
                  <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary">Code</h3>
                </div>
                <span className="bg-surface-dim text-primary px-3 py-1 font-body text-xs font-bold uppercase neo-border">Idle</span>
              </div>
              <div className="p-6 flex-1 flex flex-col gap-6">
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-1">Role</p>
                  <p className="font-headline text-xl font-bold uppercase text-primary border-l-4 border-primary pl-3">Implementation</p>
                </div>
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2">Permission Tier</p>
                  <div className="flex gap-2 font-headline text-sm font-bold uppercase flex-wrap">
                    <span className="bg-surface-dim text-on-surface-variant px-2 py-1 border-2 border-outline-variant">Draft</span>
                    <span className="bg-surface-dim text-on-surface-variant px-2 py-1 border-2 border-outline-variant">Edit</span>
                    <span className="bg-secondary text-on-error px-2 py-1 neo-border">Execute</span>
                  </div>
                </div>
                <div className="mt-auto">
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2 border-b-2 border-primary pb-1">Last Reasoning</p>
                  <p className="font-body text-sm font-medium italic text-primary bg-surface-container p-3 border-l-4 border-primary">"Awaiting final schema from Planner before initiating repository scaffold."</p>
                </div>
              </div>
              <div className="border-t-4 border-primary flex">
                <button className="flex-1 py-3 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">settings</span> Configure
                </button>
              </div>
            </article>
          </div>
        </section>

        {/* Temporary Agents Section */}
        <section>
          <div className="flex items-center gap-4 mb-8">
            <h2 className="font-headline text-3xl font-black uppercase tracking-tighter text-primary">Temporary Units</h2>
            <div className="h-1 flex-1 bg-secondary border-t-2 border-b-2 border-primary border-dashed"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {/* Temporary Agent Card: Signal Agent */}
            <article className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(230,59,46,1)] flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-secondary text-on-error font-headline font-bold uppercase text-xs px-4 py-1 border-l-4 border-b-4 border-primary z-10">
                Expiring in 2 Days
              </div>
              <div className="border-b-4 border-primary p-4 pt-8 bg-surface-variant flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-3xl text-secondary font-black">sensors</span>
                  <h3 className="font-headline text-2xl font-black uppercase tracking-tight text-primary">Signal Agent</h3>
                </div>
                <span className="bg-primary text-primary-fixed px-3 py-1 font-body text-xs font-bold uppercase neo-border">Active</span>
              </div>
              <div className="p-6 flex-1 flex flex-col gap-6">
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-1">Created For</p>
                  <p className="font-headline text-lg font-bold uppercase text-primary border-l-4 border-secondary pl-3">Mission: BuildSignal</p>
                </div>
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-1">Role</p>
                  <p className="font-headline text-xl font-bold uppercase text-primary border-l-4 border-primary pl-3">Specialized Scraper</p>
                </div>
                <div>
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2">Permission Tier</p>
                  <div className="flex gap-2 font-headline text-sm font-bold uppercase">
                    <span className="bg-primary text-on-primary px-2 py-1">Observe</span>
                  </div>
                </div>
                <div className="mt-auto">
                  <p className="font-body text-xs font-bold uppercase text-on-surface-variant mb-2 border-b-2 border-primary pb-1">Last Reasoning</p>
                  <p className="font-body text-sm font-medium italic text-primary bg-surface-container p-3 border-l-4 border-secondary">"Extracting targeted JSON endpoints from designated sources. 45% complete."</p>
                </div>
              </div>
              <div className="border-t-4 border-primary flex">
                <button className="flex-1 py-3 font-headline font-bold uppercase border-r-4 border-primary hover:bg-secondary hover:text-on-error transition-colors flex items-center justify-center gap-2">
                  <span className="material-symbols-outlined">delete</span> Terminate Early
                </button>
              </div>
            </article>
          </div>
        </section>
      </main>
    </div>
  );
}
