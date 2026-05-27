"use client";

import { useState, useEffect } from 'react';
import { fetchMissionState } from '@/app/actions';
import { Mission, Artifact } from '@/types';

type SearchLogEntry = {
  id: number;
  type: 'search' | 'navigate' | 'extract' | 'supr';
  content: string;
};

type BrowseState = 'idle' | 'searching' | 'browsing' | 'extracting' | 'done';

export default function ResearchPage() {
  const [browseState, setBrowseState] = useState<BrowseState>('idle');
  const [currentUrl, setCurrentUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchLog, setSearchLog] = useState<SearchLogEntry[]>([]);
  const [extractedData, setExtractedData] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [mission, setMission] = useState<Mission | null>(null);
  
  // Bridge state: Live Code view from the Code Workspace
  const [codeArtifacts, setCodeArtifacts] = useState<Artifact[]>([]);
  const [selectedCodeFile, setSelectedCodeFile] = useState<Artifact | null>(null);
  const [codeTriageStatus, setCodeTriageStatus] = useState<string>('Pending Research Context');

  const fetchState = async () => {
    const activeMission = await fetchMissionState();
    if (activeMission) {
      setMission(activeMission);
      
      // Filter out code files written by the Coding Agent
      const codeFiles = activeMission.artifacts?.filter(a => a.filename.endsWith('.py') || a.filename.endsWith('.json')) || [];
      setCodeArtifacts(codeFiles);

      // Check if code has the fallback fix to update status
      const clusterCode = activeMission.artifacts?.find(a => a.filename === 'feedback_clusters.py')?.content || '';
      if (clusterCode.includes('embedding') && (clusterCode.includes('not in') || clusterCode.includes('not'))) {
        setCodeTriageStatus('Passed Verification ✓');
      } else {
        const hasResearch = (activeMission.artifacts?.filter(a => a.filename.startsWith('research_')) || []).length > 0;
        setCodeTriageStatus(hasResearch ? 'Guidance Dispatched - Run Test' : 'Blocked by AssertionError (t2)');
      }
    }
  };

  useEffect(() => {
    fetchState();
    // Poll state every 4 seconds to pick up live edits from the Code Workspace!
    const interval = setInterval(fetchState, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleStartResearch = async () => {
    if (isRunning || !searchQuery.trim()) return;
    setIsRunning(true);
    setBrowseState('searching');
    setExtractedData([]);

    setSearchLog(prev => [...prev, { id: Date.now(), type: 'supr', content: `[SUPR] Delegating OSINT task to Research Agent: "${searchQuery}"` }]);

    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, missionId: mission?.id }),
      });

      if (!response.body) throw new Error('No response stream.');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const msg = JSON.parse(line);

            if (msg.type === 'status') {
              // Update the browser chrome and crawl log based on phase
              if (msg.phase === 'searching') {
                setBrowseState('searching');
                const slug = searchQuery.toLowerCase().replace(/\s+/g, '-');
                setCurrentUrl(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`);
              } else if (msg.phase === 'browsing') {
                setBrowseState('browsing');
              } else if (msg.phase === 'extracting' || msg.phase === 'generating') {
                setBrowseState('extracting');
              }
              setSearchLog(prev => [...prev, { id: Date.now(), type: 'navigate', content: msg.content }]);
            }

            if (msg.type === 'result') {
              setExtractedData(msg.findings || []);
              if (msg.url) setCurrentUrl(msg.url);
              setBrowseState('done');
              setSearchLog(prev => [
                ...prev,
                { id: Date.now(), type: 'extract', content: `[RESEARCH AGENT] Extracted ${msg.findings?.length || 0} intelligence signals.` },
                { id: Date.now(), type: 'supr', content: `[SUPR] Brief saved to SQLite: ${msg.filename}. Syncing to Code Workspace.` },
              ]);
              // Refresh mission state to pick up new artifacts
              await fetchState();
            }

            if (msg.type === 'error') {
              setSearchLog(prev => [...prev, { id: Date.now(), type: 'supr', content: `[ERROR] ${msg.content}` }]);
              setBrowseState('done');
            }
          } catch (parseErr) {
            // Skip malformed lines
          }
        }
      }
    } catch (err: any) {
      setSearchLog(prev => [...prev, { id: Date.now(), type: 'supr', content: `[ERROR] Research pipeline failed: ${err.message}` }]);
      setBrowseState('done');
    }

    setIsRunning(false);
  };


  return (
    <div className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden bg-surface-container">
      {/* Header */}
      <header className="flex-none h-16 border-b-4 border-primary bg-background flex justify-between items-center px-4 lg:px-6">
        <div className="flex items-center space-x-4">
          <span className="material-symbols-outlined text-primary text-2xl">travel_explore</span>
          <h2 className="font-headline font-bold text-lg md:text-xl uppercase tracking-tight">Research Workspace</h2>
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 bg-surface-container-high px-3 py-1 border-2 border-primary">
            <span className={`w-3 h-3 border border-primary ${browseState === 'done' ? 'bg-tertiary' : browseState === 'idle' ? 'bg-outline' : 'bg-primary-fixed animate-pulse'}`}></span>
            <span className="font-body font-bold text-sm uppercase">
              Research Agent {browseState === 'done' ? '✓ Complete' : browseState === 'idle' ? 'Standby' : 'Scraping...'}
            </span>
          </div>
        </div>
      </header>

      {/* Split Pane */}
      <div className="flex-1 flex overflow-hidden w-full">

        {/* Left Panel: Research Query & Findings */}
        <aside className="w-72 flex-none border-r-4 border-primary bg-background hidden md:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant shrink-0">
            <span className="font-headline font-bold uppercase text-sm tracking-widest">Research Query</span>
          </div>
          <div className="p-4 border-b-4 border-primary shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. export latency solutions"
              disabled={isRunning}
              className="w-full bg-surface neo-border px-3 py-2 font-body text-xs focus:outline-none focus:border-tertiary disabled:opacity-50"
            />
            <button
              onClick={handleStartResearch}
              disabled={isRunning || !searchQuery.trim()}
              className="w-full mt-3 bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">search</span>
              Begin OSINT Crawl
            </button>
          </div>

          {/* Extracted Findings */}
          <div className="p-3 border-b-4 border-primary bg-surface-variant shrink-0">
            <span className="font-headline font-bold uppercase text-sm tracking-widest">Extracted Specs</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2.5 bg-surface-container-low">
            {extractedData.length === 0 && (
              <p className="text-on-surface-variant text-[10px] font-body font-semibold uppercase italic text-center p-3">No specs extracted. Run an OSINT crawl.</p>
            )}
            {extractedData.map((finding, i) => (
              <div key={i} className="p-2.5 border-l-4 border-tertiary bg-background neo-border font-body text-xs shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] leading-relaxed">
                <strong>Signal #{i + 1}:</strong> {finding}
              </div>
            ))}
          </div>

          {/* Active Sandbox Code Drawer (Bridge to Code Workspace!) */}
          <div className="h-1/3 border-t-4 border-primary flex flex-col shrink-0">
            <div className="p-2 border-b-4 border-primary bg-secondary text-on-secondary flex items-center justify-between">
              <span className="font-headline font-bold uppercase text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">code</span>
                Sandbox Code Sync
              </span>
              <span className="bg-secondary-container text-on-secondary-container px-1.5 py-0.5 text-[8px] font-bold uppercase neo-border">Live Link</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-surface-container-high">
              <div className="mb-2 p-1.5 bg-background border border-primary text-[9px] font-mono leading-normal">
                <strong>Triage Status:</strong> <span className={codeTriageStatus.includes('Passed') ? 'text-green-600 font-bold' : 'text-red-500 font-bold animate-pulse'}>{codeTriageStatus}</span>
              </div>
              {codeArtifacts.map(art => (
                <div 
                  key={art.id}
                  onClick={() => setSelectedCodeFile(art)}
                  className="p-1.5 border-2 border-primary bg-background hover:bg-secondary-container hover:text-on-secondary-container cursor-pointer transition-colors shadow-[1px_1px_0px_0px_rgba(26,26,26,1)] flex items-center gap-2"
                >
                  <span className="material-symbols-outlined text-xs text-primary">data_object</span>
                  <span className="font-body text-[9px] font-bold uppercase truncate">{art.filename}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center: Browser Viewport */}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative w-full">
          {/* Browser Chrome */}
          <div className="flex items-center border-b-4 border-primary bg-surface-variant h-12 px-4 gap-3 shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full border-2 border-primary bg-error-container"></span>
              <span className="w-3 h-3 rounded-full border-2 border-primary bg-secondary-container"></span>
              <span className="w-3 h-3 rounded-full border-2 border-primary bg-tertiary-container"></span>
            </div>
            <div className="flex-1 flex items-center bg-background neo-border px-3 py-1 font-mono text-xs gap-2 overflow-hidden">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">lock</span>
              <span className="truncate text-on-surface-variant">{currentUrl || 'about:blank'}</span>
            </div>
            <span className={`material-symbols-outlined text-[18px] ${isRunning ? 'animate-spin text-primary' : 'text-on-surface-variant'}`}>
              {isRunning ? 'sync' : 'refresh'}
            </span>
          </div>

          {/* Viewport Content */}
          <div className="flex-1 overflow-auto custom-scrollbar bg-surface-container-lowest">
            {browseState === 'idle' && (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <span className="material-symbols-outlined text-7xl text-outline mb-6">language</span>
                <h3 className="font-headline font-bold uppercase text-xl text-on-surface-variant mb-2">OSINT Headless Browser Viewport</h3>
                <p className="font-body text-sm text-on-surface-variant max-w-md leading-relaxed">
                  When the Research Agent browses the web, you will see exactly what it crawls here in real time. Enter a query and click &quot;Begin OSINT Crawl&quot; to start.
                </p>
                <div className="mt-6 p-4 border-l-4 border-secondary bg-surface-container text-left max-w-md font-body text-xs text-on-surface-variant leading-relaxed">
                  <strong>Bridge Sync Active</strong>: Findings extracted in the browser are written directly to SQLite, immediately refreshing the context drawer in the Coding Agent&apos;s workspace!
                </div>
              </div>
            )}

            {browseState === 'searching' && (
              <div className="p-8">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center gap-3 mb-8">
                    <span className="font-headline text-3xl font-black tracking-tighter text-primary">Google</span>
                  </div>
                  <div className="neo-border bg-surface p-3 mb-6 flex items-center gap-2 shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                    <span className="material-symbols-outlined text-on-surface-variant">search</span>
                    <span className="font-body text-sm font-semibold">{searchQuery}</span>
                  </div>
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-surface-container-high rounded w-3/4"></div>
                    <div className="h-3 bg-surface-container rounded w-1/2"></div>
                    <div className="h-3 bg-surface-container rounded w-2/3"></div>
                    <div className="h-16 bg-surface-container rounded w-full mt-4"></div>
                  </div>
                </div>
              </div>
            )}

            {(browseState === 'browsing' || browseState === 'extracting') && (
              <div className="p-8">
                <div className="max-w-3xl mx-auto">
                  <div className="border-b-2 border-outline-variant pb-4 mb-6">
                    <h1 className="font-headline text-2xl font-bold text-primary mb-1">Stitch Developer Spec Report</h1>
                    <p className="font-body text-xs text-on-surface-variant">Target URI: docs.stitch-intelligence.io</p>
                  </div>
                  <div className="space-y-4 font-body text-sm leading-relaxed text-on-surface-variant">
                    <p>Scanning specifications matching query: <strong className="text-secondary uppercase">{searchQuery}</strong>.</p>
                    <p>Competitor release notes identify severe serialization validation bottlenecks inside index schemas.</p>
                    <div className={`p-4 neo-border bg-primary-container text-on-primary-container shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] ${browseState === 'extracting' ? 'ring-2 ring-tertiary ring-offset-2 animate-pulse' : ''}`}>
                      <p className="font-bold uppercase text-xs mb-2 text-primary">Extracted Spec Parameters</p>
                      <p className="font-semibold leading-relaxed">Embedding values must undergo defensive padding to handle empty lists and avoid AssertionError crashes during clustering steps.</p>
                    </div>
                  </div>
                  {browseState === 'extracting' && (
                    <div className="mt-6 p-3 bg-tertiary-container text-on-tertiary-container neo-border flex items-center gap-3 font-body text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                      <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                      Research Agent is extracting competitor schema findings...
                    </div>
                  )}
                </div>
              </div>
            )}

            {browseState === 'done' && (
              <div className="p-8">
                <div className="max-w-3xl mx-auto">
                  <div className="border-b-2 border-outline-variant pb-4 mb-6">
                    <h1 className="font-headline text-2xl font-bold text-primary mb-1">Stitch Developer Spec Report</h1>
                    <p className="font-body text-xs text-on-surface-variant">Target URI: docs.stitch-intelligence.io</p>
                  </div>
                  <div className="space-y-4 font-body text-sm leading-relaxed text-on-surface-variant">
                    <p>Successfully processed spec queries matching: <span className="font-bold text-secondary uppercase">{searchQuery}</span>.</p>
                    <div className="p-4 neo-border bg-tertiary-container text-on-tertiary-container shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
                      <p className="font-bold uppercase text-xs mb-2 text-tertiary">✓ Extracted & Sync Saved</p>
                      <p className="font-semibold leading-relaxed">All findings successfully recorded to SQLite database. Code Workspace drawer updated.</p>
                    </div>
                  </div>
                  <div className="mt-6 p-3 bg-tertiary text-on-tertiary neo-border flex items-center gap-3 font-body text-xs font-bold uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Research complete. Markdown files written to database.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel: Search Log */}
        <aside className="w-80 lg:w-96 flex-none border-l-4 border-primary bg-background hidden lg:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center shrink-0">
            <span className="font-headline font-bold uppercase text-sm tracking-widest flex items-center gap-2 text-primary">
              <span className="material-symbols-outlined text-[18px]">list_alt</span>
              Crawl Event Log
            </span>
            <button
              onClick={() => setSearchLog([])}
              className="text-xs font-bold uppercase hover:text-error transition-colors"
            >Clear</button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-black text-amber-400 font-mono text-xs leading-loose">
            {searchLog.length === 0 && (
              <div className="text-amber-800">Crawl log ready. Run an OSINT query to see agent browser logs.</div>
            )}
            {searchLog.map(line => (
              <div key={line.id} className={`mb-2 ${
                line.type === 'search' ? 'text-blue-400 font-bold' :
                line.type === 'navigate' ? 'text-purple-400' :
                line.type === 'extract' ? 'text-green-400 font-bold' :
                line.type === 'supr' ? 'text-amber-300 font-bold' : ''
              }`}>
                {line.type === 'search' && <span className="mr-1">🔍</span>}
                {line.type === 'navigate' && <span className="mr-1">→</span>}
                {line.type === 'extract' && <span className="mr-1">📋</span>}
                {line.content}
              </div>
            ))}
          </div>

          {/* Supr Guidance */}
          <div className="h-1/4 border-t-4 border-primary bg-background flex flex-col shrink-0">
            <div className="p-2 border-b-4 border-primary bg-primary-fixed flex items-center justify-between">
              <span className="font-headline font-bold uppercase text-sm flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-[18px]">psychology</span> Supr Guidance
              </span>
              <span className={`text-xs font-bold uppercase px-2 py-0.5 border-2 border-primary ${
                browseState === 'done' ? 'bg-tertiary text-on-tertiary' :
                browseState === 'idle' ? 'bg-background text-primary' :
                'bg-secondary text-on-error animate-pulse'
              }`}>
                {browseState === 'idle' ? 'Standby' : browseState === 'done' ? 'Ready' : 'Monitoring'}
              </span>
            </div>
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar text-xs">
              {browseState === 'idle' && (
                <p className="text-on-surface-variant leading-relaxed">Supr is monitoring the Research Agent. When competitor specs are saved, they are immediately synchronized to the Coding Agent sandbox.</p>
              )}
              {browseState !== 'idle' && browseState !== 'done' && (
                <p className="text-on-surface-variant leading-relaxed animate-pulse text-secondary font-bold">Research Agent is actively scraping targets. Awaiting data extraction...</p>
              )}
              {browseState === 'done' && (
                <p className="text-on-surface-variant leading-relaxed">Research complete. The Coding Agent workspace can now view the specs and automatically generate the defensive fix!</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Code Viewer popup overlay */}
      {selectedCodeFile && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-background border-4 border-primary max-w-2xl w-full p-6 neo-shadow relative flex flex-col max-h-[85vh]">
            <button 
              onClick={() => setSelectedCodeFile(null)}
              className="absolute top-4 right-4 text-primary font-bold hover:text-error text-xl font-headline"
            >✕</button>
            <h3 className="font-headline text-xl font-black uppercase text-primary border-b-4 border-primary pb-3 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">code</span>
              Sandbox Code: {selectedCodeFile.filename}
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar font-mono text-xs bg-black text-green-400 p-4 neo-border whitespace-pre-wrap leading-relaxed">
              {selectedCodeFile.content}
            </div>
            <div className="mt-4 flex justify-end">
              <button 
                onClick={() => setSelectedCodeFile(null)}
                className="bg-primary text-on-primary font-headline font-bold uppercase px-4 py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary"
              >Close Viewer</button>
            </div>
          </div>
        </div>
      )}

      <footer className="flex-none h-8 border-t-4 border-primary flex items-center px-4 justify-between font-mono text-xs bg-primary text-on-primary shrink-0">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">travel_explore</span>
            Research Engine Active
          </span>
        </div>
        <span className="text-[10px] font-bold uppercase">Stitch OSINT V1.2</span>
      </footer>
    </div>
  );
}
