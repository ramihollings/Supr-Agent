"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect } from 'react';
import { fetchSkillsState, createSkillAction, deleteSkillAction } from '@/app/actions';

interface Skill {
  id: string;
  name: string;
  description: string;
  provider: string;
  tools: string[];
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Modal form states
  const [newSkill, setNewSkill] = useState({
    name: '',
    description: '',
    provider: 'Custom API',
    rawTools: 'tool_name_1, tool_name_2'
  });

  const loadSkills = async () => {
    setIsLoading(true);
    const data = await fetchSkillsState();
    if (data) setSkills(data);
    setIsLoading(false);
  };

  useEffect(() => {
    let active = true;
    fetchSkillsState().then(data => {
      if (active) {
        if (data) setSkills(data);
        setIsLoading(false);
      }
    });
    return () => { active = false; };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleCreate = async () => {
    if (!newSkill.name || !newSkill.description) {
      showToast("Please fill in all required fields!");
      return;
    }

    const toolList = newSkill.rawTools
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    const res = await createSkillAction({
      name: newSkill.name,
      description: newSkill.description,
      provider: newSkill.provider,
      tools: toolList
    });

    if (res.success) {
      showToast(`Skill "${newSkill.name}" registered successfully!`);
      setShowModal(false);
      setNewSkill({ name: '', description: '', provider: 'Custom API', rawTools: 'tool_name_1, tool_name_2' });
      loadSkills();
    } else {
      showToast(`Error: ${res.error}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const res = await deleteSkillAction(id);
    if (res.success) {
      showToast(`Skill "${name}" deactivated.`);
      loadSkills();
    } else {
      showToast(`Error: ${res.error}`);
    }
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Agent Skills Registry" />

      {toastMessage && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}

      <main className="flex-1 p-6 md:p-12 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-12 gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-5xl md:text-7xl font-black uppercase tracking-tighter text-primary">Installed Skills</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant max-w-2xl border-l-4 border-secondary pl-4">
              Equip your AI sub-agents with advanced modular capabilities. Register new API schemas, Anthropic skills, or superpower triggers.
            </p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-primary text-on-primary neo-border font-headline font-bold uppercase text-xl py-4 px-8 hover:bg-background hover:text-primary neo-shadow transition-all active:translate-x-1 active:translate-y-1 flex items-center gap-3 shrink-0"
          >
            <span className="material-symbols-outlined font-black">construction</span>
            Register New Skill
          </button>
        </header>

        {isLoading ? (
          <div className="font-mono text-primary text-lg uppercase font-bold animate-pulse">Scanning Registry Banks...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
            {skills.map(skill => (
              <article key={skill.id} className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col relative group">
                {/* Header tag */}
                <div className="border-b-4 border-primary p-4 bg-primary-container flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-primary font-black">architecture</span>
                    <h3 className="font-headline text-xl font-black uppercase tracking-tight text-primary">{skill.name}</h3>
                  </div>
                  <span className="bg-primary text-on-primary px-2.5 py-0.5 font-body text-[10px] font-bold uppercase neo-border">{skill.provider}</span>
                </div>

                {/* Description */}
                <div className="p-6 flex-1 flex flex-col gap-4">
                  <p className="font-body text-sm text-primary leading-relaxed bg-surface-container p-4 border-l-4 border-tertiary">
                    {skill.description}
                  </p>

                  <div>
                    <h4 className="font-headline font-bold text-xs uppercase text-on-surface-variant mb-2 tracking-wider">Registered Tool Mappings</h4>
                    <div className="flex flex-wrap gap-2">
                      {skill.tools.map((tool, index) => (
                        <span key={index} className="bg-surface border-2 border-primary px-2 py-1 font-mono text-xs text-primary flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">code</span> {tool}
                        </span>
                      ))}
                      {skill.tools.length === 0 && (
                        <span className="text-xs text-on-surface-variant font-bold italic">No active tools mapped.</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delete button */}
                <div className="border-t-4 border-primary flex bg-surface-container-low">
                  <button 
                    onClick={() => handleDelete(skill.id, skill.name)}
                    className="flex-1 py-3 font-headline font-bold text-xs uppercase hover:bg-secondary hover:text-on-error transition-colors flex items-center justify-center gap-2 text-primary"
                  >
                    <span className="material-symbols-outlined text-sm font-black">delete</span> Deactivate Skill
                  </button>
                </div>
              </article>
            ))}

            {skills.length === 0 && (
              <div className="md:col-span-3 border-4 border-dashed border-primary/40 p-12 text-center bg-surface-container-low">
                <span className="material-symbols-outlined text-6xl text-primary/40 mb-4">construction</span>
                <p className="font-headline text-xl font-bold uppercase text-primary mb-2">No Skills Found</p>
                <p className="font-body text-sm text-on-surface-variant">Register new skills to expand your sub-agents capabilities.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container w-full max-w-xl neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col animate-fade-in">
            {/* Header */}
            <div className="bg-primary p-4 border-b-4 border-primary flex justify-between items-center">
              <h2 className="font-headline font-black uppercase text-2xl text-primary-fixed tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined">precision_manufacturing</span>
                Register New Skill
              </h2>
              <button onClick={() => setShowModal(false)} className="text-primary-fixed hover:text-surface transition-colors">
                <span className="material-symbols-outlined text-3xl font-black">close</span>
              </button>
            </div>

            {/* Content */}
            <div className="p-8 space-y-6">
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Skill Name</label>
                <input 
                  type="text" 
                  value={newSkill.name}
                  onChange={e => setNewSkill({...newSkill, name: e.target.value})}
                  className="w-full bg-background neo-border p-3 font-body focus:outline-none focus:border-tertiary"
                  placeholder="e.g. Google Analytics Engine"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Provider Type</label>
                <select 
                  value={newSkill.provider}
                  onChange={e => setNewSkill({...newSkill, provider: e.target.value})}
                  className="w-full bg-background neo-border p-3 font-body font-bold uppercase focus:outline-none focus:border-tertiary"
                >
                  <option value="Custom API">Custom API Bridge</option>
                  <option value="Anthropic">Anthropic Skills</option>
                  <option value="Composio">Composio Skills</option>
                  <option value="GKE Sandbox API">GKE Sandbox API</option>
                </select>
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Tools Schema Mappings (comma separated)</label>
                <input 
                  type="text" 
                  value={newSkill.rawTools}
                  onChange={e => setNewSkill({...newSkill, rawTools: e.target.value})}
                  className="w-full bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                  placeholder="e.g. read_metrics, analyze_traffic, sync_dimensions"
                />
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-sm">Skill Scope / Description</label>
                <textarea 
                  value={newSkill.description}
                  onChange={e => setNewSkill({...newSkill, description: e.target.value})}
                  className="w-full bg-background neo-border p-3 font-body text-sm h-28 focus:outline-none focus:border-tertiary custom-scrollbar"
                  placeholder="Describe what capabilities this skill registers for sandboxed sub-agents..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t-4 border-primary bg-surface-container flex justify-end gap-3">
              <button 
                onClick={() => setShowModal(false)}
                className="bg-background text-primary neo-border px-6 py-3 font-headline font-bold uppercase hover:bg-surface-variant transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreate}
                disabled={!newSkill.name || !newSkill.description}
                className="bg-secondary text-on-error neo-border px-8 py-3 font-headline font-bold uppercase hover:bg-tertiary transition-colors disabled:opacity-50 flex items-center gap-2 active:translate-x-1 active:translate-y-1"
              >
                <span className="material-symbols-outlined font-black">save</span> Register Skill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
