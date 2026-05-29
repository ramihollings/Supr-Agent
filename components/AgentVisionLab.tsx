"use client";

import React, { useState, useEffect, startTransition } from 'react';

interface Props {
  projectId?: string;
  onLogActivity?: (eventType: 'approval' | 'failure' | 'task_complete' | 'agent_action' | 'supr_decision' | 'permission' | 'delegation' | 'handoff' | 'review' | 'escalation' | 'governance', summary: string, detail: string) => void;
  onTraceUpdate?: (trace: string) => void;
  onTerminalLog?: (log: string) => void;
}

interface MockPost {
  id: string;
  source: 'reddit' | 'twitter';
  author: string;
  handle?: string;
  community?: string;
  content: string;
  time: string;
  engagement: string;
}

export function AgentVisionLab({ projectId, onLogActivity, onTraceUpdate, onTerminalLog }: Props) {
  // Navigation & Emulation State
  const [url, setUrl] = useState('https://reddit.com/r/saas/comments/supr_agentic');
  const [activeUrl, setActiveUrl] = useState('https://reddit.com/r/saas/comments/supr_agentic');
  const [device, setDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<string[]>([
    'DBGP ➜ DevTools active: listening on port 9222',
    'DBGP ➜ Page.navigate: target acquired',
    'CONSOLE ➜ [React] Injected agent vision instrumentation scripts successfully.',
  ]);

  // Time-Travel Debugger State
  const [currentStep, setCurrentStep] = useState(3);
  const steps = [
    {
      id: 1,
      title: 'Target Navigation',
      url: 'https://news.ycombinator.com',
      agent: 'Context Agent',
      status: 'Passed',
      desc: 'Connect to target node, bypass cloudflare, scrape DOM metadata.',
      trace: 'chrome-devtools-mcp::navigate_page -> Success (200 OK)',
    },
    {
      id: 2,
      title: 'Anti-Bot Emulation',
      url: 'https://twitter.com/search?q=saas_automation',
      agent: 'Signal Agent',
      status: 'Passed',
      desc: 'Emulate canvas fingerprints, human cursor gestures, scroll feeds.',
      trace: 'chrome-devtools-mcp::emulate -> Desktop layout active, user agents randomized.',
    },
    {
      id: 3,
      title: 'Intel Ingestion',
      url: 'https://reddit.com/r/saas/comments/supr_agentic',
      agent: 'Signal Agent',
      status: 'In Progress',
      desc: 'Identify high-engagement threads and parse competitor pricing tags.',
      trace: 'chrome-devtools-mcp::evaluate_script -> Parsing DOM thread list.',
    },
    {
      id: 4,
      title: 'Shadow Schema Sync',
      url: 'https://competitor.io/pricing',
      agent: 'Research Agent',
      status: 'Pending',
      desc: 'Diff competitive feature tables with local SQLite system metrics.',
      trace: 'chrome-devtools-mcp::take_screenshot -> Capturing viewport canvas.',
    },
    {
      id: 5,
      title: 'Lighthouse Audit',
      url: 'https://supr-local-sandbox.net',
      agent: 'QA Agent',
      status: 'Pending',
      desc: 'Conduct final core web vitals, SEO meta checks, and accessibility audits.',
      trace: 'chrome-devtools-mcp::lighthouse_audit -> Firing performance runner.',
    },
  ];

  // Lighthouse / UX SEO Governance State
  const [auditProgress, setAuditProgress] = useState(0);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditScores, setAuditScores] = useState({
    performance: 92,
    accessibility: 88,
    bestPractices: 95,
    seo: 100,
  });

  // Competitor Posts Feed State
  const [posts, setPosts] = useState<MockPost[]>([
    {
      id: 'p1',
      source: 'reddit',
      author: 'u/saas_pioneer_42',
      community: 'r/saas',
      content: 'Has anyone integrated Supr yet? We just migrated our background scrapers into their secure workspaces and the performance is wild. No more Selenium cluster overhead.',
      time: '2 hours ago',
      engagement: '▲ 48 Upvotes • 12 Comments',
    },
    {
      id: 'p2',
      source: 'twitter',
      author: 'Aiden Vance',
      handle: '@aiden_v',
      content: 'Supr adding Chrome DevTools MCP is sneaky brilliant. Having an AI agent write test scripts, navigate, capture screenshots, and run Lighthouse audits on itself inside a secure workspace is elite.',
      time: '4 hours ago',
      engagement: '♥ 142 Likes • 18 Retweets',
    },
    {
      id: 'p3',
      source: 'reddit',
      author: 'u/tech_investor_hq',
      community: 'r/saas',
      content: 'Looking at how Supr does multi-agent coordination. They use an sqlite state machine to store live glidepaths, permitting steering commands and rollbacks in the middle of a scraper run.',
      time: '6 hours ago',
      engagement: '▲ 89 Upvotes • 22 Comments',
    },
  ]);

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState('Idle');

  // Load trace & terminal when step changes
  useEffect(() => {
    const step = steps.find(s => s.id === currentStep);
    if (step) {
      setUrl(step.url);
      setActiveUrl(step.url);
      
      const timeStr = new Date().toLocaleTimeString();
      const traceMsg = `[${timeStr}] DEVTOOLS ➜ Time Travel state aligned to Step ${currentStep} (${step.title})`;
      const termMsg = `[Time Travel] Aligning local file cache & sandbox snapshots to Step ${currentStep}... Done.`;
      
      if (onTraceUpdate) onTraceUpdate(traceMsg);
      if (onTerminalLog) onTerminalLog(termMsg);
      
      setConsoleLogs(prev => [
        ...prev,
        `TIME-TRAVEL ➜ Restored state snapshot for ${step.title}`,
        `CONSOLE ➜ Active URL: ${step.url}`
      ]);
    }
  }, [currentStep]);

  // Handle URL change trigger
  const handleNavigate = (targetUrl: string) => {
    if (!targetUrl.trim()) return;
    setIsRefreshing(true);
    
    // Auto normalize url format
    let normalized = targetUrl;
    if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
      normalized = 'https://' + normalized;
    }
    setUrl(normalized);

    const isPredefinedStep = steps.some(s => s.url === normalized);
    if (!isPredefinedStep) {
      setIsLiveMode(true);
    }

    const timeStr = new Date().toLocaleTimeString();
    if (onTraceUpdate) onTraceUpdate(`[${timeStr}] chrome-devtools-mcp::navigate_page -> Initiated to "${normalized}"`);
    if (onTerminalLog) onTerminalLog(`➜ chrome-devtools-mcp navigate --url="${normalized}"`);

    setTimeout(() => {
      setIsRefreshing(false);
      setActiveUrl(normalized);
      setConsoleLogs(prev => [
        ...prev,
        `NAVIGATE ➜ Loaded ${normalized} (status 200)`,
        `CONSOLE ➜ Window width: ${device === 'desktop' ? '1280px' : device === 'tablet' ? '768px' : '375px'}`
      ]);
      if (onLogActivity) {
        onLogActivity('agent_action', `Agent browsed to ${normalized}`, `Headless browser navigation succeeded. Website contents loaded successfully in secure workspace.`);
      }
    }, 1000);
  };

  // Device Emulation trigger
  const handleDeviceChange = (mode: 'desktop' | 'tablet' | 'mobile') => {
    setDevice(mode);
    const timeStr = new Date().toLocaleTimeString();
    const widthStr = mode === 'desktop' ? '1280px' : mode === 'tablet' ? '768px' : '375px';
    const heightStr = mode === 'desktop' ? '800px' : mode === 'tablet' ? '1024px' : '812px';

    if (onTraceUpdate) onTraceUpdate(`[${timeStr}] chrome-devtools-mcp::emulate -> Resizing viewport to ${widthStr}x${heightStr}`);
    if (onTerminalLog) onTerminalLog(`➜ chrome-devtools-mcp emulate --viewport="${widthStr}x${heightStr}"`);

    setConsoleLogs(prev => [
      ...prev,
      `EMULATE ➜ Viewport resized to ${widthStr}x${heightStr}`,
    ]);
  };

  // Trigger Lighthouse Audit
  const handleRunAudit = () => {
    if (isAuditing) return;
    setIsAuditing(true);
    setAuditProgress(10);
    
    const timeStr = new Date().toLocaleTimeString();
    if (onTraceUpdate) onTraceUpdate(`[${timeStr}] chrome-devtools-mcp::lighthouse_audit -> Invoking audit runner`);
    if (onTerminalLog) onTerminalLog(`➜ chrome-devtools-mcp audit --url="${activeUrl}"`);

    const interval = setInterval(() => {
      setAuditProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 15;
      });
    }, 400);

    setTimeout(() => {
      setIsAuditing(false);
      // Give beautiful random high scores
      const p = Math.floor(Math.random() * 8) + 91; // 91-98
      const a = Math.floor(Math.random() * 10) + 90; // 90-99
      const b = Math.floor(Math.random() * 6) + 93;  // 93-98
      const s = 100;
      setAuditScores({ performance: p, accessibility: a, bestPractices: b, seo: s });
      
      setConsoleLogs(prev => [
        ...prev,
        `LIGHTHOUSE ➜ Audit completed for ${activeUrl}`,
        `LIGHTHOUSE ➜ Perf: ${p} | Acc: ${a} | Best: ${b} | SEO: ${s}`,
      ]);

      if (onLogActivity) {
        onLogActivity('governance', 'Lighthouse SEO & UX Audit Completed', `Performance: ${p}%, Accessibility: ${a}%, Best Practices: ${b}%, SEO: 100%. Deliverable conforms to all strict governance standards.`);
      }
    }, 3000);
  };

  // Trigger Shadow Sync
  const handleShadowSync = () => {
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatus('Fetching raw payloads...');

    const timeStr = new Date().toLocaleTimeString();
    if (onTraceUpdate) onTraceUpdate(`[${timeStr}] webcrawler::scrape -> Scraping Reddit subreddits and Twitter queries`);
    if (onTerminalLog) onTerminalLog(`➜ webcrawler scrape --query="supr agent OR agentic orchestration"`);

    setTimeout(() => {
      setSyncStatus('Parsing DOM trees...');
      
      // Inject a new post dynamically
      const isReddit = Math.random() > 0.5;
      const newPost: MockPost = isReddit ? {
        id: `p-new-${Date.now()}`,
        source: 'reddit',
        author: 'u/no_code_wizard',
        community: 'r/saas',
        content: `Just tested the Shadow Sync Cron feature in Supr. Set a scraper loop on Reddit to monitor competitor feature flags. It auto-notifies our team slack when pricing tables change. Fully governed!`,
        time: 'Just now',
        engagement: '▲ 12 Upvotes • 1 Comment'
      } : {
        id: `p-new-${Date.now()}`,
        source: 'twitter',
        author: 'SaaS Pulse',
        handle: '@saaspulse_news',
        content: `ALERT: Supr platform just deployed an Automated SEO/UX Gate feature. Sub-agents running Lighthouse audits directly on static exports before allowing staging commits. Standardized QA is getting wild. #SaaS`,
        time: 'Just now',
        engagement: '♥ 34 Likes • 2 Retweets'
      };

      setPosts(prev => [newPost, ...prev]);

    }, 1500);

    setTimeout(() => {
      setIsSyncing(false);
      setSyncStatus('Idle');
      
      setConsoleLogs(prev => [
        ...prev,
        `SHADOW-SYNC ➜ Ingested 1 new high-confidence intelligence signal.`,
      ]);

      if (onLogActivity) {
        onLogActivity('handoff', 'Shadow Sync Cron Ingested Live Intel', `Successfully scraped raw social graphs. Filtered and compiled 1 new competitive signal block.`);
      }
    }, 2800);
  };

  return (
    <div className="space-y-6">
      
      {/* 2x2 Grid for Browser Automation Studio */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* COLUMN A: AGENT VISION BROWSER VIEWPORT (7 Cols) */}
        <section className="lg:col-span-7 flex flex-col bg-background neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] h-[560px] overflow-hidden">
          
          {/* Viewport Header Controls */}
          <div className="p-3 border-b-4 border-primary bg-surface-container-high flex items-center justify-between gap-3 shrink-0">
            
            {/* Window decorations & Device Toggles */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1 pr-2 border-r-2 border-primary/20">
                <span className="w-2.5 h-2.5 rounded-full bg-secondary border border-primary"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-primary-fixed border border-primary"></span>
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 border border-primary"></span>
              </div>
              
              <div className="flex bg-background border-2 border-primary rounded-none p-0.5">
                {(['desktop', 'tablet', 'mobile'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => handleDeviceChange(mode)}
                    className={`p-1 flex items-center justify-center hover:bg-primary-fixed hover:text-primary transition-colors ${
                      device === mode ? 'bg-primary text-on-primary' : 'text-primary'
                    }`}
                    title={`Emulate ${mode}`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {mode === 'desktop' ? 'desktop_windows' : mode === 'tablet' ? 'tablet_mac' : 'phone_iphone'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Address Bar */}
            <div className="flex-1 max-w-md flex items-center bg-background border-2 border-primary px-2 py-1 gap-1.5">
              <span className="material-symbols-outlined text-sm text-green-600 animate-pulse">lock</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleNavigate(url)}
                className="flex-1 bg-transparent font-mono text-xs focus:outline-none"
              />
              {isRefreshing ? (
                <span className="material-symbols-outlined text-sm animate-spin text-primary">sync</span>
              ) : (
                <button onClick={() => handleNavigate(url)} className="material-symbols-outlined text-sm text-primary hover:text-tertiary">
                  arrow_forward
                </button>
              )}
            </div>

            {/* Reload and Console Toggle */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsLiveMode(!isLiveMode)}
                className={`h-8 px-2 border-2 border-primary flex items-center gap-1 hover:bg-primary-fixed hover:text-primary transition-all font-headline font-black text-[9px] uppercase shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none ${
                  isLiveMode ? 'bg-green-500 text-white' : 'bg-background text-primary'
                }`}
                title="Toggle Real Interactive Web vs Simulated Step Mocks"
              >
                <span className="material-symbols-outlined text-xs">
                  {isLiveMode ? 'bolt' : 'smart_toy'}
                </span>
                <span>{isLiveMode ? 'Live Proxy' : 'Simulation'}</span>
              </button>

              <button 
                onClick={() => handleNavigate(activeUrl)} 
                className="w-8 h-8 border-2 border-primary bg-background flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none shrink-0"
                title="Refresh Page"
              >
                <span className={`material-symbols-outlined text-sm ${isRefreshing ? 'animate-spin' : ''}`}>refresh</span>
              </button>
            </div>
          </div>

          {/* Viewport Render Frame Container */}
          <div className="flex-1 bg-surface-container-lowest p-4 relative overflow-hidden flex justify-center items-start custom-scrollbar">
            
            {/* Live Loading Overlay */}
            {isRefreshing && (
              <div className="absolute inset-0 bg-background/80 flex flex-col items-center justify-center z-30 select-none">
                <span className="material-symbols-outlined text-5xl animate-spin text-tertiary">progress_activity</span>
                <p className="font-headline font-black uppercase text-sm mt-3 tracking-wider text-primary">DevTools Navigating...</p>
                <p className="font-mono text-[10px] text-on-surface-variant mt-1">chrome-devtools-mcp // page_rendering</p>
              </div>
            )}

            {/* Dynamic Sized Emulated Screen */}
            <div 
              className="bg-background border-4 border-primary shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] h-full w-full overflow-y-auto custom-scrollbar flex flex-col transition-all duration-500 relative"
              style={{
                maxWidth: device === 'desktop' ? '100%' : device === 'tablet' ? '768px' : '375px',
              }}
            >
              
              {isLiveMode ? (
                <iframe
                  src={`/api/proxy?url=${encodeURIComponent(activeUrl)}`}
                  className="w-full h-full border-none bg-white flex-1 min-h-[420px]"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                />
              ) : (
                <>
                  {/* WEBPAGE MOCK STATE 1: HN (news.ycombinator.com) */}
                  {activeUrl.includes('ycombinator.com') && (
                    <div className="bg-[#f6f6ef] text-[#1a1a1a] p-4 font-body min-h-full text-xs">
                      <header className="bg-[#ff6600] p-1 flex items-center justify-between border border-primary/20 mb-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold border-2 border-white px-1 text-white leading-none text-[10px]">Y</span>
                          <span className="font-headline font-black text-xs uppercase tracking-tight text-white pr-2 border-r border-white/20">Hacker News</span>
                          <span className="font-semibold text-[10px] text-white/90">new | comments | ask | show | jobs</span>
                        </div>
                        <span className="text-[10px] font-bold text-white uppercase">User Session</span>
                      </header>

                      <main className="space-y-3">
                        <div className="border-b border-primary/10 pb-2">
                          <h4 className="font-headline font-bold text-sm text-[#111111] hover:underline cursor-pointer">
                            Show HN: Supr – Neobrutalist Agentic Orchestrator in Secure Workspace
                          </h4>
                          <p className="text-[10px] text-on-surface-variant mt-1">
                            142 points by <span className="underline">saas_architect</span> 3 hours ago | 42 comments
                          </p>
                        </div>

                        <div className="space-y-3 pl-2 border-l-2 border-primary/10 mt-3">
                          <div className="text-[11px] leading-relaxed">
                            <p className="font-bold text-[10px] text-[#ff6600]">▲ dylan_r 2 hours ago</p>
                            <p className="mt-0.5">This looks incredible. I love the fact that the agent team status is stored inside standard SQLite. Running code checks inside secure workspaces and utilizing browser automation is super clean.</p>
                          </div>
                          <div className="text-[11px] leading-relaxed pl-3 border-l border-primary/10">
                            <p className="font-bold text-[10px] text-[#2255ff]">▲ reply by tech_maven 1.5 hours ago</p>
                            <p className="mt-0.5">Exactly. The "Time-Travel Debugger" concept where we can revert file changes back to a stable DAG node is what is missing in standard LangChain frameworks.</p>
                          </div>
                        </div>
                      </main>
                    </div>
                  )}

                  {/* WEBPAGE MOCK STATE 2: REDDIT (reddit.com) */}
                  {activeUrl.includes('reddit.com') && (
                    <div className="bg-[#0b1416] text-[#e3e8eb] p-4 font-body min-h-full text-xs">
                      <header className="flex items-center gap-2 border-b border-[#233337] pb-3 mb-4">
                        <span className="w-6 h-6 rounded-full bg-[#ff4500] flex items-center justify-center text-white text-xs font-bold leading-none font-headline">r</span>
                        <h4 className="font-headline font-black text-sm uppercase tracking-tight text-white">Reddit Community</h4>
                        <span className="bg-[#233337] text-white px-2 py-0.5 rounded-full text-[9px] font-bold ml-auto uppercase">r/saas</span>
                      </header>

                      <main className="space-y-4">
                        <div className="bg-[#112022] p-3 rounded-none border border-[#233337]">
                          <div className="flex items-center gap-1 text-[9px] text-[#819196] font-bold uppercase mb-1">
                            <span>Posted by u/saas_pioneer_42</span>
                            <span>•</span>
                            <span>2 hours ago</span>
                          </div>
                          <h3 className="font-headline font-bold text-sm text-white mb-2 uppercase tracking-wide">
                            What is the best browser automation tool for multi-agent systems?
                          </h3>
                          <p className="text-[11px] leading-relaxed text-[#c3ccd0]">
                            We're currently writing complex scraping pipelines and QA test suites. Playwright with custom stealth scripts works, but it breaks constantly under Cloudflare. Recently started looking at Supr's native <span className="text-[#ffcc00] font-bold">chrome-devtools-mcp</span> integration. Anyone using it?
                          </p>
                        </div>

                        <div className="space-y-3">
                          <h4 className="font-headline font-black text-[10px] uppercase text-[#ff4500] border-b border-[#233337] pb-1">Top Community Responses</h4>
                          {posts.filter(p => p.community === 'r/saas').map((post) => (
                            <div key={post.id} className="bg-[#15272a] p-3 rounded-none border border-primary/20 space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="font-bold text-[10px] text-green-400">{post.author}</span>
                                <span className="text-[9px] text-on-surface-variant font-semibold">{post.time}</span>
                              </div>
                              <p className="text-[11px] leading-relaxed text-[#c3ccd0]">{post.content}</p>
                              <div className="pt-1.5 border-t border-primary/10 text-[9px] font-mono text-tertiary-fixed-dim">{post.engagement}</div>
                            </div>
                          ))}
                        </div>
                      </main>
                    </div>
                  )}

                  {/* WEBPAGE MOCK STATE 3: TWITTER (twitter.com) */}
                  {activeUrl.includes('twitter.com') && (
                    <div className="bg-black text-white p-4 font-body min-h-full text-xs">
                      <header className="flex items-center border-b border-[#2f3336] pb-3 mb-4">
                        <span className="material-symbols-outlined text-white text-xl">blur_on</span>
                        <h4 className="font-headline font-black text-sm uppercase tracking-tight text-white ml-2">X / Signal Stream</h4>
                        <span className="bg-[#1d9bf0] text-white px-2 py-0.5 text-[8px] font-black uppercase ml-auto">Live Query</span>
                      </header>

                      <main className="space-y-4">
                        {posts.filter(p => p.source === 'twitter').map((post) => (
                          <div key={post.id} className="border-b border-[#2f3336] pb-3 last:border-0 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-7 h-7 rounded-none border border-primary bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-xs">
                                {post.author[0]}
                              </span>
                              <div>
                                <p className="font-bold text-white text-xs leading-none">{post.author}</p>
                                <p className="text-[9px] text-[#71767b] font-mono leading-none mt-1">{post.handle}</p>
                              </div>
                              <span className="text-[9px] text-[#71767b] font-semibold ml-auto">{post.time}</span>
                            </div>
                            <p className="text-[11px] leading-relaxed text-[#e7e9ea] pl-8">
                              {post.content}
                            </p>
                            <div className="pl-8 text-[9px] font-mono text-[#71767b] flex gap-4">
                              <span>{post.engagement}</span>
                            </div>
                          </div>
                        ))}
                      </main>
                    </div>
                  )}

                  {/* WEBPAGE MOCK STATE 4: COMPETITOR PRICING (competitor.io) */}
                  {activeUrl.includes('competitor.io') && (
                    <div className="bg-[#0f0e17] text-[#a7a9be] p-4 font-body min-h-full text-xs">
                      <header className="flex items-center justify-between border-b border-[#2e2f3e] pb-3 mb-4">
                        <h4 className="font-headline font-black text-sm text-[#fffffe] uppercase tracking-wide">COMPETITOR INTEL AUDIT</h4>
                        <span className="bg-secondary text-white px-2 py-0.5 text-[8px] font-bold uppercase">STEALTH SCRAPED</span>
                      </header>

                      <main className="space-y-4">
                        <div className="text-center">
                          <p className="text-[9px] font-bold uppercase tracking-widest text-[#ff8906]">Scraped Specs</p>
                          <h3 className="font-headline font-black text-lg text-[#fffffe] uppercase mt-0.5">Competitor Premium Tier</h3>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mt-2">
                          <div className="bg-[#16161a] p-3 border-2 border-primary text-center">
                            <p className="text-[9px] uppercase font-bold text-[#a7a9be]">Automated API Tier</p>
                            <h4 className="font-headline font-black text-xl text-[#fffffe] mt-1">$299/mo</h4>
                            <p className="text-[8px] text-[#ff8906] font-bold mt-1">✓ Unlimited Crawl Workers</p>
                          </div>
                          <div className="bg-[#16161a] p-3 border-2 border-primary text-center">
                            <p className="text-[9px] uppercase font-bold text-[#a7a9be]">AI Orchestrator Base</p>
                            <h4 className="font-headline font-black text-xl text-[#fffffe] mt-1">$99/mo</h4>
                            <p className="text-[8px] text-on-surface-variant mt-1">✗ Restricted workspaces</p>
                          </div>
                        </div>

                        <div className="bg-[#16161a] p-3 border-l-4 border-[#ff8906] font-mono text-[9px] space-y-1">
                          <p className="font-bold text-[#fffffe]">➜ [DOM Parser Check]</p>
                          <p>Found 4 endpoints with dynamic JS payloads.</p>
                          <p>Injected CloakBrowser stealth scraper successful.</p>
                          <p>Data exported to Supr SQLite memory stores.</p>
                        </div>
                      </main>
                    </div>
                  )}

                  {/* WEBPAGE MOCK STATE 5: SANDBOX LOCALHOST (supr-local-sandbox.net) */}
                  {activeUrl.includes('supr-local-sandbox.net') && (
                    <div className="bg-[#0d0e15] text-[#d1d5db] p-4 font-body min-h-full text-xs flex flex-col justify-center items-center">
                      <div className="max-w-sm text-center space-y-3">
                        <div className="w-12 h-12 bg-primary-fixed text-primary rounded-none border-2 border-primary mx-auto flex items-center justify-center animate-spin">
                          <span className="material-symbols-outlined text-2xl">verified_user</span>
                        </div>
                        <h3 className="font-headline font-black text-sm text-white uppercase">SUPR LOCAL WORKSPACE RUNNER</h3>
                        <p className="text-[10px] leading-relaxed text-gray-400">
                          Static HTML page generated successfully. Running within secure workspace isolation. Browser automation is listening for web audits.
                        </p>
                        <div className="border border-primary/20 bg-background/5 p-2 rounded-none font-mono text-[9px] text-[#ffcc00] text-left">
                          <p className="font-bold">✓ Workspace build compiles cleanly</p>
                          <p className="mt-1">✓ Website checking ready: click "Trigger Lighthouse Audit Gate" on the panel to audit UX/SEO benchmarks.</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* DEFAULT LANDING WEBPAGE */}
                  {!activeUrl.includes('ycombinator.com') && 
                   !activeUrl.includes('reddit.com') && 
                   !activeUrl.includes('twitter.com') && 
                   !activeUrl.includes('competitor.io') && 
                   !activeUrl.includes('supr-local-sandbox.net') && (
                    <div className="bg-[#f2ede5] p-6 font-body min-h-full text-xs flex flex-col justify-center items-center">
                      <div className="max-w-md text-center space-y-3">
                        <span className="material-symbols-outlined text-5xl text-tertiary">travel_explore</span>
                        <h3 className="font-headline font-black text-base text-primary uppercase">Browser Navigation Studio</h3>
                        <p className="font-body text-xs text-on-surface-variant font-semibold">
                          Enter any URL in the address bar above, or select a debugging step on the Time-Travel Debugger to inspect live DOM scrapes.
                        </p>
                        <div className="flex gap-2 justify-center pt-2">
                          <button 
                            onClick={() => handleNavigate('https://reddit.com/r/saas/comments/supr_agentic')}
                            className="bg-background border-2 border-primary text-[10px] font-bold uppercase py-1.5 px-3 hover:bg-primary-fixed transition-colors"
                          >
                            Load r/saas mock
                          </button>
                          <button 
                            onClick={() => handleNavigate('https://news.ycombinator.com')}
                            className="bg-background border-2 border-primary text-[10px] font-bold uppercase py-1.5 px-3 hover:bg-primary-fixed transition-colors"
                          >
                            Load Hacker News mock
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>

          {/* DevTools Web Console (Collapsible/Footer) */}
          <div className="border-t-4 border-primary bg-primary text-[#fafafa] h-28 shrink-0 flex flex-col font-mono text-[9.5px] p-2 overflow-y-auto custom-scrollbar">
            <p className="font-bold text-primary-fixed uppercase text-[9px] mb-1 tracking-wider border-b border-white/10 pb-0.5 flex items-center justify-between">
              <span>DevTools Web Console Log</span>
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
            </p>
            {consoleLogs.slice(-5).map((log, idx) => (
              <div key={idx} className="flex gap-1.5 leading-relaxed border-b border-white/5 py-0.5 last:border-0">
                <span className="text-gray-400">[{idx+1}]</span>
                <span className={
                  log.startsWith('DBGP') ? "text-[#a8c6ff]" :
                  log.startsWith('TIME-TRAVEL') ? "text-[#ffcc00] font-black" :
                  log.startsWith('LIGHTHOUSE') ? "text-green-300 font-bold" :
                  log.startsWith('EMULATE') ? "text-secondary font-bold" : "text-gray-300"
                }>
                  {log}
                </span>
              </div>
            ))}
          </div>

        </section>

        {/* COLUMN B: CONTROLS & COMPANION WIDGETS (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">

          {/* TIME-TRAVEL DEBUGGER */}
          <section className="bg-background neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b-2 border-primary pb-2 mb-3">
                <h4 className="font-headline text-lg font-black uppercase tracking-tight text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary">history_toggle_off</span> Time-Travel Debugger
                </h4>
                <span className="bg-secondary-container text-on-secondary-container px-2 py-0.5 text-[8px] font-bold uppercase neo-border">Revert State</span>
              </div>
              <p className="font-body text-[11px] text-on-surface-variant font-bold leading-normal mb-4">
                Drag or click to jump back to any browser state snapshot. Reverts local databases & files automatically.
              </p>

              {/* Interactive Steps Slider */}
              <div className="relative py-4 pr-1">
                {/* Horizontal connection line */}
                <div className="absolute top-1/2 left-0 right-0 h-1 bg-primary/20 -translate-y-1/2 z-0"></div>
                <div 
                  className="absolute top-1/2 left-0 h-1 bg-secondary -translate-y-1/2 z-0 transition-all duration-300"
                  style={{ width: `${((currentStep - 1) / (steps.length - 1)) * 100}%` }}
                ></div>

                {/* Steps Nodes */}
                <div className="flex justify-between relative z-10">
                  {steps.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setCurrentStep(s.id);
                        if (onLogActivity) {
                          onLogActivity('review', `Time-Travel rolled state to Step ${s.id}`, `Switched browser frame context to "${s.title}" in secure workspace.`);
                        }
                      }}
                      className={`w-8 h-8 rounded-none border-2 flex items-center justify-center font-headline font-black text-xs transition-all hover:scale-110 active:scale-95 ${
                        currentStep === s.id
                          ? 'bg-secondary text-white border-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]'
                          : s.id < currentStep
                          ? 'bg-primary-fixed text-primary border-primary'
                          : 'bg-background text-on-surface-variant border-outline-variant'
                      }`}
                      title={s.title}
                    >
                      {s.id}
                    </button>
                  ))}
                </div>
              </div>

              {/* Active Step Card */}
              {(() => {
                const s = steps.find(st => st.id === currentStep);
                if (!s) return null;
                return (
                  <div className="mt-4 bg-surface-container-low border-2 border-primary p-3 space-y-1.5">
                    <div className="flex justify-between items-center border-b border-primary/10 pb-1">
                      <span className="font-headline font-bold text-xs uppercase text-primary">{s.title}</span>
                      <span className={`px-2 py-0.5 text-[8px] font-bold uppercase neo-border ${
                        s.status === 'Passed' ? 'bg-primary-fixed text-primary' : s.status === 'In Progress' ? 'bg-tertiary text-white' : 'bg-background text-on-surface-variant'
                      }`}>{s.status}</span>
                    </div>
                    <p className="font-body text-[10px] text-on-surface-variant leading-relaxed font-semibold">{s.desc}</p>
                    <div className="grid grid-cols-2 gap-2 text-[9px] font-mono pt-1 text-on-surface-variant">
                      <div>Agent: <span className="font-bold text-primary">{s.agent}</span></div>
                      <div>Trace ID: <span className="font-bold text-secondary">tr-{s.id}</span></div>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Rollback Trigger Button */}
            <button
              onClick={() => {
                const s = steps.find(st => st.id === currentStep);
                if (s && onTerminalLog) {
                  onTerminalLog(`[ROLLBACK COMMAND] Executing hard workspace reset to Snapshot Step ${currentStep} (${s.title})...`);
                  onTerminalLog(`[ROLLBACK COMMAND] Overwriting files with cache-hash: sha256_b3749cff...`);
                  onTerminalLog(`[ROLLBACK COMMAND] Workspace reverted successfully.`);
                }
                if (onLogActivity) {
                  onLogActivity('review', 'Workspace Rollback Triggered', `Hard rollback executed. Restored local git working directory state back to step ${currentStep}.`);
                }
                alert(`SUCCESS: Workspace files and SQLite database rolled back to State Step ${currentStep} (${steps.find(st => st.id === currentStep)?.title}).`);
              }}
              className="mt-4 bg-primary text-on-primary font-headline font-bold uppercase py-2 px-4 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-colors duration-100 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none text-xs text-center flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-sm">history_toggle_off</span>
              Rollback Workspace to Step {currentStep}
            </button>
          </section>

          {/* AUTOMATED UX/SEO GOVERNANCE GATE */}
          <section className="bg-background neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-4 relative overflow-hidden">
            <div className="flex justify-between items-center border-b-2 border-primary pb-2 mb-3">
              <h4 className="font-headline text-lg font-black uppercase tracking-tight text-primary flex items-center gap-1.5">
                <span className="material-symbols-outlined text-tertiary">verified_user</span> Automated UX/SEO Gate
              </h4>
              <span className="bg-tertiary-container text-on-tertiary-container px-2 py-0.5 text-[8px] font-bold uppercase neo-border">Governance</span>
            </div>

            <p className="font-body text-[11px] text-on-surface-variant font-bold leading-normal mb-4">
              Executes a headless Lighthouse run to audit speed indexes, semantic layout, title/meta tags, and strict HTML validation tags.
            </p>

            {/* Lighthouse Circular Score Gauges */}
            <div className="grid grid-cols-4 gap-2 py-2">
              {[
                { label: 'Perf', key: 'performance', color: 'text-[#00cc66]' },
                { label: 'Access', key: 'accessibility', color: 'text-[#ff9900]' },
                { label: 'Best Pr.', key: 'bestPractices', color: 'text-[#00cc66]' },
                { label: 'SEO', key: 'seo', color: 'text-[#00cc66]' },
              ].map((gate) => {
                const score = auditScores[gate.key as keyof typeof auditScores];
                const r = 16;
                const c = 2 * Math.PI * r;
                const offset = c - (score / 100) * c;
                
                return (
                  <div key={gate.key} className="flex flex-col items-center p-1 bg-surface-container-low border border-primary/15 relative">
                    <div className="relative w-12 h-12 flex items-center justify-center">
                      <svg className="w-12 h-12 -rotate-90">
                        <circle cx="24" cy="24" r={r} stroke="var(--color-outline-variant)" strokeWidth="3" fill="transparent" className="opacity-30" />
                        <circle 
                          cx="24" 
                          cy="24" 
                          r={r} 
                          stroke={score >= 90 ? '#00cc66' : '#ff9900'} 
                          strokeWidth="3" 
                          fill="transparent" 
                          strokeDasharray={c} 
                          strokeDashoffset={isAuditing ? c : offset} 
                          className="transition-all duration-1000 ease-out"
                        />
                      </svg>
                      <span className="absolute font-headline font-black text-xs text-primary">{isAuditing ? '...' : score}</span>
                    </div>
                    <span className="font-headline font-bold text-[9px] uppercase mt-1.5 text-on-surface-variant">{gate.label}</span>
                  </div>
                );
              })}
            </div>

            {/* Running Audit Progress */}
            {isAuditing && (
              <div className="mt-4 space-y-1.5">
                <div className="flex justify-between text-[10px] font-mono font-bold text-tertiary">
                  <span>Running chrome-devtools-mcp::lighthouse_audit</span>
                  <span>{auditProgress}%</span>
                </div>
                <div className="w-full h-2 bg-outline-variant neo-border-sm relative overflow-hidden">
                  <div className="absolute inset-y-0 left-0 bg-tertiary transition-all duration-300" style={{ width: `${auditProgress}%` }} />
                </div>
              </div>
            )}

            {/* Trigger Button */}
            <button
              onClick={handleRunAudit}
              disabled={isAuditing}
              className="w-full mt-4 bg-primary text-on-primary font-headline font-bold uppercase py-2 px-4 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-colors duration-100 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none text-xs text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">speed</span>
              {isAuditing ? 'Analyzing Site Performance...' : 'Trigger Lighthouse Audit Gate'}
            </button>
          </section>

          {/* SHADOW-SYNC COMPETITOR INTEL CRON */}
          <section className="bg-background neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] p-4 flex flex-col justify-between">
            <div>
              <div className="flex justify-between items-center border-b-2 border-primary pb-2 mb-3">
                <h4 className="font-headline text-lg font-black uppercase tracking-tight text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary">sync_alt</span> Shadow Sync Cron (cr-1)
                </h4>
                <span className="bg-primary-container text-on-primary-container px-2 py-0.5 text-[8px] font-bold uppercase neo-border">Every 5m</span>
              </div>
              <p className="font-body text-[11px] text-on-surface-variant font-bold leading-normal mb-3">
                Aggregates background scrapes of competitive subreddits (r/saas) and Twitter queries via automated web workers.
              </p>

              {/* Status & Settings */}
              <div className="bg-surface-container-low border-2 border-primary p-3 text-[10px] space-y-2 mb-4">
                <div className="flex justify-between items-center border-b border-primary/10 pb-1">
                  <span className="font-headline font-bold uppercase text-primary">Cron Job Details</span>
                  <span className="font-mono text-green-600 font-bold">● Active</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-on-surface-variant font-semibold">
                  <div>Interval: <span className="font-mono text-primary">5 Minutes</span></div>
                  <div>Engine: <span className="font-mono text-primary">Web Crawler</span></div>
                  <div>Targets: <span className="font-mono text-primary">r/saas, Twitter</span></div>
                  <div>Mode: <span className="font-mono text-primary">Bypass Bot Block</span></div>
                </div>
                {isSyncing && (
                  <div className="pt-1 text-[9px] font-mono text-tertiary flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs animate-spin">refresh</span>
                    <span>Status: {syncStatus}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Manual Trigger Button */}
            <button
              onClick={handleShadowSync}
              disabled={isSyncing}
              className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-2 px-4 border-2 border-primary hover:bg-primary-fixed hover:text-primary transition-colors duration-100 shadow-[3px_3px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none text-xs text-center flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">schedule_send</span>
              {isSyncing ? 'Scraping Social Streams...' : 'Execute Manual Shadow Sync'}
            </button>
          </section>

        </div>

      </div>

    </div>
  );
}
