"use client";

import { TopNav } from '@/components/TopNav';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { InlineApproval, ApprovalRequest } from '@/components/InlineApproval';
import { Glidepath, Phase } from '@/components/Glidepath';
import { TaskBoard, Task } from '@/components/TaskBoard';
import { AgentTeamSidebar } from '@/components/AgentTeamSidebar';
import { AgentInfo } from '@/components/AgentCard';
import { fetchMissionState, fetchAgentsState, logActivityAction, updateTaskStatusAction } from '@/app/actions';
import { Message, Mission } from '@/types';

export default function MissionControlPage() {
  const [command, setCommand] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [missionId, setMissionId] = useState<string>('m1');
  const [mission, setMission] = useState<Mission | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [readinessScore, setReadinessScore] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    // Initial agents load (less frequent)
    async function loadAgents() {
      const agentData = await fetchAgentsState();
      if (agentData) setAgents(agentData);
    }
    loadAgents();

    // Mission stream for real-time updates
    const eventSource = new EventSource('/api/mission/stream');
    
    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data) as Mission;
      if (data) {
        setMissionId(data.id);
        setMission(data);
        
        const combinedMessages = [...(data.messages || [])];
        if (data.failures) {
          data.failures.forEach(f => {
            if (!f.resolved) {
              combinedMessages.push({
                id: Number(f.id.replace('f-', '') || Date.now()),
                sender: 'Supr',
                text: `[FAILURE] Agent ${f.agentName} failed task ${f.taskId}: ${f.summary}. Guidance required.`,
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
  }, []);

  const handleApprovalDecision = (id: string, decision: 'approve' | 'reject' | 'revise') => {
    setMessages(prev => [...prev, { id: Date.now(), sender: 'You', text: `Approval Gate ${decision}d.`, isUser: true }]);
    
    if (decision === 'approve') {
      setPhases(prev => prev.map(p => {
        if (p.status === 'Active') return { ...p, status: 'Done' };
        if (p.status === 'Gate_Pending') return { ...p, status: 'Active' };
        return p;
      }));
      setTasks(prev => prev.map(t => t.id === 't2' ? { ...t, status: 'Done' } : t));
      setTasks(prev => [...prev, { id: 't3', title: 'Generate Build Brief', description: 'Drafting spec based on approved priorities.', agentName: 'Spec Agent', agentIcon: 'edit_document', status: 'Active' }]);
      setMessages(prev => [...prev, { id: Date.now() + 1, sender: 'Supr', text: 'Gate approved. Proceeding to prioritization and spec generation.', isUser: false }]);
      
      // Persist to DB
      logActivityAction(missionId, {
        eventType: 'approval',
        actor: 'User',
        actorIcon: 'account_circle',
        summary: `User approved gate: ${id}`,
        detail: `Permission Observe + Draft granted for scope expansion.`
      });
      updateTaskStatusAction(missionId, 't2', 'Done');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim() || isProcessing) return;

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
            // Ignore parse errors from raw stream
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
      <TopNav title="Mission Control" />
      
      {toastMessage && (
        <div className="fixed bottom-24 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}

      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Command Channel */}
        <section className="w-80 border-r-4 border-primary bg-background hidden lg:flex flex-col">
          <div className="p-4 border-b-4 border-primary bg-primary text-primary-fixed">
            <h2 className="font-headline font-black uppercase text-xl tracking-tight">Command Channel</h2>
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
                placeholder="Issue command..." 
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

        {/* Center Column: Glidepath & Board */}
        <section className="flex-1 flex flex-col overflow-y-auto custom-scrollbar p-6 lg:p-8 gap-8">
          {/* Glidepath */}
          <Glidepath phases={phases} readinessScore={readinessScore} />

          {/* Task Board */}
          <TaskBoard tasks={tasks} />
        </section>

        {/* Right Column: Reasoning / Agents */}
        <AgentTeamSidebar 
          agents={agents}
          reasoningText={mission?.objective ? `Objective: ${mission.objective}` : 'Context Scan prioritized because "Pain Clustering" revealed anomalous spikes in user complaints regarding competitor data export features.'}
          gateRequiredText={phases.some(p => p.status === 'Gate_Pending') ? 'Prioritization phase requires human approval.' : undefined}
          onReviewGate={() => showToast("Reviewing active gate in Command Channel...")}
          subMissionIds={mission?.subMissionIds}
        />
      </div>
    </div>
  );
}
