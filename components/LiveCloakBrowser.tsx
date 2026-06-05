'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type CloakPage = {
  id: string;
  url: string;
  finalUrl?: string;
  title: string;
  html: string;
  text: string;
  statusCode: number | null;
  status: 'idle' | 'navigating' | 'fetched' | 'error';
  error?: string;
  durationMs?: number;
  retrievedAt?: string;
  fallback?: 'text' | 'html';
};

const BOOKMARKS: { label: string; url: string }[] = [
  { label: 'Supr Home', url: 'supr://mission-control' },
  { label: 'Knowledge', url: 'supr://library' },
  { label: 'Code Lab', url: 'supr://code' },
  { label: 'about:blank', url: 'about:blank' },
];

function safeHost(url: string) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function safeFavicon(url: string) {
  const host = safeHost(url);
  if (!host) return null;
  return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
}

export type LiveCloakBrowserProps = {
  pages: CloakPage[];
  activePageId: string | null;
  cloakPath: string | null;
  isNavigating: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
  onHome: () => void;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
};

export function LiveCloakBrowser({
  pages,
  activePageId,
  cloakPath,
  isNavigating,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
  onHome,
  onSelect,
  onClose,
}: LiveCloakBrowserProps) {
  const active = pages.find((p) => p.id === activePageId) ?? null;
  const [bookmarksOpen, setBookmarksOpen] = useState(true);

  const favicon = useMemo(() => (active ? safeFavicon(active.url) : null), [active]);

  const cloakStatus = cloakPath
    ? { label: `CloakBrowser: ${safeHost(cloakPath) || 'ready'}`, tone: 'bg-tertiary text-on-tertiary' }
    : { label: 'CloakBrowser: CLOAKBROWSER_PATH not set', tone: 'bg-error text-on-error' };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background relative w-full">
      <div className="flex items-center bg-surface-variant border-b-4 border-primary h-9 px-2 gap-2 shrink-0 overflow-x-auto custom-scrollbar">
        <div className="flex items-center gap-1.5 mr-2 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full border border-primary bg-error-container" />
          <span className="w-2.5 h-2.5 rounded-full border border-primary bg-secondary-container" />
          <span className="w-2.5 h-2.5 rounded-full border border-primary bg-tertiary-container" />
        </div>
        <span
          className={`font-headline font-black uppercase text-[10px] px-2 py-0.5 border-2 border-primary whitespace-nowrap ${cloakStatus.tone}`}
          title="Identity of the live browser process driving this viewport. Set CLOAKBROWSER_PATH to override the chromium binary used for scraping."
        >
          <span className="material-symbols-outlined text-[12px] align-middle mr-1">travel_explore</span>
          {cloakStatus.label}
        </span>
        <div className="flex-1" />
        {pages.map((page) => {
          const isActive = page.id === activePageId;
          const fav = page.url && page.url.startsWith('http') ? safeFavicon(page.url) : null;
          return (
            <div
              key={page.id}
              onClick={() => onSelect(page.id)}
              className={`group flex items-center gap-1.5 pl-2.5 pr-1 h-7 border-2 border-primary font-body text-[10px] font-bold uppercase max-w-[220px] shrink-0 cursor-pointer transition-all ${
                isActive
                  ? 'bg-background text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] -translate-y-0.5'
                  : 'bg-surface text-on-surface-variant hover:bg-surface-container'
              }`}
              title={page.url}
              role="tab"
              aria-selected={isActive}
            >
              {fav ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={fav} alt="" className="w-3 h-3 shrink-0" />
              ) : (
                <span className="material-symbols-outlined text-[12px] shrink-0">
                  {page.status === 'navigating' ? 'progress_activity' : page.status === 'error' ? 'error' : page.url === 'about:blank' ? 'desktop_windows' : 'language'}
                </span>
              )}
              <span className="truncate">
                {page.title || safeHost(page.url) || 'New tab'}
              </span>
              {page.status === 'navigating' && <span className="material-symbols-outlined text-[12px] animate-spin shrink-0">progress_activity</span>}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(page.id);
                }}
                className="ml-1 w-4 h-4 flex items-center justify-center text-on-surface-variant hover:text-error"
                aria-label={`Close ${page.title}`}
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center border-b-4 border-primary bg-surface-variant h-11 px-2 gap-1.5 shrink-0">
        <NavButton
          icon="arrow_back"
          label="Back"
          disabled={!canGoBack}
          onClick={onBack}
        />
        <NavButton
          icon="arrow_forward"
          label="Forward"
          disabled={!canGoForward}
          onClick={onForward}
        />
        <NavButton
          icon={isNavigating ? 'stop' : 'refresh'}
          label={isNavigating ? 'Stop' : 'Reload'}
          spin={isNavigating}
          onClick={onReload}
        />
        <NavButton icon="home" label="Home" onClick={onHome} />

        <div className="flex-1 flex items-center bg-background neo-border px-2 h-8 font-mono text-[11px] gap-2 overflow-hidden">
          <span className="material-symbols-outlined text-[14px] text-on-surface-variant shrink-0">
            {active?.url?.startsWith('https') ? 'lock' : active?.url?.startsWith('http') ? 'warning' : 'public'}
          </span>
          <span className="truncate text-on-surface-variant flex-1">
            {active?.url || 'about:blank'}
          </span>
          {active?.statusCode != null && (
            <span className="font-bold uppercase text-[9px] px-1.5 py-0.5 border border-primary text-on-surface-variant shrink-0">
              {active.statusCode}
            </span>
          )}
          {active && (
            <span className="font-bold uppercase text-[9px] px-1.5 py-0.5 border border-primary text-on-surface-variant shrink-0">
              {active.fallback === 'text' ? 'text' : 'html'}
            </span>
          )}
        </div>

        <NavButton icon="code" label="Devtools" onClick={() => undefined} />
        <NavButton icon="more_vert" label="More" onClick={() => undefined} />
      </div>

      <div className="flex items-center border-b-2 border-outline-variant bg-surface-container-lowest h-7 px-3 gap-3 shrink-0 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setBookmarksOpen((v) => !v)}
          className="font-headline font-black uppercase text-[9px] text-on-surface-variant tracking-widest hover:text-primary"
        >
          {bookmarksOpen ? 'Bookmarks −' : 'Bookmarks +'}
        </button>
        {bookmarksOpen &&
          BOOKMARKS.map((bm) => (
            <span
              key={bm.label}
              className="font-body text-[10px] text-primary whitespace-nowrap cursor-default"
              title={bm.url}
            >
              {bm.label}
            </span>
          ))}
        <div className="flex-1" />
        <span className="font-body text-[9px] font-bold uppercase text-on-surface-variant">
          {pages.length} tab{pages.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar bg-surface-container-lowest relative">
        {!active && (
          <div className="flex flex-col items-center justify-center h-full text-center p-8">
            <span className="material-symbols-outlined text-7xl text-outline mb-6">travel_explore</span>
            <h3 className="font-headline font-bold uppercase text-xl text-on-surface-variant mb-2">CloakBrowser Viewport</h3>
            <p className="font-body text-sm text-on-surface-variant max-w-md leading-relaxed">
              Drive the live CloakBrowser binary from the left rail. Enter a URL or run a research query and every page the agent navigates will be rendered here inside a sandboxed preview.
            </p>
            <div className="mt-6 p-4 border-l-4 border-secondary bg-surface-container text-left max-w-md font-body text-xs text-on-surface-variant leading-relaxed">
              <strong>Live tool</strong>: this viewport calls <code className="bg-black text-amber-300 px-1 py-0.5">lib/tools/browser.ts</code> via <code className="bg-black text-amber-300 px-1 py-0.5">/api/research/navigate</code> and renders the captured HTML in an isolated <code className="bg-black text-amber-300 px-1 py-0.5">iframe</code>.
            </div>
          </div>
        )}

        {active?.status === 'navigating' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
            <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
            <p className="mt-3 font-headline font-bold uppercase text-sm text-primary">
              CloakBrowser is loading {safeHost(active.url) || active.url}
            </p>
            <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
              Waiting for network idle (Playwright + {cloakPath ? safeHost(cloakPath) : 'CLOAKBROWSER_PATH not set'}).
            </p>
          </div>
        )}

        {active?.status === 'error' && (
          <div className="p-8 max-w-2xl mx-auto">
            <div className="p-4 border-4 border-error bg-error-container text-on-error-container neo-shadow">
              <p className="font-headline font-black uppercase text-sm mb-2">CloakBrowser navigation failed</p>
              <p className="font-mono text-xs break-words whitespace-pre-wrap">{active.error}</p>
              <p className="font-body text-[11px] mt-3">
                URL: <span className="font-mono">{active.url}</span>
              </p>
            </div>
          </div>
        )}

        {active?.status === 'fetched' && active.html && (
          <iframe
            key={active.id}
            title={active.title || active.url}
            srcDoc={active.html}
            sandbox="allow-same-origin"
            className="w-full h-full bg-white border-0"
            referrerPolicy="no-referrer"
          />
        )}

        {active?.status === 'fetched' && !active.html && active.text && (
          <div className="p-6 max-w-4xl mx-auto">
            <div className="border-b-2 border-outline-variant pb-3 mb-4">
              <h1 className="font-headline text-2xl font-bold text-primary">{active.title || safeHost(active.url)}</h1>
              <p className="font-body text-xs text-on-surface-variant">
                Captured body text from CloakBrowser (no HTML returned). URL: <span className="font-mono">{active.url}</span>
              </p>
            </div>
            <pre className="font-mono text-xs whitespace-pre-wrap break-words bg-surface-container p-4 neo-border">
              {active.text}
            </pre>
          </div>
        )}
      </div>

      <div className="flex items-center border-t-4 border-primary bg-surface-variant h-6 px-3 gap-3 shrink-0 text-[10px] font-mono">
        <span className="flex items-center gap-1 text-on-surface-variant">
          <span className="material-symbols-outlined text-[12px]">verified</span>
          Cloak
        </span>
        <span className="text-on-surface-variant">
          {active?.url?.startsWith('https') ? 'Secure' : active?.url?.startsWith('http') ? 'Insecure' : 'Local'}
        </span>
        <span className="text-on-surface-variant">JS: ON</span>
        <span className="text-on-surface-variant">UA: CloakBrowser/1.2</span>
        <div className="flex-1" />
        {active?.durationMs != null && (
          <span className="text-on-surface-variant">{active.durationMs}ms</span>
        )}
        <span className="text-primary font-bold uppercase">
          {isNavigating ? 'Loading…' : active ? `Page: ${safeHost(active.url) || 'blank'}` : 'Idle'}
        </span>
      </div>
    </div>
  );
}

function NavButton({
  icon,
  label,
  onClick,
  disabled,
  spin,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  spin?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`w-8 h-8 flex items-center justify-center border-2 border-primary bg-background text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] hover:bg-tertiary hover:text-on-tertiary active:translate-x-0.5 active:translate-y-0.5 ${disabled ? 'opacity-40' : ''}`}
    >
      <span className={`material-symbols-outlined text-[16px] ${spin ? 'animate-spin' : ''}`}>{icon}</span>
    </button>
  );
}

export function useCloakBrowser() {
  const [pages, setPages] = useState<CloakPage[]>([
    {
      id: 'home',
      url: 'about:blank',
      title: 'About:Blank',
      html: '',
      text: '',
      statusCode: null,
      status: 'idle',
    },
  ]);
  const [activePageId, setActivePageId] = useState<string>('home');
  const [historyStack, setHistoryStack] = useState<string[]>(['home']);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [isNavigating, setIsNavigating] = useState(false);
  const cloakPathRef = useRef<string | null>(null);

  const activePage = pages.find((p) => p.id === activePageId) ?? null;

  const navigate = async (url: string, opts?: { selector?: string; fromQuery?: string }) => {
    if (isNavigating) return;
    const pageId = `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const placeholder: CloakPage = {
      id: pageId,
      url,
      title: url,
      html: '',
      text: '',
      statusCode: null,
      status: 'navigating',
    };
    setPages((prev) => [...prev, placeholder]);
    pushHistory(pageId);
    setActivePageId(pageId);
    setIsNavigating(true);

    try {
      const response = await fetch('/api/research/navigate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, selector: opts?.selector }),
      });
      if (!response.body) throw new Error('No response stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let captured: CloakPage | null = null;

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
            if (msg.type === 'status' && msg.phase === 'navigating' && typeof msg.content === 'string') {
              cloakPathRef.current = msg.content.includes('CLOAKBROWSER_PATH is not set')
                ? null
                : cloakPathRef.current ?? 'configured';
            }
            if (msg.type === 'fetched') {
              captured = {
                id: pageId,
                url: msg.url,
                finalUrl: msg.finalUrl,
                title: msg.title || safeHost(msg.url),
                html: msg.html || '',
                text: msg.text || '',
                statusCode: msg.statusCode ?? null,
                status: 'fetched',
                durationMs: msg.durationMs,
                retrievedAt: msg.retrievedAt,
                fallback: msg.fallback,
              };
            }
            if (msg.type === 'error') {
              captured = {
                id: pageId,
                url,
                title: url,
                html: '',
                text: '',
                statusCode: null,
                status: 'error',
                error: msg.content,
              };
              cloakPathRef.current = null;
            }
          } catch {
            // ignore malformed
          }
        }
      }

      if (captured) {
        setPages((prev) => prev.map((p) => (p.id === pageId ? captured! : p)));
      } else {
        setPages((prev) =>
          prev.map((p) =>
            p.id === pageId
              ? { ...p, status: 'error', error: 'No response from CloakBrowser pipeline.' }
              : p,
          ),
        );
      }
    } catch (err: any) {
      setPages((prev) =>
        prev.map((p) =>
          p.id === pageId
            ? { ...p, status: 'error', error: err.message || 'CloakBrowser pipeline failed.' }
            : p,
        ),
      );
    } finally {
      setIsNavigating(false);
    }
  };

  const pushHistory = (pageId: string) => {
    setHistoryStack((prev) => {
      const trimmed = prev.slice(0, historyIndex + 1);
      return [...trimmed, pageId];
    });
    setHistoryIndex((idx) => idx + 1);
  };

  const goBack = () => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setActivePageId(historyStack[newIndex]);
  };
  const goForward = () => {
    if (historyIndex >= historyStack.length - 1) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setActivePageId(historyStack[newIndex]);
  };
  const reload = () => {
    if (!activePage || activePage.url === 'about:blank') return;
    navigate(activePage.url);
  };
  const goHome = () => {
    setActivePageId('home');
    pushHistory('home');
  };
  const closePage = (id: string) => {
    setPages((prev) => {
      const next = prev.filter((p) => p.id !== id);
      if (next.length === 0) {
        return [{
          id: 'home',
          url: 'about:blank',
          title: 'About:Blank',
          html: '',
          text: '',
          statusCode: null,
          status: 'idle',
        }];
      }
      return next;
    });
    setHistoryStack((prev) => prev.filter((id_) => id_ !== id));
    if (activePageId === id) {
      setActivePageId('home');
    }
  };

  return {
    pages,
    activePageId,
    activePage,
    historyStack,
    historyIndex,
    isNavigating,
    cloakPath: cloakPathRef.current,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex < historyStack.length - 1,
    actions: {
      navigate,
      goBack,
      goForward,
      reload,
      goHome,
      setActivePageId,
      closePage,
    },
  };
}
