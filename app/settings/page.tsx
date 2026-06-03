"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect, useRef } from 'react';
import { notifySettingsChanged } from '@/hooks/useSettingsSnapshot';
import {
  fetchSettingsAction,
  updateSettingAction,
  fetchMemoryItemsAction,
  purgeMemoryItemsAction,
  addGlobalMemoryItemAction,
  updateMemoryReviewAction,
  fetchDesignProfilesAction,
  applyDesignProfileAction,
  fetchConnectorHealthAction,
  fetchLiveProviderModelsAction,
  testConnectorAction,
  probeDockerAvailabilityAction,
  exportOrganizationAction,
  importOrganizationAction,
  fetchMissionsAction,
  fetchAgentsState
} from '@/app/actions';
import { DEFAULT_BACKUP_MODEL, DEFAULT_MINIMAX_MODEL, PROVIDER_MODEL_OPTIONS, PROVIDER_OPTIONS, defaultModelForProvider } from '@/lib/providers/catalog';

interface MemoryItem {
  id: string;
  key: string;
  value: string;
  type: string;
  scope: string;
  importance: string;
  pinned: boolean;
  reason: string;
  reviewedAt?: string;
  stale: boolean;
  createdAt: string;
}

interface DesignProfile {
  id: string;
  name: string;
  file: string;
  theme: string;
  palette: string;
  mood: string;
  preview: string;
}

interface ConnectorHealth {
  id: string;
  name: string;
  configured: boolean;
  status: string;
  lastChecked: string;
}

const ALLOWED_THEMES = new Set([
  'neobrutalist',
  'openclaw',
  'hermes',
  'google-neural',
  'crt',
  'cyberpunk',
  'minimalist',
  'design-notion',
  'design-verge',
  'design-carbon',
]);

const ALLOWED_PALETTES = new Set([
  'classic',
  'cyberpunk-neon',
  'nordic-frost',
  'forest-moss',
  'vintage-orange',
  'matrix-digital',
  'sunset-glow',
  'ocean-breeze',
  'royal-velvet',
  'sakura-pastel',
  'minimal-monochrome',
  'desert-cactus',
  'corporate-tech',
  'toxic-spill',
  'warm-autumn',
  'design-notion',
  'design-verge',
]);

function sanitizeTheme(theme: string) {
  return ALLOWED_THEMES.has(theme) ? theme : 'neobrutalist';
}

function sanitizePalette(palette: string) {
  return ALLOWED_PALETTES.has(palette) ? palette : 'classic';
}

function builtInModelOptionsForProvider(provider: string) {
  return PROVIDER_MODEL_OPTIONS[provider] || [];
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('Operating Mode');
  const [operatingMode, setOperatingMode] = useState('Supervisor');
  const [permissionBoundary, setPermissionBoundary] = useState('governed');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [liveProviderModels, setLiveProviderModels] = useState<Record<string, { label: string; value: string }[]>>({});

  // Global LLM Keys States
  const [globalMinimaxKey, setGlobalMinimaxKey] = useState('');
  const [globalGeminiKey, setGlobalGeminiKey] = useState('');
  const [globalOpenaiKey, setGlobalOpenaiKey] = useState('');
  const [globalAnthropicKey, setGlobalAnthropicKey] = useState('');
  const [globalXaiKey, setGlobalXaiKey] = useState('');
  const [globalOpenrouterKey, setGlobalOpenrouterKey] = useState('');
  const [globalGroqKey, setGlobalGroqKey] = useState('');
  const [globalMistralKey, setGlobalMistralKey] = useState('');
  const [globalDeepseekKey, setGlobalDeepseekKey] = useState('');
  const [globalBackupKey, setGlobalBackupKey] = useState('');
  const [globalBackupUrl, setGlobalBackupUrl] = useState('');
  const [globalBackupModel, setGlobalBackupModel] = useState(DEFAULT_BACKUP_MODEL);
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
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [socialEnabled, setSocialEnabled] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [dockerLastProbe, setDockerLastProbe] = useState('');
  const [remoteExecutionEnabled, setRemoteExecutionEnabled] = useState(false);
  const [remoteExecutionHost, setRemoteExecutionHost] = useState('');

  const [telegramToken, setTelegramToken] = useState('718290382:AAFlk1829aB...');
  const [telegramChatId, setTelegramChatId] = useState('-100192830182');
  const [twitterHandle, setTwitterHandle] = useState('@supr_orchestrator');
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // Memory Banks States
  const [memoryItems, setMemoryItems] = useState<MemoryItem[]>([]);
  const [showMemoryModal, setShowMemoryModal] = useState(false);
  const [activeMemoryBank, setActiveMemoryBank] = useState<string>('User');
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newImportance, setNewImportance] = useState('Medium');
  const [memorySearch, setMemorySearch] = useState('');
  const [showPinnedOnly, setShowPinnedOnly] = useState(false);

  const modeRef = useRef<HTMLDivElement>(null);
  const permissionsRef = useRef<HTMLDivElement>(null);
  const llmRef = useRef<HTMLDivElement>(null);
  const appearanceRef = useRef<HTMLDivElement>(null);
  const integrationsRef = useRef<HTMLDivElement>(null);
  const memoryRef = useRef<HTMLDivElement>(null);
  const standardsRef = useRef<HTMLDivElement>(null);
  const channelsRef = useRef<HTMLDivElement>(null);
  const portabilityRef = useRef<HTMLDivElement>(null);

  // Portability States
  const [importBundle, setImportBundle] = useState<any>(null);
  const [importStatus, setImportStatus] = useState<'idle' | 'reading' | 'ready' | 'importing'>('idle');
  const [collisions, setCollisions] = useState<{ table: string; count: number; examples: string[] }[]>([]);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [importSummary, setImportSummary] = useState<any>(null);
  const [existingMissions, setExistingMissions] = useState<any[]>([]);
  const [existingAgents, setExistingAgents] = useState<any[]>([]);

  // Theme & Appearance States
  const [currentTheme, setCurrentTheme] = useState('neobrutalist');
  const [currentPalette, setCurrentPalette] = useState('classic');
  const [activeDesignProfile, setActiveDesignProfile] = useState('');
  const [designProfiles, setDesignProfiles] = useState<DesignProfile[]>([]);
  const [connectorHealth, setConnectorHealth] = useState<ConnectorHealth[]>([]);

  // Integration credentials
  const [integrationComposio, setIntegrationComposio] = useState('');
  const [integrationGithub, setIntegrationGithub] = useState('');
  const [integrationSlack, setIntegrationSlack] = useState('');
  const [integrationDiscord, setIntegrationDiscord] = useState('');
  const [integrationGmail, setIntegrationGmail] = useState('');

  // Load settings and memories from SQLite
  useEffect(() => {
    async function loadData() {
      const [settings, memories, missions, agents] = await Promise.all([
        fetchSettingsAction(),
        fetchMemoryItemsAction(),
        fetchMissionsAction(),
        fetchAgentsState()
      ]);
      const [profiles, health] = await Promise.all([
        fetchDesignProfilesAction(),
        fetchConnectorHealthAction(),
      ]);
      setDesignProfiles(profiles);
      setConnectorHealth(health);
      setExistingMissions(missions || []);
      setExistingAgents(agents || []);

      if (settings.appearance_theme) {
        const safeTheme = sanitizeTheme(settings.appearance_theme);
        setCurrentTheme(safeTheme);
        localStorage.setItem('supr_theme', safeTheme);
      }
      if (settings.appearance_palette) {
        const safePalette = sanitizePalette(settings.appearance_palette);
        setCurrentPalette(safePalette);
        localStorage.setItem('supr_palette', safePalette);
      }
      if (settings.active_design_profile) setActiveDesignProfile(settings.active_design_profile);

      if (settings.integrations_composio) setIntegrationComposio(settings.integrations_composio);
      if (settings.integrations_github) setIntegrationGithub(settings.integrations_github);
      if (settings.integrations_slack) setIntegrationSlack(settings.integrations_slack);
      if (settings.integrations_discord) setIntegrationDiscord(settings.integrations_discord);
      if (settings.integrations_gmail) setIntegrationGmail(settings.integrations_gmail);

      if (settings.operating_mode) setOperatingMode(settings.operating_mode);
      if (settings.permission_boundary) setPermissionBoundary(settings.permission_boundary);

      // Global Keys
      if (settings.global_minimax_key) setGlobalMinimaxKey(settings.global_minimax_key);
      if (settings.global_gemini_key) setGlobalGeminiKey(settings.global_gemini_key);
      if (settings.global_openai_key) setGlobalOpenaiKey(settings.global_openai_key);
      if (settings.global_anthropic_key) setGlobalAnthropicKey(settings.global_anthropic_key);
      if (settings.global_xai_key) setGlobalXaiKey(settings.global_xai_key);
      if (settings.global_openrouter_key) setGlobalOpenrouterKey(settings.global_openrouter_key);
      if (settings.global_groq_key) setGlobalGroqKey(settings.global_groq_key);
      if (settings.global_mistral_key) setGlobalMistralKey(settings.global_mistral_key);
      if (settings.global_deepseek_key) setGlobalDeepseekKey(settings.global_deepseek_key);
      if (settings.global_backup_key) setGlobalBackupKey(settings.global_backup_key);
      if (settings.global_backup_url) setGlobalBackupUrl(settings.global_backup_url);
      if (settings.global_backup_model) setGlobalBackupModel(settings.global_backup_model);
      if (settings.global_backup_name) setGlobalBackupName(settings.global_backup_name);

      // Supr Role Override
      const loadedSuprProvider = settings.llm_provider_supr || 'default';
      setSuprProvider(loadedSuprProvider);
      if (settings.llm_key_supr) setSuprKey(settings.llm_key_supr);
      setSuprModel(settings.llm_model_supr || defaultModelForProvider(loadedSuprProvider));
      if (settings.llm_url_supr) setSuprUrl(settings.llm_url_supr);

      // Code Role Override
      const loadedCodeProvider = settings.llm_provider_code || 'default';
      setCodeProvider(loadedCodeProvider);
      if (settings.llm_key_code) setCodeKey(settings.llm_key_code);
      setCodeModel(settings.llm_model_code || defaultModelForProvider(loadedCodeProvider));
      if (settings.llm_url_code) setCodeUrl(settings.llm_url_code);

      // Research Role Override
      const loadedResearchProvider = settings.llm_provider_research || 'default';
      setResearchProvider(loadedResearchProvider);
      if (settings.llm_key_research) setResearchKey(settings.llm_key_research);
      setResearchModel(settings.llm_model_research || defaultModelForProvider(loadedResearchProvider));
      if (settings.llm_url_research) setResearchUrl(settings.llm_url_research);

      // Sub-agents Override
      const loadedSubProvider = settings.llm_provider_sub || 'default';
      setSubProvider(loadedSubProvider);
      if (settings.llm_key_sub) setSubKey(settings.llm_key_sub);
      setSubModel(settings.llm_model_sub || defaultModelForProvider(loadedSubProvider));
      if (settings.llm_url_sub) setSubUrl(settings.llm_url_sub);

      setEmailEnabled(settings.channels_email === 'true');
      setSlackEnabled(settings.channels_slack === 'true');
      setDiscordEnabled(settings.channels_discord === 'true');
      setTelegramEnabled(settings.channels_telegram === 'true');
      setSocialEnabled(settings.channels_social === 'true');
      setDockerAvailable(settings.docker_available === 'true');
      if (settings.docker_last_probe) setDockerLastProbe(settings.docker_last_probe);
      setRemoteExecutionEnabled(settings.remote_execution_enabled === 'true');
      if (settings.remote_execution_host) setRemoteExecutionHost(settings.remote_execution_host);

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
    if (res.success) {
      // Broadcast to other tabs (and the in-tab chat) so they
      // re-fetch the snapshot. This is the sentinel that
      // useSettingsSnapshot listens for via the 'storage' event.
      notifySettingsChanged();
      if (toastMsg) showToast(toastMsg);
    }
  };

  const modelOptionsForProvider = (provider: string) => {
    const live = liveProviderModels[provider] || [];
    const builtIn = builtInModelOptionsForProvider(provider);
    const seen = new Set<string>();
    return [...live, ...builtIn].filter((model) => {
      if (seen.has(model.value)) return false;
      seen.add(model.value);
      return true;
    });
  };

  const refreshLiveProviderModels = async (provider: string) => {
    if (provider === 'default' || provider === 'openai_compat') return;
    const result = await fetchLiveProviderModelsAction(provider);
    if (!result.success) {
      showToast(result.error || `Could not refresh ${provider} models`);
      return;
    }
    if (result.models.length > 0) {
      setLiveProviderModels((prev) => ({ ...prev, [provider]: result.models }));
      showToast(`Loaded ${result.models.length} live ${provider} models`);
    }
  };

  const selectRoleProvider = (provider: string, setProvider: (value: string) => void, setModel: (value: string) => void) => {
    setProvider(provider);
    const defaultModel = defaultModelForProvider(provider);
    setModel(defaultModel);
    void refreshLiveProviderModels(provider);
  };

  const handleModeChange = (mode: string) => {
    setOperatingMode(mode);
    handleUpdateSetting('operating_mode', mode, `Operating mode set to ${mode} ✓`);
  };

  const handleThemeChange = (theme: string) => {
    const safeTheme = sanitizeTheme(theme);
    theme = safeTheme;
    setCurrentTheme(safeTheme);
    localStorage.setItem('supr_theme', safeTheme);
    const htmlClasses = document.documentElement.className.split(' ');
    const cleanedClasses = htmlClasses.filter(c => !c.startsWith('theme-'));
    document.documentElement.className = `theme-${safeTheme} ` + cleanedClasses.join(' ');
    handleUpdateSetting('appearance_theme', theme, `Theme set to ${theme.toUpperCase()} ✓`);
  };

  const handlePaletteChange = (palette: string) => {
    const safePalette = sanitizePalette(palette);
    palette = safePalette;
    setCurrentPalette(safePalette);
    localStorage.setItem('supr_palette', safePalette);
    const htmlClasses = document.documentElement.className.split(' ');
    const cleanedClasses = htmlClasses.filter(c => !c.startsWith('palette-'));
    document.documentElement.className = `palette-${safePalette} ` + cleanedClasses.join(' ');
    handleUpdateSetting('appearance_palette', palette, `Color Palette set to ${palette.toUpperCase()} ✓`);
  };

  const handleDesignProfileApply = async (profileId: string) => {
    const res = await applyDesignProfileAction(profileId);
    if (res.success && res.profile) {
      const safeTheme = sanitizeTheme(res.profile.theme);
      const safePalette = sanitizePalette(res.profile.palette);
      setActiveDesignProfile(res.profile.id);
      setCurrentTheme(safeTheme);
      setCurrentPalette(safePalette);
      localStorage.setItem('supr_theme', safeTheme);
      localStorage.setItem('supr_palette', safePalette);
      const htmlClasses = document.documentElement.className.split(' ');
      const cleanedClasses = htmlClasses.filter(c => !c.startsWith('theme-') && !c.startsWith('palette-'));
      document.documentElement.className = `theme-${safeTheme} palette-${safePalette} ` + cleanedClasses.join(' ');
      showToast(`Applied ${res.profile.name} design profile`);
    } else {
      showToast(res.error || 'Design profile could not be applied');
    }
  };

  const handleToggleChannel = (channel: string, current: boolean, label: string) => {
    const newVal = !current;
    if (channel === 'email') {
      setEmailEnabled(newVal);
      handleUpdateSetting('channels_email', newVal ? 'true' : 'false', `${label} ${newVal ? 'Enabled' : 'Disabled'} ✓`);
    } else if (channel === 'slack') {
      setSlackEnabled(newVal);
      handleUpdateSetting('channels_slack', newVal ? 'true' : 'false', `${label} ${newVal ? 'Enabled' : 'Disabled'} ✓`);
    } else if (channel === 'discord') {
      setDiscordEnabled(newVal);
      handleUpdateSetting('channels_discord', newVal ? 'true' : 'false', `${label} ${newVal ? 'Enabled' : 'Disabled'} âœ“`);
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

  const refreshMemories = async () => {
    const updatedMemories = await fetchMemoryItemsAction();
    setMemoryItems(updatedMemories);
  };

  const handleMemoryReview = async (id: string, updates: { pinned?: boolean; reviewed?: boolean }) => {
    const res = await updateMemoryReviewAction(id, updates);
    if (res.success) {
      showToast(updates.reviewed ? 'Memory marked reviewed' : 'Memory pin updated');
      await refreshMemories();
    } else {
      showToast('Memory update failed');
    }
  };

  const handleConnectorTest = async (connectorId: string, name: string) => {
    const res = await testConnectorAction(connectorId);
    showToast(`${name}: ${res.status}`);
    setConnectorHealth(await fetchConnectorHealthAction());
  };

  const handleDockerProbe = async () => {
    showToast('Checking Docker availability...');
    const res = await probeDockerAvailabilityAction();
    setDockerAvailable(!!res.available);
    setDockerLastProbe(new Date().toISOString());
    showToast(res.available ? 'Docker sandbox is available' : `Docker unavailable: ${res.detail || 'probe failed'}`);
  };

  const handleExportDatabase = async () => {
    setIsBackingUp(true);
    showToast("Generating backup\u2026");
    try {
      const res = await exportOrganizationAction();
      if (res.success && res.data) {
        const blob = new Blob([res.data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `supr_scrubbed_backup_${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        setLastBackupAt(new Date().toISOString());
        showToast("Scrubbed organization backup downloaded successfully \u2713");
      } else {
        showToast(res.error || "Failed to export organization backup.");
      }
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('reading');
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const bundle = JSON.parse(text);

        if (!bundle || bundle.version !== '1.0.0' || !bundle.data) {
          showToast("Unsupported backup format. Version must be 1.0.0.");
          setImportStatus('idle');
          return;
        }

        const foundCollisions: typeof collisions = [];

        // 1. Check settings collisions
        if (Array.isArray(bundle.data.settings)) {
          const matchingSettings = bundle.data.settings.filter((s: any) => s.value !== '[SCRUBBED]');
          if (matchingSettings.length > 0) {
            foundCollisions.push({
              table: 'Settings',
              count: matchingSettings.length,
              examples: matchingSettings.slice(0, 3).map((s: any) => s.key),
            });
          }
        }

        // 2. Check missions collisions
        if (Array.isArray(bundle.data.missions)) {
          const existingIds = new Set(existingMissions.map((m: any) => m.id));
          const matchingMissions = bundle.data.missions.filter((m: any) => existingIds.has(m.id));
          if (matchingMissions.length > 0) {
            foundCollisions.push({
              table: 'Missions',
              count: matchingMissions.length,
              examples: matchingMissions.slice(0, 3).map((m: any) => m.title),
            });
          }
        }

        // 3. Check agents collisions
        if (Array.isArray(bundle.data.agents)) {
          const existingIds = new Set(existingAgents.map((a: any) => a.id));
          const matchingAgents = bundle.data.agents.filter((a: any) => existingIds.has(a.id));
          if (matchingAgents.length > 0) {
            foundCollisions.push({
              table: 'Agents',
              count: matchingAgents.length,
              examples: matchingAgents.slice(0, 3).map((a: any) => a.name),
            });
          }
        }

        setCollisions(foundCollisions);
        setImportBundle(bundle);
        setImportStatus('ready');
      } catch (err) {
        showToast("Invalid JSON file uploaded.");
        setImportStatus('idle');
      }
    };
    reader.readAsText(file);
  };

  const handleExecuteImport = async () => {
    if (!importBundle) return;
    setImportStatus('importing');
    try {
      const res = await importOrganizationAction(JSON.stringify(importBundle), { allowOverwrite: confirmOverwrite });
      if (res.success && res.imported) {
        setImportSummary(res.imported);
        showToast("Database backup successfully restored ✓");
        setImportStatus('idle');
        setImportBundle(null);
        setCollisions([]);
        setConfirmOverwrite(false);
        // Reload settings, memories, missions, and agents
        const [settings, memories, missions, agents] = await Promise.all([
          fetchSettingsAction(),
          fetchMemoryItemsAction(),
          fetchMissionsAction(),
          fetchAgentsState()
        ]);
        setMemoryItems(memories);
        setExistingMissions(missions || []);
        setExistingAgents(agents || []);
      } else {
        if (res.collisions) setCollisions(res.collisions);
        showToast(res.error || "Restoration failed.");
        setImportStatus('ready');
      }
    } catch (err: any) {
      showToast(err.message || "Restoration failed.");
      setImportStatus('ready');
    }
  };

  const visibleMemoryItems = memoryItems
    .filter(item => item.scope === activeMemoryBank)
    .filter(item => !showPinnedOnly || item.pinned)
    .filter(item => {
      const q = memorySearch.trim().toLowerCase();
      return !q || `${item.key} ${item.value} ${item.reason}`.toLowerCase().includes(q);
    });

  const scrollToSection = (section: string, ref: React.RefObject<HTMLDivElement | null>) => {
    setActiveSection(section);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const providerKeyControls = [
    { label: 'OpenAI API Key', key: 'global_openai_key', value: globalOpenaiKey, setter: setGlobalOpenaiKey, placeholder: 'sk-...' },
    { label: 'Anthropic API Key', key: 'global_anthropic_key', value: globalAnthropicKey, setter: setGlobalAnthropicKey, placeholder: 'sk-ant-...' },
    { label: 'xAI API Key', key: 'global_xai_key', value: globalXaiKey, setter: setGlobalXaiKey, placeholder: 'xai-...' },
    { label: 'OpenRouter API Key', key: 'global_openrouter_key', value: globalOpenrouterKey, setter: setGlobalOpenrouterKey, placeholder: 'sk-or-...' },
    { label: 'Groq API Key', key: 'global_groq_key', value: globalGroqKey, setter: setGlobalGroqKey, placeholder: 'gsk_...' },
    { label: 'Mistral API Key', key: 'global_mistral_key', value: globalMistralKey, setter: setGlobalMistralKey, placeholder: '...' },
    { label: 'DeepSeek API Key', key: 'global_deepseek_key', value: globalDeepseekKey, setter: setGlobalDeepseekKey, placeholder: 'sk-...' },
  ];

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
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
                  <input
                    value={memorySearch}
                    onChange={(e) => setMemorySearch(e.target.value)}
                    className="bg-background neo-border p-2 text-xs focus:outline-none focus:border-tertiary font-mono"
                    placeholder="Search memory, reason, or value"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPinnedOnly(prev => !prev)}
                    className={`neo-border px-3 py-2 font-headline font-bold uppercase text-[10px] ${showPinnedOnly ? 'bg-tertiary text-on-tertiary' : 'bg-background'}`}
                  >
                    Pinned
                  </button>
                </div>
                {visibleMemoryItems.length === 0 ? (
                  <div className="p-8 text-center bg-surface-container neo-border text-on-surface-variant text-xs">
                    No memories persisted in the {activeMemoryBank} bank. Use the form above to inject a custom fact.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {visibleMemoryItems
                      .map((item) => (
                        <div key={item.id} className="neo-border bg-surface p-3 text-xs relative">
                          <span className={`absolute top-2 right-2 text-[8px] font-bold uppercase px-1.5 py-0.5 border ${
                            item.importance === 'High' ? 'bg-secondary text-on-error border-secondary' : 'bg-surface-container text-on-surface-variant'
                          }`}>
                            {item.pinned ? 'Pinned' : item.importance}
                          </span>
                          <span className="font-bold uppercase text-primary block truncate max-w-[80%]">{item.key}</span>
                          <p className="font-mono text-on-surface-variant mt-1.5 bg-background p-2 neo-border leading-relaxed break-words">{item.value}</p>
                          <p className="font-body text-[10px] text-on-surface-variant mt-2">{item.reason}</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => handleMemoryReview(item.id, { pinned: !item.pinned })}
                              className="border border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
                            >
                              {item.pinned ? 'Unpin' : 'Pin'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMemoryReview(item.id, { reviewed: true })}
                              className="border border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
                            >
                              Review
                            </button>
                            {item.stale && <span className="border border-secondary px-2 py-1 font-mono text-[9px] uppercase text-secondary">Stale</span>}
                          </div>
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
              { name: 'Theme & Appearance', ref: appearanceRef },
              { name: 'Integrations', ref: integrationsRef },
              { name: 'Memory', ref: memoryRef },
              { name: 'Standards', ref: standardsRef },
              { name: 'Channels & Socials', ref: channelsRef },
              { name: 'Portability', ref: portabilityRef },
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

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4 border-b-2 border-primary pb-3">
                  <div>
                    <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">deployed_code</span> Docker Sandbox
                    </h3>
                    <p className="font-body text-xs text-on-surface-variant mt-1">Controls whether `execute_sandboxed_command` can run in a real Docker environment.</p>
                  </div>
                  <span className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary ${dockerAvailable ? 'bg-primary text-on-primary' : 'bg-surface-dim text-on-surface-variant'}`}>
                    {dockerAvailable ? 'Available' : 'Not Enabled'}
                  </span>
                </div>
                <div className="font-mono text-[10px] text-on-surface-variant">
                  Last probe: {dockerLastProbe ? new Date(dockerLastProbe).toLocaleString() : 'never'}
                </div>
                <button
                  onClick={handleDockerProbe}
                  className="bg-primary text-on-primary font-bold uppercase text-xs p-3 neo-border hover:bg-tertiary hover:text-on-tertiary transition-colors flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-sm">fact_check</span>
                  Probe Docker
                </button>
              </div>

              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4">
                <div className="flex items-start justify-between gap-4 border-b-2 border-primary pb-3">
                  <div>
                    <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary">dns</span> Remote Execution
                    </h3>
                    <p className="font-body text-xs text-on-surface-variant mt-1">Disabled by default. `execute_remote` remains blocked unless a host is configured and this switch is enabled.</p>
                  </div>
                  <button
                    onClick={async () => {
                      const next = !remoteExecutionEnabled;
                      setRemoteExecutionEnabled(next);
                      await handleUpdateSetting('remote_execution_enabled', next ? 'true' : 'false', `Remote execution ${next ? 'enabled' : 'disabled'}`);
                    }}
                    className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary transition-all ${remoteExecutionEnabled ? 'bg-secondary text-on-error neo-shadow' : 'bg-surface-dim text-on-surface-variant'}`}
                  >
                    {remoteExecutionEnabled ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-2 text-xs">Remote Host Reference</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={remoteExecutionHost}
                      onChange={(event) => setRemoteExecutionHost(event.target.value)}
                      className="flex-1 bg-background neo-border p-3 font-mono text-xs focus:outline-none focus:border-tertiary"
                      placeholder="ssh://host-alias or disabled"
                    />
                    <button
                      onClick={() => handleUpdateSetting('remote_execution_host', remoteExecutionHost, 'Remote host reference saved')}
                      className="bg-primary text-on-primary font-bold uppercase text-xs px-3 neo-border hover:bg-tertiary transition-colors"
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
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
                  <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">MiniMax API Key</label>
                  <div className="flex gap-2">
                    <input
                      type="password" aria-label="MiniMax API Key"
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
                  <span className="text-[9px] text-on-surface-variant block mt-1">Primary LLM if set. Default model: {DEFAULT_MINIMAX_MODEL}. API: https://api.minimax.io/v1</span>
                </div>

                <div>
                  <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">Gemini API Key</label>
                  <div className="flex gap-2">
                    <input
                      type="password" aria-label="Gemini API Key"
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
                {providerKeyControls.map((control) => (
                  <div key={control.key}>
                    <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">{control.label}</label>
                    <div className="flex gap-2">
                      <input
                        type="password" aria-label={control.label}
                        value={control.value}
                        onChange={(e) => control.setter(e.target.value)}
                        className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                        placeholder={control.placeholder}
                      />
                      <button
                        onClick={() => handleUpdateSetting(control.key, control.value, `${control.label} saved`)}
                        className="bg-primary text-on-primary font-bold uppercase text-xs px-3 neo-border hover:bg-tertiary transition-colors"
                      >Save</button>
                    </div>
                  </div>
                ))}
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
                      type="password" aria-label="Backup API Key"
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
                      onChange={(e) => selectRoleProvider(e.target.value, setSuprProvider, setSuprModel)}
                      className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                    >
                      {PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider.value} value={provider.value}>{provider.label}</option>
                      ))}
                    </select>
                  </div>
                  {suprProvider !== 'default' && (
                    <div className="space-y-2 animate-fadeIn text-[10px]">
                      <input
                        type="password" aria-label="Supr API key"
                        value={suprKey}
                        onChange={(e) => setSuprKey(e.target.value)}
                        placeholder="Custom API Key (leave blank to inherit global)"
                        className="w-full bg-surface neo-border p-1 text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={suprModel}
                        onChange={(e) => setSuprModel(e.target.value)}
                        list={modelOptionsForProvider(suprProvider).length ? 'supr-model-options' : undefined}
                        placeholder={suprProvider === 'openai_compat' ? 'Custom Model Name Override' : 'Select or enter model'}
                        className="w-full bg-surface neo-border p-1 text-xs"
                      />
                      {modelOptionsForProvider(suprProvider).length > 0 && (
                        <datalist id="supr-model-options">
                          {modelOptionsForProvider(suprProvider).map((model) => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                          ))}
                        </datalist>
                      )}
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
                      onChange={(e) => selectRoleProvider(e.target.value, setCodeProvider, setCodeModel)}
                      className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                    >
                      {PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider.value} value={provider.value}>{provider.label}</option>
                      ))}
                    </select>
                  </div>
                  {codeProvider !== 'default' && (
                    <div className="space-y-2 animate-fadeIn text-[10px]">
                      <input
                        type="password" aria-label="Code agent API key"
                        value={codeKey}
                        onChange={(e) => setCodeKey(e.target.value)}
                        placeholder="Custom API Key (leave blank to inherit global)"
                        className="w-full bg-surface neo-border p-1 text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={codeModel}
                        onChange={(e) => setCodeModel(e.target.value)}
                        list={modelOptionsForProvider(codeProvider).length ? 'code-model-options' : undefined}
                        placeholder={codeProvider === 'openai_compat' ? 'Custom Model Name Override' : 'Select or enter model'}
                        className="w-full bg-surface neo-border p-1 text-xs"
                      />
                      {modelOptionsForProvider(codeProvider).length > 0 && (
                        <datalist id="code-model-options">
                          {modelOptionsForProvider(codeProvider).map((model) => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                          ))}
                        </datalist>
                      )}
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
                      onChange={(e) => selectRoleProvider(e.target.value, setResearchProvider, setResearchModel)}
                      className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                    >
                      {PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider.value} value={provider.value}>{provider.label}</option>
                      ))}
                    </select>
                  </div>
                  {researchProvider !== 'default' && (
                    <div className="space-y-2 animate-fadeIn text-[10px]">
                      <input
                        type="password" aria-label="Research agent API key"
                        value={researchKey}
                        onChange={(e) => setResearchKey(e.target.value)}
                        placeholder="Custom API Key (leave blank to inherit global)"
                        className="w-full bg-surface neo-border p-1 text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={researchModel}
                        onChange={(e) => setResearchModel(e.target.value)}
                        list={modelOptionsForProvider(researchProvider).length ? 'research-model-options' : undefined}
                        placeholder={researchProvider === 'openai_compat' ? 'Custom Model Name Override' : 'Select or enter model'}
                        className="w-full bg-surface neo-border p-1 text-xs"
                      />
                      {modelOptionsForProvider(researchProvider).length > 0 && (
                        <datalist id="research-model-options">
                          {modelOptionsForProvider(researchProvider).map((model) => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                          ))}
                        </datalist>
                      )}
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
                      onChange={(e) => selectRoleProvider(e.target.value, setSubProvider, setSubModel)}
                      className="w-full bg-surface neo-border p-1.5 text-xs font-bold"
                    >
                      {PROVIDER_OPTIONS.map((provider) => (
                        <option key={provider.value} value={provider.value}>{provider.label}</option>
                      ))}
                    </select>
                  </div>
                  {subProvider !== 'default' && (
                    <div className="space-y-2 animate-fadeIn text-[10px]">
                      <input
                        type="password" aria-label="Sub-agent API key"
                        value={subKey}
                        onChange={(e) => setSubKey(e.target.value)}
                        placeholder="Custom API Key (leave blank to inherit global)"
                        className="w-full bg-surface neo-border p-1 text-xs font-mono"
                      />
                      <input
                        type="text"
                        value={subModel}
                        onChange={(e) => setSubModel(e.target.value)}
                        list={modelOptionsForProvider(subProvider).length ? 'sub-model-options' : undefined}
                        placeholder={subProvider === 'openai_compat' ? 'Custom Model Name Override' : 'Select or enter model'}
                        className="w-full bg-surface neo-border p-1 text-xs"
                      />
                      {modelOptionsForProvider(subProvider).length > 0 && (
                        <datalist id="sub-model-options">
                          {modelOptionsForProvider(subProvider).map((model) => (
                            <option key={model.value} value={model.value}>{model.label}</option>
                          ))}
                        </datalist>
                      )}
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

          {/* Theme & Appearance Section */}
          <div ref={appearanceRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Theme & Appearance</h2>
              <p className="font-body text-on-surface-variant mt-2">Morph the entire design system and layout structure with instant preview.</p>
            </div>

            <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4">
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2">
                <span className="material-symbols-outlined text-primary">design_services</span> Design.md Profiles
              </h3>
              <p className="font-body text-sm text-on-surface-variant">
                Apply a profile from <span className="font-mono">design/</span>. Profiles are mapped to safe Supr theme and palette tokens, so the interface changes live without rewriting React files.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {designProfiles.map(profile => (
                  <button
                    key={profile.id}
                    onClick={() => handleDesignProfileApply(profile.id)}
                    className={`neo-border bg-background p-4 text-left flex flex-col gap-3 hover:bg-surface-container transition-colors ${
                      activeDesignProfile === profile.id ? 'ring-2 ring-primary bg-primary-container text-on-primary-container' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className="font-headline font-black uppercase text-sm block">{profile.name}</span>
                        <span className="font-mono text-[10px] uppercase text-on-surface-variant">{profile.file}</span>
                      </div>
                      <span className="bg-surface-container-high border border-outline-variant px-2 py-1 font-headline font-bold uppercase text-[9px]">
                        {profile.mood}
                      </span>
                    </div>
                    <p className="text-xs text-on-surface-variant line-clamp-3">{profile.preview || 'Design profile ready.'}</p>
                    <div className="flex gap-2 text-[10px] font-mono uppercase">
                      <span>theme:{profile.theme}</span>
                      <span>palette:{profile.palette}</span>
                    </div>
                  </button>
                ))}
                {designProfiles.length === 0 && (
                  <div className="neo-border bg-background p-4 text-sm text-on-surface-variant">
                    No design profiles found in <span className="font-mono">design/</span>.
                  </div>
                )}
              </div>
            </div>

            {/* Layout Themes */}
            <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4">
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2">
                <span className="material-symbols-outlined text-primary">layers</span> Structural Layout Styles (7 Themes)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {[
                  { id: 'neobrutalist', name: 'Neo-Brutalist', desc: 'Thick black borders, solid fills, and offset drop shadows. (Default)', icon: 'grid_view' },
                  { id: 'openclaw', name: 'OpenClaw Terminal', desc: 'Retro developer monospace hacker layout with scanlines and green font glows.', icon: 'terminal' },
                  { id: 'hermes', name: 'Hermes Cybernetic', desc: 'Clean dark cyber dashboard with compact borders and subtle cyan tech halos.', icon: 'developer_board' },
                  { id: 'google-neural', name: 'Google Neural', desc: 'Pastel glassmorphic card layers, deep backdrop blurs, and soft radial color clouds.', icon: 'lens_blur' },
                  { id: 'crt', name: 'Phosphor CRT', desc: 'Monochrome glowing green grid layout with curved cathode screen flicker.', icon: 'monitor' },
                  { id: 'cyberpunk', name: 'Neon Cyberpunk', desc: 'Deep purple canvas with hot pink highlights and heavy glowing neon bevels.', icon: 'palette' },
                  { id: 'minimalist', name: 'Minimalist Clean', desc: 'Sleek professional white space design with extremely soft card borders.', icon: 'space_dashboard' },
                ].map(theme => (
                  <div
                    key={theme.id}
                    onClick={() => handleThemeChange(theme.id)}
                    className={`p-4 border-2 border-primary bg-background cursor-pointer hover:bg-surface-container transition-all flex flex-col justify-between min-h-[140px] shadow-[2px_2px_0px_0px_var(--color-primary)] ${
                      currentTheme === theme.id ? 'ring-2 ring-primary bg-primary-container text-on-primary-container' : ''
                    }`}
                  >
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <span className="font-headline font-bold text-xs uppercase flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">{theme.icon}</span> {theme.name}
                        </span>
                        {currentTheme === theme.id && <span className="material-symbols-outlined text-sm text-green-600">check_circle</span>}
                      </div>
                      <p className="text-[10px] leading-relaxed text-on-surface-variant">{theme.desc}</p>
                    </div>
                    <span className="text-[8px] font-bold uppercase tracking-wider mt-4">Select Style</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 3-Tone Color Palettes */}
            <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4">
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2">
                <span className="material-symbols-outlined text-primary">color_lens</span> Curated 3-Tone Palettes (15 Choices)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
                {[
                  { id: 'classic', name: 'Classic Supr', c1: '#ffcc00', c2: '#e63b2e', c3: '#0055ff' },
                  { id: 'cyberpunk-neon', name: 'Cyber Neon', c1: '#ff007f', c2: '#00ffff', c3: '#ffe600' },
                  { id: 'nordic-frost', name: 'Nordic Frost', c1: '#1f3a52', c2: '#3b7c80', c3: '#5f7d95' },
                  { id: 'forest-moss', name: 'Forest Moss', c1: '#2d4a22', c2: '#7c683c', c3: '#4a6670' },
                  { id: 'vintage-orange', name: 'Rust Vintage', c1: '#111111', c2: '#d35400', c3: '#2980b9' },
                  { id: 'matrix-digital', name: 'Digital Matrix', c1: '#00ff00', c2: '#008800', c3: '#32cd32' },
                  { id: 'sunset-glow', name: 'Sunset Glow', c1: '#ff4757', c2: '#6c5ce7', c3: '#10ac84' },
                  { id: 'ocean-breeze', name: 'Ocean Breeze', c1: '#0070f3', c2: '#00d2fc', c3: '#f39c12' },
                  { id: 'royal-velvet', name: 'Royal Velvet', c1: '#5f27cd', c2: '#f1c40f', c3: '#ff4757' },
                  { id: 'sakura-pastel', name: 'Sakura Pastel', c1: '#ff7b90', c2: '#a8dadc', c3: '#ffc6ff' },
                  { id: 'minimal-monochrome', name: 'Monochrome', c1: '#000000', c2: '#555555', c3: '#cccccc' },
                  { id: 'desert-cactus', name: 'Desert Cactus', c1: '#4a5c53', c2: '#e07a5f', c3: '#81b29a' },
                  { id: 'corporate-tech', name: 'Corporate Tech', c1: '#1e3a8a', c2: '#0f766e', c3: '#f59e0b' },
                  { id: 'toxic-spill', name: 'Toxic Spill', c1: '#39ff14', c2: '#ff007f', c3: '#ff5e00' },
                  { id: 'warm-autumn', name: 'Warm Autumn', c1: '#6e1a0b', c2: '#d97706', c3: '#92400e' },
                ].map(p => (
                  <button
                    key={p.id}
                    onClick={() => handlePaletteChange(p.id)}
                    className={`p-2.5 border-2 border-primary bg-background flex flex-col gap-2 hover:bg-surface-container transition-all text-left shadow-[2px_2px_0px_0px_var(--color-primary)] ${
                      currentPalette === p.id ? 'ring-2 ring-primary bg-primary-container text-on-primary-container' : ''
                    }`}
                  >
                    <span className="font-headline font-bold text-[9px] uppercase truncate block">{p.name}</span>
                    <div className="flex gap-1">
                      <span className="w-4 h-4 border border-primary block" style={{ backgroundColor: p.c1 }} title="Primary"></span>
                      <span className="w-4 h-4 border border-primary block" style={{ backgroundColor: p.c2 }} title="Secondary"></span>
                      <span className="w-4 h-4 border border-primary block" style={{ backgroundColor: p.c3 }} title="Tertiary"></span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Integrations Section */}
          <div ref={integrationsRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">API & Integrations Credentials</h2>
              <p className="font-body text-on-surface-variant mt-2">Provide keys to run real commands on GitHub, Slack, and Gmail. Optional channels can stay disconnected without blocking core MiniMax-backed agent work.</p>
            </div>

            <div className="border-4 border-primary p-6 bg-surface">
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2 mb-4">
                <span className="material-symbols-outlined text-primary">health_and_safety</span> Connector Health
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                {connectorHealth.map(connector => (
                  <div key={connector.id} className="neo-border bg-background p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-headline font-black uppercase text-xs">{connector.name}</span>
                      <span className={`w-2.5 h-2.5 border border-primary rounded-full ${connector.configured ? 'bg-tertiary' : 'bg-surface-variant'}`}></span>
                    </div>
                    <p className="font-mono text-[10px] uppercase text-on-surface-variant">{connector.status}</p>
                    <button
                      onClick={() => handleConnectorTest(connector.id, connector.name)}
                      className="mt-3 w-full border border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
                    >
                      Test
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-6">

              {/* Composio */}
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">Composio API Connection Key</label>
                <div className="flex gap-2">
                  <input
                    type="password" aria-label="Composio API Connection Key"
                    value={integrationComposio}
                    onChange={(e) => {
                      setIntegrationComposio(e.target.value);
                      handleUpdateSetting('integrations_composio', e.target.value);
                    }}
                    className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                    placeholder="••••••••••••••••••••"
                  />
                  <button
                    onClick={() => handleUpdateSetting('integrations_composio', integrationComposio, 'Composio key updated ✓')}
                    className="bg-primary text-on-primary font-bold uppercase text-xs px-4 neo-border hover:bg-tertiary transition-colors"
                  >Save</button>
                </div>
                <span className="text-[9px] text-on-surface-variant block mt-1">Connects dynamic workspaces, tool schemas, and agent executions via Composio.</span>
              </div>

              {/* GitHub */}
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">GitHub Personal Access Token (PAT)</label>
                <div className="flex gap-2">
                  <input
                    type="password" aria-label="GitHub Personal Access Token (PAT)"
                    value={integrationGithub}
                    onChange={(e) => {
                      setIntegrationGithub(e.target.value);
                      handleUpdateSetting('integrations_github', e.target.value);
                    }}
                    className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                    placeholder="ghp_••••••••••••••••••••"
                  />
                  <button
                    onClick={() => handleUpdateSetting('integrations_github', integrationGithub, 'GitHub token updated ✓')}
                    className="bg-primary text-on-primary font-bold uppercase text-xs px-4 neo-border hover:bg-tertiary transition-colors"
                  >Save</button>
                </div>
                <span className="text-[9px] text-on-surface-variant block mt-1">Clearance token enabling Supr to pull repos, create issues, and manage task branches.</span>
              </div>

              {/* Slack */}
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">Slack Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="password" aria-label="Slack Webhook URL"
                    value={integrationSlack}
                    onChange={(e) => {
                      setIntegrationSlack(e.target.value);
                      handleUpdateSetting('integrations_slack', e.target.value);
                    }}
                    className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                    placeholder="https://hooks.slack.com/services/••••••••"
                  />
                  <button
                    onClick={() => handleUpdateSetting('integrations_slack', integrationSlack, 'Slack webhook updated ✓')}
                    className="bg-primary text-on-primary font-bold uppercase text-xs px-4 neo-border hover:bg-tertiary transition-colors"
                  >Save</button>
                </div>
                <span className="text-[9px] text-on-surface-variant block mt-1">Webhooks enabling direct pings to your channels for approval alerts and deployment traces.</span>
              </div>

              {/* Discord */}
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">Discord Webhook URL</label>
                <div className="flex gap-2">
                  <input
                    type="password" aria-label="Discord Webhook URL"
                    value={integrationDiscord}
                    onChange={(e) => {
                      setIntegrationDiscord(e.target.value);
                      handleUpdateSetting('integrations_discord', e.target.value);
                    }}
                    className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                    placeholder="https://discord.com/api/webhooks/..."
                  />
                  <button
                    onClick={() => handleUpdateSetting('integrations_discord', integrationDiscord, 'Discord webhook updated')}
                    className="bg-primary text-on-primary font-bold uppercase text-xs px-4 neo-border hover:bg-tertiary transition-colors"
                  >Save</button>
                </div>
                <span className="text-[9px] text-on-surface-variant block mt-1">Webhook used by the Messaging Gateway for approval, failure, and mission completion notifications.</span>
              </div>

              {/* Gmail */}
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-1 text-xs">Gmail App Password / Access Code</label>
                <div className="flex gap-2">
                  <input
                    type="password" aria-label="Gmail App Password / Access Code"
                    value={integrationGmail}
                    onChange={(e) => {
                      setIntegrationGmail(e.target.value);
                      handleUpdateSetting('integrations_gmail', e.target.value);
                    }}
                    className="flex-1 bg-background neo-border p-2 font-mono text-xs focus:outline-none focus:border-tertiary"
                    placeholder="•••• •••• •••• ••••"
                  />
                  <button
                    onClick={() => handleUpdateSetting('integrations_gmail', integrationGmail, 'Gmail credential updated ✓')}
                    className="bg-primary text-on-primary font-bold uppercase text-xs px-4 neo-border hover:bg-tertiary transition-colors"
                  >Save</button>
                </div>
                <span className="text-[9px] text-on-surface-variant block mt-1">Required App Password enabling direct SMTP/IMAP scans for pulling messages and automated notifications.</span>
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
                { id: 'pass_tests', name: 'Tests Must Pass', desc: 'Validation must succeed before deployment.' },
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
                      type="password" aria-label="Bot Token"
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
                  <p className="font-body text-xs text-on-surface-variant max-w-lg">Allows research agents to draft or directly post scheduled social media announcements and trend analysis briefs.</p>
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

              {/* Discord Connector */}
              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
                <div className="flex justify-between items-center border-b-2 border-primary pb-3">
                  <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary">forum</span> Discord Webhook Hook
                  </h3>
                  <button
                    onClick={() => handleToggleChannel('discord', discordEnabled, 'Discord webhook channel')}
                    className={`text-xs font-bold uppercase px-3 py-1 border-2 border-primary transition-all ${
                      discordEnabled ? 'bg-primary text-on-primary neo-shadow' : 'bg-surface-dim text-on-surface-variant'
                    }`}
                  >
                    {discordEnabled ? 'Active âœ“' : 'Inactive'}
                  </button>
                </div>
                <p className="font-body text-xs text-on-surface-variant">Receives governed Discord webhook commands and sends approval/completion notifications through the Messaging Gateway.</p>
              </div>

            </div>
          </div>

          <div className="w-full h-4 bg-primary opacity-20" style={{ backgroundImage: "repeating-linear-gradient(45deg, transparent, transparent 10px, #1a1a1a 10px, #1a1a1a 20px)" }}></div>

          {/* Portability Section */}
          <div ref={portabilityRef} className="flex flex-col gap-6">
            <div className="border-b-4 border-primary pb-4 mb-4">
              <h2 className="font-headline text-3xl font-black uppercase tracking-tighter">Organization Portability</h2>
              <p className="font-body text-on-surface-variant mt-2">Export a scrubbed JSON bundle of your entire organization (projects, agents, memories) or restore database state from a backup.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Export Panel */}
              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
                <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2 mb-2">
                  <span className="material-symbols-outlined text-primary">download</span> Back up workspace
                </h3>
                <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                  Download a complete JSON snapshot of your workspace database. API keys, passwords, and tokens are scrubbed to <code className="font-mono text-[10px]">[SCRUBBED]</code> before the file is generated.
                </p>
                {lastBackupAt && (
                  <p className="font-mono text-[10px] text-on-surface-variant mt-2">
                    Last backup: {new Date(lastBackupAt).toLocaleString()}
                  </p>
                )}
                <button
                  onClick={handleExportDatabase}
                  disabled={isBackingUp}
                  aria-busy={isBackingUp}
                  className="mt-auto bg-primary text-on-primary font-bold uppercase text-xs p-4 neo-border hover:bg-tertiary hover:text-on-tertiary hover:neo-shadow transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="material-symbols-outlined text-sm" aria-hidden="true">
                    {isBackingUp ? "hourglass_top" : "download"}
                  </span>
                  {isBackingUp ? "Generating backup\u2026" : "Back up now"}
                </button>
              </div>

              {/* Import Panel */}
              <div className="border-4 border-primary p-6 bg-surface flex flex-col gap-4 relative overflow-hidden group">
                <h3 className="font-headline text-xl font-bold uppercase tracking-tight flex items-center gap-2 border-b-2 border-primary pb-2 mb-2">
                  <span className="material-symbols-outlined text-primary">upload</span> Import / Restore Backup
                </h3>
                <p className="font-body text-xs text-on-surface-variant leading-relaxed mb-2">
                  Restore organization state from a previously exported database JSON bundle. This will overlay imported records onto your existing SQLite database.
                </p>

                {importStatus === 'idle' && (
                  <div className="relative border-2 border-dashed border-primary bg-background p-4 flex flex-col items-center justify-center min-h-[100px] cursor-pointer hover:bg-surface-container transition-colors">
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImportFileSelect}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <span className="material-symbols-outlined text-3xl text-primary mb-2">cloud_upload</span>
                    <span className="font-headline font-bold text-xs uppercase text-primary">Choose JSON Backup File</span>
                  </div>
                )}

                {importStatus === 'reading' && (
                  <div className="border-2 border-primary bg-background p-4 flex items-center justify-center min-h-[100px] gap-2">
                    <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                    <span className="font-headline font-bold text-xs uppercase text-primary">Parsing file structure...</span>
                  </div>
                )}

                {importStatus === 'ready' && importBundle && (
                  <div className="space-y-4">
                    {/* Manifest Preview */}
                    <div className="bg-background border-2 border-primary p-3 space-y-2 text-xs">
                      <div className="flex justify-between items-center border-b border-primary/20 pb-1">
                        <span className="font-headline font-bold uppercase text-primary">Bundle Version</span>
                        <span className="font-mono">{importBundle.version}</span>
                      </div>
                      <div className="flex justify-between items-center border-b border-primary/20 pb-1">
                        <span className="font-headline font-bold uppercase text-primary">Timestamp</span>
                        <span className="font-mono text-[10px]">{new Date(importBundle.timestamp).toLocaleString()}</span>
                      </div>
                      <div className="pt-1">
                        <span className="font-headline font-bold uppercase text-xs text-primary block mb-1">Entity Breakdown</span>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
                          <div>Missions: {importBundle.data?.missions?.length || 0}</div>
                          <div>Glidepaths: {importBundle.data?.glidepaths?.length || 0}</div>
                          <div>Agents: {importBundle.data?.agents?.length || 0}</div>
                          <div>Tasks: {importBundle.data?.tasks?.length || 0}</div>
                          <div>Approvals: {importBundle.data?.approvals?.length || 0}</div>
                          <div>Memories: {importBundle.data?.memoryItems?.length || 0}</div>
                          <div>Settings: {importBundle.data?.settings?.length || 0}</div>
                        </div>
                      </div>
                    </div>

                    {/* Collision Alert Panel */}
                    {collisions.length > 0 && (
                      <div className="bg-secondary/15 border-4 border-secondary p-4 flex flex-col gap-2">
                        <h4 className="font-headline font-bold uppercase text-xs text-secondary flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">warning</span> Collision Overwrite Danger
                        </h4>
                        <p className="text-[10px] leading-relaxed text-on-surface-variant font-body">
                          This backup contains entities with IDs matching items in your current workspace. Proceeding will overwrite existing configurations:
                        </p>
                        <div className="space-y-1 font-mono text-[9px] text-on-surface-variant bg-background p-2 border border-secondary">
                          {collisions.map((c) => (
                            <div key={c.table}>
                              <strong>{c.table}:</strong> {c.count} match(es) (e.g. {c.examples.join(', ')})
                            </div>
                          ))}
                        </div>
                        <label className="flex items-center gap-2 mt-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={confirmOverwrite}
                            onChange={(e) => setConfirmOverwrite(e.target.checked)}
                            className="w-4 h-4 border-2 border-secondary rounded-none focus:ring-0 text-secondary"
                          />
                          <span className="font-headline font-bold uppercase text-[9px] text-secondary">
                            I authorize overwriting existing records
                          </span>
                        </label>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleExecuteImport}
                        disabled={collisions.length > 0 && !confirmOverwrite}
                        className={`flex-1 font-headline font-bold uppercase text-xs p-3 neo-border hover:neo-shadow transition-all flex items-center justify-center gap-2 ${
                          collisions.length > 0 && !confirmOverwrite
                            ? 'bg-surface-variant text-on-surface-variant opacity-50 cursor-not-allowed border-outline'
                            : 'bg-primary text-on-primary hover:bg-tertiary hover:text-on-tertiary'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">restore</span>
                        Execute Restore
                      </button>
                      <button
                        onClick={() => {
                          setImportStatus('idle');
                          setImportBundle(null);
                          setCollisions([]);
                          setConfirmOverwrite(false);
                        }}
                        className="bg-background text-primary font-headline font-bold uppercase text-xs p-3 neo-border hover:bg-surface-container transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {importStatus === 'importing' && (
                  <div className="border-2 border-primary bg-background p-4 flex flex-col items-center justify-center min-h-[100px] gap-2">
                    <span className="material-symbols-outlined animate-spin text-3xl text-primary mb-2">sync</span>
                    <span className="font-headline font-bold text-xs uppercase text-primary">Restoring database state...</span>
                  </div>
                )}

                {/* Summary Panel */}
                {importSummary && (
                  <div className="bg-primary/10 border-2 border-primary p-3 text-xs space-y-2">
                    <h4 className="font-headline font-bold uppercase text-primary flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">verified</span> Restore Completed
                    </h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px]">
                      <div>Missions: {importSummary.Missions || 0}</div>
                      <div>Glidepaths: {importSummary.Glidepaths || 0}</div>
                      <div>Agents: {importSummary.Agents || 0}</div>
                      <div>Tasks: {importSummary.Tasks || 0}</div>
                      <div>Approvals: {importSummary.Approvals || 0}</div>
                      <div>Memories: {importSummary.Memory_Items || 0}</div>
                      <div>Settings: {importSummary.Settings || 0}</div>
                    </div>
                    <button
                      onClick={() => setImportSummary(null)}
                      className="w-full mt-2 bg-background border border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
                    >
                      Clear Summary
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

        </section>
      </main>
    </div>
  );
}
