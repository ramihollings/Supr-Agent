"use client";

import { TopNav } from '@/components/TopNav';
import { useState, useEffect, startTransition, Suspense } from 'react';
import { Mission, MemoryItem } from '@/types';
import { getActiveMissionAction, fetchMissionsAction } from '@/app/actions';
import { useSearchParams, useRouter } from 'next/navigation';

interface ReasoningNode {
  id: string;
  label: string;
  status: 'passed' | 'failed' | 'running' | 'pending';
  timestamp: string;
  thoughtProcess: string;
  hypotheses: { option: string; confidence: number; verdict: string }[];
  sandboxCommand?: string;
  sandboxOutput?: string;
  actionTaken: string;
}

const DEFAULT_REASONING_TREE: ReasoningNode[] = [
  {
    id: 'n1',
    label: 'Parse Objective & Register Scope',
    status: 'passed',
    timestamp: '18:10:02',
    thoughtProcess: 'Analyze project description and outline phases. Deconstruct goal into sub-actions.',
    hypotheses: [
      { option: 'A: Parallel processing of tasks', confidence: 25, verdict: 'Rejected - potential locks' },
      { option: 'B: Sequential dependency execution model', confidence: 95, verdict: 'Accepted - safe and predictable' }
    ],
    actionTaken: 'Initialized Project Workspace metadata and generated task structure.'
  },
  {
    id: 'n2',
    label: 'Competitive Signals Web Crawl',
    status: 'passed',
    timestamp: '18:10:15',
    thoughtProcess: 'Gather competitor metrics. Isolate network requests using WebCrawler agent.',
    sandboxCommand: 'browser scrape --target="competitor_metrics"',
    sandboxOutput: '[WebCrawler] Fetching raw JSON... 24 target data frames parsed successfully.',
    hypotheses: [
      { option: 'A: Crawl standard browser DOM trees', confidence: 40, verdict: 'Rejected - Bot-detection block' },
      { option: 'B: Rotate headers & fetch raw JSON endpoint', confidence: 85, verdict: 'Accepted - Data retrieved' }
    ],
    actionTaken: 'Saved scraped competitor data structure into temporary database storage.'
  },
  {
    id: 'n3',
    label: 'Draft Integration Python Script',
    status: 'failed',
    timestamp: '18:10:30',
    thoughtProcess: 'Build pandas script to load and cluster competitor signals.',
    sandboxCommand: 'python -m pytest tests/validation.py',
    sandboxOutput: 'AssertionError: assert \'cluster\' in Index. 1 failed in 0.42s.',
    hypotheses: [
      { option: 'A: Direct numpy matrix stack clustering', confidence: 90, verdict: 'Accepted - but failed test assertion due to missing index' }
    ],
    actionTaken: 'Reported error checks failure and logged code check error in workspace policy decisions.'
  },
  {
    id: 'n4',
    label: 'Secure Self-Healing Code Run',
    status: 'passed',
    timestamp: '18:10:45',
    thoughtProcess: 'Triage verification assertion error. Read research brief and apply self-healing diff.',
    sandboxCommand: 'python src/feedback_clusters.py',
    sandboxOutput: '[SelfHealer] Injecting code fix. Tests run... 1 passed in 0.38s.',
    hypotheses: [
      { option: 'A: Wait for user manual correction', confidence: 10, verdict: 'Rejected - user confirmation required' },
      { option: 'B: Trigger AI Self-Healer code replacement', confidence: 92, verdict: 'Accepted - Fix applied and checked' }
    ],
    actionTaken: 'Patched feedback_clusters.py in workspace filesystem. Re-run tests succeeded.'
  },
  {
    id: 'n5',
    label: 'Verify Workspace Governance Rules',
    status: 'running',
    timestamp: '18:11:00',
    thoughtProcess: 'Analyze workspace file modifications against SOC2 and SOX compliance rules.',
    sandboxCommand: 'npm run lint',
    sandboxOutput: 'Auditing code policies... 0 security exceptions found.',
    hypotheses: [
      { option: 'A: Standard static code structure check', confidence: 98, verdict: 'Active - scanning package bounds' }
    ],
    actionTaken: 'Validating dependencies inside secure container workspace.'
  },
  {
    id: 'n6',
    label: 'Generate Handover Report Bundle',
    status: 'pending',
    timestamp: '---',
    thoughtProcess: 'Compile final deliverables list, code artifacts, and deploy configurations.',
    hypotheses: [],
    actionTaken: 'Awaiting upstream completion.'
  }
];

function ReasoningPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [projects, setProjects] = useState<Mission[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [mission, setMission] = useState<Mission | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Reasoning Tree States
  const [treeNodes, setTreeNodes] = useState<ReasoningNode[]>(DEFAULT_REASONING_TREE);
  const [selectedNodeId, setSelectedNodeId] = useState<string>('n4');
  const [overrideDirective, setOverrideDirective] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    async function loadProjects() {
      const data = await fetchMissionsAction();
      setProjects(data);
      
      const urlProjectId = searchParams.get('id');
      if (urlProjectId) {
        setSelectedProjectId(urlProjectId);
      } else if (data.length > 0) {
        const active = data.find(m => m.status === 'Active') || data[0];
        setSelectedProjectId(active.id);
      }
    }
    loadProjects();
  }, [searchParams]);

  useEffect(() => {
    if (selectedProjectId) {
      setIsRefreshing(true);
      getActiveMissionAction(selectedProjectId).then(data => {
        setMission(data || null);
        setTimeout(() => setIsRefreshing(false), 400);
      });
    }
  }, [selectedProjectId]);

  const handleProjectChange = (id: string) => {
    setSelectedProjectId(id);
    const params = new URLSearchParams(searchParams.toString());
    params.set('id', id);
    router.push(`/reasoning?${params.toString()}`);
  };

  const handleSteerNode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideDirective.trim()) return;

    showToast(`Injecting logic override for Node: ${selectedNodeId}...`);
    
    // Simulate updating the node state and Supr re-routing
    setTreeNodes(prev => prev.map(node => {
      if (node.id === selectedNodeId) {
        return {
          ...node,
          thoughtProcess: `${node.thoughtProcess} [STEER OVERRIDE RECEIVED: "${overrideDirective}"]`,
          actionTaken: `Overrode default strategy: ${overrideDirective}. Re-evaluation loop triggered.`,
          hypotheses: [
            { option: `User override: ${overrideDirective}`, confidence: 100, verdict: 'Accepted - Force Override' },
            ...node.hypotheses
          ]
        };
      }
      return node;
    }));
    
    setOverrideDirective('');
  };

  const selectedNode = treeNodes.find(n => n.id === selectedNodeId) || treeNodes[0];

  return (
    <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container overflow-hidden relative">
      <TopNav title="Reasoning Core Decision Center" />

      {toastMessage && (
        <div className="fixed bottom-8 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}
      
      <main className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full flex flex-col gap-6">
        
        {/* Header */}
        <header className="border-b-4 border-primary pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <h1 className="font-headline text-4xl md:text-5xl font-black uppercase tracking-tighter text-primary">Reasoning Core</h1>
            <p className="font-body text-sm font-bold mt-2 text-on-surface-variant border-l-4 border-tertiary pl-3">
              View the step-by-step decision path, analyzed choices, and workspace outcomes.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="font-headline text-xs font-bold uppercase text-primary">Workspace:</span>
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="bg-surface border-4 border-primary px-3 py-2 font-headline font-bold uppercase text-xs neo-shadow cursor-pointer focus:outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        </header>

        {/* Blended Dual-pane Content */}
        <div className="flex flex-col lg:flex-row gap-6 items-stretch flex-1 min-h-[550px]">
          
          {/* LEFT PANEL: Interactive Tree Map */}
          <section className="flex-1 bg-background neo-border p-6 shadow-md flex flex-col justify-between">
            <div>
              <h2 className="font-headline text-2xl font-black uppercase tracking-tighter text-primary border-b-2 border-primary pb-2 mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">account_tree</span>
                Steps Taken
              </h2>
              
              {/* Tree nodes loop */}
              <div className="relative pl-6 border-l-4 border-outline-variant space-y-8 py-2">
                {treeNodes.map((node, index) => {
                  const isActive = node.id === selectedNodeId;
                  return (
                    <div 
                      key={node.id} 
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`relative flex items-center gap-4 cursor-pointer p-3 transition-all border-2 group ${
                        isActive 
                          ? 'bg-primary-container border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]' 
                          : 'bg-surface border-transparent hover:border-outline-variant'
                      }`}
                    >
                      {/* Node Bullet status indicator */}
                      <span className={`absolute left-0 -translate-x-[34px] w-6 h-6 rounded-full border-2 border-primary flex items-center justify-center font-bold text-[10px] neo-shadow ${
                        node.status === 'passed' ? 'bg-tertiary text-on-tertiary' :
                        node.status === 'failed' ? 'bg-error text-on-error animate-pulse' :
                        node.status === 'running' ? 'bg-secondary text-on-primary animate-pulse' :
                        'bg-surface-dim text-on-surface-variant'
                      }`}>
                        {index + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center gap-2 mb-1">
                          <h4 className="font-headline font-black text-xs uppercase tracking-tight truncate text-primary">{node.label}</h4>
                          <span className={`text-[8px] font-bold uppercase px-2 py-0.5 border ${
                            node.status === 'passed' ? 'bg-tertiary-container text-primary border-primary' :
                            node.status === 'failed' ? 'bg-error-container text-error border-error' :
                            node.status === 'running' ? 'bg-secondary-container text-primary border-primary' :
                            'bg-surface-container text-on-surface-variant border-outline'
                          }`}>
                            {node.status}
                          </span>
                        </div>
                        <p className="font-body text-[10px] text-on-surface-variant truncate font-semibold">Action: {node.actionTaken}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-surface-container p-3 border-l-4 border-primary text-[10px] mt-6 text-on-surface-variant font-mono">
              SYSTEM_ORCHESTRATOR: Supr V4.0 // SANDBOX RUNS: ACTIVE
            </div>
          </section>

          {/* RIGHT PANEL: Details & Steering Panel */}
          <section className="w-full lg:w-96 bg-background neo-border p-6 shadow-md flex flex-col justify-between">
            <div className="space-y-6">
              <header className="border-b-2 border-primary pb-2 flex items-center justify-between">
                <h3 className="font-headline font-black uppercase text-sm tracking-tight text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">visibility</span>
                  Node Details
                </h3>
                <span className="font-mono text-[9px] text-on-surface-variant">Timestamp: {selectedNode.timestamp}</span>
              </header>

              {/* Thought Process */}
              <div>
                <span className="block font-headline font-bold text-[10px] uppercase text-primary mb-1">Active Thought Process</span>
                <p className="font-body text-xs leading-relaxed text-on-surface bg-surface-container p-3 border-l-4 border-tertiary font-semibold">
                  {selectedNode.thoughtProcess}
                </p>
              </div>

              {/* Hypotheses Evaluated */}
              <div>
                <span className="block font-headline font-bold text-[10px] uppercase text-primary mb-2">Decisions Analyzed</span>
                <div className="space-y-2">
                  {selectedNode.hypotheses.map((h, i) => (
                    <div key={i} className="neo-border bg-surface p-2.5 text-[10px]">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-body font-bold text-primary">{h.option}</span>
                        <span className="bg-primary-container text-primary text-[8px] px-1.5 py-0.5 border border-primary font-bold">Conf: {h.confidence}%</span>
                      </div>
                      <p className="font-mono text-[9px] text-on-surface-variant">Verdict: {h.verdict}</p>
                    </div>
                  ))}
                  {selectedNode.hypotheses.length === 0 && (
                    <p className="font-body text-xs italic text-on-surface-variant">No hypotheses evaluated yet.</p>
                  )}
                </div>
              </div>

              {/* Sandbox Outputs */}
              {selectedNode.sandboxCommand && (
                <div>
                  <span className="block font-headline font-bold text-[10px] uppercase text-primary mb-1.5">Sandbox Command & Output</span>
                  <div className="bg-black p-3 font-mono text-[9px] text-green-400 border border-primary leading-normal overflow-x-auto">
                    <span className="text-blue-400 font-bold">➜ supr@sandbox:~$</span> {selectedNode.sandboxCommand}
                    <pre className="mt-1 text-gray-300 whitespace-pre-wrap">{selectedNode.sandboxOutput}</pre>
                  </div>
                </div>
              )}

              {/* Action Taken */}
              <div>
                <span className="block font-headline font-bold text-[10px] uppercase text-primary mb-1">Action Executed</span>
                <p className="font-body text-xs font-semibold text-primary">{selectedNode.actionTaken}</p>
              </div>
            </div>

            {/* Steer Decisions Form */}
            <form onSubmit={handleSteerNode} className="border-t-2 border-primary pt-4 mt-6">
              <label className="block font-headline font-bold text-[10px] uppercase text-primary mb-2 flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">edit_square</span>
                Guide AI Decisions
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={overrideDirective}
                  onChange={(e) => setOverrideDirective(e.target.value)}
                  placeholder="Tell the AI what to do next..."
                  className="flex-1 bg-background border-2 border-primary px-3 py-1.5 text-xs focus:outline-none focus:border-tertiary"
                />
                <button
                  type="submit"
                  disabled={!overrideDirective.trim()}
                  className="bg-primary text-on-primary border-2 border-primary px-4 py-1.5 font-headline font-bold uppercase text-xs hover:bg-tertiary transition-colors active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
                >
                  Guide AI
                </button>
              </div>
            </form>
          </section>

        </div>
      </main>
    </div>
  );
}

export default function ReasoningPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 md:ml-64 flex flex-col min-h-screen bg-surface-container items-center justify-center">
        <p className="font-headline font-bold text-sm uppercase text-primary animate-pulse">Loading Reasoning Core...</p>
      </div>
    }>
      <ReasoningPageContent />
    </Suspense>
  );
}
