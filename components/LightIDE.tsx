'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CommandPalette, type Command } from './ide/CommandPalette';
import { FileOutline } from './ide/FileOutline';
import { FindBar, defaultFindState, type FindState } from './ide/FindBar';
import { ProblemsPanel } from './ide/ProblemsPanel';
import { StatusBar } from './ide/StatusBar';
import { detectLanguage, getEol, getIndentUnit, languageLabel } from '@/lib/ide/language';
import { extractOutline, type OutlineSymbol } from '@/lib/ide/outline';
import { extractProblems, type Problem } from '@/lib/ide/problems';
import { highlightForLang } from '@/lib/ide/highlight';

export type LightIDETab = {
  filename: string;
  content: string;
  lastSavedContent: string;
  savedAt: string | null;
  saving: boolean;
};

export type LightIDEProps = {
  tabs: LightIDETab[];
  activeFile: string;
  onSelectFile: (filename: string) => void;
  onChangeContent: (filename: string, content: string) => void;
  onSaveFile: (filename: string) => Promise<void> | void;
  onCloseTab: (filename: string) => void;
  onNewFile: () => void;
  onRunCode: (filename: string) => void;
  onLint: () => void;
  onBuild: () => void;
  onDiagnoseFix: (filename: string) => void;
  onJumpToResearch?: (filename: string) => void;
  ghostSuggestion?: { code: string; diagnosis: string; fix: string } | null;
  onApplyGhost?: () => void;
  onDismissGhost?: () => void;
  terminalOutput?: string;
};

type Cursor = { line: number; column: number; selectionLength: number };

export function LightIDE(props: LightIDEProps) {
  const {
    tabs,
    activeFile,
    onSelectFile,
    onChangeContent,
    onSaveFile,
    onCloseTab,
    onNewFile,
    onRunCode,
    onLint,
    onBuild,
    onDiagnoseFix,
    onJumpToResearch,
    ghostSuggestion,
    onApplyGhost,
    onDismissGhost,
    terminalOutput,
  } = props;

  const activeTab = useMemo(() => tabs.find((t) => t.filename === activeFile) ?? null, [tabs, activeFile]);

  const [highlighted, setHighlighted] = useState('');
  const [cursor, setCursor] = useState<Cursor>({ line: 1, column: 1, selectionLength: 0 });
  const [find, setFind] = useState<FindState>(defaultFindState);
  const [showFind, setShowFind] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [activeLine, setActiveLine] = useState(1);
  const [problems, setProblems] = useState<Problem[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const highlightRef = useRef<HTMLDivElement | null>(null);
  const fileLang = useMemo(() => detectLanguage(activeTab?.filename ?? ''), [activeTab?.filename]);

  const isDirty = !!activeTab && activeTab.content !== activeTab.lastSavedContent;
  const totalLines = useMemo(() => (activeTab ? activeTab.content.split('\n').length : 0), [activeTab?.content]);
  const eol = useMemo(() => (activeTab ? getEol(activeTab.content) : 'LF'), [activeTab?.content]);
  const indent = useMemo(() => (activeTab ? getIndentUnit(activeTab.content) : 'Spaces: 4'), [activeTab?.content]);

  // Debounced syntax highlight on content change
  useEffect(() => {
    if (!activeTab) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const html = await highlightForLang(activeTab.content, fileLang.lang);
      if (!cancelled) setHighlighted(html);
    }, 80);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [activeTab?.content, fileLang.lang]);

  // Extract outline
  const outline: OutlineSymbol[] = useMemo(() => {
    if (!activeTab) return [];
    return extractOutline(activeTab.content, fileLang.lang);
  }, [activeTab?.content, fileLang.lang]);

  // Extract problems from terminal output
  useEffect(() => {
    setProblems(extractProblems(terminalOutput ?? '', activeFile));
  }, [terminalOutput, activeFile]);

  const matchRanges = useMemo(() => computeMatches(activeTab?.content ?? '', find), [activeTab?.content, find]);
  const [activeMatch, setActiveMatch] = useState(0);
  useEffect(() => {
    setActiveMatch(0);
  }, [find.query, find.caseSensitive, find.regex, activeFile]);
  useEffect(() => {
    if (matchRanges.length > 0) {
      const m = matchRanges[activeMatch] || matchRanges[0];
      if (m) jumpToOffset(m.start);
    }
  }, [activeMatch, matchRanges]);

  const updateCursor = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    const pos = ta.selectionStart ?? 0;
    const before = ta.value.slice(0, pos);
    const lines = before.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;
    const selLen = (ta.selectionEnd ?? pos) - pos;
    setCursor({ line, column: col, selectionLength: Math.abs(selLen) });
    setActiveLine(line);
  }, []);

  const handleScroll = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (gutterRef.current) {
      gutterRef.current.scrollTop = ta.scrollTop;
    }
    if (highlightRef.current) {
      highlightRef.current.scrollTop = ta.scrollTop;
      highlightRef.current.scrollLeft = ta.scrollLeft;
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (!activeTab) return;
      onChangeContent(activeTab.filename, e.target.value);
    },
    [activeTab, onChangeContent],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isMod = e.metaKey || e.ctrlKey;
      const ta = e.currentTarget;
      if (isMod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (activeTab) onSaveFile(activeTab.filename);
        return;
      }
      if (isMod && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setShowFind(true);
        return;
      }
      if (isMod && (e.key === 'p' || (e.shiftKey && e.key.toLowerCase() === 'p'))) {
        e.preventDefault();
        setShowPalette(true);
        return;
      }
      if (isMod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShowPalette(true);
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        insertAtCursor(ta, '    ');
        return;
      }
      if (e.key === 'Escape' && showFind) {
        e.preventDefault();
        setShowFind(false);
      }
    },
    [activeTab, onSaveFile, showFind],
  );

  const insertAtCursor = (ta: HTMLTextAreaElement, text: string) => {
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    const before = ta.value.slice(0, start);
    const after = ta.value.slice(end);
    const next = before + text + after;
    onChangeContent(activeTab!.filename, next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + text.length;
      updateCursor();
    });
  };

  const jumpToOffset = (offset: number) => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    ta.selectionStart = ta.selectionEnd = offset;
    // Scroll so the line is centered
    const before = ta.value.slice(0, offset);
    const line = before.split('\n').length;
    const lineHeight = 18;
    const target = Math.max(0, (line - 3) * lineHeight);
    ta.scrollTop = target;
    handleScroll();
    updateCursor();
  };

  const jumpToLine = (line: number) => {
    const ta = textareaRef.current;
    if (!ta || !activeTab) return;
    const lines = activeTab.content.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i += 1) {
      offset += lines[i].length + 1;
    }
    jumpToOffset(offset);
  };

  const onReplace = () => {
    if (!activeTab || !find.query) return;
    const m = matchRanges[activeMatch];
    if (!m) return;
    const next = activeTab.content.slice(0, m.start) + find.replacement + activeTab.content.slice(m.end);
    onChangeContent(activeTab.filename, next);
    setTimeout(() => setActiveMatch((i) => i), 30);
  };
  const onReplaceAll = () => {
    if (!activeTab || !find.query) return;
    const safe = matchRanges.slice().reverse();
    let next = activeTab.content;
    for (const r of safe) {
      next = next.slice(0, r.start) + find.replacement + next.slice(r.end);
    }
    onChangeContent(activeTab.filename, next);
  };

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      { id: 'save', label: 'Save File', description: 'Persist current buffer to workspace', group: 'File', shortcut: '⌘S', icon: 'save', run: () => activeTab && onSaveFile(activeTab.filename) },
      { id: 'new', label: 'New File', description: 'Create a new file in workspace', group: 'File', icon: 'note_add', run: onNewFile },
      { id: 'close', label: 'Close Tab', group: 'File', icon: 'close', run: () => activeTab && onCloseTab(activeTab.filename) },
      { id: 'find', label: 'Find', description: 'Search in current file', group: 'Edit', shortcut: '⌘F', icon: 'search', run: () => setShowFind(true) },
      { id: 'replace', label: 'Toggle Replace', group: 'Edit', icon: 'find_replace', run: () => setFind((s) => ({ ...s, showReplace: !s.showReplace })) },
      { id: 'palette', label: 'Open Command Palette', shortcut: '⌘K', group: 'View', icon: 'command', run: () => setShowPalette(true) },
      { id: 'run', label: 'Run Code', description: 'Execute the active file in the sandbox', group: 'Run', shortcut: '▶', icon: 'play_arrow', run: () => activeTab && onRunCode(activeTab.filename) },
      { id: 'lint', label: 'Run Lint', group: 'Run', icon: 'fact_check', run: onLint },
      { id: 'build', label: 'Run Build', group: 'Run', icon: 'deployed_code', run: onBuild },
      { id: 'diagnose', label: 'Code Agent: Diagnose & Fix', description: 'Ask the Code Agent to repair the active file', group: 'Code Agent', icon: 'psychology', run: () => activeTab && onDiagnoseFix(activeTab.filename) },
    ];
    if (onJumpToResearch) {
      list.push({ id: 'research', label: 'Open Research Brief', group: 'Code Agent', icon: 'travel_explore', run: () => onJumpToResearch(activeTab?.filename ?? '') });
    }
    return list;
  }, [activeTab, onSaveFile, onNewFile, onCloseTab, onRunCode, onLint, onBuild, onDiagnoseFix, onJumpToResearch]);

  // Sync textarea + gutter sizes
  useLayoutEffect(() => {
    handleScroll();
  }, [activeTab?.content, handleScroll]);

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-background relative w-full" data-testid="light-ide">
      <div className="flex items-center border-b-4 border-primary bg-surface-variant h-9 px-2 gap-1 overflow-x-auto custom-scrollbar shrink-0">
        {tabs.map((tab) => {
          const isActive = tab.filename === activeFile;
          const dirty = tab.content !== tab.lastSavedContent;
          return (
            <div
              key={tab.filename}
              onClick={() => onSelectFile(tab.filename)}
              className={`group flex items-center gap-1.5 pl-2.5 pr-1 h-7 border-2 border-primary font-body text-[10px] font-bold uppercase max-w-[220px] shrink-0 cursor-pointer ${
                isActive
                  ? 'bg-background text-primary shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] -translate-y-0.5'
                  : 'bg-surface text-on-surface-variant hover:bg-surface-container'
              }`}
              role="tab"
              aria-selected={isActive}
            >
              <span className="material-symbols-outlined text-[12px] shrink-0">description</span>
              <span className="truncate">{tab.filename}</span>
              {dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="unsaved" />}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.filename);
                }}
                className="ml-1 w-4 h-4 flex items-center justify-center text-on-surface-variant hover:text-error"
                aria-label={`Close ${tab.filename}`}
              >
                <span className="material-symbols-outlined text-[12px]">close</span>
              </button>
            </div>
          );
        })}
        <button
          onClick={onNewFile}
          className="ml-1 w-7 h-7 border-2 border-primary bg-background text-primary hover:bg-tertiary hover:text-on-tertiary flex items-center justify-center shrink-0"
          title="New file"
          aria-label="New file"
        >
          <span className="material-symbols-outlined text-[14px]">add</span>
        </button>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowPalette(true)}
            className="px-2 h-7 border-2 border-primary bg-background text-primary hover:bg-tertiary hover:text-on-tertiary flex items-center gap-1 font-body text-[10px] font-bold uppercase"
            title="Command palette (⌘K)"
          >
            <span className="material-symbols-outlined text-[12px]">command</span>
            Palette
            <kbd className="ml-1 px-1 border border-primary text-[8px] font-mono">⌘K</kbd>
          </button>
          <button
            onClick={() => setShowFind((v) => !v)}
            className={`px-2 h-7 border-2 border-primary flex items-center gap-1 font-body text-[10px] font-bold uppercase ${
              showFind ? 'bg-primary text-on-primary' : 'bg-background text-primary hover:bg-tertiary hover:text-on-tertiary'
            }`}
            title="Find (⌘F)"
          >
            <span className="material-symbols-outlined text-[12px]">search</span>
            Find
            <kbd className="ml-1 px-1 border border-primary text-[8px] font-mono">⌘F</kbd>
          </button>
        </div>
      </div>

      <div className="flex items-center border-b-2 border-outline-variant bg-surface-container-lowest h-6 px-3 gap-2 text-[10px] font-mono text-on-surface-variant shrink-0 overflow-x-auto custom-scrollbar" aria-label="Breadcrumbs">
        <span className="material-symbols-outlined text-[12px]">folder</span>
        <span>workspace</span>
        <span>›</span>
        <span className="text-primary font-bold">{activeFile || 'untitled'}</span>
        {ghostSuggestion && (
          <span className="ml-auto text-secondary font-bold uppercase flex items-center gap-1">
            <span className="material-symbols-outlined text-[12px]">auto_fix_high</span>
            Code Agent fix ready
          </span>
        )}
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {activeTab ? (
          <CodeArea
            tab={activeTab}
            highlighted={highlighted}
            cursor={cursor}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onSelect={updateCursor}
            onClick={updateCursor}
            onScroll={handleScroll}
            textareaRef={textareaRef}
            gutterRef={gutterRef}
            highlightRef={highlightRef}
            activeLine={activeLine}
            ghostSuggestion={ghostSuggestion}
            onApplyGhost={onApplyGhost}
            onDismissGhost={onDismissGhost}
            fileLangLabel={languageLabel(fileLang.lang)}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-on-surface-variant text-xs p-6">
            <span className="material-symbols-outlined text-5xl mb-3">code_off</span>
            <p>No file open. Create a new file to start coding.</p>
          </div>
        )}

        {showFind && activeTab && (
          <FindBar
            state={find}
            onChange={setFind}
            onClose={() => setShowFind(false)}
            onNext={() => setActiveMatch((i) => (matchRanges.length === 0 ? 0 : (i + 1) % matchRanges.length))}
            onPrev={() => setActiveMatch((i) => (matchRanges.length === 0 ? 0 : (i - 1 + matchRanges.length) % matchRanges.length))}
            onReplace={onReplace}
            onReplaceAll={onReplaceAll}
            matchCount={matchRanges.length}
            activeIndex={activeMatch}
          />
        )}

        {showPalette && (
          <CommandPalette
            open={showPalette}
            commands={commands}
            onClose={() => setShowPalette(false)}
          />
        )}
      </div>

      <StatusBar
        file={activeTab?.filename ?? ''}
        languageLabel={languageLabel(fileLang.lang)}
        cursorLine={cursor.line}
        cursorColumn={cursor.column}
        selectionLength={cursor.selectionLength}
        totalLines={totalLines}
        isDirty={isDirty}
        saving={!!activeTab?.saving}
        eol={eol}
        indent={indent}
        lastSavedAt={activeTab?.savedAt ?? null}
        encoding="8"
      />
    </div>
  );
}

function CodeArea(props: {
  tab: LightIDETab;
  highlighted: string;
  cursor: Cursor;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onSelect: () => void;
  onClick: () => void;
  onScroll: () => void;
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  gutterRef: React.MutableRefObject<HTMLDivElement | null>;
  highlightRef: React.MutableRefObject<HTMLDivElement | null>;
  activeLine: number;
  ghostSuggestion?: { code: string; diagnosis: string; fix: string } | null;
  onApplyGhost?: () => void;
  onDismissGhost?: () => void;
  fileLangLabel: string;
}) {
  const {
    tab,
    highlighted,
    onChange,
    onKeyDown,
    onSelect,
    onClick,
    onScroll,
    textareaRef,
    gutterRef,
    highlightRef,
    activeLine,
    ghostSuggestion,
    onApplyGhost,
    onDismissGhost,
    fileLangLabel,
  } = props;
  const lines = tab.content.split('\n');
  return (
    <div className="flex-1 flex min-w-0 relative bg-surface-container-lowest">
      <div
        ref={gutterRef}
        className="flex-none w-12 border-r-2 border-primary bg-surface-variant text-right font-mono text-[11px] leading-[18px] text-on-surface-variant select-none overflow-hidden"
        aria-hidden="true"
      >
        {lines.map((_, i) => (
          <div
            key={i}
            className={`px-2 ${i + 1 === activeLine ? 'bg-primary text-on-primary font-bold' : ''}`}
            style={{ height: 18 }}
          >
            {i + 1}
          </div>
        ))}
      </div>

      <div className="flex-1 relative font-mono text-[12px] leading-[18px] overflow-hidden">
        {ghostSuggestion && (
          <div className="absolute top-2 right-2 z-10 max-w-md border-4 border-primary bg-background neo-shadow p-3">
            <div className="flex items-center gap-1 mb-1">
              <span className="material-symbols-outlined text-secondary text-[14px]">auto_fix_high</span>
              <span className="font-headline font-black uppercase text-[10px] text-primary">Code Agent fix</span>
            </div>
            <p className="text-[10px] font-body text-on-surface-variant mb-1">{ghostSuggestion.diagnosis}</p>
            <p className="text-[10px] font-body text-on-surface-variant mb-2 italic">Fix: {ghostSuggestion.fix}</p>
            <pre className="text-[9px] bg-black text-amber-300 p-2 max-h-32 overflow-auto custom-scrollbar whitespace-pre-wrap break-all">
              {ghostSuggestion.code.slice(0, 600)}{ghostSuggestion.code.length > 600 ? '…' : ''}
            </pre>
            <div className="flex justify-end gap-2 mt-2">
              {onDismissGhost && (
                <button onClick={onDismissGhost} className="text-[10px] font-bold uppercase border-2 border-primary px-2 py-0.5 hover:bg-surface">
                  Dismiss
                </button>
              )}
              {onApplyGhost && (
                <button onClick={onApplyGhost} className="text-[10px] font-bold uppercase border-2 border-primary bg-primary text-on-primary px-2 py-0.5 hover:bg-tertiary hover:text-on-tertiary">
                  Apply
                </button>
              )}
            </div>
          </div>
        )}

        <div
          ref={highlightRef}
          aria-hidden="true"
          className="absolute inset-0 p-2 whitespace-pre overflow-auto custom-scrollbar pointer-events-none"
          style={{ color: 'var(--color-on-surface)' }}
        >
          <code
            className={`hljs language-${fileLangLabel.toLowerCase()} block min-h-full`}
            dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
          />
        </div>

        <textarea
          ref={textareaRef}
          value={tab.content}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onSelect={onSelect}
          onClick={onClick}
          onScroll={onScroll}
          spellCheck={false}
          autoCorrect="off"
          autoCapitalize="off"
          wrap="off"
          className="absolute inset-0 p-2 w-full h-full bg-transparent text-transparent caret-primary font-mono text-[12px] leading-[18px] resize-none focus:outline-none whitespace-pre overflow-auto custom-scrollbar selection:bg-primary-fixed selection:text-on-primary-fixed"
          aria-label={`Editor for ${tab.filename}`}
        />
      </div>
    </div>
  );
}

function computeMatches(text: string, find: FindState): Array<{ start: number; end: number }> {
  if (!find.query) return [];
  const flags = 'g' + (find.caseSensitive ? '' : 'i');
  let re: RegExp;
  try {
    re = find.regex ? new RegExp(find.query, flags) : new RegExp(escapeRegex(find.query), flags);
  } catch {
    return [];
  }
  const out: Array<{ start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    out.push({ start: m.index, end: m.index + m[0].length });
    if (out.length > 5000) break;
  }
  return out;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
