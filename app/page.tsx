"use client";

import { TopNav } from '@/components/TopNav';
import Link from 'next/link';
import { useState, useEffect, useRef, startTransition, Suspense } from 'react';
import { MissionWizard } from '@/components/MissionWizard';
import { InlineApproval } from '@/components/InlineApproval';
import { SteerableCanvas } from '@/components/SteerableCanvas';
import { AgentCard, AgentInfo } from '@/components/AgentCard';
import { AgentVisionLab } from '@/components/AgentVisionLab';
import { 
  fetchMissionsAction, 
  fetchAgentsState, 
  logActivityAction, 
  updateTaskStatusAction 
} from '@/app/actions';
import { Message, Mission } from '@/types';
import { useSearchParams, useRouter } from 'next/navigation';

function BlendedDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  // High-level dashboard states
  const [showWizard, setShowWizard] = useState(false);
  const [projects, setProjects] = useState<Mission[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  // Project-specific workspace states
  const projectId = searchParams.get('id');
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [mission, setMission] = useState<Mission | null>(null);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [readinessScore, setReadinessScore] = useState(72);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'glidepath' | 'browser'>('glidepath');
  const [mobilePanel, setMobilePanel] = useState<'chat' | 'work' | 'telemetry'>('work');

  // Telemetry Metrics
  const [tokenBurn, setTokenBurn] = useState(1.42);
  const [tokenCount, setTokenCount] = useState(24082);
  const [activeReasoning, setActiveReasoning] = useState(
    "Supr activated WebCrawler to gather competitor metrics. Redirecting to QA Validator to check code structure and run tests in the secure workspace."
  );

  // Live AG-UI Tool traces
  const [toolTraces, setToolTraces] = useState<string[]>([
    '[10:40:02] INITIALIZE - Secure workspace active.',
    '[10:40:15] toprank::seo_audit - Crawling target backlinks...',
    '[10:40:32] browser::web_scrape - Fetching public page data...',
    '[10:40:51] workspace::exec - Scanning workspace directory structure...'
  ]);

  // Terminal Simulator Logs
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '➜ /workspace/sandbox',
    'Initializing secure workspace...',
    'Mounting project volumes...',
    'Supr AI Manager standing by for instructions.',
    '[Agent: WebCrawler] Executing browser run --target="competitor_metrics"...',
    '[Sandbox Output] Fetching raw JSON parameters...',
    '[Agent: WebCrawler] Successfully parsed 24 target data frames.'
  ]);
  const terminalRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Fetch projects list
  const loadProjects = async () => {
    try {
      const data = await fetchMissionsAction();
      setProjects(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Fetch agents state
  useEffect(() => {
    async function loadAgents() {
      const agentData = await fetchAgentsState();
      if (agentData) setAgents(agentData);
    }
    loadAgents();
  }, []);

  // Scroll terminal to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // Live telemetry ticker
  useEffect(() => {
    const interval = setInterval(() => {
      setTokenBurn(prev => Number((prev + 0.002).toFixed(4)));
      setTokenCount(prev => prev + 12);

      const newTraces = [
        `[${new Date().toLocaleTimeString()}] toprank::seo_audit - Running semantic scoring`,
        `[${new Date().toLocaleTimeString()}] agentmemory::compress - Auto-saving workspace snapshot`,
        `[${new Date().toLocaleTimeString()}] superpowers::file_replace - Patching package specifications`,
        `[${new Date().toLocaleTimeString()}] workspace::verify_code - Checking code structure`
      ];
      const randomTrace = newTraces[Math.floor(Math.random() * newTraces.length)];
      setToolTraces(prev => [...prev.slice(-6), randomTrace]);

      const randomTerminal = [
        `[Sandbox Output] Process thread ${Math.floor(Math.random() * 8000)} running...`,
        `[Agent: StrategicPlanner] Recalculating priority score indices...`,
        `[Sandbox Output] Exit Code 0 - Process succeeded.`
      ];
      setTerminalLogs(prev => [...prev, randomTerminal[Math.floor(Math.random() * randomTerminal.length)]]);

    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Project-specific stream setup
  useEffect(() => {
    if (!projectId) return;

    const eventSource = new EventSource(`/api/mission/stream?id=${projectId}`);

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as Mission;
      if (data) {
        setMission(data);

        const combinedMessages = [...(data.messages || [])];
        if (data.failures) {
          data.failures.forEach(f => {
            if (!f.resolved) {
              combinedMessages.push({
                id: Number(f.id.replace('f-', '') || Date.now()),
                sender: 'Supr',
                text: `[BLOCKER] Team Member ${f.agentName} hit an issue on task ${f.taskId}: ${f.summary}. Strategic guidance required.`,
                isUser: false
              });
            }
          });
        }

        setMessages(combinedMessages.sort((a, b) => a.id - b.id));
        setReadinessScore(data.readinessScore || 72);
      }
    };

    eventSource.onerror = (err) => {
      console.error('SSE Error:', err);
      eventSource.close();
    };

    return () => {
      eventSource.close();
    };
  }, [projectId]);

  const handleAgentVisionLog = async (
    eventType: 'approval' | 'failure' | 'task_complete' | 'agent_action' | 'supr_decision' | 'permission' | 'delegation' | 'handoff' | 'review' | 'escalation' | 'governance',
    summary: string,
    detail: string
  ) => {
    if (!projectId) return;
    try {
      await logActivityAction(projectId, {
        eventType,
        actor: 'Signal Agent',
        actorIcon: 'smart_toy',
        summary,
        detail
      });
    } catch (err) {
      console.error("Failed to write live devtools log to SQLite:", err);
    }
  };

  const handleApprovalDecision = (id: string, decision: 'approve' | 'reject' | 'revise') => {
    setMessages(prev => [...prev, { id: Date.now(), sender: 'You', text: `Action Safety Audit ${decision}d.`, isUser: true }]);
    setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'Supr', text: `Audit gate marked as ${decision}d. Verifying code structure in secure workspace.`, isUser: false }]);
    showToast(`Gate decision processed: ${decision}`);
  };

  const handleSubmitMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isProcessing || !projectId) return;

    const userMessage = command;
    setMessages(prev => [...prev, { id: Date.now(), sender: 'You', text: userMessage, isUser: true }]);
    setCommand('');
    setIsProcessing(true);

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: userMessage })
      });

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.trim() !== '');

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === 'message') {
              setMessages(prev => [...prev, { id: Date.now(), sender: 'Supr', text: data.content, isUser: false }]);
            }
          } catch (err) {
            // Ignore parse errors
          }
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDragStart = (e: React.DragEvent, type: string) => {
    e.dataTransfer.setData('text/plain', type);
  };

  const handleNodeSteered = (nodeId: string, instructions: string) => {
    showToast(`Steering Context injected into Node "${nodeId}"! ✓`);
    setMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'You', text: `[STEER INTERRUPT on Node ${nodeId}] Injected directions: "${instructions}"`, isUser: true },
      { id: Date.now() + 1, sender: 'Supr', text: `AG-UI Interrupt received. Backend workers paused. Context buffers successfully updated. Resuming thread loops...`, isUser: false }
    ]);
  };

  const handleNodeRollback = (nodeId: string) => {
    showToast(`Time Travel: Reverting file trees to snapshot "${nodeId}"... ✓`);
    setTerminalLogs(prev => [
      ...prev,
      `[Time Travel Rollback] Reverting workspace files to snapshot: ${nodeId}`,
      `[Time Travel Rollback] Restoring file trees... Done.`,
      `[Time Travel Rollback] Truncated future execution paths. Ready.`
    ]);
    setMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'You', text: `Time travel rollback triggered on Node "${nodeId}"`, isUser: true },
      { id: Date.now() + 1, sender: 'Supr', text: `Snapshot reversion successfully reset to secure workspace instances. Workspace state re-aligned to ${nodeId} completion.`, isUser: false }
    ]);
  };

  const handleCheckpointAdded = (label: string, beforeNodeId: string) => {
    showToast(`Checkpoint Added before Node "${beforeNodeId}"! ✓`);
    setMessages(prev => [
      ...prev,
      { id: Date.now(), sender: 'Supr', text: `[Rewired Connection] A new custom ${label} was dropped onto connection line before node ${beforeNodeId}. SQLite planner state recalculated successfully.`, isUser: false }
    ]);
    setActiveReasoning(`User inserted a manual review gate before Node ${beforeNodeId}. Rerouting downstream tasks and auditing permission tier contexts.`);
  };

  const handleNewMission = () => {
    setShowWizard(true);
  };

  const handleWizardClose = async () => {
    setShowWizard(false);
    loadProjects();
  };

  const handleProjectSwitch = (id: string) => {
    const params = new URLSearchParams(window.location.search);
    if (id) {
      params.set('id', id);
      router.push(`/?${params.toString()}`);
    } else {
      router.push('/');
    }
  };

  // If a project is selected, render the detailed project workspace
  if (projectId) {
    return (
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
        <TopNav title={mission ? `${mission.name} Workspace` : "Project Workspace"} />

        {toastMessage && (
          <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
            {toastMessage}
          </div>
        )}

        {/* Project Selector & Blending Header */}
        <div className="bg-surface-container-high border-b-4 border-primary px-4 py-2.5 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-sm">folder_open</span>
            <select
              value={projectId}
              onChange={(e) => handleProjectSwitch(e.target.value)}
              className="bg-background neo-border px-3 py-1.5 font-headline font-bold uppercase text-xs text-primary focus:outline-none focus:border-tertiary min-w-[200px] cursor-pointer"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name} — {p.readinessScore}%</option>
              ))}
            </select>
          </div>

          <button
            onClick={() => handleProjectSwitch('')}
            className="bg-background neo-border px-3 py-1.5 font-headline font-bold uppercase text-[10px] text-primary hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-xs">dashboard</span>
            All Projects Overview
          </button>

          <span className="font-mono text-[10px] text-on-surface-variant ml-2">ID: {projectId}</span>

          <Link
            href="/orchestration"
            className="ml-auto bg-background neo-border px-3 py-1.5 font-headline font-bold uppercase text-[10px] text-primary hover:bg-primary hover:text-on-primary transition-colors flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-xs">visibility</span>
            Observance Hub
          </Link>
        </div>

        <div className="xl:hidden bg-background border-b-4 border-primary grid grid-cols-3">
          {[
            { id: 'chat', label: 'Chat', icon: 'chat_bubble' },
            { id: 'work', label: 'Work', icon: 'hub' },
            { id: 'telemetry', label: 'Signals', icon: 'radar' },
          ].map((panel) => (
            <button
              key={panel.id}
              onClick={() => setMobilePanel(panel.id as typeof mobilePanel)}
              className={`py-3 px-2 border-r-2 last:border-r-0 border-primary font-headline font-black uppercase text-[10px] flex items-center justify-center gap-1.5 ${
                mobilePanel === panel.id ? 'bg-primary text-on-primary' : 'bg-background text-primary'
              }`}
            >
              <span className="material-symbols-outlined text-sm">{panel.icon}</span>
              {panel.label}
            </button>
          ))}
        </div>

        {/* Blended Command Workspace Layout */}
        <div className="flex-1 flex flex-col xl:flex-row overflow-hidden">
          {/* COLUMN 1: SUPR CHAT STREAM & STEERING PRESETS */}
          <aside className={`${mobilePanel === 'chat' ? 'flex' : 'hidden'} xl:flex w-full xl:w-80 xl:border-r-4 border-primary bg-background flex-col shrink-0 overflow-hidden`}>
            <div className="p-4 border-b-4 border-primary bg-surface-container-high">
              <h3 className="font-headline font-black uppercase text-sm tracking-tight text-primary flex items-center gap-1.5 mb-2.5">
                <span className="material-symbols-outlined text-sm">construction</span>
                Steering Presets Drag-Box
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'manual_review')}
                  className="bg-background neo-border p-2 text-center cursor-grab hover:bg-surface-variant transition-colors group flex flex-col items-center gap-1 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                >
                  <span className="material-symbols-outlined text-sm text-secondary group-hover:scale-110 transition-transform">lock</span>
                  <span className="font-headline text-[8px] font-bold uppercase leading-none">Manual Gate</span>
                </div>
                <div
                  draggable
                  onDragStart={(e) => handleDragStart(e, 'dynamic_audit')}
                  className="bg-background neo-border p-2 text-center cursor-grab hover:bg-surface-variant transition-colors group flex flex-col items-center gap-1 shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]"
                >
                  <span className="material-symbols-outlined text-sm text-tertiary group-hover:scale-110 transition-transform">security</span>
                  <span className="font-headline text-[8px] font-bold uppercase leading-none">Sandbox Audit</span>
                </div>
              </div>
              <p className="font-body text-[9px] text-on-surface-variant mt-2 text-center font-semibold uppercase italic">Drag blocks and drop onto DAG connection edges.</p>
            </div>

            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="p-3 border-b-4 border-primary bg-primary text-primary-fixed">
                <h2 className="font-headline font-black uppercase text-xs tracking-tight flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">chat_bubble</span>
                  Collaborative Stream
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3 flex flex-col bg-surface-container-low">
                {messages.map((msg) => (
                  msg.isUser ? (
                    <div key={msg.id} className="neo-border p-3 bg-primary-container text-on-primary-container self-end max-w-[90%] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                      <div className="flex items-center justify-end gap-1.5 mb-1 border-b border-outline/10 pb-0.5">
                        <span className="font-headline font-bold text-[9px] uppercase">{msg.sender}</span>
                        <span className="material-symbols-outlined text-xs">account_circle</span>
                      </div>
                      <p className="text-xs font-semibold leading-relaxed font-body">{msg.text}</p>
                    </div>
                  ) : msg.approvalRequest ? (
                    <InlineApproval key={msg.id} request={msg.approvalRequest} onDecision={handleApprovalDecision} />
                  ) : (
                    <div key={msg.id} className="neo-border p-3 bg-surface max-w-[90%] shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                      <div className="flex items-center gap-1.5 mb-1 border-b border-outline/10 pb-0.5">
                        <span className="material-symbols-outlined text-xs text-tertiary">smart_toy</span>
                        <span className="font-headline font-bold text-[9px] uppercase">{msg.sender}</span>
                      </div>
                      <p className="text-xs font-semibold leading-relaxed font-body">{msg.text}</p>
                    </div>
                  )
                ))}
                {isProcessing && (
                  <div className="neo-border p-3 bg-surface animate-pulse">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-xs animate-spin text-tertiary">sync</span>
                      <span className="font-headline font-bold text-[9px] uppercase text-primary">Supr processing...</span>
                    </div>
                  </div>
                )}
              </div>
              <form onSubmit={handleSubmitMessage} className="p-3 border-t-4 border-primary bg-surface-container-high">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={command}
                    onChange={(e) => setCommand(e.target.value)}
                    disabled={isProcessing}
                    placeholder="Inject directive/instruction..."
                    className="flex-1 bg-background neo-border px-3 py-2 font-body text-xs focus:outline-none focus:border-tertiary disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="bg-primary text-primary-fixed neo-border p-2 hover:bg-tertiary hover:text-on-tertiary transition-colors active:translate-x-1 active:translate-y-1 disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-base">send</span>
                  </button>
                </div>
              </form>
            </div>
          </aside>

          {/* COLUMN 2: CENTER ACTIVE GLIDEPATH CANVAS & SANDBOX STUDIO */}
          <main className={`${mobilePanel === 'work' ? 'flex' : 'hidden'} xl:flex flex-1 flex-col overflow-y-auto custom-scrollbar bg-surface-container xl:border-r-4 border-primary`}>
            <div className="flex bg-surface-container-high border-b-4 border-primary shrink-0">
              <button
                onClick={() => setActiveTab('glidepath')}
                className={`flex-1 py-3 px-4 font-headline font-black uppercase text-xs border-r-4 border-primary transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'glidepath' ? 'bg-primary text-on-primary' : 'bg-background text-primary hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-sm">hub</span>
                Active Glidepath Canvas
              </button>
              <button
                onClick={() => setActiveTab('browser')}
                className={`flex-1 py-3 px-4 font-headline font-black uppercase text-xs transition-colors flex items-center justify-center gap-2 ${
                  activeTab === 'browser' ? 'bg-primary text-on-primary' : 'bg-background text-primary hover:bg-surface-container'
                }`}
              >
                <span className="material-symbols-outlined text-sm">travel_explore</span>
                Agent Vision & Browser Automation Lab
              </button>
            </div>

            <div className="p-4 flex flex-col gap-6 flex-1">
              {activeTab === 'glidepath' ? (
                <>
                  <SteerableCanvas
                    onNodeSteered={handleNodeSteered}
                    onNodeRollback={handleNodeRollback}
                    onCheckpointAdded={handleCheckpointAdded}
                  />

                  <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 h-[320px] shrink-0">
                    <div className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-4 flex flex-col relative overflow-hidden">
                      <div className="flex justify-between items-center border-b-2 border-primary pb-2 mb-3">
                        <h4 className="font-headline text-lg font-black uppercase tracking-tight text-secondary flex items-center gap-1.5">
                          <span className="material-symbols-outlined">design_services</span> Artifact Studio
                        </h4>
                        <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 text-[8px] font-bold uppercase neo-border">Live Preview</span>
                      </div>
                      <div className="flex-1 bg-surface-container-low neo-border p-4 overflow-y-auto custom-scrollbar">
                        <article className="font-body text-xs space-y-4">
                          <div className="border-l-4 border-secondary pl-3 py-1">
                            <h4 className="font-headline font-bold text-sm uppercase text-primary">COMPETITOR SIGNAL TELEMETRY BRIEF</h4>
                            <p className="text-[10px] text-on-surface-variant font-semibold">Generated by Signal Agent</p>
                          </div>
                          <p className="leading-relaxed">This deliverable captures competitor releases extracted through the CloakBrowser crawler workspace. Focus points include API bottlenecks and schema redundancies.</p>
                          <table className="w-full text-left border-collapse text-[10px] font-mono">
                            <thead>
                              <tr className="border-b-2 border-primary bg-surface">
                                <th className="p-1.5 font-bold uppercase">System Metric</th>
                                <th className="p-1.5 font-bold uppercase">Stitch Score</th>
                                <th className="p-1.5 font-bold uppercase">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="border-b border-outline/10">
                                <td className="p-1.5">JSON Serialization</td>
                                <td className="p-1.5 text-secondary font-bold">98.2%</td>
                                <td className="p-1.5 text-primary">Stable</td>
                              </tr>
                              <tr className="border-b border-outline/10">
                                <td className="p-1.5">Docker Sandboxes</td>
                                <td className="p-1.5 text-secondary font-bold">91.4%</td>
                                <td className="p-1.5 text-tertiary">Optimized</td>
                              </tr>
                            </tbody>
                          </table>
                        </article>
                      </div>
                    </div>

                    <div className="neo-border bg-background shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-4 flex flex-col relative overflow-hidden">
                      <div className="flex justify-between items-center border-b-2 border-primary pb-2 mb-3">
                        <h4 className="font-headline text-lg font-black uppercase tracking-tight text-primary flex items-center gap-1.5">
                          <span className="material-symbols-outlined">terminal</span> Sandbox Terminal
                        </h4>
                        <span className="bg-primary-container text-on-primary-container px-2 py-0.5 text-[8px] font-bold uppercase neo-border">Simulated Logs</span>
                      </div>
                      <div
                        ref={terminalRef}
                        className="flex-1 bg-black p-4 font-mono text-[10px] text-green-400 neo-border overflow-y-auto custom-scrollbar space-y-1.5 selection:bg-green-800"
                      >
                        {terminalLogs.map((log, idx) => (
                          <p key={idx} className={
                            log.startsWith('➜') ? "text-blue-400 font-bold" :
                              log.includes('Agent:') ? "text-amber-300 font-bold" :
                                log.includes('[Sandbox Output]') ? "text-gray-300" : "text-green-400"
                          }>
                            {log}
                          </p>
                        ))}
                      </div>
                    </div>
                  </section>
                </>
              ) : (
                <AgentVisionLab
                  projectId={projectId}
                  onLogActivity={handleAgentVisionLog}
                  onTraceUpdate={(trace) => setToolTraces(prev => [...prev.slice(-6), trace])}
                  onTerminalLog={(log) => setTerminalLogs(prev => [...prev, log])}
                />
              )}
            </div>
          </main>

          {/* COLUMN 3: OUT-OF-BAND TELEMETRY & METRICS */}
          <aside className={`${mobilePanel === 'telemetry' ? 'flex' : 'hidden'} xl:flex w-full xl:w-80 bg-background flex-col shrink-0 overflow-y-auto custom-scrollbar p-5 gap-6`}>
            <section className="border-4 border-primary p-4 bg-surface relative overflow-hidden">
              <h4 className="font-headline font-black uppercase text-sm tracking-tight text-primary flex items-center gap-1.5 border-b-2 border-primary pb-2 mb-2">
                <span className="material-symbols-outlined text-sm text-tertiary">lightbulb</span>
                Governor Context Explainability
              </h4>
              <p className="font-body text-xs leading-relaxed text-on-surface bg-surface-container p-3 border-l-4 border-tertiary">
                {activeReasoning}
              </p>
            </section>

            <section className="border-4 border-primary p-4 bg-surface flex flex-col">
              <div className="flex justify-between items-center border-b-2 border-primary pb-2 mb-3">
                <h4 className="font-headline font-black uppercase text-sm tracking-tight text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-secondary animate-pulse">radar</span>
                  Simulated Traces
                </h4>
                <span className="w-2 h-2 bg-secondary rounded-full animate-ping"></span>
              </div>
              <div className="space-y-2 max-h-[140px] overflow-y-auto custom-scrollbar font-mono text-[9px] text-on-surface-variant">
                {toolTraces.map((trace, idx) => (
                  <div key={idx} className="border-b border-outline/5 pb-1 last:border-b-0 leading-normal">
                    {trace}
                  </div>
                ))}
              </div>
            </section>

            <section className="border-4 border-primary p-4 bg-surface-container flex flex-col gap-4">
              <h4 className="font-headline font-black uppercase text-sm tracking-tight text-primary border-b-2 border-primary pb-2">
                Mission Metrics
              </h4>

              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="font-headline font-bold text-[10px] uppercase text-primary">Project Readiness</span>
                  <span className="font-headline font-black text-lg text-secondary">{readinessScore}%</span>
                </div>
                <div className="w-full h-3 bg-outline-variant neo-border-sm relative overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-secondary transition-all duration-1000"
                    style={{ width: `${readinessScore}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-end mb-1">
                  <span className="font-headline font-bold text-[10px] uppercase text-primary">Token Spend</span>
                  <span className="font-headline font-black text-sm text-tertiary">${tokenBurn}</span>
                </div>
                <div className="font-mono text-[9px] text-on-surface-variant">
                  Total Accumulated: <span className="font-bold">{tokenCount} tokens</span>
                </div>
              </div>

              <div>
                <span className="block font-headline font-bold text-[10px] uppercase text-primary mb-2">Agent Permissions</span>
                <div className="flex flex-wrap gap-1">
                  {['Observe', 'Draft', 'Edit', 'Execute', 'Root'].map((perm, idx) => (
                    <span
                      key={perm}
                      className={`px-2 py-0.5 border text-[8px] font-bold uppercase ${idx <= 2 ? 'bg-primary text-on-primary border-primary' : 'bg-surface text-on-surface-variant border-outline'}`}
                    >
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </section>

            <section className="flex flex-col">
              <h4 className="font-headline font-black uppercase text-sm tracking-tight text-primary border-b-2 border-primary pb-2 mb-4">
                Assigned Team
              </h4>
              <div className="space-y-3">
                {agents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </section>
          </aside>
        </div>
      </div>
    );
  }

  // Otherwise, render the High-level Dashboard Overview
  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container relative">
      {showWizard && <MissionWizard onClose={handleWizardClose} />}
      <TopNav title="Dashboard Overview" />
      
      <div className="p-6 lg:p-8 flex-1 overflow-y-auto space-y-8 max-w-7xl mx-auto w-full">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b-4 border-primary pb-6">
          <div>
            <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Dashboard</h1>
            <p className="font-body text-lg font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Active projects, deliverables, and agent orchestration center.</p>
          </div>
          <div className="relative">
            <button 
              onClick={handleNewMission}
              className="bg-primary text-on-primary neo-border neo-shadow font-headline font-bold uppercase py-3 px-6 hover:bg-primary-fixed hover:text-primary transition-all active:translate-x-1 active:translate-y-1"
            >
              <span className="flex items-center gap-2"><span className="material-symbols-outlined">add</span> New Project</span>
            </button>
          </div>
        </header>

        {/* Active Projects */}
        <section>
          <h2 className="font-headline text-2xl font-black uppercase tracking-tight mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-tertiary">rocket_launch</span> Active Projects
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {loadingProjects ? (
              <div className="font-mono text-sm text-on-surface-variant p-6 bg-background neo-border">Loading projects...</div>
            ) : projects.length > 0 ? (
              projects.map(proj => (
                <div key={proj.id} className="bg-background neo-border neo-shadow p-6 group cursor-pointer hover:bg-surface-bright transition-colors flex flex-col justify-between min-h-[220px]">
                  <div>
                    <div className="flex justify-between items-start mb-4">
                      <Link href={`/?id=${proj.id}`} className="font-headline text-2xl font-bold uppercase group-hover:text-tertiary transition-colors">
                        {proj.name}
                      </Link>
                      <span className={`px-3 py-1 font-body text-xs font-bold uppercase neo-border ${
                        proj.status === 'Active' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-variant text-on-surface-variant'
                      }`}>
                        {proj.status === 'Active' ? 'In Progress' : 'Completed'}
                      </span>
                    </div>
                    <p className="font-body text-sm text-on-surface-variant mb-6 line-clamp-2">
                      {proj.objective || 'No objective defined.'}
                    </p>
                  </div>
                  
                  <div className="flex items-center justify-between border-t-2 border-outline-variant pt-4">
                    <div className="flex -space-x-2">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center neo-border z-30" title="Supr Supervisor"><span className="material-symbols-outlined text-on-primary text-sm">psychology</span></div>
                      <div className="w-8 h-8 rounded-full bg-surface-variant flex items-center justify-center neo-border z-20" title="Research Agent"><span className="material-symbols-outlined text-primary text-sm">travel_explore</span></div>
                    </div>
                    <div className="text-right">
                      <span className="font-headline font-bold text-xs uppercase text-on-surface-variant block">Delivery Progress</span>
                      <span className="font-headline font-black text-2xl text-secondary">{proj.readinessScore || 0}%</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-background neo-border p-6 text-on-surface-variant font-bold text-sm">No active projects found. Create a new one to begin!</div>
            )}

            <button 
              onClick={handleNewMission}
              className="bg-surface-variant neo-border p-6 shadow-sm opacity-80 border-dashed hover:bg-surface-container hover:opacity-100 transition-all text-left"
            >
               <div className="flex items-center justify-center h-full min-h-[220px] text-on-surface-variant">
                  <p className="font-headline font-bold uppercase text-sm flex items-center gap-2">
                    <span className="material-symbols-outlined">add_circle</span> Initialize New Project
                  </p>
               </div>
            </button>
          </div>
        </section>

        {/* Deliverable Repositories / Recent Artifacts */}
        <section>
          <h2 className="font-headline text-2xl font-black uppercase tracking-tight mb-4 border-b-4 border-primary pb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">folder_open</span> Project Deliverables & Reports
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             {projects.slice(0, 3).map((proj, idx) => {
               const targetArtifact = proj.artifacts?.[0];
               const artifactTitle = targetArtifact?.filename || `${proj.name} Execution Pack`;
               const artifactDesc = targetArtifact ? `${proj.name} deliverable spec.` : `Checklist and findings summary.`;
               
               return (
                 <Link 
                   key={proj.id} 
                   href={`/mission-packet?id=${proj.id}`} 
                   className="bg-background neo-border p-5 hover:bg-surface transition-colors hover:neo-shadow-lg flex flex-col justify-between gap-4 min-h-[160px]"
                 >
                    <div className="flex items-center justify-between">
                      <span className={`material-symbols-outlined text-3xl ${idx % 3 === 0 ? 'text-secondary' : idx % 3 === 1 ? 'text-tertiary' : 'text-primary'}`}>
                        {targetArtifact?.type === 'code' ? 'terminal' : 'description'}
                      </span>
                      <span className="text-xs font-bold uppercase text-on-surface-variant">Project Report</span>
                    </div>
                    <div>
                      <h3 className="font-headline font-bold uppercase truncate">{artifactTitle}</h3>
                      <p className="font-body text-xs mt-1 text-on-surface-variant line-clamp-2">{artifactDesc}</p>
                    </div>
                 </Link>
               );
             })}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function WorkspacePage() {
  return (
    <Suspense fallback={
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container items-center justify-center">
        <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Loading Dashboard...</p>
      </div>
    }>
      <BlendedDashboardContent />
    </Suspense>
  );
}
