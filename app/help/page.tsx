"use client";

import { TopNav } from '@/components/TopNav';
import { useState } from 'react';

const FAQ_ITEMS = [
  {
    q: 'How do I create a new project?',
    a: 'Click "New Project" on the Dashboard or in the sidebar. Fill out the project name, objective, and workflow type in the wizard. Supr will automatically generate a Glidepath execution plan with phases, tasks, and agent assignments.'
  },
  {
    q: 'What is a Glidepath?',
    a: 'A Glidepath is the persistent, state-managed execution contract for a project. It defines the sequence of phases (Intake → Ingestion → Clustering → Context Scan → Brief Gen → QA Gate → Code Sandbox → Export), assigns agents to each phase, and tracks progress through the lifecycle.'
  },
  {
    q: 'How do agent permissions work?',
    a: 'Agents operate under a tiered permission model: Observe (read-only), Draft (can create proposals), Edit (can modify artifacts), Execute (can run code in sandbox), External Act (can access external APIs), and Root (unrestricted). Higher tiers require explicit approval from the Supervisor or the user.'
  },
  {
    q: 'What happens when an agent fails a task?',
    a: 'Supr enters an automated self-healing loop. The failure is logged in the Diagnostics Console, and the agent retries up to 3 times with adjusted parameters. If all retries fail, the task escalates to you for manual intervention via the Interactive Override panel.'
  },
  {
    q: 'Can I roll back changes made by an agent?',
    a: 'Yes. On the Project Control Center DAG canvas, click any completed node and select "Rollback to this state." This restores the workspace file tree to that node\'s snapshot and truncates all downstream execution.'
  },
  {
    q: 'How do I add a new skill or tool to an agent?',
    a: 'Navigate to Skills in the sidebar. Click "Register New Skill" and fill in the skill name, provider type, tool schema mappings, and description. Once registered, the skill becomes available to all agents with the appropriate permission tier.'
  },
  {
    q: 'What are Cron Triggers?',
    a: 'Cron Triggers are scheduled automations that run recurring background tasks—like scraping competitor signals, cleaning sandbox caches, or recompiling semantic indexes. You can pause, resume, trigger manually, or create new schedules from the Cron Jobs page.'
  },
  {
    q: 'How do I connect social channels?',
    a: 'Go to Settings → Channels & Socials. You can connect Telegram (bot token + chat ID), Twitter/X (OAuth link), and Discord (webhook URL). Connected channels receive real-time project logs, approval gate alerts, and agent status updates.'
  }
];

const SHORTCUTS = [
  { keys: ['Ctrl', 'N'], action: 'Create new project' },
  { keys: ['Ctrl', 'S'], action: 'Save current artifact' },
  { keys: ['Ctrl', 'Shift', 'R'], action: 'Sync memory banks' },
  { keys: ['Ctrl', 'Shift', 'T'], action: 'Open sandbox terminal' },
  { keys: ['Esc'], action: 'Close active modal / wizard' },
];

export default function HelpPage() {
  const [showToast, setShowToast] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState('');

  const handleSubmitTicket = () => {
    if (!feedbackText.trim()) {
      setShowToast(true);
      setTimeout(() => setShowToast(false), 2500);
      return;
    }
    setFeedbackText('');
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2500);
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Documentation & Help" />
      
      {showToast && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          Feedback submitted to engineering ✓
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-5xl mx-auto w-full">
        <header className="mb-12 border-b-4 border-primary pb-6">
          <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Supr Manual</h1>
          <p className="font-body text-lg font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">Complete operating guide for the governed AI supervisor workspace.</p>
        </header>

        <div className="space-y-12">

          {/* Getting Started */}
          <article className="bg-background neo-border p-6 neo-shadow">
            <h2 className="font-headline text-2xl font-bold uppercase mb-6 text-primary border-b-2 border-primary pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">rocket_launch</span> Getting Started
            </h2>
            <div className="space-y-6">
              <div className="flex gap-6 items-start">
                <div className="w-10 h-10 neo-border bg-primary text-on-primary flex items-center justify-center font-black shrink-0">1</div>
                <div>
                  <h3 className="font-headline font-bold uppercase text-sm mb-1">Create a Project</h3>
                  <p className="font-body text-sm text-on-surface-variant">Click <strong>&quot;New Project&quot;</strong> from the Dashboard or sidebar. Define your project name, objective, and workflow type. Supr will generate an execution Glidepath automatically.</p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <div className="w-10 h-10 neo-border bg-primary text-on-primary flex items-center justify-center font-black shrink-0">2</div>
                <div>
                  <h3 className="font-headline font-bold uppercase text-sm mb-1">Monitor the Control Center</h3>
                  <p className="font-body text-sm text-on-surface-variant">Navigate to the <strong>Control Center</strong> to see the interactive DAG canvas. Watch agents execute phases in real-time, review the Explainable AI card, and track token spend.</p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <div className="w-10 h-10 neo-border bg-primary text-on-primary flex items-center justify-center font-black shrink-0">3</div>
                <div>
                  <h3 className="font-headline font-bold uppercase text-sm mb-1">Steer & Override</h3>
                  <p className="font-body text-sm text-on-surface-variant">Click any active node on the DAG to open the steering panel. Use <strong>Interactive Override</strong> to pause execution and inject custom instructions, or <strong>Time Travel</strong> to roll back to a previous state.</p>
                </div>
              </div>
              <div className="flex gap-6 items-start">
                <div className="w-10 h-10 neo-border bg-primary text-on-primary flex items-center justify-center font-black shrink-0">4</div>
                <div>
                  <h3 className="font-headline font-bold uppercase text-sm mb-1">Review Deliverables</h3>
                  <p className="font-body text-sm text-on-surface-variant">When the project reaches export, visit the <strong>Project Report</strong> page to review all generated artifacts, download individual files, or export the complete delivery bundle.</p>
                </div>
              </div>
            </div>
          </article>

          {/* Core Principles */}
          <article className="bg-background neo-border p-6">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4 text-primary border-b-2 border-primary pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">school</span> Core Principles
            </h2>
            <div className="font-body text-sm space-y-4">
              <p><strong className="uppercase">1. Supervisor First:</strong> Supr is not a generic assistant. It is a project supervisor. You give Supr a project, and Supr builds the Glidepath, assigns agents, and manages execution.</p>
              <p><strong className="uppercase">2. Secure Delegation:</strong> Subagents cannot commit actions to the core workspace without Supr&apos;s review, or your approval if the permissions dictate.</p>
              <p><strong className="uppercase">3. Transparent Reasoning:</strong> Any action taken autonomously will be recorded in the Decision Matrix (Strategic Plan tab) outlining exactly why Supr allowed it.</p>
              <p><strong className="uppercase">4. Zero-Trust Onboarding:</strong> External or untrusted agents are placed in the Evaluation Sandbox before being granted workspace access. You control the permission tier, memory scope, and execution limits.</p>
              <p><strong className="uppercase">5. Artifact Integrity:</strong> All generated code, briefs, and reports are persisted to the local SQLite database and available for download from the Project Report page at any time.</p>
            </div>
          </article>

          {/* Navigation Guide */}
          <article className="bg-background neo-border p-6">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4 text-primary border-b-2 border-primary pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">map</span> Navigation Guide
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { icon: 'dashboard', name: 'Dashboard', desc: 'Overview of all active projects and their delivery progress.' },
                { icon: 'insights', name: 'Control Center', desc: 'Interactive DAG canvas for real-time project orchestration and steering.' },
                { icon: 'history', name: 'Updates', desc: 'Immutable audit trail of every agent action, approval, and system event.' },
                { icon: 'smart_toy', name: 'Task Force', desc: 'Manage permanent and temporary agents, including the Evaluation Sandbox.' },
                { icon: 'psychology', name: 'Strategic Plan', desc: 'Memory banks and decision matrix showing Supr reasoning.' },
                { icon: 'construction', name: 'Skills', desc: 'Registry of installed capabilities—API bridges, Anthropic skills, tools.' },
                { icon: 'schedule', name: 'Cron Jobs', desc: 'Scheduled automations for recurring background tasks.' },
                { icon: 'code', name: 'Code Workspace', desc: 'Live IDE backed by SQLite for editing and testing agent code.' },
                { icon: 'travel_explore', name: 'Research Library', desc: 'Dynamic research findings with cross-workspace code sync.' },
                { icon: 'inventory_2', name: 'Project Report', desc: 'Final deliverable bundle with download and export capabilities.' },
                { icon: 'settings', name: 'Settings', desc: 'Operating mode, permissions, memory, standards, and social channels.' },
              ].map(item => (
                <div key={item.name} className="flex items-start gap-3 p-3 border-2 border-outline-variant hover:border-primary transition-colors">
                  <span className="material-symbols-outlined text-tertiary shrink-0 mt-0.5">{item.icon}</span>
                  <div>
                    <span className="font-headline font-bold uppercase text-xs text-primary block">{item.name}</span>
                    <span className="font-body text-xs text-on-surface-variant">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Keyboard Shortcuts */}
          <article className="bg-background neo-border p-6">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4 text-primary border-b-2 border-primary pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">keyboard</span> Keyboard Shortcuts
            </h2>
            <div className="space-y-3">
              {SHORTCUTS.map((s, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 border-b border-outline-variant last:border-b-0">
                  <div className="flex gap-1.5">
                    {s.keys.map((k, ki) => (
                      <span key={ki}>
                        <kbd className="bg-surface-container border-2 border-primary px-2 py-1 font-mono text-xs font-bold">{k}</kbd>
                        {ki < s.keys.length - 1 && <span className="mx-1 text-on-surface-variant">+</span>}
                      </span>
                    ))}
                  </div>
                  <span className="font-body text-sm text-on-surface-variant">{s.action}</span>
                </div>
              ))}
            </div>
          </article>

          {/* FAQ */}
          <article className="bg-background neo-border p-6">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4 text-primary border-b-2 border-primary pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">help</span> Frequently Asked Questions
            </h2>
            <div className="space-y-2">
              {FAQ_ITEMS.map((faq, idx) => (
                <div key={idx} className="border-2 border-primary">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                    className={`w-full text-left p-4 flex justify-between items-center gap-4 transition-colors ${
                      expandedFaq === idx ? 'bg-primary-container' : 'bg-surface hover:bg-surface-container'
                    }`}
                  >
                    <span className="font-headline font-bold uppercase text-sm text-primary">{faq.q}</span>
                    <span className="material-symbols-outlined text-primary shrink-0 transition-transform" style={{ transform: expandedFaq === idx ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                  </button>
                  {expandedFaq === idx && (
                    <div className="p-4 border-t-2 border-primary bg-background">
                      <p className="font-body text-sm text-on-surface-variant leading-relaxed">{faq.a}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </article>

          {/* Glossary */}
          <article className="bg-background neo-border p-6">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4 text-primary border-b-2 border-primary pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">menu_book</span> Glossary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 font-body text-sm">
              {[
                { term: 'Glidepath', def: 'The phased execution plan for a project lifecycle.' },
                { term: 'DAG Canvas', def: 'Directed Acyclic Graph visualization of project phases.' },
                { term: 'Interactive Override', def: 'Manual pause-and-inject control over active agent threads.' },
                { term: 'Evaluation Sandbox', def: 'Isolated staging area for vetting untrusted agents.' },
                { term: 'Diagnostics Console', def: 'Automated failure analysis and self-healing resolution lab.' },
                { term: 'XAI Card', def: 'Explainable AI panel showing natural-language reasoning for Supr decisions.' },
                { term: 'AG-UI Protocol', def: 'Agent-to-UI event streaming for real-time tool traces.' },
                { term: 'Readiness Score (Rm)', def: 'Computed confidence metric for project delivery progress.' },
              ].map(g => (
                <div key={g.term} className="border-l-4 border-tertiary pl-3">
                  <span className="font-headline font-bold uppercase text-xs text-primary">{g.term}</span>
                  <p className="text-on-surface-variant text-xs mt-0.5">{g.def}</p>
                </div>
              ))}
            </div>
          </article>

          {/* Contact Support */}
          <article className="bg-surface neo-border border-dashed p-6">
            <h2 className="font-headline text-2xl font-bold uppercase mb-4 text-primary border-b-2 border-outline-variant pb-2 flex items-center gap-2">
              <span className="material-symbols-outlined">support_agent</span> Submit Feedback
            </h2>
            <p className="font-body text-sm mb-4 text-on-surface-variant">Found a bug, have a feature request, or need help with something not covered here? Submit feedback below.</p>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full bg-background neo-border p-4 font-body text-sm h-28 focus:outline-none focus:border-tertiary custom-scrollbar mb-4"
              placeholder="Describe the issue or suggestion in detail..."
            />
            <button 
              onClick={handleSubmitTicket}
              className="bg-primary text-on-primary neo-border py-3 px-8 font-headline font-bold uppercase hover:bg-tertiary transition-colors shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] active:translate-x-1 active:translate-y-1 active:shadow-none flex items-center gap-2"
            >
              <span className="material-symbols-outlined">send</span>
              Submit Feedback
            </button>
          </article>

        </div>
      </main>
    </div>
  );
}
