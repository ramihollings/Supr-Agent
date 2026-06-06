"use client";

import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { TopNav } from '@/components/TopNav';
import { useSettingsSnapshot } from '@/hooks/useSettingsSnapshot';
import { WorkspaceFilesPanel } from '@/components/WorkspaceFilesPanel';
import { CanvasEditorPanel } from '@/components/CanvasEditorPanel';
import { CanvasRunPanel } from '@/components/CanvasRunPanel';
import {
  fetchChatMessagesAction,
  updateChatMessageAction,
  deleteChatMessageAction,
  sendChatMessageAction,
  fetchWorkspaceFilesAction,
  readWorkspaceFileAction,
  writeWorkspaceFileAction,
  deleteWorkspaceFileAction,
  executeCodeAction,
  fetchSettingsAction,
  fetchLiveProviderModelsAction,
  updateSettingAction,
  fetchAgentStatuses,
  fetchMissionsAction,
  conciergePeekAction,
  conciergeInitiateAction,
  fetchConciergeCapabilitiesAction,
} from '@/app/actions';
import { detectHandshakeIntent, type InitiateMissionPlan } from '@/lib/concierge/handshake';
import { useRouter } from 'next/navigation';
import { PROVIDER_MODEL_OPTIONS, PROVIDER_OPTIONS, defaultModelForProvider } from '@/lib/providers/catalog';

interface ChatMessage {
  id: string;
  sender: 'user' | 'supr';
  content: string;
  file: {
    name: string;
    type: string;
    content: string;
  } | null;
  createdAt: string;
}

interface WorkspaceFile {
  filename: string;
  size: number;
  updatedAt: string;
  type: string;
}

interface AgentStatus {
  id: string;
  name: string;
  role: string;
  permissionTier: string;
  isPermanent: boolean;
  currentTask: string | null;
  currentProject: string | null;
  status: string;
}

export default function SuprChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  // Phase 1B: streaming model chunks accumulate here keyed by agent id,
  // rendered as a typewriter line above the final bubble.
  const [streamingByAgent, setStreamingByAgent] = useState<Record<string, string>>({});
  // Phase 1B: in-flight tool call strip cleared when matching tool_completed arrives.
  const [activeToolCalls, setActiveToolCalls] = useState<Array<{ agentId: string; toolName: string; args: unknown; startedAt: string }>>([]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');

  // Settings states (Toggles saved to Settings DB)
  const [activeModel, setActiveModel] = useState('gemini');
  const [activeModelName, setActiveModelName] = useState(defaultModelForProvider('gemini'));
  const [liveProviderModels, setLiveProviderModels] = useState<Record<string, { label: string; value: string }[]>>({});
  const [autonomyMode, setAutonomyMode] = useState('guided');
  const [sandboxAllowKeys, setSandboxAllowKeys] = useState(false);

  // Agent Statuses Roster
  const [agentStatuses, setAgentStatuses] = useState<AgentStatus[]>([]);

  // File Upload states
  const [selectedFile, setSelectedFile] = useState<{ name: string; type: string; content: string } | null>(null);
  const [uploadLoading, setUploadLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Right-Pane Workspace Canvas States
  const [canvasOpen, setCanvasOpen] = useState(true); // default open for 3-pane layout
  const [canvasTab, setCanvasTab] = useState<'preview' | 'run' | 'explorer'>('explorer');
  const [canvasFile, setCanvasFile] = useState<{ filename: string; content: string } | null>(null);

  // Workspace files explorer list
  const [wsFiles, setWsFiles] = useState<WorkspaceFile[]>([]);
  const [runLoading, setRunLoading] = useState(false);
  const [runOutput, setRunOutput] = useState<{ success: boolean; stdout?: string; stderr?: string; error?: string } | null>(null);

  // ---- Concierge Mode state -----------------------------------------
  // chatPhase tracks where the conversation is in the Concierge loop:
  //   'concierge'         -> default; user is discussing with Supr
  //   'awaiting_handshake'-> Supr has proposed a plan; user must approve
  //   'mission_live'     -> the Initiate_Mission tool has fired
  const [chatPhase, setChatPhase] = useState<'concierge' | 'awaiting_handshake' | 'mission_live'>('concierge');
  const [conciergeEnabled, setConciergeEnabled] = useState(true);
  const [pendingPlan, setPendingPlan] = useState<InitiateMissionPlan | null>(null);
  const [pendingPlanMessageId, setPendingPlanMessageId] = useState<string | null>(null);
  const [initiateBusy, setInitiateBusy] = useState(false);
  const [initiateError, setInitiateError] = useState<string | null>(null);
  const router = useRouter();
  // -------------------------------------------------------------------

  useEffect(() => {
    loadData();
    loadWorkspace();
    const wsInterval = setInterval(loadWorkspace, 10000);
    const agentInterval = setInterval(loadAgents, 5000);
    return () => {
      clearInterval(wsInterval);
      clearInterval(agentInterval);
    };
  }, []);

  // Concierge: load capability flags once on mount so the header
  // and confirmation card can render the right chrome.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const caps = await fetchConciergeCapabilitiesAction();
        if (!cancelled) setConciergeEnabled(!!caps?.conciergeMode);
      } catch {
        // Default to true if the server is unreachable.
        if (!cancelled) setConciergeEnabled(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Phase 1B: while the chat is orchestrating, subscribe to the
  // mission-scoped SSE stream and consume the new session event kind.
  // Model chunks become a typewriter; tool_called/tool_completed become
  // an activity strip so the user can see what sub-agents are doing.
  useEffect(() => {
    if (!chatLoading || typeof window === 'undefined') return;
    const url = new URL('/api/mission/stream', window.location.origin);
    const source = new EventSource(url.toString());
    const handleSession = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data);
        if (event.kind === 'model_chunk') {
          const agentId = String(event.data?.agentId || '');
          if (!agentId) return;
          const chunk = String(event.data?.chunk || '');
          setStreamingByAgent((prev) => ({ ...prev, [agentId]: (prev[agentId] || '') + chunk }));
        } else if (event.kind === 'tool_called') {
          setActiveToolCalls((prev) => [
            ...prev,
            {
              agentId: String(event.data?.agentId || ''),
              toolName: String(event.data?.toolName || ''),
              args: event.data?.args,
              startedAt: event.at || new Date().toISOString(),
            },
          ]);
        } else if (event.kind === 'tool_completed') {
          setActiveToolCalls((prev) => prev.slice(0, -1));
        } else if (event.kind === 'session_completed' || event.kind === 'session_failed') {
          setStreamingByAgent({});
        }
      } catch {
        // Ignore malformed session events; the SSE stream stays open.
      }
    };
    source.addEventListener('session', handleSession);
    return () => {
      source.removeEventListener('session', handleSession);
      source.close();
    };
  }, [chatLoading]);

  const settingsSnapshot = useSettingsSnapshot();

  useEffect(() => {
    if (!settingsSnapshot.loaded) return;
    // Shared snapshot is the source of truth for these four fields.
    setActiveModel(settingsSnapshot.activeModel);
    setActiveModelName(settingsSnapshot.activeModelName);
    setAutonomyMode(settingsSnapshot.autonomyMode);
    setSandboxAllowKeys(settingsSnapshot.sandboxAllowKeys);
    if (Object.keys(settingsSnapshot.liveProviderModels).length > 0) {
      setLiveProviderModels(settingsSnapshot.liveProviderModels);
    }
  }, [
    settingsSnapshot.loaded,
    settingsSnapshot.activeModel,
    settingsSnapshot.activeModelName,
    settingsSnapshot.autonomyMode,
    settingsSnapshot.sandboxAllowKeys,
    settingsSnapshot.liveProviderModels,
  ]);

  const loadData = async () => {
    const [msgs, settings, projectsList, filesList, statuses] = await Promise.all([
      fetchChatMessagesAction(),
      fetchSettingsAction(),
      fetchMissionsAction(),
      fetchWorkspaceFilesAction(),
      fetchAgentStatuses()
    ]);

    setAgentStatuses(statuses);

    let processedMsgs = [...msgs];
    if (processedMsgs.length <= 1) {
      const activeProjCount = projectsList.filter(p => p.status === 'Active').length;
      const fileCount = filesList.length;

      const welcomeText = `Hello Manager! I am Supr, your central coordinator. 
I have initialized our secure session. 

**Current System Telemetry:**
*   **Active Projects:** ${activeProjCount} project(s) currently under management.
*   **Sandbox Workspace:** ${fileCount} file(s) available in local Docker sandbox.
*   **Auth Clearance:** ${settings.permission_boundary || 'governed'} tier enabled.
*   **LLM Provider Priority:** ${settings.llm_provider_supr || 'Gemini'} active.

How can I assist you today? You can query data, ask me to draft/run code files in our isolated sandbox, or dispatch agent actions directly.`;

      if (processedMsgs.length === 0) {
        processedMsgs = [{
          id: 'init-msg',
          sender: 'supr',
          content: welcomeText,
          file: null,
          createdAt: new Date().toISOString()
        }];
      } else {
        processedMsgs[0] = {
          ...processedMsgs[0],
          content: welcomeText
        };
      }
    }
    setMessages(processedMsgs);
  };

  const loadWorkspace = async () => {
    const files = await fetchWorkspaceFilesAction();
    setWsFiles(files);
  };

  const loadAgents = async () => {
    const statuses = await fetchAgentStatuses();
    setAgentStatuses(statuses);
  };

  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadLoading(true);
    const reader = new FileReader();

    const isText = file.type.startsWith('text/') ||
      file.name.endsWith('.js') ||
      file.name.endsWith('.ts') ||
      file.name.endsWith('.py') ||
      file.name.endsWith('.json') ||
      file.name.endsWith('.csv') ||
      file.name.endsWith('.md');

    reader.onload = () => {
      setSelectedFile({
        name: file.name,
        type: file.type || 'application/octet-stream',
        content: reader.result as string
      });
      setUploadLoading(false);
    };

    if (isText) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() && !selectedFile) return;

    setChatLoading(true);
    const textToSend = inputText;
    const fileToSend = selectedFile || undefined;

    setInputText('');
    setSelectedFile(null);

    const intent = conciergeEnabled ? detectHandshakeIntent(textToSend) : { kind: 'none' as const };

    setMessages(prev => [
      ...prev,
      {
        id: `temp-${Date.now()}`,
        sender: 'user',
        content: textToSend,
        file: fileToSend || null,
        createdAt: new Date().toISOString()
      }
    ]);

    const res = await sendChatMessageAction(textToSend, fileToSend);
    if (res.success) {
      await loadData();
      await loadWorkspace();

      // Concierge Handshake: if the user just said "go" and the
      // most recent Supr reply contains a ```plan``` JSON fence,
      // extract the plan, validate it, and stage the confirmation
      // card. The user still has to click "Approve & start mission"
      // -- the only thing the chat auto-spawns is the card.
      if (conciergeEnabled && intent.kind === 'go') {
        try {
          const latest = await fetchChatMessagesAction();
          for (let i = latest.length - 1; i >= 0; i--) {
            const m = latest[i];
            if (m.sender !== 'supr') continue;
            const plan = extractPlanFromMessage(m.content || '');
            if (plan) {
              setPendingPlan(plan);
              setPendingPlanMessageId(m.id);
              setChatPhase('awaiting_handshake');
              break;
            }
          }
          if (!pendingPlan) {
            // No plan in the most recent Supr message; nudge the user.
            alert('Supr has not yet proposed a plan in ```plan``` JSON form. Ask Supr to "propose a plan" first, then approve.');
          }
        } catch (err) {
          console.error('Concierge plan extraction failed:', err);
        }
      } else if (conciergeEnabled && intent.kind === 'reject') {
        // User changed their mind: drop any pending plan.
        setPendingPlan(null);
        setPendingPlanMessageId(null);
        setChatPhase('concierge');
      }
    } else {
      alert(`Chat execution failed: ${res.error}`);
    }
    setChatLoading(false);
  };

  const handleStartEditMessage = (message: ChatMessage) => {
    setEditingMessageId(message.id);
    setEditingMessageText(message.content);
  };

  const handleSaveMessageEdit = async () => {
    if (!editingMessageId || !editingMessageText.trim()) return;
    const res = await updateChatMessageAction(editingMessageId, editingMessageText.trim());
    if (res.success) {
      setEditingMessageId(null);
      setEditingMessageText('');
      await loadData();
    } else {
      alert(`Message update failed: ${res.error}`);
    }
  };

  const handleDeleteMessage = async (messageId: string) => {
    if (!confirm('Delete this message from Supr Chat history?')) return;
    const res = await deleteChatMessageAction(messageId);
    if (res.success) {
      if (editingMessageId === messageId) {
        setEditingMessageId(null);
        setEditingMessageText('');
      }
      await loadData();
    } else {
      alert(`Message delete failed: ${res.error}`);
    }
  };

  // ---- Concierge plan extraction & approval ----------------------
  // Supr wraps a proposed plan in a ```plan``` JSON fence. We
  // scan the most recent Supr message for the fence, parse the
  // JSON, validate it, and stage it as pendingPlan. Anything that
  // doesn't validate is left alone -- the user can keep iterating
  // with Supr until a valid plan is emitted.
  const PLAN_FENCE = /```plan\s*\n([\s\S]*?)```/m;
  function extractPlanFromMessage(content: string): InitiateMissionPlan | null {
    if (!content) return null;
    const match = PLAN_FENCE.exec(content);
    if (!match) return null;
    try {
      const parsed = JSON.parse(match[1].trim());
      // Re-validate against the canonical schema.
      const { InitiateMissionPlanSchema } = require('@/lib/concierge/handshake');
      const result = InitiateMissionPlanSchema.safeParse(parsed);
      if (result.success) return result.data as InitiateMissionPlan;
      return null;
    } catch {
      return null;
    }
  }

  const handleApprovePlan = async () => {
    if (!pendingPlan || initiateBusy) return;
    setInitiateBusy(true);
    setInitiateError(null);
    try {
      const res = await conciergeInitiateAction({
        plan: pendingPlan,
        approvedBy: 'manager@local',
        source: 'supr-chat',
      });
      if (res.ok && res.missionId) {
        setChatPhase('mission_live');
        setPendingPlan(null);
        setPendingPlanMessageId(null);
        // Move the user to the Live Work Graph so they can watch
        // the mission execute.
        router.push(`/?id=${res.missionId}`);
      } else {
        setInitiateError(res.error || 'Concierge initiate failed.');
      }
    } catch (err: any) {
      setInitiateError(err?.message || String(err));
    } finally {
      setInitiateBusy(false);
    }
  };

  const handleRejectPlan = () => {
    setPendingPlan(null);
    setPendingPlanMessageId(null);
    setChatPhase('concierge');
    setInitiateError(null);
  };
  // ----------------------------------------------------------------

  const handleToggleSandboxKeys = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setSandboxAllowKeys(checked);
    await updateSettingAction('sandbox_allow_api_keys', checked ? 'true' : 'false');
  };

  const handleApplyChatSettings = async () => {
    await Promise.all([
      updateSettingAction('llm_provider_supr', activeModel),
      updateSettingAction('llm_model_supr', activeModelName),
      updateSettingAction('operating_mode', autonomyMode),
    ]);
    alert("Controls applied successfully.");
  };

  const modelOptionsForProvider = (provider: string) => {
    const live = liveProviderModels[provider] || [];
    const builtIn = PROVIDER_MODEL_OPTIONS[provider] || [];
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
    if (result.success && result.models.length > 0) {
      setLiveProviderModels((prev) => ({ ...prev, [provider]: result.models }));
    }
  };

  const handleProviderChange = (provider: string) => {
    setActiveModel(provider);
    const defaultModel = defaultModelForProvider(provider);
    setActiveModelName(defaultModel);
    void refreshLiveProviderModels(provider);
  };

  // Open Canvas File
  const handleOpenFile = async (filename: string) => {
    const content = await readWorkspaceFileAction(filename);
    setCanvasFile({ filename, content });
    setCanvasTab('preview');
    setCanvasOpen(true);
    setRunOutput(null);
  };

  // Save Canvas File
  const handleSaveFile = async () => {
    if (!canvasFile) return;
    const res = await writeWorkspaceFileAction(canvasFile.filename, canvasFile.content);
    if (res.success) {
      alert(`Saved ${canvasFile.filename} successfully!`);
      loadWorkspace();
    }
  };

  // Run Canvas File
  const handleRunFile = async () => {
    if (!canvasFile) return;
    setRunLoading(true);
    setRunOutput(null);
    setCanvasTab('run');

    const res = await executeCodeAction(canvasFile.filename, canvasFile.filename.endsWith('.py') ? 'python' : 'javascript');
    setRunOutput(res);
    setRunLoading(false);
  };

  // Delete File
  const handleDeleteFile = async (filename: string) => {
    if (confirm(`Are you sure you want to delete ${filename}?`)) {
      const res = await deleteWorkspaceFileAction(filename);
      if (res.success) {
        loadWorkspace();
        if (canvasFile?.filename === filename) {
          setCanvasFile(null);
        }
      }
    }
  };

  // Create new workspace file
  const handleCreateNewFile = async () => {
    const filename = prompt("Enter file name (e.g. script.py, data.json):");
    if (!filename) return;
    const res = await writeWorkspaceFileAction(filename, `# New Supr Sandbox Document\n`);
    if (res.success) {
      loadWorkspace();
      handleOpenFile(filename);
    }
  };

  // Separate structured telemetry blocks from regular chat text
  const parseMessageContent = (content: string) => {
    const telemetryRegex = /```telemetry\n([\s\S]*?)```\n*/g;
    const match = telemetryRegex.exec(content);

    if (match) {
      const logs = match[1].trim();
      const text = content.replace(telemetryRegex, '').trim();
      return { logs, text };
    }
    return { logs: null, text: content };
  };

  return (
    <div className="flex-1 md:ml-64 flex min-h-screen bg-surface-container relative overflow-hidden">

      {/* Pane 1: Left Settings and Squad Pane */}
      <aside className="w-[280px] border-r-4 border-primary bg-background shrink-0 flex flex-col h-screen overflow-y-auto custom-scrollbar z-10 p-5 space-y-6">
        <div>
          <h3 className="font-headline font-black uppercase text-xs text-primary border-b-2 border-primary pb-1.5 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">settings</span>
            Chat Controls
          </h3>
          <div className="space-y-4 text-xs">
            <div>
              <label className="block text-[9px] font-black uppercase text-on-surface-variant mb-1">Model Provider</label>
              <select
                value={activeModel}
                onChange={(e) => handleProviderChange(e.target.value)}
                className="w-full bg-surface neo-border p-1.5 font-bold focus:outline-none"
              >
                {PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider.value} value={provider.value}>{provider.label}</option>
                ))}
              </select>
            </div>

            {activeModel !== 'default' && (
              <div>
                <label className="block text-[9px] font-black uppercase text-on-surface-variant mb-1">Model</label>
                <input
                  type="text"
                  value={activeModelName}
                  onChange={(e) => setActiveModelName(e.target.value)}
                  list={modelOptionsForProvider(activeModel).length ? 'chat-model-options' : undefined}
                  className="w-full bg-surface neo-border p-1.5 font-bold focus:outline-none"
                  placeholder={activeModel === 'openai_compat' ? 'Custom model name' : 'Select or enter model'}
                />
                {modelOptionsForProvider(activeModel).length ? (
                  <datalist id="chat-model-options">
                    {modelOptionsForProvider(activeModel).map((model) => (
                      <option key={model.value} value={model.value}>{model.label}</option>
                    ))}
                  </datalist>
                ) : null}
              </div>
            )}

            <div>
              <label className="block text-[9px] font-black uppercase text-on-surface-variant mb-1">Autonomy Clearance</label>
              <select
                value={autonomyMode}
                onChange={(e) => setAutonomyMode(e.target.value)}
                className="w-full bg-surface neo-border p-1.5 font-bold focus:outline-none"
              >
                <option value="guided">Guided (Confirm Steps)</option>
                <option value="supervisor">Supervisor (Managed)</option>
                <option value="autonomous">Full Autonomy</option>
              </select>
            </div>

            {/* Sandbox keys allow toggle */}
            <div className="pt-2 border-t border-primary/20 flex items-center gap-2">
              <input
                type="checkbox"
                id="sandbox_allow_keys"
                checked={sandboxAllowKeys}
                onChange={handleToggleSandboxKeys}
                className="w-4 h-4 accent-primary cursor-pointer border-2 border-primary"
              />
              <label htmlFor="sandbox_allow_keys" className="font-bold text-[10px] uppercase text-primary cursor-pointer select-none">
                Allow API keys in Sandbox
              </label>
            </div>

            <button
              onClick={handleApplyChatSettings}
              className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border hover:bg-tertiary transition-colors shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0px_0px_rgba(0,0,0,1)]"
            >
              Apply Controls
            </button>
          </div>
        </div>

        <div>
          <h3 className="font-headline font-black uppercase text-xs text-primary border-b-2 border-primary pb-1.5 mb-3 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">groups</span>
            Agent Squad
          </h3>
          <div className="space-y-2 text-xs">
            {agentStatuses.map((agent) => (
              <div key={agent.id} className="p-2 border-2 border-primary bg-surface flex flex-col gap-1 text-on-surface">
                <div className="flex justify-between items-center">
                  <span className="font-bold uppercase text-[10px]">{agent.name}</span>
                  <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase neo-border ${agent.status === 'Working' ? 'bg-secondary text-on-secondary animate-pulse' : 'bg-surface-variant text-on-surface-variant'
                    }`}>
                    {agent.status}
                  </span>
                </div>
                <div className="flex justify-between text-[9px] text-on-surface-variant font-mono">
                  <span>Role: {agent.role}</span>
                  <span className="font-bold text-primary">{agent.permissionTier}</span>
                </div>
                {agent.currentProject && (
                  <div className="text-[8px] text-secondary font-bold truncate mt-0.5 uppercase border-t border-dashed border-primary/20 pt-1">
                    Project: {agent.currentProject}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Pane 2: Center Chat Feed Pane */}
      <div className="flex-1 flex flex-col h-screen min-w-0 bg-surface-container relative">
        <header className="flex-none h-16 border-b-4 border-primary bg-background flex justify-between items-center px-4 lg:px-6 relative z-30">
          <div className="flex items-center space-x-4">
            <span className="material-symbols-outlined text-primary text-2xl">chat</span>
            <h2 className="font-headline font-bold text-lg md:text-xl uppercase tracking-tight">Supr-Chat</h2>
            {conciergeEnabled && (
              <span className={`px-2 py-0.5 font-headline font-black uppercase text-[9px] border-2 border-primary ${chatPhase === 'awaiting_handshake'
                ? 'bg-secondary text-on-secondary animate-pulse'
                : chatPhase === 'mission_live'
                  ? 'bg-tertiary text-on-tertiary'
                  : 'bg-primary text-on-primary'
                }`} title="Concierge Mode: Supr will not start a mission until you approve a plan in chat.">
                {chatPhase === 'awaiting_handshake'
                  ? 'Awaiting Handshake'
                  : chatPhase === 'mission_live'
                    ? 'Mission Live'
                    : 'Concierge'}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            {/* Toggle Canvas Button */}
            <button
              onClick={() => setCanvasOpen(!canvasOpen)}
              className={`p-2 border-2 border-primary flex items-center justify-center hover:bg-surface-container ${canvasOpen ? 'bg-primary text-on-primary' : 'bg-background'
                }`}
              title="Toggle Workspace Canvas"
            >
              <span className="material-symbols-outlined text-sm">side_navigation</span>
            </button>
          </div>
        </header>

        {/* Chat Feed */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6 space-y-6">
          {messages.map((msg) => {
            const { logs, text } = parseMessageContent(msg.content);
            const isUser = msg.sender === 'user';

            return (
              <div key={msg.id} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-4xl ${isUser ? 'ml-auto' : 'mr-auto'} w-full`}>

                {/* 1. File Attachment Rendering */}
                {msg.file && (
                  <div className={`mb-2 p-3 neo-border bg-background max-w-sm flex items-center gap-3 shadow-[2px_2px_0px_0px_var(--color-primary)]`}>
                    <span className="material-symbols-outlined text-secondary text-2xl">
                      {msg.file.type.startsWith('image/') ? 'image' : 'description'}
                    </span>
                    <div className="overflow-hidden">
                      <p className="font-bold text-xs uppercase truncate">{msg.file.name}</p>
                      <p className="text-[9px] text-on-surface-variant truncate">{msg.file.type}</p>
                    </div>
                  </div>
                )}

                {/* 2. Simulation / Telemetry Log Console (Inside the bubble flow) */}
                {logs && (
                  <div className="w-full max-w-lg mb-3 neo-border bg-black text-green-400 font-mono text-[10px] leading-relaxed p-4 shadow-[3px_3px_0px_0px_var(--color-primary)]">
                    <div className="flex items-center gap-2 mb-2 border-b border-green-955 pb-1.5 text-green-500 font-bold uppercase text-[9px]">
                      <span className="material-symbols-outlined animate-spin text-[12px]">sync</span>
                      Task Telemetry Logs (Docker Sandbox)
                    </div>
                    <pre className="whitespace-pre-wrap">{logs}</pre>
                  </div>
                )}

                {/* 3. Text Message Bubble */}
                <div className={`p-4 neo-border font-body text-sm leading-relaxed max-w-2xl group ${isUser
                  ? 'bg-primary text-on-primary shadow-[4px_4px_0px_0px_rgba(0,0,0,0.15)]'
                  : 'bg-background text-on-background shadow-[4px_4px_0px_0px_var(--color-primary)]'
                  }`}>
                  <div className="flex items-center justify-end gap-1 mb-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleStartEditMessage(msg)}
                      className={`border px-2 py-0.5 font-headline font-bold uppercase text-[8px] ${isUser ? 'border-on-primary text-on-primary hover:bg-on-primary hover:text-primary' : 'border-primary text-primary hover:bg-primary hover:text-on-primary'
                        }`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteMessage(msg.id)}
                      className={`border px-2 py-0.5 font-headline font-bold uppercase text-[8px] ${isUser ? 'border-on-primary text-on-primary hover:bg-on-primary hover:text-primary' : 'border-error text-error hover:bg-error hover:text-on-error'
                        }`}
                    >
                      Delete
                    </button>
                  </div>

                  {/* Handle inline generated images */}
                  {msg.file?.type.startsWith('image/') && msg.file.content ? (
                    <div className="mb-3 neo-border bg-surface overflow-hidden max-w-md">
                      <Image
                        src={msg.file.content.startsWith('data:') ? msg.file.content : `data:image/png;base64,${msg.file.content}`}
                        alt="Supr generated illustration"
                        width={800}
                        height={600}
                        unoptimized
                        className="w-full object-contain max-h-[300px] h-auto"
                      />
                    </div>
                  ) : null}

                  {editingMessageId === msg.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editingMessageText}
                        onChange={(event) => setEditingMessageText(event.target.value)}
                        className="w-full min-h-[120px] bg-surface text-on-surface border-2 border-primary p-3 font-mono text-xs focus:outline-none focus:border-tertiary resize-vertical"
                        spellCheck={false}
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMessageId(null);
                            setEditingMessageText('');
                          }}
                          className="border border-primary px-3 py-1 font-headline font-bold uppercase text-[9px] hover:bg-surface-container text-primary"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleSaveMessageEdit}
                          className="border border-primary bg-primary text-on-primary px-3 py-1 font-headline font-bold uppercase text-[9px] hover:bg-tertiary hover:text-on-tertiary"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="whitespace-pre-wrap">{text}</div>
                  )}
                </div>

                <span className="text-[8px] text-on-surface-variant font-mono mt-1 px-1">
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            );
          })}

          {/* Concierge Handshake Confirmation Card
              Rendered ONLY when a plan is staged. The Approve button
              is the ONLY path that invokes the Initiate_Mission tool. */}
          {pendingPlan && (
            <div className="max-w-3xl mx-auto p-5 neo-border bg-background shadow-[6px_6px_0px_0px_rgba(26,26,26,1)] border-l-8 border-l-secondary">
              <div className="flex items-center gap-2 mb-3 border-b-2 border-primary pb-2">
                <span className="material-symbols-outlined text-secondary text-xl">handshake</span>
                <h3 className="font-headline font-black uppercase text-sm text-primary">Concierge Handshake</h3>
                <span className="ml-auto px-2 py-0.5 bg-secondary text-on-secondary font-headline font-black uppercase text-[9px] animate-pulse">
                  Awaiting Approval
                </span>
              </div>
              <p className="font-body text-xs text-on-surface-variant mb-3 leading-relaxed">
                Supr has proposed a plan. <strong>Review it carefully.</strong> Clicking <em>Approve & start mission</em> will create the mission in SQLite and wake up the Live Work Graph. Nothing runs until you approve.
              </p>
              <div className="bg-surface-container border-2 border-primary p-3 mb-3">
                <p className="font-headline font-black uppercase text-[10px] text-primary">Mission</p>
                <p className="font-body text-sm font-bold">{pendingPlan.name}</p>
                <p className="font-body text-[11px] text-on-surface-variant mt-1 leading-relaxed">{pendingPlan.objective}</p>
                <div className="mt-3">
                  <p className="font-headline font-black uppercase text-[10px] text-primary mb-1">
                    Phases ({pendingPlan.phases.length}) &middot; Tasks ({pendingPlan.phases.reduce((sum, p) => sum + p.tasks.length, 0)})
                  </p>
                  <ul className="space-y-1.5">
                    {pendingPlan.phases.map((phase, idx) => (
                      <li key={idx} className="border-l-4 border-tertiary pl-2 py-1 bg-background">
                        <p className="font-headline font-black uppercase text-[10px] text-primary">{phase.name}</p>
                        <ul className="mt-1 space-y-0.5">
                          {phase.tasks.map((task, tidx) => (
                            <li key={tidx} className="font-body text-[10px] text-on-surface-variant">
                              &middot; {task.title} <span className="text-on-surface-variant/60">({task.agentRole}, {task.riskLevel})</span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {initiateError && (
                <div className="mb-3 p-2 border-2 border-error bg-error/10 text-error font-body text-xs">
                  <strong>Initiate failed:</strong> {initiateError}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleApprovePlan}
                  disabled={initiateBusy}
                  className="flex-1 min-w-[180px] bg-primary text-on-primary font-headline font-black uppercase text-xs py-3 neo-border neo-shadow hover:bg-tertiary hover:text-on-tertiary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {initiateBusy ? (
                    <>
                      <span className="material-symbols-outlined animate-spin text-sm">sync</span>
                      Initiating Mission...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">rocket_launch</span>
                      Approve & Start Mission
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleRejectPlan}
                  disabled={initiateBusy}
                  className="bg-background border-2 border-primary text-primary font-headline font-bold uppercase text-xs py-3 px-4 neo-border hover:bg-surface-container disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              <p className="mt-3 font-mono text-[9px] text-on-surface-variant">
                Approved by: <strong>manager@local</strong> &middot; Source: <strong>supr-chat</strong> &middot; Plan ref: <code>{pendingPlanMessageId ?? 'pending'}</code>
              </p>
            </div>
          )}

          {chatLoading && (
            <div className="flex items-center gap-3 p-4 max-w-sm neo-border bg-background shadow-[4px_4px_0px_0px_var(--color-primary)]">
              <span className="material-symbols-outlined animate-spin text-primary">sync</span>
              <span className="font-headline font-bold text-xs uppercase text-primary">Supr is orchestrating...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Dock */}
        <div className="flex-none p-4 md:p-6 border-t-4 border-primary bg-background z-20">
          <form onSubmit={handleSend} className="max-w-4xl mx-auto flex flex-col gap-3">

            {/* Selected File Preview Box */}
            {selectedFile && (
              <div className="flex items-center justify-between p-2.5 neo-border bg-surface-container max-w-md text-xs">
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="material-symbols-outlined text-secondary">
                    {selectedFile.type.startsWith('image/') ? 'image' : 'description'}
                  </span>
                  <span className="font-bold truncate">{selectedFile.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedFile(null)}
                  className="text-error font-bold uppercase hover:underline text-[10px]"
                >
                  Remove
                </button>
              </div>
            )}

            <div className="flex gap-3">
              {/* Attachment Button */}
              <button
                type="button"
                onClick={handleFileUploadClick}
                disabled={uploadLoading}
                className="px-4 py-3 neo-border bg-background hover:bg-surface-container flex items-center justify-center transition-colors disabled:opacity-50"
              >
                <span className="material-symbols-outlined">attachment</span>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />

              {/* Message input */}
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask Supr to fetch data, generate image, draft mail, create sandbox code..."
                disabled={chatLoading}
                className="flex-1 bg-surface neo-border px-4 py-3 font-body text-sm focus:outline-none focus:border-tertiary disabled:opacity-50"
              />

              {/* Submit */}
              <button
                type="submit"
                disabled={chatLoading || (!inputText.trim() && !selectedFile)}
                className="px-6 py-3 bg-primary text-on-primary font-headline font-black uppercase text-sm neo-border neo-shadow hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1 transition-all disabled:opacity-50 disabled:pointer-events-none"
              >
                Send
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Pane 3: Right Sandbox Pane */}
      {canvasOpen && (
        <aside className="w-[450px] md:w-[480px] border-l-4 border-primary bg-background shrink-0 flex flex-col h-screen z-20 relative">
          {/* Tab Selector Headers */}
          <div className="flex-none flex border-b-4 border-primary bg-surface-variant">
            {[
              { id: 'explorer', label: 'Sandbox Files', icon: 'folder' },
              { id: 'preview', label: 'Editor Preview', icon: 'description' },
              { id: 'run', label: 'Terminal output', icon: 'terminal' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setCanvasTab(tab.id as any)}
                className={`flex-1 p-3 font-headline font-bold uppercase text-[10px] flex items-center justify-center gap-1.5 border-r-2 border-primary last:border-r-0 ${canvasTab === tab.id
                  ? 'bg-background text-primary border-b-4 border-b-transparent'
                  : 'bg-surface-variant hover:bg-surface-container text-on-surface-variant'
                  }`}
              >
                <span className="material-symbols-outlined text-xs">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {/* Drawer Body content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-5 bg-surface-container-low flex flex-col">

            {/* Workspace Files Explorer */}
            {canvasTab === 'explorer' && (
              <WorkspaceFilesPanel
                files={wsFiles}
                onCreateNewFile={handleCreateNewFile}
                onOpenFile={handleOpenFile}
                onDeleteFile={handleDeleteFile}
              />
            )}

            {/* Document / Code Editor Preview */}
            {canvasTab === 'preview' && (
              <CanvasEditorPanel
                file={canvasFile}
                onChangeContent={(next) =>
                  setCanvasFile((prev) => (prev ? { ...prev, content: next } : null))
                }
                onSave={handleSaveFile}
                onRun={handleRunFile}
              />
            )}

            {/* Shell Execution Output */}
            {canvasTab === 'run' && (
              <CanvasRunPanel loading={runLoading} output={runOutput} />
            )}
          </div>
        </aside>
      )}

    </div>
  );
}
