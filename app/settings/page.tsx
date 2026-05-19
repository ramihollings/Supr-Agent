"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect, useRef } from 'react';
import { 
  fetchSettingsAction, 
  updateSettingAction, 
  fetchMemoryItemsAction, 
  purgeMemoryItemsAction, 
  addGlobalMemoryItemAction 
} from '@/app/actions';

interface MemoryItem {
  id: string;
  key: string;
  value: string;
  type: string;
  scope: string;
  importance: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('Operating Mode');
  const [operatingMode, setOperatingMode] = useState('Supervisor');
  const [permissionBoundary, setPermissionBoundary] = useState('governed');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Global LLM Keys States
  const [globalMinimaxKey, setGlobalMinimaxKey] = useState('');
  const [globalGeminiKey, setGlobalGeminiKey] = useState('');
  const [globalBackupKey, setGlobalBackupKey] = useState('');
  const [globalBackupUrl, setGlobalBackupUrl] = useState('');
  const [globalBackupModel, setGlobalBackupModel] = useState('');
  const [globalBackupName, setGlobalBackupName] = useState('');

  // Role Overrides States
  const [suprProvider, setSuprProvider] = useState('default');
  const [suprKey, setSuprKey] = useState('');
  const [suprModel, setSuprModel] = useState('');
  const [suprUrl, setSuprUrl] = useState('');

  const [codeProvider, setCodeProvider] = useState('default');
  const [codeKey, setCodeKey] = useState('');
  const [codeModel, setCodeModel] = useState('');
  const [codeUrl, setCodeUrl] = useState('');

  const [researchProvider, setResearchProvider] = useState('default');
  const [researchKey, setResearchKey] = useState('');
  const [researchModel, setResearchModel] = useState('');
  const [researchUrl, setResearchUrl] = useState('');

  const [subProvider, setSubProvider] = useState('default');
  const [subKey, setSubKey] = useState('');
  const [subModel, setSubModel] = useState('');
  const [subUrl, setSubUrl] = useState('');

  // Channels States
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [slackEnabled, setSlackEnabled] = useState(true);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [socialEnabled, setSocialEnabled] = useState(false);

  const [telegramToken, setTelegramToken] = useState('718290382:AAFlk1829aB...');
  const [telegramChatId, setTelegramChatId] = useState('-100192830182');
  const [twitterHandle, setTwitterHandle] = useState('@supr_orchestrator');

  // Memory Banks States
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [activeMemoryBank, setActiveMemoryBank] = useState<string>('User');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newImportance, setNewImportance] = useState('Medium');

  const modeRef = useRef<HTMLDivElement>(null);
  const permissionsRef = useRef<HTMLDivElement>(null);
  const llmRef = useRef<HTMLDivElement>(null);
  const memoryRef = useRef<HTMLDivElement>(null);
  const standardsRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<HTMLDivElement>(null);

  // Load settings and memories from SQLite
  useEffect(() => {
    async function loadData() {
      const [settings, memories] = await Promise.all([
        fetchSettingsAction(),
        fetchMemoryItemsAction()
      ]);

      if (settings.operating_mode) setOperatingMode(settings.operating_mode);
      if (settings.permission_boundary) setPermissionBoundary(settings.permission_boundary);

      // Global Keys
      if (settings.global_minimax_key) setGlobalMinimaxKey(settings.global_minimax_key);
      if (settings.global_gemini_key) setGlobalGeminiKey(settings.global_gemini_key);
      if (settings.global_backup_key) setGlobalBackupKey(settings.global_backup_key);
      if (settings.global_backup_url) setGlobalBackupUrl(settings.global_backup_url);
      if (settings.global_backup_model) setGlobalBackupModel(settings.global_backup_model);
      if (settings.global_backup_name) setGlobalBackupName(settings.global_backup_name);

      // Supr Role Override
      if (settings.llm_provider_supr) setSuprProvider(settings.llm_provider_supr);
      if (settings.llm_key_supr) setSuprKey(settings.llm_key_supr);
      if (settings.llm_model_supr) setSuprModel(settings.llm_model_supr);
      if (settings.llm_url_supr) setSuprUrl(settings.llm_url_supr);

      // Code Role Override
      if (settings.llm_provider_code) setCodeProvider(settings.llm_provider_code);
      if (settings.llm_key_code) setCodeKey(settings.llm_key_code);
      if (settings.llm_model_code) setCodeModel(settings.llm_model_code);
      if (settings.llm_url_code) setCodeUrl(settings.llm_url_code);

      // Research Role Override
      if (settings.llm_provider_research) setResearchProvider(settings.llm_provider_research);
      if (settings.llm_key_research) setResearchKey(settings.llm_key_research);
      if (settings.llm_model_research) setResearchModel(settings.llm_model_research);
      if (settings.llm_url_research) setResearchUrl(settings.llm_url_research);

      // Sub-agents Override
      if (settings.llm_provider_sub) setSubProvider(settings.llm_provider_sub);
      if (settings.llm_key_sub) setSubKey(settings.llm_key_sub);
      if (settings.llm_model_sub) setSubModel(settings.llm_model_sub);
      if (settings.llm_url_sub) setSubUrl(settings.llm_url_sub);
      
      setEmailEnabled(settings.channels_email === 'true');
      setSlackEnabled(settings.channels_slack === 'true');
      setTelegramEnabled(settings.channels_telegram === 'true');
      setSocialEnabled(settings.channels_social === 'true');

      if (settings.telegram_token) setTelegramToken(settings.telegram_token);
      if (settings.telegram_chat_id) setTelegramChatId(settings.telegram_chat_id);
      if (settings.twitter_handle) setTwitterHandle(settings.twitter_handle);

      setMemoryItems(memories);
    }
    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleUpdateSetting = async (key: string, value: string, toastMsg?: string) => {
    const res = await updateSettingAction(key, value);
    if (res.success && toastMsg) {
      showToast(toastMsg);
    }
  };

  const handleModeChange = (mode: string) => {
    setOperatingMode(mode);
    handleUpdateSetting('operating_mode', mode, `Operating mode set to ${mode} ✓`);
  };

  const handleToggleChannel = (channel: string, current: boolean, label: string) => {
    const newVal = !current;
    if (channel === 'email') {
      setEmailEnabled(newVal);
      handleUpdateSetting('channels_email', newVal ? 'true' : 'false', `${label} ${newVal ? 'Enabled' : 'Disabled'} ✓`);
    } else if (channel === 'slack') {
      setSlackEnabled(newVal);
      handleUpdateSetting('channels_slack', newVal ? 'true' : 'false', `${label} ${newVal ? 'Enabled' : 'Disabled'} ✓`);
    } else if (channel === 'telegram') {
      setTelegramEnabled(newVal);
      handleUpdateSetting('channels_telegram', newVal ? 'true' : 'false', `${label} ${newVal ? 'Enabled' : 'Disabled'} ✓`);
    } else if (channel === 'social') {
      setSocialEnabled(newVal);
      handleUpdateSetting('channels_social', newVal ? 'true' : 'false', `${label} ${newVal ? 'Enabled' : 'Disabled'} ✓`);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    const res = await addGlobalMemoryItemAction(newKey, newValue, newImportance, activeMemoryBank);
    if (res.success) {
      showToast(`Added memory to ${activeMemoryBank} Bank ✓`);
      setNewKey('');
      setNewValue('');
      const updatedMemories = await fetchMemoryItemsAction();
      setMemoryItems(updatedMemories);
    }
  };

  const handlePurgeBank = async (scope: string) => {
    if (confirm(`Are you sure you want to purge all memories in the ${scope} bank?`)) {
      const res = await purgeMemoryItemsAction(scope);
      if (res.success) {
        showToast(`${scope} bank purged successfully ✓`);
        const updatedMemories = await fetchMemoryItemsAction();
        setMemoryItems(updatedMemories);
      }
    }
  };

  const scrollToSection = (section: string, ref: React.RefObject<HTMLDivElement | null>) => {
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

      {/* Memory Banks Interactive Modal */}
      {showMemoryModal && (
        <div className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-background neo-border max-w-2xl w-full max-h-[85vh] flex flex-col neo-shadow-lg">
            {/* Modal Header */}
            <div className="p-4 border-b-4 border-primary bg-primary-container flex justify-between items-center">
              <h3 className="font-headline font-black uppercase text-lg text-primary flex items-center gap-2">
                <span className="material-symbols-outlined">database</span>
                Memory Inspector: {activeMemoryBank} Bank
              </h3>
              <button 
                onClick={() => setShowMemoryModal(false)}
                className="w-8 h-8 neo-border bg-background flex items-center justify-center hover:bg-secondary hover:text-on-error transition-colors"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar flex-1 space-y-6">
              {/* Form to insert new memory item */}
              <form onSubmit={handleAddMemory} className="neo-border bg-surface p-4 space-y-4">
                <h4 className="font-headline font-bold uppercase text-xs text-primary">Inject Custom Memory Entry</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Key / Domain</label>
                    <input 
                      type="text" 
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary"
                      placeholder="e.g. twitter_api_endpoint"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Importance</label>
                    <select
                      value={newImportance}
                      onChange={(e) => setNewImportance(e.target.value)}
                      className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-bold"
                    >
                      <option value="Low">Low Importance</option>
                      <option value="Medium">Medium Importance</option>
                      <option value="High">High Importance</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Value / Fact Content</label>
                  <textarea 
                    value={newValue}
                    onChange={(e) => setNewValue(e.target.value)}
                    className="w-full bg-background neo-border p-2 text-xs h-16 focus:outline-none focus:border-tertiary font-mono"
                    placeholder="e.g. Ensure all telemetry events include workspace correlation headers."
                    required
                  />
                </div>
                <div className="flex justify-end">
                  <button 
                    type="submit"
                    className="bg-primary text-on-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs hover:bg-tertiary hover:text-on-tertiary transition-colors"
                  >
                    Inject Memory
                  </button>
                </div>
              </form>

              {/* Memory list */}
              <div className="space-y-3">
                <h4 className="font-headline font-bold uppercase text-xs text-primary flex justify-between items-center">
                  <span>Learned Fact Contexts</span>
                  <button 
                    onClick={() => handlePurgeBank(activeMemoryBank)}
                    className="text-error hover:underline text-[10px] uppercase font-bold"
                  >
                    Purge All
                  </button>
                </h4>
                {memoryItems.filter(item => item.scope === activeMemoryBank).length === 0 ? (
                  <div className="p-8 text-center bg-surface-container neo-border text-on-surface-variant text-xs">
                    No memories persisted in the {activeMemoryBank} bank. Use the form above to inject a custom fact.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {memoryItems
                      .filter(item => item.scope === activeMemoryBank)
                      .map((item) => (
                        <div key={item.id} className="neo-border bg-surface p-3 text-xs relative">
                          <span className={`absolute top-2 right-2 text-[8px] font-bold uppercase px-1.5 py-0.5 border ${
                            item.importance === 'High' ? 'bg-secondary text-on-error border-secondary' : 'bg-surface-container text-on-surface-variant'
                          }`}>
                            {item.importance}
                          </span>
                          <span className="font-bold uppercase text-primary block truncate max-w-[80%]">{item.key}</span>
                          <p className="font-mono text-on-surface-variant mt-1.5 bg-background p-2 neo-border leading-relaxed break-words">{item.value}</p>
                          <span className="text-[9px] text-outline mt-2 block">Persisted at: {new Date(item.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t-4 border-primary bg-surface-container-high flex justify-end">
              <button 
                onClick={() => setShowMemoryModal(false)}
                className="bg-primary text-on-primary neo-border px-6 py-2 font-headline font-bold uppercase text-xs"
              >
                Close Inspector
              </button>
            </div>
          </div>
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
              { name: 'LLM Configuration', ref: llmRef },
              { name: 'Memory', ref: memoryRef },
              { name: 'Standards', ref: standardsRef },
              { name: 'Channels & Socials', ref: channelsRef },
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
                { id: 'guided', name: 'Guided', risk: 'Low', desc: 'System proposes actions, requires explicit user approval for every step.' },
                { id: 'supervisor', name: 'Supervisor', risk: 'Med', desc: 'System executes autonomously within bounded parameters. Escalates exceptions.' },
                { id: 'autonomous', name: 'Autonomous', risk: 'High', desc: 'System operates independently across most tasks. Requires minimal oversight.' },
                { id: 'fully_autonomous', name: 'Fully Autonomous', risk: 'Extreme', desc: 'Unbounded execution. Self-directed goal generation. Use with caution.', danger: true },
              ].map((mode) => (
                <div 
                  key={mode.id}
                  onClick={() => handleModeChange(mode.id)}
                  className={`border-4 border-primary p-6 flex flex-col gap-4 relative overflow-hidden group hover:neo-shadow-lg transition-all cursor-pointer ${
                    operatingMode === mode.id 
                      ? mode.danger ? 'bg-secondary text-on-error neo-shadow-lg translate-x-[-2px] translate-y-[-2px]' : 'bg-primary-container text-on-primary-container neo-shadow-lg translate-x-[-2px] translate-y-[-2px]'
                      : 'bg-surface'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <h3 className={`font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 ${operatingMode === mode.id && mode.danger ? 'text-on-error' : ''}`}>
                      {mode.name} {operatingMode === mode.id && <span className="material-symbols-outlined">check_circle</span>}
                    </h3>
                    <span className={`text-xs font-bold uppercase px-2 py-1 border-2 border-primary ${
                      mode.risk === 'Extreme' ? 'bg-secondary text-on-error' : 
                      mode.risk === 'High' ? 'bg-tertiary text-on-tertiary' : 
                      'bg-surface-container-high'
                    }`}>Risk: {mode.risk}</span>
                  </div>
                  <p className="font-body text-sm flex-1">{mode.desc}</p>
                  <div className="mt-4 flex items-center gap-2 font-bold text-sm uppercase">
                    <span className="material-symbols-outlined">{operatingMode === mode.id ? 'radio_button_checked' : 'radio_button_unchecked'}</span> 
                    {operatingMode === mode.id ? 'Active Default' : 'Select Mode'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Permissions Hierarchy */}
          <div ref={permissionsRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Permissions Hierarchy</h2>
              <p className="font-body text-on-surface-variant mt-2">Adjust clearance limits and agent boundaries.</p>
            </div>
            
            <div className="flex flex-col neo-border bg-surface-container-low">
              {[
                { id: 'observe', level: 1, name: 'Observe', desc: 'Read-only access to logs and state.' },
                { id: 'governed', level: 2, name: 'Governed', desc: 'Can trigger predefined workflows, require review for executions.' },
                { id: 'execute', level: 3, name: 'Execute', desc: 'Modify agent parameters, compile packages, direct execute.' },
                { id: 'root', level: 4, name: 'Root', desc: 'Unrestricted clearance. Destructive capability across hosts.', danger: true },
              ].map((p) => (
                <div key={p.id} className={`flex items-center p-4 border-b-4 border-primary ${
                  permissionBoundary === p.id 
                    ? p.danger ? 'bg-secondary text-on-error' : 'bg-primary-container text-on-primary-container'
                    : 'bg-surface'
                }`}>
                  <div className={`w-12 h-12 neo-border flex items-center justify-center mr-4 font-black ${p.danger ? 'bg-secondary text-on-error' : 'bg-surface-container'}`}>{p.level}</div>
                  <div className="flex-1">
                    <h4 className="font-bold uppercase flex items-center gap-1.5">
                      {p.name}
                      {permissionBoundary === p.id && <span className="material-symbols-outlined text-xs">verified</span>}
                    </h4>
                    <p className="text-sm font-body">{p.desc}</p>
                  </div>
                  <button 
                    onClick={async () => {
                      setPermissionBoundary(p.id);
                      await updateSettingAction('permission_boundary', p.id);
                      showToast(`Enforced ${p.name} security tier ✓`);
                    }}
                    className={`px-4 py-2 neo-border font-bold text-sm uppercase transition-colors ${
                      permissionBoundary === p.id 
                        ? 'bg-primary text-on-primary' 
                        : 'bg-background hover:bg-surface-container'
                    }`}
                  >
                    {permissionBoundary === p.id ? 'Active Boundary' : 'Enforce'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* LLM Configuration Panel */}
          <div ref={llmRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">LLM Configuration</h2>
              <p className="font-body text-on-surface-variant mt-2">Manage API keys, endpoints, and models for Supr and sub-agents on the fly.</p>
            </div>

            {/* 1. Global API Keys & Defaults */}
            <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-6 bg-primary text-on-primary text-[8px] font-black uppercase flex items-center justify-center rotate-45 translate-x-8 translate-y-3 pointer-events-none select-none tracking-widest shadow-sm">
                Global Keys
              </div>
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2 mb-2">
                <span className="material-symbols-outlined text-primary">key</span> Global Providers & Fallbacks
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">MiniMax M2.7 API Key</label>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      value={globalMinimaxKey}
                      onChange={(e) => setGlobalMinimaxKey(e.target.value)}
                      className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                      placeholder="sk-..."
                    />
                    <button 
                      onClick={() => handleUpdateSetting('global_minimax_key', globalMinimaxKey, 'Global MiniMax key saved ✓')}
                      className="bg-primary text-on-primary font-bold uppercase text-xs px-3 neo-border hover:bg-tertiary transition-colors"
                    >Save</button>
                  </div>
                  <span className="text-[9px] text-on-surface-variant block mt-1">Primary LLM if set. API: https://api.minimax.io/v1</span>
                </div>

                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">Gemini API Key</label>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      value={globalGeminiKey}
                      onChange={(e) => setGlobalGeminiKey(e.target.value)}
                      className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                      placeholder="AIzaSy..."
                    />
                    <button 
                      onClick={() => handleUpdateSetting('global_gemini_key', globalGeminiKey, 'Global Gemini key saved ✓')}
                      className="bg-primary text-on-primary font-bold uppercase text-xs px-3 neo-border hover:bg-tertiary transition-colors"
                    >Save</button>
                  </div>
                  <span className="text-[9px] text-on-surface-variant block mt-1">Secondary primary LLM. Used if MiniMax key is missing.</span>
                </div>
              </div>

              <div className="w-full h-0.5 bg-outline-variant my-2"></div>

              <h4 className="font-headline font-bold text-xs uppercase text-primary tracking-wide">Backup Provider Config (OpenAI-Compatible)</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Backup Name</label>
                  <input 
                    type="text" 
                    value={globalBackupName}
                    onChange={(e) => setGlobalBackupName(e.target.value)}
                    className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-bold"
                    placeholder="e.g. OpenAI, Groq, Together"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Backup Model Name</label>
                  <input 
                    type="text" 
                    value={globalBackupModel}
                    onChange={(e) => setGlobalBackupModel(e.target.value)}
                    className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-mono"
                    placeholder="gpt-4o-mini, llama-3.3-70b-versatile"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Backup API Base URL</label>
                  <input 
                    type="text" 
                    value={globalBackupUrl}
                    onChange={(e) => setGlobalBackupUrl(e.target.value)}
                    className="w-full bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-mono"
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold uppercase text-on-surface-variant mb-1">Backup API Key</label>
                  <div className="flex gap-2">
                    <input 
                      type="password" 
                      value={globalBackupKey}
                      onChange={(e) => setGlobalBackupKey(e.target.value)}
                      className="flex-1 bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-mono"
                      placeholder="sk-..."
                    />
                    <button 
                      onClick={async () => {
                        await Promise.all([
                          updateSettingAction('global_backup_name', globalBackupName),
                          updateSettingAction('global_backup_model', globalBackupModel),
                          updateSettingAction('global_backup_url', globalBackupUrl),
                          updateSettingAction('global_backup_key', globalBackupKey),
                        ]);
                        showToast('Backup LLM config saved ✓');
                      }}
                      className="bg-primary text-on-primary font-bold uppercase text-xs px-6 neo-border hover:bg-tertiary transition-colors"
                    >Save Backup Config</button>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. Custom Role Overrides */}
            <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-6">
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2">
                <span className="material-symbols-outlined text-primary">diversity_3</span> Agent Customization Override
              </h3>
              
              <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                By default, all agents inherit the global priority flow (MiniMax → Gemini → Backup). 
                Override specific agents below to run them on separate providers or custom models on the fly!
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* Supr Override */}
                <div className="neo-border bg-background p-4 flex flex-col gap-3 relative">
                  <div className="flex justify-between items-center border-b border-primary pb-2">
                    <span className="font-headline font-bold text-xs uppercase text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">psychology</span> Lead Orchestrator (Supr)
                    </span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-primary-container border border-primary">Active</span>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-on-surface-variant mb-1">Select Provider</label>
                    <select 
                      value={suprProvider} 
                      onChange={(e) => setSuprProvider(e.target.value)}
                      className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                    >
                      <option value="default">Default (Global Flow)</option>
                      <option value="gemini">Gemini</option>
                      <option value="minimax">MiniMax M2.7</option>
                      <option value="openai_compat">OpenAI-Compatible</option>
                    </select>
                  </div>
                  {suprProvider !== 'default' && (
                    <div className="space-y-2 animate-fadeIn text-[10px]">
                      <input 
                        type="password" 
                        value={suprKey}
                        onChange={(e) => setSuprKey(e.target.value)}
                        placeholder="Custom API Key (leave blank to inherit global)"
                        className="w-full bg-surface neo-border p-1 text-xs font-mono"
                      />
                      <input 
                        type="text" 
                        value={suprModel}
                        onChange={(e) => setSuprModel(e.target.value)}
                        placeholder="Custom Model Name Override"
                        className="w-full bg-surface neo-border p-1 text-xs"
                      />
                      {suprProvider === 'openai_compat' && (
                        <input 
                          type="text" 
                          value={suprUrl}
                          onChange={(e) => setSuprUrl(e.target.value)}
                          placeholder="Custom Endpoint URL Override"
                          className="w-full bg-surface neo-border p-1 text-xs font-mono"
                        />
                      )}
                    </div>
                  )}
                  <button 
                    onClick={async () => {
                      await Promise.all([
                        updateSettingAction('llm_provider_supr', suprProvider),
                        updateSettingAction('llm_key_supr', suprKey),
                        updateSettingAction('llm_model_supr', suprModel),
                        updateSettingAction('llm_url_supr', suprUrl),
                      ]);
                      showToast('Supr Orchestrator override saved ✓');
                    }}
                    className="mt-auto bg-primary text-on-primary font-bold uppercase text-[10px] py-1.5 neo-border hover:bg-tertiary"
                  >Apply Override</button>
                </div>

                {/* Coding Agent Override */}
                <div className="neo-border bg-background p-4 flex flex-col gap-3 relative">
                  <div className="flex justify-between items-center border-b border-primary pb-2">
                    <span className="font-headline font-bold text-xs uppercase text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">code</span> Coding Agent
                    </span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-primary-container border border-primary">Active</span>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-on-surface-variant mb-1">Select Provider</label>
                    <select 
                      value={codeProvider} 
                      onChange={(e) => setCodeProvider(e.target.value)}
                      className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                    >
                      <option value="default">Default (Global Flow)</option>
                      <option value="gemini">Gemini</option>
                      <option value="minimax">MiniMax M2.7</option>
                      <option value="openai_compat">OpenAI-Compatible</option>
                    </select>
                  </div>
                  {codeProvider !== 'default' && (
                    <div className="space-y-2 animate-fadeIn text-[10px]">
                      <input 
                        type="password" 
                        value={codeKey}
                        onChange={(e) => setCodeKey(e.target.value)}
                        placeholder="Custom API Key (leave blank to inherit global)"
                        className="w-full bg-surface neo-border p-1 text-xs font-mono"
                      />
                      <input 
                        type="text" 
                        value={codeModel}
                        onChange={(e) => setCodeModel(e.target.value)}
                        placeholder="Custom Model Name Override"
                        className="w-full bg-surface neo-border p-1 text-xs"
                      />
                      {codeProvider === 'openai_compat' && (
                        <input 
                          type="text" 
                          value={codeUrl}
                          onChange={(e) => setCodeUrl(e.target.value)}
                          placeholder="Custom Endpoint URL Override"
                          className="w-full bg-surface neo-border p-1 text-xs font-mono"
                        />
                      )}
                    </div>
                  )}
                  <button 
                    onClick={async () => {
                      await Promise.all([
                        updateSettingAction('llm_provider_code', codeProvider),
                        updateSettingAction('llm_key_code', codeKey),
                        updateSettingAction('llm_model_code', codeModel),
                        updateSettingAction('llm_url_code', codeUrl),
                      ]);
                      showToast('Coding Agent override saved ✓');
                    }}
                    className="mt-auto bg-primary text-on-primary font-bold uppercase text-[10px] py-1.5 neo-border hover:bg-tertiary"
                  >Apply Override</button>
                </div>

                {/* Research Agent Override */}
                <div className="neo-border bg-background p-4 flex flex-col gap-3 relative">
                  <div className="flex justify-between items-center border-b border-primary pb-2">
                    <span className="font-headline font-bold text-xs uppercase text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">travel_explore</span> Research Agent
                    </span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-primary-container border border-primary">Active</span>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-on-surface-variant mb-1">Select Provider</label>
                    <select 
                      value={researchProvider} 
                      onChange={(e) => setResearchProvider(e.target.value)}
                      className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                    >
                      <option value="default">Default (Global Flow)</option>
                      <option value="gemini">Gemini</option>
                      <option value="minimax">MiniMax M2.7</option>
                      <option value="openai_compat">OpenAI-Compatible</option>
                    </select>
                  </div>
                  {researchProvider !== 'default' && (
                    <div className="space-y-2 animate-fadeIn text-[10px]">
                      <input 
                        type="password" 
                        value={researchKey}
                        onChange={(e) => setResearchKey(e.target.value)}
                        placeholder="Custom API Key (leave blank to inherit global)"
                        className="w-full bg-surface neo-border p-1 text-xs font-mono"
                      />
                      <input 
                        type="text" 
                        value={researchModel}
                        onChange={(e) => setResearchModel(e.target.value)}
                        placeholder="Custom Model Name Override"
                        className="w-full bg-surface neo-border p-1 text-xs"
                      />
                      {researchProvider === 'openai_compat' && (
                        <input 
                          type="text" 
                          value={researchUrl}
                          onChange={(e) => setResearchUrl(e.target.value)}
                          placeholder="Custom Endpoint URL Override"
                          className="w-full bg-surface neo-border p-1 text-xs font-mono"
                        />
                      )}
                    </div>
                  )}
                  <button 
                    onClick={async () => {
                      await Promise.all([
                        updateSettingAction('llm_provider_research', researchProvider),
                        updateSettingAction('llm_key_research', researchKey),
                        updateSettingAction('llm_model_research', researchModel),
                        updateSettingAction('llm_url_research', researchUrl),
                      ]);
                      showToast('Research Agent override saved ✓');
                    }}
                    className="mt-auto bg-primary text-on-primary font-bold uppercase text-[10px] py-1.5 neo-border hover:bg-tertiary"
                  >Apply Override</button>
                </div>

                {/* Sub-agents Override */}
                <div className="neo-border bg-background p-4 flex flex-col gap-3 relative">
                  <div className="flex justify-between items-center border-b border-primary pb-2">
                    <span className="font-headline font-bold text-xs uppercase text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">group</span> Sub-Agents (General)
                    </span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-primary-container border border-primary">Active</span>
                  </div>
                  <div>
                    <label className="block text-[9px] font-bold uppercase text-on-surface-variant mb-1">Select Provider</label>
                    <select 
                      value={subProvider} 
                      onChange={(e) => setSubProvider(e.target.value)}
                      className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                    >
                      <option value="default">Default (Global Flow)</option>
                      <option value="gemini">Gemini</option>
                      <option value="minimax">MiniMax M2.7</option>
                      <option value="openai_compat">OpenAI-Compatible</option>
                    </select>
                  </div>
                  {subProvider !== 'default' && (
                    <div className="space-y-2 animate-fadeIn text-[10px]">
                      <input 
                        type="password" 
                        value={subKey}
                        onChange={(e) => setSubKey(e.target.value)}
                        placeholder="Custom API Key (leave blank to inherit global)"
                        className="w-full bg-surface neo-border p-1 text-xs font-mono"
                      />
                      <input 
                        type="text" 
                        value={subModel}
                        onChange={(e) => setSubModel(e.target.value)}
                        placeholder="Custom Model Name Override"
                        className="w-full bg-surface neo-border p-1 text-xs"
                      />
                      {subProvider === 'openai_compat' && (
                        <input 
                          type="text" 
                          value={subUrl}
                          onChange={(e) => setSubUrl(e.target.value)}
                          placeholder="Custom Endpoint URL Override"
                          className="w-full bg-surface neo-border p-1 text-xs font-mono"
                        />
                      )}
                    </div>
                  )}
                  <button 
                    onClick={async () => {
                      await Promise.all([
                        updateSettingAction('llm_provider_sub', subProvider),
                        updateSettingAction('llm_key_sub', subKey),
                        updateSettingAction('llm_model_sub', subModel),
                        updateSettingAction('llm_url_sub', subUrl),
                      ]);
                      showToast('Sub-agents override saved ✓');
                    }}
                    className="mt-auto bg-primary text-on-primary font-bold uppercase text-[10px] py-1.5 neo-border hover:bg-tertiary"
                  >Apply Override</button>
                </div>

              </div>
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
                { name: 'User', icon: 'person', type: 'Persistent', bg: 'bg-primary-container', border: 'border-l-secondary' },
                { name: 'Workspace', icon: 'folder_special', type: 'Persistent', bg: 'bg-tertiary-container', border: 'border-l-tertiary' },
                { name: 'Mission', icon: 'radar', type: 'Ephemeral', bg: 'bg-surface-variant', border: 'border-l-outline-variant', danger: true },
              ].map((m) => {
                const count = memoryItems.filter(item => item.scope === m.name).length;
                return (
                  <div key={m.name} className="neo-border bg-surface flex flex-col h-full relative group">
                    <div className={`p-4 border-b-4 border-primary flex justify-between items-center ${m.bg}`}>
                      <h3 className="font-headline font-bold uppercase text-lg flex items-center gap-2">
                        <span className="material-symbols-outlined">{m.icon}</span> {m.name} Bank
                      </h3>
                      <span className={`px-2 py-1 text-[10px] font-bold uppercase border-2 border-primary ${m.danger ? 'bg-error text-on-error' : 'bg-background'}`}>{m.type}</span>
                    </div>
                    <div className="p-4 flex-1 flex flex-col gap-3 font-body text-sm bg-background">
                      <p className="text-on-surface-variant text-xs uppercase font-bold tracking-wider mb-2">Stored Telemetry</p>
                      <div className={`p-3 border-l-4 ${m.border} bg-surface flex flex-col gap-1`}>
                         <span className="font-headline font-bold text-xs uppercase text-primary">Entries: {count}</span>
                         <span className="text-[10px] text-on-surface-variant">Contextual data managed by the {m.name} bank.</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 border-t-4 border-primary">
                      <button 
                        onClick={() => {
                          setActiveMemoryBank(m.name);
                          setShowMemoryModal(true);
                        }}
                        className="p-3 border-r-4 border-primary font-bold uppercase text-[10px] hover:bg-primary hover:text-on-primary transition-colors flex justify-center items-center gap-1"
                      >
                         <span className="material-symbols-outlined text-sm">visibility</span> View Items
                      </button>
                      <button 
                        onClick={() => handlePurgeBank(m.name)}
                        className="p-3 font-bold uppercase text-[10px] text-error hover:bg-error hover:text-on-error transition-colors flex justify-center items-center gap-1"
                      >
                         <span className="material-symbols-outlined text-sm">delete</span> Purge Cache
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Operational Standards */}
          <div ref={standardsRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Operational Standards</h2>
              <p className="font-body text-on-surface-variant mt-2">Fine-tune verification rules applied to all active deployments.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { id: 'cite_evidence', name: 'Evidence Required', desc: 'Agents must cite sources before execution.' },
                { id: 'pass_tests', name: 'Tests Must Pass', desc: 'Simulation must succeed prior to live deployment.' },
                { id: 'scope_approval', name: 'Scope Approval', desc: 'Require human sign-off if mission parameters shift.' },
              ].map((s) => (
                <label key={s.id} className="flex items-start gap-4 p-4 border-4 border-primary bg-surface cursor-pointer group hover:bg-surface-container transition-colors">
                  <input 
                    type="checkbox" 
                    defaultChecked 
                    onChange={(e) => {
                      handleUpdateSetting(`standard_${s.id}`, e.target.checked ? 'true' : 'false', `${s.name} rule updated ✓`);
                    }}
                    className="w-6 h-6 border-2 border-primary rounded-none text-primary focus:ring-primary focus:ring-offset-0 mt-1" 
                  />
                  <div>
                    <span className="block font-bold uppercase text-sm mb-1 group-hover:text-tertiary transition-colors">{s.name}</span>
                    <span className="block font-body text-xs text-on-surface-variant">{s.desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Channels & Socials Section */}
          <div ref={channelsRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Channels & Socials</h2>
              <p className="font-body text-on-surface-variant mt-2">Configure notification triggers, social hooks, and chat automation bots.</p>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {/* Telegram Channel Connector */}
              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
                <div className="flex justify-between items-center border-b-2 border-primary pb-3">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">telegram</span> Telegram Chatbot Connection
                  </h3>
                  <button 
                    onClick={() => handleToggleChannel('telegram', telegramEnabled, 'Telegram Channel')}
                    className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary transition-all ${
                      telegramEnabled ? 'bg-primary text-on-primary neo-shadow' : 'bg-surface-dim text-on-surface-variant'
                    }`}
                  >
                    {telegramEnabled ? 'Connected ✓' : 'Disconnected'}
                  </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className="block font-headline font-bold uppercase text-primary mb-2 text-xs">Bot Token</label>
                    <input 
                      type="password" 
                      value={telegramToken}
                      onChange={(e) => {
                        setTelegramToken(e.target.value);
                        handleUpdateSetting('telegram_token', e.target.value);
                      }}
                      className="w-full bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                      placeholder="e.g. 123456789:ABCdefGhIJK..."
                    />
                  </div>
                  <div>
                    <label className="block font-headline font-bold uppercase text-primary mb-2 text-xs">Chat ID / Group Channel</label>
                    <input 
                      type="text" 
                      value={telegramChatId}
                      onChange={(e) => {
                        setTelegramChatId(e.target.value);
                        handleUpdateSetting('telegram_chat_id', e.target.value);
                      }}
                      className="w-full bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                      placeholder="e.g. -100123456789"
                    />
                  </div>
                </div>

                <div className="flex justify-between items-center mt-4 flex-wrap gap-4">
                  <p className="font-body text-xs text-on-surface-variant max-w-md">Provides real-time project logs, approval gate alerts, and command logs straight to your private Telegram channel.</p>
                </div>
              </div>

              {/* Twitter/X Connector */}
              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
                <div className="flex justify-between items-center border-b-2 border-primary pb-3">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">share</span> Twitter / X Broadcast Connection
                  </h3>
                  <button 
                    onClick={() => handleToggleChannel('social', socialEnabled, 'X/Twitter Broadcast')}
                    className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary transition-all ${
                      socialEnabled ? 'bg-primary text-on-primary neo-shadow' : 'bg-surface-dim text-on-surface-variant'
                    }`}
                  >
                    {socialEnabled ? 'Connected ✓' : 'Disconnected'}
                  </button>
                </div>
                
                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-2 text-xs">Linked X Account Handle</label>
                  <input 
                    type="text" 
                    value={twitterHandle}
                    onChange={(e) => {
                      setTwitterHandle(e.target.value);
                      handleUpdateSetting('twitter_handle', e.target.value);
                    }}
                    className="w-full bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                    placeholder="@supr_orchestrator"
                  />
                </div>

                <div className="flex justify-between items-center flex-wrap gap-4 mt-2">
                  <p className="font-body text-xs text-on-surface-variant max-w-lg">Allows research and OSINT agents to draft or directly post scheduled social media announcements and trend analysis briefs.</p>
                </div>
              </div>

              {/* Email Broadcast Connector */}
              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
                <div className="flex justify-between items-center border-b-2 border-primary pb-3">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">mail</span> Email Alerts Hook
                  </h3>
                  <button 
                    onClick={() => handleToggleChannel('email', emailEnabled, 'Email Notifications')}
                    className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary transition-all ${
                      emailEnabled ? 'bg-primary text-on-primary neo-shadow' : 'bg-surface-dim text-on-surface-variant'
                    }`}
                  >
                    {emailEnabled ? 'Active ✓' : 'Inactive'}
                  </button>
                </div>
                <p className="font-body text-xs text-on-surface-variant">Sends automated daily executive brief summaries, critical diagnostic console alerts, and QA report handoffs directly to key stakeholders.</p>
              </div>

              {/* Slack Connector */}
              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
                <div className="flex justify-between items-center border-b-2 border-primary pb-3">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">chat_bubble</span> Slack Webhook hook
                  </h3>
                  <button 
                    onClick={() => handleToggleChannel('slack', slackEnabled, 'Slack webhook channel')}
                    className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary transition-all ${
                      slackEnabled ? 'bg-primary text-on-primary neo-shadow' : 'bg-surface-dim text-on-surface-variant'
                    }`}
                  >
                    {slackEnabled ? 'Active ✓' : 'Inactive'}
                  </button>
                </div>
                <p className="font-body text-xs text-on-surface-variant">Triggers notification pings to designated Slack channels when agent sandbox tasks fail or when manual overrides are intercepted.</p>
              </div>

            </div>
          </div>

        </section>
      </main>
    </div>
  );
}
