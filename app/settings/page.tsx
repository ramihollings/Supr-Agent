"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useRef } from 'react';

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('Operating Mode');
  const [operatingMode, setOperatingMode] = useState('Supervisor');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const modeRef = useRef<HTMLDivElement>(null);
  const permissionsRef = useRef<HTMLDivElement>(null);
  const memoryRef = useRef<HTMLDivElement>(null);
  const standardsRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const scrollToSection = (section: string, ref: React.RefObject<HTMLDivElement>) => {
    setActiveSection(section);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Settings" />
      
      {toastMessage && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}

      <main className="flex-1 overflow-y-auto max-w-7xl mx-auto w-full p-4 md:p-8 flex flex-col md:flex-row gap-8">
        {/* Settings Vertical Nav */}
        <aside className="w-full md:w-64 flex-shrink-0 flex flex-col gap-2 border-r-0 md:border-r-4 border-primary pr-0 md:pr-8 mb-8 md:mb-0 sticky top-0 h-fit">
          <h1 className="font-headline text-4xl font-black tracking-tighter uppercase mb-8 pb-4 border-b-4 border-primary">Settings</h1>
          <nav className="flex flex-col gap-2">
            {[
              { name: 'Operating Mode', ref: modeRef },
              { name: 'Permissions', ref: permissionsRef },
              { name: 'Memory', ref: memoryRef },
              { name: 'Standards', ref: standardsRef },
            ].map((item) => (
              <button 
                key={item.name}
                onClick={() => scrollToSection(item.name, item.ref)}
                className={`font-body font-bold uppercase text-sm p-4 neo-border flex justify-between items-center group transition-all ${
                  activeSection === item.name 
                    ? 'bg-primary text-on-primary neo-shadow translate-x-[2px] translate-y-[2px]' 
                    : 'bg-surface text-primary hover:bg-surface-container'
                }`}
              >
                {item.name}
                <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
              </button>
            ))}
            <button 
              onClick={() => showToast("Workflows coming soon!")}
              className="font-body font-bold uppercase text-sm p-4 bg-surface text-primary neo-border hover:bg-surface-container transition-colors flex justify-between items-center group relative"
            >
              Workflows
              <div className="absolute right-12 top-1/2 -translate-y-1/2 w-3 h-3 bg-secondary rounded-full border border-primary"></div>
              <span className="material-symbols-outlined group-hover:translate-x-1 transition-transform">chevron_right</span>
            </button>
          </nav>
        </aside>

        {/* Settings Content Area */}
        <section className="flex-1 flex flex-col gap-12 pb-20">
          
          <div ref={modeRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Operating Mode</h2>
              <p className="font-body text-on-surface-variant mt-2">Configure the autonomy level of the system.</p>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {[
                { name: 'Guided', risk: 'Low', desc: 'System proposes actions, requires explicit user approval for every step.' },
                { name: 'Supervisor', risk: 'Med', desc: 'System executes autonomously within bounded parameters. Escalates exceptions.' },
                { name: 'Autonomous', risk: 'High', desc: 'System operates independently across most tasks. Requires minimal oversight.' },
                { name: 'Fully Autonomous', risk: 'Extreme', desc: 'Unbounded execution. Self-directed goal generation. Use with caution.', danger: true },
              ].map((mode) => (
                <div 
                  key={mode.name}
                  onClick={() => setOperatingMode(mode.name)}
                  className={`border-4 border-primary p-6 flex flex-col gap-4 relative overflow-hidden group hover:neo-shadow-lg transition-all cursor-pointer ${
                    operatingMode === mode.name 
                      ? mode.danger ? 'bg-secondary text-on-error neo-shadow-lg translate-x-[-2px] translate-y-[-2px]' : 'bg-primary-container text-on-primary-container neo-shadow-lg translate-x-[-2px] translate-y-[-2px]'
                      : 'bg-surface'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h3 className={`font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 ${operatingMode === mode.name && mode.danger ? 'text-on-error' : ''}`}>
                      {mode.name} {operatingMode === mode.name && <span className="material-symbols-outlined">check_circle</span>}
                    </h3>
                    <span className={`text-xs font-bold uppercase px-2 py-1 border-2 border-primary ${
                      mode.risk === 'Extreme' ? 'bg-secondary text-on-error' : 
                      mode.risk === 'High' ? 'bg-tertiary text-on-tertiary' : 
                      'bg-surface-container-high'
                    }`}>Risk: {mode.risk}</span>
                  </div>
                  <p className="font-body text-sm flex-1">{mode.desc}</p>
                  <div className="mt-4 flex items-center gap-2 font-bold text-sm uppercase">
                    <span className="material-symbols-outlined">{operatingMode === mode.name ? 'radio_button_checked' : 'radio_button_unchecked'}</span> 
                    {operatingMode === mode.name ? 'Active Default' : 'Select Mode'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Permissions */}
          <div ref={permissionsRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Permissions Hierarchy</h2>
            </div>
            
            <div className="flex flex-col neo-border bg-surface-container-low">
              {[
                { level: 1, name: 'Observe', desc: 'Read-only access to logs and state.', bg: 'bg-surface' },
                { level: 2, name: 'Execute', desc: 'Can trigger predefined workflows.', bg: 'bg-surface-container' },
                { level: 3, name: 'Configure', desc: 'Modify agent parameters and standards.', bg: 'bg-tertiary-container' },
                { level: 4, name: 'Root', desc: 'Unrestricted access. Destructive capabilities.', bg: 'bg-error-container', text: 'text-on-error-container', danger: true },
              ].map((p) => (
                <div key={p.name} className={`flex items-center p-4 border-b-4 border-primary ${p.bg} ${p.text || ''}`}>
                  <div className={`w-12 h-12 neo-border flex items-center justify-center mr-4 font-black ${p.danger ? 'bg-secondary text-on-error' : 'bg-surface-container'}`}>{p.level}</div>
                  <div className="flex-1">
                    <h4 className="font-bold uppercase">{p.name}</h4>
                    <p className="text-sm font-body">{p.desc}</p>
                  </div>
                  <button 
                    onClick={() => showToast(`Editing ${p.name} permissions...`)}
                    className={`px-4 py-2 neo-border font-bold text-sm uppercase transition-colors ${p.danger ? 'bg-secondary text-on-error hover:bg-primary hover:text-on-primary neo-shadow' : 'hover:bg-primary hover:text-on-primary'}`}
                  >
                    {p.danger ? 'Manage' : 'Edit'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Memory Banks */}
          <div ref={memoryRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4 flex justify-between items-end">
              <div>
                <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Memory Banks</h2>
                <p className="font-body text-on-surface-variant mt-2">Manage learned context across different retention layers.</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: 'User Memory', icon: 'person', type: 'Persistent', bg: 'bg-primary-container', border: 'border-l-secondary' },
                { name: 'Workspace', icon: 'folder_special', type: 'Persistent', bg: 'bg-tertiary-container', border: 'border-l-tertiary' },
                { name: 'Mission', icon: 'radar', type: 'Ephemeral', bg: 'bg-surface-variant', border: 'border-l-outline-variant', danger: true },
              ].map((m) => (
                <div key={m.name} className="neo-border bg-surface flex flex-col h-full relative group">
                  <div className={`p-4 border-b-4 border-primary flex justify-between items-center ${m.bg}`}>
                    <h3 className="font-headline font-bold uppercase text-lg flex items-center gap-2">
                      <span className="material-symbols-outlined">{m.icon}</span> {m.name}
                    </h3>
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase border-2 border-primary ${m.danger ? 'bg-error text-on-error' : 'bg-background'}`}>{m.type}</span>
                  </div>
                  <div className="p-4 flex-1 flex flex-col gap-3 font-body text-sm bg-background">
                    <p className="text-on-surface-variant text-xs uppercase font-bold tracking-wider mb-2">Details</p>
                    <div className={`p-2 border-l-4 ${m.border} bg-surface`}>
                       Contextual data managed by the {m.name.toLowerCase()} unit.
                    </div>
                  </div>
                  <button 
                    onClick={() => showToast(m.danger ? "Purging cache..." : `Managing ${m.name}...`)}
                    className={`p-3 border-t-4 border-primary font-bold uppercase text-xs transition-colors flex justify-center items-center gap-2 ${m.danger ? 'text-error hover:bg-error hover:text-on-error' : 'hover:bg-primary hover:text-on-primary'}`}
                  >
                     <span className="material-symbols-outlined text-[16px]">{m.danger ? 'delete' : 'edit'}</span> {m.danger ? 'Purge Cache' : 'Manage Bank'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Standards */}
          <div ref={standardsRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Operational Standards</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { name: 'Evidence Required', desc: 'Agents must cite sources before execution.' },
                { name: 'Tests Must Pass', desc: 'Simulation must succeed prior to live deployment.' },
                { name: 'Scope Approval', desc: 'Require human sign-off if mission parameters shift.' },
              ].map((s) => (
                <label key={s.name} className="flex items-start gap-4 p-4 border-4 border-primary bg-surface cursor-pointer group hover:bg-surface-container transition-colors">
                  <input type="checkbox" defaultChecked className="w-6 h-6 border-2 border-primary rounded-none text-primary focus:ring-primary focus:ring-offset-0 mt-1" />
                  <div>
                    <span className="block font-bold uppercase text-sm mb-1 group-hover:text-tertiary transition-colors">{s.name}</span>
                    <span className="block font-body text-xs text-on-surface-variant">{s.desc}</span>
                  </div>
                </label>
              ))}
            </div>
            
            <div className="mt-8 flex justify-end">
              <button 
                onClick={() => showToast("Configurations Saved ✓")}
                className="px-8 py-4 bg-primary text-on-primary font-headline font-bold text-lg uppercase neo-border neo-shadow hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] transition-all"
              >
                Save Configurations
              </button>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}
