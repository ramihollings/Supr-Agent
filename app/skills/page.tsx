"use client";

import { TopNav } from '@/components/TopNav';
import { useToast } from '@/components/ToastProvider';
import { useState, useEffect, Suspense } from 'react';
import { fetchSkillsState, createSkillAction, deleteSkillAction } from '@/app/actions';

interface Skill {
  id: string;
  name: string;
  description: string;
  provider: string;
  tools: string[];
}

const SKILL_GUIDELINES: Record<string, { why: string; when: string }> = {
  'google web intelligence': {
    why: 'Allows sub-agents to access real-time external data, search scientific preprints, and pull current API documentation.',
    when: 'Activate when the workspace lacks context, or when competitor signals and market research are requested.'
  },
  'docker node sandbox execution': {
    why: 'Provides secure command-line runs inside an isolated, secure workspace.',
    when: 'Activate when verifying script syntax, running automated test suites, or checking code structure.'
  },
  'composio slack bridge': {
    why: 'Enables direct communication with team channels for immediate notification dispatches.',
    when: 'Activate when critical tasks complete, failures escalate, or manual review gates require attention.'
  },
  'composio github bridge': {
    why: 'Automates repository issue creation, branch commits, and pull requests.',
    when: 'Activate when compiling bug fixes, cataloging issues, or exporting deliverables.'
  }
};

function getSkillMeta(name: string, description: string) {
  const key = name.toLowerCase().trim();
  for (const k of Object.keys(SKILL_GUIDELINES)) {
    if (key.includes(k) || k.includes(key)) {
      return SKILL_GUIDELINES[k];
    }
  }
  // Generic fallback
  return {
    why: `Equips sub-agents with modular capability wrappers to bridge the sandbox and external APIs safely.`,
    when: `Instruct the agent to utilize this when executing tasks described as: "${description.slice(0, 60)}..."`
  };
}

function SkillsPageContent() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showModal, setShowModal] = useState(false);
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
    loadSkills();
  }, []);

  const { showToast } = useToast();

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

      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Installed Skills</h1>
            <p className="font-body text-sm font-bold mt-2 text-on-surface-variant max-w-2xl border-l-4 border-secondary pl-3">
              Manage tools and integrations. These allow your agents to browse the web, edit files, run tests, and send notifications.
            </p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-primary text-on-primary neo-border font-headline font-bold uppercase text-sm py-3 px-5 hover:bg-background hover:text-primary neo-shadow transition-all active:translate-x-1 active:translate-y-1 flex items-center gap-2 shrink-0"
          >
            <span className="material-symbols-outlined text-[20px] font-black">construction</span>
            Register New Skill
          </button>
        </header>

        {isLoading ? (
          <div className="font-mono text-primary text-xs uppercase font-bold animate-pulse">Scanning Registry Banks...</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {skills.map(skill => {
              const meta = getSkillMeta(skill.name, skill.description);
              return (
                <article key={skill.id} className="neo-border bg-background shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] flex flex-col justify-between relative group text-xs">
                  <div>
                    {/* Header */}
                    <div className="border-b-2 border-primary p-3 bg-primary-container flex justify-between items-center">
                      <div className="flex items-center gap-2 truncate">
                        <span className="material-symbols-outlined text-lg text-primary font-black">architecture</span>
                        <h3 className="font-headline font-bold uppercase tracking-tight text-primary truncate">{skill.name}</h3>
                      </div>
                      <span className="bg-primary text-on-primary px-1.5 py-0.5 font-body text-[8px] font-bold uppercase border border-primary shrink-0">{skill.provider}</span>
                    </div>

                    <div className="p-4 space-y-3 font-body">
                      {/* Description */}
                      <p className="text-on-surface-variant italic font-semibold leading-relaxed border-l-2 border-outline-variant pl-2">
                        {skill.description}
                      </p>

                      {/* Explicit Why / When sections */}
                      <div className="bg-surface-container p-2.5 space-y-2 border border-primary/10">
                        <div>
                          <span className="block font-headline font-bold text-[9px] uppercase text-primary mb-0.5">Why Use This</span>
                          <p className="text-primary text-[10px] leading-snug font-semibold">{meta.why}</p>
                        </div>
                        <div>
                          <span className="block font-headline font-bold text-[9px] uppercase text-tertiary mb-0.5">When to Activate</span>
                          <p className="text-on-surface-variant text-[10px] leading-snug">{meta.when}</p>
                        </div>
                      </div>

                      {/* Tool maps */}
                      <div>
                        <h4 className="font-headline font-bold text-[9px] uppercase text-on-surface-variant mb-1.5 tracking-wider">Tool Mappings</h4>
                        <div className="flex flex-wrap gap-1.5">
                          {skill.tools.map((tool, index) => (
                            <span key={index} className="bg-surface border border-primary px-1.5 py-0.5 font-mono text-[9px] text-primary flex items-center gap-1">
                              <span className="material-symbols-outlined text-[10px]">code</span> {tool}
                            </span>
                          ))}
                          {skill.tools.length === 0 && (
                            <span className="text-[10px] text-on-surface-variant font-bold italic">No active tools mapped.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="border-t-2 border-primary flex bg-surface-container-low">
                    <button 
                      onClick={() => handleDelete(skill.id, skill.name)}
                      className="flex-1 py-2 font-headline font-bold text-[10px] uppercase hover:bg-secondary hover:text-on-error transition-colors flex items-center justify-center gap-1.5 text-primary"
                    >
                      <span className="material-symbols-outlined text-sm font-black">delete</span> Deactivate
                    </button>
                  </div>
                </article>
              );
            })}

            {skills.length === 0 && (
              <div className="col-span-full border-4 border-dashed border-primary/40 p-12 text-center bg-surface-container-low">
                <span className="material-symbols-outlined text-5xl text-primary/40 mb-2">construction</span>
                <p className="font-headline text-lg font-bold uppercase text-primary mb-1">No Skills Found</p>
                <p className="font-body text-xs text-on-surface-variant">Register new skills to expand sub-agent capabilities.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Creation Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface-container w-full max-w-xl neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col animate-fade-in text-xs">
            <div className="bg-primary p-4 border-b-4 border-primary flex justify-between items-center">
              <h2 className="font-headline font-black uppercase text-xl text-primary-fixed tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined">precision_manufacturing</span>
                Register New Skill
              </h2>
              <button onClick={() => setShowModal(false)} className="text-primary-fixed hover:text-surface transition-colors">
                <span className="material-symbols-outlined text-2xl font-black">close</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-[10px]">Skill Name</label>
                <input 
                  type="text" 
                  value={newSkill.name}
                  onChange={e => setNewSkill({...newSkill, name: e.target.value})}
                  className="w-full bg-background neo-border p-2 font-body focus:outline-none"
                  placeholder="e.g. Google Analytics Engine"
                  autoFocus
                />
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-[10px]">Provider Type</label>
                <select 
                  value={newSkill.provider}
                  onChange={e => setNewSkill({...newSkill, provider: e.target.value})}
                  className="w-full bg-background neo-border p-2 font-body font-bold uppercase focus:outline-none"
                >
                  <option value="Custom API">Custom API Bridge</option>
                  <option value="Anthropic">Anthropic Skills</option>
                  <option value="Composio">Composio Skills</option>
                  <option value="GKE Sandbox API">GKE Sandbox API</option>
                </select>
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-[10px]">Tools Schema Mappings (comma separated)</label>
                <input 
                  type="text" 
                  value={newSkill.rawTools}
                  onChange={e => setNewSkill({...newSkill, rawTools: e.target.value})}
                  className="w-full bg-background neo-border p-2 font-mono text-[10px] focus:outline-none"
                  placeholder="e.g. read_metrics, analyze_traffic"
                />
              </div>

              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-[10px]">Skill Scope / Description</label>
                <textarea 
                  value={newSkill.description}
                  onChange={e => setNewSkill({...newSkill, description: e.target.value})}
                  className="w-full bg-background neo-border p-2 font-body h-20 focus:outline-none custom-scrollbar"
                  placeholder="Describe what capabilities this skill registers for sandboxed sub-agents..."
                />
              </div>
            </div>

            <div className="p-4 border-t-4 border-primary bg-surface-container flex justify-end gap-2.5">
              <button 
                onClick={() => setShowModal(false)}
                className="bg-background text-primary neo-border px-5 py-2 font-headline font-bold uppercase text-xs hover:bg-surface-variant transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleCreate}
                disabled={!newSkill.name || !newSkill.description}
                className="bg-secondary text-on-error neo-border px-6 py-2 font-headline font-bold uppercase text-xs hover:bg-tertiary transition-colors disabled:opacity-50 flex items-center gap-1.5 active:translate-x-1 active:translate-y-1"
              >
                <span className="material-symbols-outlined text-sm font-black">save</span> Save Skill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SkillsPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container items-center justify-center">
        <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Loading Skills Registry...</p>
      </div>
    }>
      <SkillsPageContent />
    </Suspense>
  );
}
