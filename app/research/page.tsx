"use client";

import { useState, useEffect } from 'react';
import { fetchMissionState, addArtifactAction, addMemoryItemAction, logActivityAction } from '@/app/actions';
import { Mission } from '@/types';

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

  useEffect(() => {
    async function init() {
      const activeMission = await fetchMissionState();
      if (activeMission) setMission(activeMission);
    }
    init();
  }, []);

  const handleStartResearch = async () => {
    if (isRunning || !searchQuery.trim()) return;
    setIsRunning(true);
    setBrowseState('searching');
    setExtractedData([]);

    // Step 1: Search
    setSearchLog(prev => [...prev, { id: Date.now(), type: 'supr', content: `[SUPR] Assigning Research Agent: "${searchQuery}"` }]);
    setCurrentUrl(`https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`);
    await new Promise(r => setTimeout(r, 1500));

    setSearchLog(prev => [...prev, { id: Date.now(), type: 'search', content: `Searching: "${searchQuery}"` }]);
    await new Promise(r => setTimeout(r, 1200));

    // Step 2: Navigate to result
    setBrowseState('browsing');
    const fakeUrl = 'https://docs.example.com/api/export-latency-report';
    setCurrentUrl(fakeUrl);
    setSearchLog(prev => [
      ...prev,
      { id: Date.now(), type: 'navigate', content: `Navigating to: ${fakeUrl}` },
    ]);
    await new Promise(r => setTimeout(r, 2000));

    // Step 3: Extract
    setBrowseState('extracting');
    setSearchLog(prev => [
      ...prev,
      { id: Date.now(), type: 'extract', content: 'Extracting relevant content from page...' },
    ]);
    await new Promise(r => setTimeout(r, 1500));

    const findings = [
      'Export latency averages 4.2s for JSON payloads > 50MB',
      'Bottleneck identified in serialization layer, not network I/O',
      'Recommended fix: streaming JSON encoder (est. 60% improvement)',
    ];
    setExtractedData(findings);

    setSearchLog(prev => [
      ...prev,
      { id: Date.now(), type: 'supr', content: `[RESEARCH AGENT] Extracted ${findings.length} findings. Returning to Supr.` },
    ]);

    if (mission) {
      // Save findings as a markdown artifact
      await addArtifactAction(mission.id, {
        filename: `research_${searchQuery.replace(/\s+/g, '_')}.md`,
        type: 'markdown',
        content: `# Research Findings: ${searchQuery}\n\n${findings.map(f => `- ${f}`).join('\n')}`
      });

      // Save high-importance findings to Memory Items
      for (const finding of findings) {
        await addMemoryItemAction(mission.id, {
          key: 'research_finding',
          value: finding,
          importance: 'High'
        });
      }

      await logActivityAction(mission.id, {
        eventType: 'agent_action',
        actor: 'Research Agent',
        actorIcon: 'travel_explore',
        summary: `Completed research for: ${searchQuery}`,
        detail: `Extracted ${findings.length} key findings and added them to mission memory.`
      });
    }

    setBrowseState('done');
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
              Research Agent {browseState === 'done' ? '✓ Done' : browseState === 'idle' ? 'Standby' : 'Active'}
            </span>
          </div>
        </div>
      </header>

      {/* Split Pane */}
      <div className="flex-1 flex overflow-hidden w-full">

        {/* Left: Search Panel */}
        <aside className="w-48 lg:w-72 flex-none border-r-4 border-primary bg-background hidden md:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant">
            <span className="font-headline font-bold uppercase text-sm tracking-widest">Research Query</span>
          </div>
          <div className="p-4 border-b-4 border-primary">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="e.g. export latency solutions"
              disabled={isRunning}
              className="w-full bg-surface neo-border px-3 py-2 font-body text-sm focus:outline-none focus:border-tertiary disabled:opacity-50"
            />
            <button
              onClick={handleStartResearch}
              disabled={isRunning || !searchQuery.trim()}
              className="w-full mt-3 bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-sm hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <span className="material-symbols-outlined text-[18px]">search</span>
              Begin Research
            </button>
          </div>

          {/* Extracted Findings */}
          <div className="p-3 border-b-4 border-primary bg-surface-variant">
            <span className="font-headline font-bold uppercase text-sm tracking-widest">Findings</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
            {extractedData.length === 0 && (
              <p className="text-on-surface-variant text-xs font-body">No findings yet. Run a research query.</p>
            )}
            {extractedData.map((finding, i) => (
              <div key={i} className="p-2 border-l-4 border-tertiary bg-surface font-body text-xs">
                <strong>#{i + 1}:</strong> {finding}
              </div>
            ))}
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
                <h3 className="font-headline font-bold uppercase text-xl text-on-surface-variant mb-2">Browser Viewport</h3>
                <p className="font-body text-sm text-on-surface-variant max-w-md">
                  When the Research Agent browses the web, you will see exactly what it sees here in real time. Enter a query and click &quot;Begin Research&quot; to start.
                </p>
                <p className="font-body text-xs text-on-surface-variant mt-4 border-t border-outline-variant pt-4 max-w-sm">
                  Future: Powered by a headless browser (Puppeteer/Playwright) running as a real human-like session to avoid detection.
                </p>
              </div>
            )}

            {browseState === 'searching' && (
              <div className="p-8">
                <div className="max-w-2xl mx-auto">
                  <div className="flex items-center gap-3 mb-8">
                    <span className="font-headline text-3xl font-black tracking-tighter text-primary">Google</span>
                  </div>
                  <div className="neo-border bg-surface p-3 mb-6 flex items-center gap-2">
                    <span className="material-symbols-outlined text-on-surface-variant">search</span>
                    <span className="font-body text-sm">{searchQuery}</span>
                  </div>
                  <div className="space-y-4 animate-pulse">
                    <div className="h-4 bg-surface-container-high rounded w-3/4"></div>
                    <div className="h-3 bg-surface-container rounded w-1/2"></div>
                    <div className="h-3 bg-surface-container rounded w-2/3"></div>
                    <div className="h-16 bg-surface-container rounded w-full mt-4"></div>
                    <div className="h-16 bg-surface-container rounded w-full"></div>
                  </div>
                </div>
              </div>
            )}

            {(browseState === 'browsing' || browseState === 'extracting') && (
              <div className="p-8">
                <div className="max-w-3xl mx-auto">
                  <div className="border-b-2 border-outline-variant pb-4 mb-6">
                    <h1 className="font-headline text-2xl font-bold text-primary mb-1">Export Latency Performance Report</h1>
                    <p className="font-body text-xs text-on-surface-variant">docs.example.com — Last updated 3 weeks ago</p>
                  </div>
                  <div className="space-y-4 font-body text-sm leading-relaxed text-on-surface-variant">
                    <p>Our internal benchmarks show that JSON export operations experience significant latency when payload sizes exceed <strong className="text-primary">50MB</strong>.</p>
                    <p>The primary bottleneck has been identified in the <code className="bg-surface-container-high px-1 neo-border text-primary">serialization layer</code>, not in network I/O as previously assumed.</p>
                    <div className={`p-4 neo-border bg-primary-container text-on-primary-container ${browseState === 'extracting' ? 'ring-2 ring-tertiary ring-offset-2 animate-pulse' : ''}`}>
                      <p className="font-bold uppercase text-xs mb-2">Key Finding</p>
                      <p>Switching to a streaming JSON encoder reduced export times by an estimated <strong>60%</strong> in staging environments.</p>
                    </div>
                    <p>Further testing is recommended before production deployment. Edge cases include nested arrays with circular references and binary blob fields.</p>
                  </div>
                  {browseState === 'extracting' && (
                    <div className="mt-6 p-3 bg-tertiary-container text-on-tertiary-container neo-border flex items-center gap-3 font-body text-xs font-bold uppercase">
                      <span className="material-symbols-outlined animate-spin text-[16px]">sync</span>
                      Research Agent is extracting relevant data...
                    </div>
                  )}
                </div>
              </div>
            )}

            {browseState === 'done' && (
              <div className="p-8">
                <div className="max-w-3xl mx-auto">
                  <div className="border-b-2 border-outline-variant pb-4 mb-6">
                    <h1 className="font-headline text-2xl font-bold text-primary mb-1">Export Latency Performance Report</h1>
                    <p className="font-body text-xs text-on-surface-variant">docs.example.com — Last updated 3 weeks ago</p>
                  </div>
                  <div className="space-y-4 font-body text-sm leading-relaxed text-on-surface-variant">
                    <p>Our internal benchmarks show that JSON export operations experience significant latency when payload sizes exceed <strong className="text-primary">50MB</strong>.</p>
                    <p>The primary bottleneck has been identified in the <code className="bg-surface-container-high px-1 neo-border text-primary">serialization layer</code>, not in network I/O as previously assumed.</p>
                    <div className="p-4 neo-border bg-tertiary-container text-on-tertiary-container">
                      <p className="font-bold uppercase text-xs mb-2">✓ Extracted</p>
                      <p>Switching to a streaming JSON encoder reduced export times by an estimated <strong>60%</strong> in staging environments.</p>
                    </div>
                  </div>
                  <div className="mt-6 p-3 bg-tertiary text-on-tertiary neo-border flex items-center gap-3 font-body text-xs font-bold uppercase">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    Research complete. Findings returned to Supr.
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Search Log */}
        <aside className="w-80 lg:w-96 flex-none border-l-4 border-primary bg-background hidden lg:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center">
            <span className="font-headline font-bold uppercase text-sm tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">list_alt</span>
              Search Log
            </span>
            <button
              onClick={() => setSearchLog([])}
              className="text-xs font-bold uppercase hover:text-error transition-colors"
            >Clear</button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-surface-tint text-[#f5f0e8] font-mono text-xs leading-loose">
            {searchLog.length === 0 && (
              <div className="text-[#f5f0e8]/50">Search log ready. Begin a research query to see agent activity.</div>
            )}
            {searchLog.map(line => (
              <div key={line.id} className={`mb-2 ${
                line.type === 'search' ? 'text-tertiary font-bold' :
                line.type === 'navigate' ? 'text-primary-fixed' :
                line.type === 'extract' ? 'text-secondary font-bold' :
                line.type === 'supr' ? 'text-primary-fixed font-bold' : ''
              }`}>
                {line.type === 'search' && <span className="mr-1">🔍</span>}
                {line.type === 'navigate' && <span className="mr-1">→</span>}
                {line.type === 'extract' && <span className="mr-1">📋</span>}
                {line.content}
              </div>
            ))}
          </div>

          {/* Supr Guidance */}
          <div className="h-1/4 border-t-4 border-primary bg-background flex flex-col">
            <div className="p-2 border-b-4 border-primary bg-primary-fixed flex items-center justify-between">
              <span className="font-headline font-bold uppercase text-sm flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-[18px]">psychology</span> Supr Guidance
              </span>
              <span className={`text-xs font-bold uppercase px-2 py-0.5 border-2 border-primary ${
                browseState === 'done' ? 'bg-tertiary text-on-tertiary' :
                browseState === 'idle' ? 'bg-background text-primary' :
                'bg-secondary text-on-error animate-pulse'
              }`}>
                {browseState === 'idle' ? 'Standby' : browseState === 'done' ? 'Complete' : 'Monitoring'}
              </span>
            </div>
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar text-sm">
              {browseState === 'idle' && (
                <p className="text-on-surface-variant">Supr will monitor the Research Agent&apos;s browsing activity and validate findings before they are committed to mission memory.</p>
              )}
              {browseState !== 'idle' && browseState !== 'done' && (
                <p className="text-on-surface-variant">Research Agent is actively browsing. Supr is validating that browsing stays within the mission&apos;s permission scope (<strong>Observe + Draft</strong>).</p>
              )}
              {browseState === 'done' && (
                <p className="text-on-surface-variant">Research complete. <strong>{extractedData.length} findings</strong> extracted and passed to Supr for integration into the mission context.</p>
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer className={`flex-none h-8 border-t-4 border-primary flex items-center px-4 justify-between font-mono text-xs ${browseState === 'done' ? 'bg-tertiary text-on-tertiary' : 'bg-primary text-on-primary'}`}>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">{browseState === 'done' ? 'check_circle' : 'public'}</span>
            {browseState === 'done' ? 'Research Complete' : 'Browser Ready'}
          </span>
          {browseState !== 'idle' && browseState !== 'done' && (
            <span className="flex items-center gap-1 text-primary-fixed">
              <span className="material-symbols-outlined text-[14px]">sync</span> Research Agent Browsing...
            </span>
          )}
        </div>
      </footer>
    </div>
  );
}
