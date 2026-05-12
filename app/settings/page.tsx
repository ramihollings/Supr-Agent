import { TopNav } from '@/components/TopNav';

export default function SettingsPage() {
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden">
      <TopNav title="Settings" />
      
      <main className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full p-4 md:p-8 flex flex-col md:flex-row gap-8">
        {/* Settings Vertical Nav */}
        <aside className="w-full md:w-64 flex-shrink-0 flex flex-col gap-2 border-r-0 md:border-r-4 border-primary pr-0 md:pr-8 mb-8 md:mb-0">
          <h1 className="font-headline text-4xl font-black tracking-tighter uppercase mb-8 pb-4 border-b-4 border-primary">Settings</h1>
          <nav className="flex flex-col gap-2">
            <button className="font-body font-bold uppercase text-sm p-4 bg-primary text-on-primary neo-border flex justify-between items-center group neo-shadow translate-x-[2px] translate-y-[2px]">
              Operating Mode
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
            </button>
            <button className="font-body font-bold uppercase text-sm p-4 bg-surface text-primary neo-border hover:bg-surface-container transition-colors flex justify-between items-center group">
              Permissions
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
            </button>
            <button className="font-body font-bold uppercase text-sm p-4 bg-surface text-primary neo-border hover:bg-surface-container transition-colors flex justify-between items-center group">
              Memory
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
            </button>
            <button className="font-body font-bold uppercase text-sm p-4 bg-surface text-primary neo-border hover:bg-surface-container transition-colors flex justify-between items-center group">
              Standards
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
            </button>
            <button className="font-body font-bold uppercase text-sm p-4 bg-surface text-primary neo-border hover:bg-surface-container transition-colors flex justify-between items-center group relative">
              Workflows
              <div className="absolute right-12 top-1/2 -translate-y-1/2 w-3 h-3 bg-secondary rounded-full border border-primary"></div>
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
            </button>
          </nav>
        </aside>

        {/* Settings Content Area */}
        <section className="flex-1 flex flex-col gap-12 pb-20">
          
          <div className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Operating Mode</h2>
              <p className="font-body text-on-surface-variant mt-2">Configure the autonomy level of the system.</p>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {/* Guided */}
              <div className="border-4 border-primary bg-surface p-6 flex flex-col gap-4 relative overflow-hidden group hover:neo-shadow-lg transition-all cursor-pointer">
                <div className="flex justify-between items-start">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight">Guided</h3>
                  <span className="text-xs font-bold uppercase bg-surface-container-high px-2 py-1 border-2 border-primary">Risk: Low</span>
                </div>
                <p className="font-body text-sm flex-1">System proposes actions, requires explicit user approval for every step.</p>
                <div className="mt-4 flex items-center gap-2 font-bold text-sm uppercase text-primary">
                  <span className="material-symbols-outlined">radio_button_unchecked</span> Select Mode
                </div>
              </div>

              {/* Supervisor (Active) */}
              <div className="border-4 border-primary bg-primary-container text-on-primary-container p-6 flex flex-col gap-4 relative overflow-hidden group neo-shadow-lg translate-x-[-2px] translate-y-[-2px]">
                <div className="flex justify-between items-start">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                    Supervisor <span className="material-symbols-outlined">check_circle</span>
                  </h3>
                  <span className="text-xs font-bold uppercase bg-surface px-2 py-1 border-2 border-primary text-primary">Risk: Med</span>
                </div>
                <p className="font-body text-sm flex-1">System executes autonomously within bounded parameters. Escalates exceptions.</p>
                <div className="mt-4 flex items-center gap-2 font-bold text-sm uppercase">
                  <span className="material-symbols-outlined">radio_button_checked</span> Active Default
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-10">
                  <span className="material-symbols-outlined text-[120px]">visibility</span>
                </div>
              </div>

              {/* Autonomous */}
              <div className="border-4 border-primary bg-surface p-6 flex flex-col gap-4 relative overflow-hidden group hover:neo-shadow-lg transition-all cursor-pointer">
                <div className="flex justify-between items-start">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight">Autonomous</h3>
                  <span className="text-xs font-bold uppercase bg-tertiary text-on-tertiary px-2 py-1 border-2 border-primary">Risk: High</span>
                </div>
                <p className="font-body text-sm flex-1">System operates independently across most tasks. Requires minimal oversight.</p>
                <div className="mt-4 flex items-center gap-2 font-bold text-sm uppercase text-primary">
                  <span className="material-symbols-outlined">radio_button_unchecked</span> Select Mode
                </div>
              </div>

              {/* Fully Autonomous */}
              <div className="border-4 border-primary bg-surface p-6 flex flex-col gap-4 relative overflow-hidden group hover:neo-shadow-lg transition-all cursor-pointer">
                <div className="flex justify-between items-start">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight text-secondary">Fully Autonomous</h3>
                  <span className="text-xs font-bold uppercase bg-secondary text-on-error px-2 py-1 border-2 border-primary">Risk: Extreme</span>
                </div>
                <p className="font-body text-sm flex-1">Unbounded execution. Self-directed goal generation. Use with caution.</p>
                <div className="mt-4 flex items-center gap-2 font-bold text-sm uppercase text-secondary">
                  <span className="material-symbols-outlined">radio_button_unchecked</span> Select Mode
                </div>
              </div>
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Permissions */}
          <div className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Permissions Hierarchy</h2>
            </div>
            
            <div className="flex flex-col neo-border bg-surface-container-low">
              <div className="flex items-center p-4 border-b-4 border-primary bg-surface">
                <div className="w-12 h-12 neo-border bg-surface-container flex items-center justify-center mr-4 font-black">1</div>
                <div className="flex-1">
                  <h4 className="font-bold uppercase">Observe</h4>
                  <p className="text-sm font-body">Read-only access to logs and state.</p>
                </div>
                <button className="px-4 py-2 neo-border font-bold text-sm uppercase hover:bg-primary hover:text-on-primary transition-colors">Edit</button>
              </div>
              
              <div className="flex items-center p-4 border-b-4 border-primary bg-surface-container">
                <div className="w-12 h-12 neo-border bg-primary-container flex items-center justify-center mr-4 font-black">2</div>
                <div className="flex-1">
                  <h4 className="font-bold uppercase">Execute</h4>
                  <p className="text-sm font-body">Can trigger predefined workflows.</p>
                </div>
                <button className="px-4 py-2 neo-border font-bold text-sm uppercase hover:bg-primary hover:text-on-primary transition-colors">Edit</button>
              </div>
              
              <div className="flex items-center p-4 border-b-4 border-primary bg-tertiary-container">
                <div className="w-12 h-12 neo-border bg-tertiary text-on-tertiary flex items-center justify-center mr-4 font-black">3</div>
                <div className="flex-1">
                  <h4 className="font-bold uppercase">Configure</h4>
                  <p className="text-sm font-body">Modify agent parameters and standards.</p>
                </div>
                <button className="px-4 py-2 neo-border font-bold text-sm uppercase hover:bg-primary hover:text-on-primary transition-colors">Edit</button>
              </div>
              
              <div className="flex items-center p-4 bg-error-container text-on-error-container">
                <div className="w-12 h-12 neo-border bg-secondary text-on-error flex items-center justify-center mr-4 font-black">4</div>
                <div className="flex-1">
                  <h4 className="font-bold uppercase text-secondary">Root</h4>
                  <p className="text-sm font-body">Unrestricted access. Destructive capabilities.</p>
                </div>
                <button className="px-4 py-2 neo-border font-bold text-sm uppercase bg-secondary text-on-error hover:bg-primary hover:text-on-primary transition-colors neo-shadow">Manage</button>
              </div>
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Standards */}
          <div className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Operational Standards</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <label className="flex items-start gap-4 p-4 border-4 border-primary bg-surface cursor-pointer group hover:bg-surface-container transition-colors">
                <input type="checkbox" defaultChecked className="w-6 h-6 border-2 border-primary rounded-none text-primary focus:ring-primary focus:ring-offset-0 mt-1" />
                <div>
                  <span className="block font-bold uppercase text-sm mb-1 group-hover:text-tertiary transition-colors">Evidence Required</span>
                  <span className="block font-body text-xs text-on-surface-variant">Agents must cite sources before execution.</span>
                </div>
              </label>
              <label className="flex items-start gap-4 p-4 border-4 border-primary bg-surface cursor-pointer group hover:bg-surface-container transition-colors">
                <input type="checkbox" defaultChecked className="w-6 h-6 border-2 border-primary rounded-none text-primary focus:ring-primary focus:ring-offset-0 mt-1" />
                <div>
                  <span className="block font-bold uppercase text-sm mb-1 group-hover:text-tertiary transition-colors">Tests Must Pass</span>
                  <span className="block font-body text-xs text-on-surface-variant">Simulation must succeed prior to live deployment.</span>
                </div>
              </label>
              <label className="flex items-start gap-4 p-4 border-4 border-primary bg-surface cursor-pointer group hover:bg-surface-container transition-colors">
                <input type="checkbox" className="w-6 h-6 border-2 border-primary rounded-none text-primary focus:ring-primary focus:ring-offset-0 mt-1" />
                <div>
                  <span className="block font-bold uppercase text-sm mb-1 group-hover:text-tertiary transition-colors">Approval For Scope Changes</span>
                  <span className="block font-body text-xs text-on-surface-variant">Require human sign-off if mission parameters shift.</span>
                </div>
              </label>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button className="px-8 py-4 bg-primary text-on-primary font-headline font-bold text-lg uppercase neo-border neo-shadow hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] transition-all">
                Save Configurations
              </button>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}
