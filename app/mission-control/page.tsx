"use client";

import { TopNav } from '@/components/TopNav';
import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { InlineApproval, ApprovalRequest } from '@/components/InlineApproval';
import { Glidepath, Phase } from '@/components/Glidepath';
import { TaskBoard, Task } from '@/components/TaskBoard';
import { AgentTeamSidebar } from '@/components/AgentTeamSidebar';
import { AgentInfo } from '@/components/AgentCard';
import { fetchAgentsState, logActivityAction, updateTaskStatusAction } from '@/app/actions';
import { Message, Mission } from '@/types';

export default function MissionControlPage() {
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [readinessScore, setReadinessScore] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([
    '➜ /workspace/sandbox',
    'Initializing secure gVisor container...',
    'Mounting project volumes...',
    'Supr AI Manager standing by for instructions.'
  ]);
  const terminalRef = useRef<HTMLDivElement>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Get project ID from query parameter safely on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id') || 'm1';
    setProjectId(id);
  }, []);

  // Sync agents (less frequent)
  useEffect(() => {
    async function loadAgents() {
      const agentData = await fetchAgentsState();
      if (agentData) setAgents(agentData);
    }
    loadAgents();
  }, []);

  // Scroll terminal to bottom when new logs arrive
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLogs]);

  // Connect to workspace-scoped SSE stream when projectId is loaded
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
        setPhases(data.phases || []);
        setTasks(data.tasks || []);
        setReadinessScore(data.readinessScore || 0);
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

  // Live "Agent at Work" Telemetry Terminal Simulator
  useEffect(() => {
    const activeTask = tasks.find(t => t.status === 'Active');
    if (!activeTask) return;

    let index = 0;
    const logsForAgent = [
      `[Assigned: ${activeTask.agentName}] Initializing task: "${activeTask.title}"...`,
      `[Assigned: ${activeTask.agentName}] Scanning directory for schema changes...`,
      `[Assigned: ${activeTask.agentName}] Reviewing Anthropic MCP design protocols...`,
      `[Assigned: ${activeTask.agentName}] Sandbox test execution running...`,
      `[Assigned: ${activeTask.agentName}] All test suites passed! Delivery ready.`
    ];

    const timer = setInterval(() => {
      if (index < logsForAgent.length) {
        setTerminalLogs(prev => [...prev, logsForAgent[index]]);
        index++;
      } else {
        clearInterval(timer);
      }
    }, 4000);

    return () => clearInterval(timer);
  }, [tasks]);

  const handleApprovalDecision = (id: string, decision: 'approve' | 'reject' | 'revise') => {
    setMessages(prev => [...prev, { id: Date.now(), sender: 'You', text: `Action Safety Audit ${decision}d.`, isUser: true }]);
    
    if (decision === 'approve' && projectId) {
      setPhases(prev => prev.map(p => {
        if (p.status === 'Active') return { ...p, status: 'Done' };
        if (p.status === 'Gate_Pending') return { ...p, status: 'Active' };
        return p;
      }));
      setTasks(prev => prev.map(t => t.id === 't2' ? { ...t, status: 'Done' } : t));
      setTasks(prev => [...prev, { id: 't3', title: 'Generate Strategic Spec', description: 'Drafting spec based on approved priorities.', agentName: 'Spec Agent', agentIcon: 'edit_document', status: 'Active' }]);
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'Supr', text: 'Audit approved. Advancing prioritize phase and drafting strategic specs.', isUser: false }]);
      
      // Persist to DB
      logActivityAction(projectId, {
        eventType: 'approval',
        actor: 'User',
        actorIcon: 'account_circle',
        summary: `User approved audit gate: ${id}`,
        detail: `Permission granted to expand sandbox scope to abandoned GitHub issues.`
      });
      updateTaskStatusAction(projectId, 't2', 'Done');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title={mission ? `${mission.name} Workspace` : "Roadmap Center"} />
      
      {toastMessage && (
        <div className="fixed bottom-24 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Workspace Collaborative Chat */}
          <section className="w-80 border-r-4 border-primary bg-background hidden lg:flex flex-col">
            <div className="p-4 border-b-4 border-primary bg-primary text-primary-fixed">
              <h2 className="font-headline font-black uppercase text-xl tracking-tight">Collaborative Chat</h2>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 flex flex-col">
              {messages.map((msg) => (
                msg.isUser ? (
                  <div key={msg.id} className="neo-border p-3 bg-primary-container text-on-primary-container self-end max-w-[85%]">
                    <div className="flex items-center justify-end gap-2 mb-1">
                      <span className="font-headline font-bold text-sm uppercase">{msg.sender}</span>
                      <span className="material-symbols-outlined text-sm">account_circle</span>
                    </div>
                    <p className="text-sm font-medium">{msg.text}</p>
                  </div>
                ) : (
                  msg.approvalRequest ? (
                    <InlineApproval key={msg.id} request={msg.approvalRequest} onDecision={handleApprovalDecision} />
                  ) : (
                    <div key={msg.id} className="neo-border p-3 bg-surface">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="material-symbols-outlined text-sm">smart_toy</span>
                        <span className="font-headline font-bold text-sm uppercase">{msg.sender}</span>
                      </div>
                      <p className="text-sm font-medium">{msg.text}</p>
                    </div>
                  )
                )
              ))}
              {isProcessing && (
                <div className="neo-border p-3 bg-surface animate-pulse">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm animate-spin">sync</span>
                    <span className="font-headline font-bold text-sm uppercase">Supr is processing...</span>
                  </div>
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="p-4 border-t-4 border-primary bg-surface-container-high">
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  disabled={isProcessing}
                  placeholder="Ask a question or issue a directive..." 
                  className="flex-1 bg-background neo-border px-3 py-2 font-body text-sm focus:outline-none focus:border-tertiary focus:ring-0 disabled:opacity-50" 
                />
                <button 
                  type="submit" 
                  disabled={isProcessing}
                  className="bg-primary text-primary-fixed neo-border p-2 hover:bg-tertiary hover:text-on-tertiary transition-colors active:translate-x-1 active:translate-y-1 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">send</span>
                </button>
              </div>
            </form>
          </section>

          {/* Center Column: Roadmap & Board */}
          <section className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 lg:p-8 gap-8">
            {/* Roadmap */}
            <Glidepath phases={phases} readinessScore={readinessScore} />

            {/* Task Board */}
            <TaskBoard tasks={tasks} />
          </section>

          {/* Right Column: Strategic Sidebar */}
          <AgentTeamSidebar 
            agents={agents}
            reasoningText={mission?.objective ? `Project Objective: ${mission.objective}` : 'Auditing prioritization parameters after discovering high correlations between user churn and JSON serialization delays.'}
            gateRequiredText={phases.some(p => p.status === 'Gate_Pending') ? 'Audit gate pending manager approval.' : undefined}
            onReviewGate={() => showToast("Reviewing pending audit in Collaborative Chat...")}
            subMissionIds={mission?.subMissionIds}
          />
        </div>

        {/* Lower Area: Code Sandbox Workspace & Artifact Studio */}
        <section className="h-64 border-t-4 border-primary bg-background hidden lg:flex">
          {/* Code Workspace */}
          <div className="w-1/2 border-r-4 border-primary p-4 flex flex-col">
             <div className="flex justify-between items-center mb-2">
               <h2 className="font-headline font-black uppercase text-lg tracking-tight text-primary flex items-center gap-2">
                 <span className="material-symbols-outlined">terminal</span> Code Sandbox Workspace
               </h2>
               <span className="bg-primary-container text-on-primary-container px-2 py-1 text-[10px] font-bold uppercase neo-border">Sandboxed</span>
             </div>
             <div ref={terminalRef} className="flex-1 bg-surface-container-high p-4 font-mono text-xs text-on-surface neo-border overflow-y-auto custom-scrollbar space-y-1">
                {terminalLogs.map((log, index) => (
                  <p key={index} className={log.startsWith('➜') ? "text-tertiary font-bold" : log.includes('Assigned') ? "text-secondary font-semibold" : "text-on-surface"}>
                    {log}
                  </p>
                ))}
             </div>
          </div>
          {/* Artifact Studio */}
          <div className="w-1/2 p-4 flex flex-col">
             <div className="flex justify-between items-center mb-2">
               <h2 className="font-headline font-black uppercase text-lg tracking-tight text-secondary flex items-center gap-2">
                 <span className="material-symbols-outlined">design_services</span> Artifact Studio
               </h2>
               <span className="bg-secondary-container text-on-secondary-container px-2 py-1 text-[10px] font-bold uppercase neo-border">Preview</span>
             </div>
             <div className="flex-1 border-2 border-dashed border-secondary p-4 flex items-center justify-center bg-surface-container overflow-y-auto">
                {mission?.artifacts && mission.artifacts.length > 0 ? (
                  <div className="w-full h-full flex flex-col items-start gap-2">
                     <p className="font-bold text-sm text-secondary mb-2 bg-secondary-container text-on-secondary-container px-2 py-1 neo-border flex items-center gap-2">
                       <span className="material-symbols-outlined text-[16px]">file_present</span>
                       {mission.artifacts[mission.artifacts.length - 1].filename}
                     </p>
                     <div className="w-full flex-1 text-[10px] font-mono text-on-surface whitespace-pre-wrap p-3 border-l-4 border-secondary bg-background neo-border overflow-y-auto">
                       {mission.artifacts[mission.artifacts.length - 1].content}
                     </div>
                  </div>
                ) : (
                  <p className="font-body text-sm text-on-surface-variant text-center flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-4xl text-secondary opacity-50">note_stack</span>
                    Select an artifact from the repository or issue a strategic directive to preview files here.
                  </p>
                )}
             </div>
          </div>
        </section>
      </div>
    </div>
  );
}
