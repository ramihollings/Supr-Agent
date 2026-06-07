'use client';
/* eslint-disable react-hooks/exhaustive-deps -- textarea editor callbacks intentionally retain stable DOM event identities */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CodeAgentChatPanel } from './ide/CodeAgentChatPanel';
import { CommandPalette, type Command } from './ide/CommandPalette';
import { DiffViewer } from './ide/DiffViewer';
import { FileOutline } from './ide/FileOutline';
import { FindBar, defaultFindState, type FindState } from './ide/FindBar';
import { ProblemsPanel } from './ide/ProblemsPanel';
import { StatusBar } from './ide/StatusBar';
import { detectLanguage, getEol, getIndentUnit, languageLabel } from '@/lib/ide/language';
import { extractOutline, type OutlineSymbol } from '@/lib/ide/outline';
import { extractProblems, type Problem } from '@/lib/ide/problems';
import { highlightForLang } from '@/lib/ide/highlight';
import { computeLineDiff } from '@/lib/ide/diff';

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
  onCursorChange?: (file: string, info: { line: number; column: number; scrollTop: number }) => void;
  onDismissDiff?: () => void;
  diffProposal?: { code: string; diagnosis: string; fix: string } | null;
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
  const [showDiff, setShowDiff] = useState(false);
  const [pendingDiff, setPendingDiff] = useState<{ code: string; diagnosis: string; fix: string } | null>(null);
  // Multi-cursor: positions where the next typing event should be applied
  // in addition to the textarea's primary cursor. Cleared after one edit
  // (a true multi-cursor state would require contenteditable, which is
  // out of scope for a textarea-backed "light IDE").
  const [multiCursors, setMultiCursors] = useState<Array<{ anchor: number; head: number }>>([]);
  const [chatOpen, setChatOpen] = useState(false);

  // When the parent hands us a new ghost proposal, default the diff to
  // shown. Closing the diff dismisses the proposal at the parent level.
  useEffect(() => {
    if (props.ghostSuggestion) {
      setPendingDiff(props.ghostSuggestion);
      setShowDiff(true);
    }
  }, [props.ghostSuggestion]);

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

  const updateCursor = useCallback((_arg?: unknown) => {
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

  // Notify parent of cursor / scroll position so it can persist them in
  // localStorage (crash recovery). Debounced to avoid thrashing the
  // storage layer on every keystroke.
  const cursorReportTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reportCursor = useCallback(() => {
    if (!activeTab || !props.onCursorChange) return;
    if (cursorReportTimer.current) clearTimeout(cursorReportTimer.current);
    const ta = textareaRef.current;
    const file = activeTab.filename;
    const info = { line: cursor.line, column: cursor.column, scrollTop: ta?.scrollTop ?? 0 };
    cursorReportTimer.current = setTimeout(() => {
      props.onCursorChange?.(file, info);
    }, 250);
  }, [activeTab, cursor, props]);
  useEffect(() => () => {
    if (cursorReportTimer.current) clearTimeout(cursorReportTimer.current);
  }, []);

  const updateCursorAndReport = useCallback(() => {
    updateCursor();
    reportCursor();
  }, [updateCursor, reportCursor]);

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
    reportCursor();
  }, [reportCursor]);

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
      if (isMod && e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        addCursorAbove();
        return;
      }
      if (isMod && e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        addCursorBelow();
        return;
      }
      if (isMod && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        selectAllOccurrences();
        return;
      }
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        insertAtCursor(ta, '    ');
        return;
      }
      if (e.key === 'Escape') {
        if (showFind) {
          e.preventDefault();
          setShowFind(false);
          return;
        }
        if (multiCursors.length > 0) {
          e.preventDefault();
          collapseMultiCursors();
          return;
        }
      }
    },
    [activeTab, onSaveFile, showFind, multiCursors.length],
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

  // ---- Multi-cursor helpers ----
  // Compute the byte offset for a given line/column (1-based) inside
  // the active tab's content.
  const offsetAtLineCol = (text: string, line: number, column: number) => {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < Math.min(line - 1, lines.length); i += 1) {
      offset += lines[i].length + 1;
    }
    if (line - 1 < lines.length) {
      offset += Math.max(0, Math.min(column - 1, lines[line - 1].length));
    }
    return offset;
  };
  const addCursorAbove = () => {
    if (!activeTab) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const before = activeTab.content.slice(0, ta.selectionStart ?? 0);
    const line = before.split('\n').length;
    if (line <= 1) return; // already on first line
    const col = before.length - before.lastIndexOf('\n');
    const target = offsetAtLineCol(activeTab.content, line - 1, col);
    setMultiCursors((prev) => {
      const next = [...prev, { anchor: target, head: target }];
      next.sort((a, b) => a.head - b.head);
      return next;
    });
  };
  const addCursorBelow = () => {
    if (!activeTab) return;
    const ta = textareaRef.current;
    if (!ta) return;
    const before = activeTab.content.slice(0, ta.selectionStart ?? 0);
    const line = before.split('\n').length;
    const lines = activeTab.content.split('\n');
    if (line >= lines.length) return; // already on last line
    const col = before.length - before.lastIndexOf('\n');
    const target = offsetAtLineCol(activeTab.content, line + 1, col);
    setMultiCursors((prev) => {
      const next = [...prev, { anchor: target, head: target }];
      next.sort((a, b) => a.head - b.head);
      return next;
    });
  };
  const collapseMultiCursors = () => setMultiCursors([]);
  const selectAllOccurrences = () => {
    if (!activeTab) return;
    const ta = textareaRef.current;
    if (!ta) return;
    // Pull the word/selection at the primary cursor
    const text = activeTab.content;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    let word: string;
    if (start !== end) {
      word = text.slice(start, end);
    } else {
      // Expand to word boundaries
      const before = text.slice(0, start);
      const after = text.slice(start);
      const m1 = before.match(/[A-Za-z0-9_]+$/);
      const m2 = after.match(/^[A-Za-z0-9_]+/);
      const left = m1 ? m1[0].length : 0;
      const right = m2 ? m2[0].length : 0;
      if (left + right === 0) return;
      word = text.slice(start - left, start + right);
    }
    if (!word) return;
    const safe = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(safe, 'g');
    const matches: Array<{ anchor: number; head: number }> = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      matches.push({ anchor: m.index, head: m.index + m[0].length });
      if (matches.length > 500) break;
    }
    setMultiCursors(matches);
  };

  // Intercept the next `beforeinput` event when multi-cursors are
  // active so the same character is inserted at every cursor position.
  const handleBeforeInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      if (!activeTab || multiCursors.length === 0) return;
      const event = e.nativeEvent as InputEvent;
      if (!event.inputType) return;
      // Only intercept text insertion / deletion. Let composition etc. through.
      if (
        !event.inputType.startsWith('insert') &&
        !event.inputType.startsWith('delete')
      ) {
        return;
      }
      e.preventDefault();
      const text = activeTab.content;
      const data = event.data ?? '';
      const cursors = [...multiCursors].sort((a, b) => a.anchor - b.anchor);
      let next = text;
      // Apply right-to-left so offsets remain valid
      for (let i = cursors.length - 1; i >= 0; i -= 1) {
        const c = cursors[i];
        const a = c.anchor;
        const h = c.head;
        const lo = Math.min(a, h);
        const hi = Math.max(a, h);
        if (event.inputType.startsWith('delete')) {
          let removeLen = 0;
          if (event.inputType === 'deleteContentBackward') removeLen = hi - lo || 1;
          else if (event.inputType === 'deleteContentForward') removeLen = hi - lo || 1;
          else if (event.inputType === 'deleteWordBackward') removeLen = countPrevWordLen(next, lo);
          else if (event.inputType === 'deleteWordForward') removeLen = countNextWordLen(next, lo);
          else if (event.inputType === 'deleteSoftLineBackward') removeLen = lo;
          else if (event.inputType === 'deleteSoftLineForward') removeLen = next.length - lo;
          else if (event.inputType === 'deleteHardLineBackward') removeLen = countLineStartLen(next, lo);
          else if (event.inputType === 'deleteHardLineForward') removeLen = countLineEndLen(next, lo);
          else removeLen = hi - lo;
          if (removeLen <= 0) continue;
          next = next.slice(0, lo) + next.slice(Math.min(next.length, lo + removeLen));
        } else {
          next = next.slice(0, lo) + data + next.slice(lo);
        }
      }
      onChangeContent(activeTab.filename, next);
      // Collapse to single cursor (the primary) — multi-cursor editing
      // in a textarea is single-shot only.
      setMultiCursors([]);
    },
    [activeTab, multiCursors, onChangeContent],
  );

  const commands: Command[] = useMemo(() => {
    const list: Command[] = [
      { id: 'save', label: 'Save File', description: 'Persist current buffer to workspace', group: 'File', shortcut: '⌘S', icon: 'save', run: () => activeTab && onSaveFile(activeTab.filename) },
      { id: 'new', label: 'New File', description: 'Create a new file in workspace', group: 'File', icon: 'note_add', run: onNewFile },
      { id: 'close', label: 'Close Tab', group: 'File', icon: 'close', run: () => activeTab && onCloseTab(activeTab.filename) },
      { id: 'find', label: 'Find', description: 'Search in current file', group: 'Edit', shortcut: '⌘F', icon: 'search', run: () => setShowFind(true) },
      { id: 'replace', label: 'Toggle Replace', group: 'Edit', icon: 'find_replace', run: () => setFind((s) => ({ ...s, showReplace: !s.showReplace })) },
      { id: 'cursor-above', label: 'Add Cursor Above', shortcut: '⌘⌥↑', group: 'Edit', icon: 'vertical_align_top', keywords: ['multi', 'multicursor'], run: addCursorAbove },
      { id: 'cursor-below', label: 'Add Cursor Below', shortcut: '⌘⌥↓', group: 'Edit', icon: 'vertical_align_bottom', keywords: ['multi', 'multicursor'], run: addCursorBelow },
      { id: 'select-occurrences', label: 'Select All Occurrences', shortcut: '⌘⇧L', group: 'Edit', icon: 'select_all', keywords: ['multi', 'multicursor', 'rename'], run: selectAllOccurrences },
      { id: 'collapse-cursors', label: 'Collapse Multi-Cursor', group: 'Edit', icon: 'close_fullscreen', keywords: ['multi', 'multicursor'], run: collapseMultiCursors },
      { id: 'palette', label: 'Open Command Palette', shortcut: '⌘K', group: 'View', icon: 'command', run: () => setShowPalette(true) },
      { id: 'run', label: 'Run Code', description: 'Execute the active file in the sandbox', group: 'Run', shortcut: '▶', icon: 'play_arrow', run: () => activeTab && onRunCode(activeTab.filename) },
      { id: 'lint', label: 'Run Lint', group: 'Run', icon: 'fact_check', run: onLint },
      { id: 'build', label: 'Run Build', group: 'Run', icon: 'deployed_code', run: onBuild },
      { id: 'diagnose', label: 'Code Agent: Diagnose & Fix', description: 'Ask the Code Agent to repair the active file', group: 'Code Agent', icon: 'psychology', run: () => activeTab && onDiagnoseFix(activeTab.filename) },
      { id: 'chat', label: 'Toggle Code Agent Chat', description: 'Open a streaming chat with the Code Agent', group: 'Code Agent', icon: 'forum', keywords: ['chat', 'llm', 'agent'], run: () => setChatOpen((v) => !v) },
    ];
    return onJumpToResearch
      ? [...list, { id: 'research', label: 'Open Research Brief', group: 'Code Agent', icon: 'travel_explore', run: () => onJumpToResearch(activeFile) }]
      : list;
  }, [activeTab, activeFile, onSaveFile, onNewFile, onCloseTab, onRunCode, onLint, onBuild, onDiagnoseFix, onJumpToResearch, setChatOpen]);

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
          <button
            onClick={() => setChatOpen((v) => !v)}
            className={`px-2 h-7 border-2 border-primary flex items-center gap-1 font-body text-[10px] font-bold uppercase ${
              chatOpen ? 'bg-primary text-on-primary' : 'bg-background text-primary hover:bg-tertiary hover:text-on-tertiary'
            }`}
            title="Code Agent Chat"
          >
            <span className="material-symbols-outlined text-[12px]">forum</span>
            Chat
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
            onBeforeInput={handleBeforeInput}
            onSelect={updateCursorAndReport}
            onClick={updateCursorAndReport}
            onScroll={handleScroll}
            multiCursors={multiCursors}
            textareaRef={textareaRef}
            gutterRef={gutterRef}
            highlightRef={highlightRef}
            activeLine={activeLine}
            diffOpen={showDiff}
            diffPayload={pendingDiff}
            onAcceptDiff={onApplyGhost}
            onRejectDiff={onDismissGhost}
            onCloseDiff={() => setShowDiff(false)}
            onAcceptHunk={(_hunkIndex) => onApplyGhost?.()}
            onRejectHunk={(_hunkIndex) => onDismissGhost?.()}
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

        <CodeAgentChatPanel
          open={chatOpen}
          activeFile={activeFile}
          activeFileContent={activeTab?.content ?? ''}
          onClose={() => setChatOpen(false)}
        />
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
  onBeforeInput: (e: React.FormEvent<HTMLTextAreaElement>) => void;
  onSelect: () => void;
  onClick: () => void;
  onScroll: () => void;
  multiCursors: Array<{ anchor: number; head: number }>;
  textareaRef: React.MutableRefObject<HTMLTextAreaElement | null>;
  gutterRef: React.MutableRefObject<HTMLDivElement | null>;
  highlightRef: React.MutableRefObject<HTMLDivElement | null>;
  activeLine: number;
  diffOpen: boolean;
  diffPayload: { code: string; diagnosis: string; fix: string } | null;
  onAcceptDiff?: () => void;
  onRejectDiff?: () => void;
  onCloseDiff: () => void;
  onAcceptHunk: (hunkIndex: number) => void;
  onRejectHunk: (hunkIndex: number) => void;
  fileLangLabel: string;
}) {
  const {
    tab,
    highlighted,
    onChange,
    onKeyDown,
    onBeforeInput,
    onSelect,
    onClick,
    onScroll,
    multiCursors,
    textareaRef,
    gutterRef,
    highlightRef,
    activeLine,
    diffOpen,
    diffPayload,
    onAcceptDiff,
    onRejectDiff,
    onCloseDiff,
    onAcceptHunk,
    onRejectHunk,
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
        {diffOpen && diffPayload && (
          <DiffViewer
            open={diffOpen}
            filename={tab.filename}
            original={tab.content}
            proposed={diffPayload.code}
            diagnosis={diffPayload.diagnosis}
            fix={diffPayload.fix}
            onAcceptAll={() => onAcceptDiff?.()}
            onRejectAll={() => onRejectDiff?.()}
            onAcceptHunk={onAcceptHunk}
            onRejectHunk={onRejectHunk}
            onClose={onCloseDiff}
          />
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
          onBeforeInput={onBeforeInput}
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
        {multiCursors.length > 0 && (
          <div className="absolute top-2 left-14 z-10 bg-tertiary text-on-tertiary font-headline font-black uppercase text-[9px] px-1.5 py-0.5 border border-primary">
            Multi-cursor: {multiCursors.length} · Esc to collapse
          </div>
        )}
      </div>

      <Minimap
        content={tab.content}
        highlighted={highlighted}
        scrollRef={textareaRef}
      />
    </div>
  );
}

function Minimap({ content, highlighted, scrollRef }: { content: string; highlighted: string; scrollRef: React.MutableRefObject<HTMLTextAreaElement | null> }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 0 });

  useEffect(() => {
    const ta = scrollRef.current;
    if (!ta) return;
    const update = () => {
      const total = ta.scrollHeight;
      const visible = ta.clientHeight;
      const ratio = total > 0 ? visible / total : 1;
      const topRatio = total > 0 ? ta.scrollTop / total : 0;
      setViewport({ top: topRatio * 100, height: ratio * 100 });
    };
    update();
    ta.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      ta.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [scrollRef, content]);

  const onClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const ta = scrollRef.current;
    const rect = e.currentTarget.getBoundingClientRect();
    if (!ta) return;
    const ratio = (e.clientY - rect.top) / rect.height;
    ta.scrollTop = ratio * ta.scrollHeight;
  };

  return (
    <div
      ref={ref}
      onClick={onClick}
      role="presentation"
      aria-hidden="true"
      className="hidden md:block flex-none w-24 border-l-2 border-primary bg-surface-container-lowest relative overflow-hidden cursor-pointer"
      title="Minimap — click to jump"
    >
      <div
        className="absolute inset-x-0 p-1 text-[3px] leading-[4px] font-mono whitespace-pre text-on-surface pointer-events-none select-none"
        style={{ transform: 'scaleY(0.25)', transformOrigin: 'top left', width: '400%' }}
        dangerouslySetInnerHTML={{ __html: highlighted.slice(0, 60000) + '\n' }}
      />
      <div
        className="absolute inset-x-0 border-t-2 border-b-2 border-primary bg-primary/15 pointer-events-none"
        style={{ top: `${viewport.top}%`, height: `${Math.max(viewport.height, 4)}%` }}
      />
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

function countPrevWordLen(text: string, offset: number): number {
  // Count characters to remove when deleting the previous word from
  // `offset`. Mirrors the typical Ctrl+Backspace behavior in editors:
  // skip trailing whitespace, then skip a run of word/non-word chars.
  let i = offset;
  let removed = 0;
  while (i > 0 && /\s/.test(text[i - 1])) {
    i -= 1;
    removed += 1;
  }
  const startClass = isWordChar(text[i - 1]);
  while (i > 0 && isWordChar(text[i - 1]) === startClass) {
    i -= 1;
    removed += 1;
  }
  return removed;
}

function countNextWordLen(text: string, offset: number): number {
  let i = offset;
  let removed = 0;
  while (i < text.length && /\s/.test(text[i])) {
    i += 1;
    removed += 1;
  }
  const startClass = isWordChar(text[i]);
  while (i < text.length && isWordChar(text[i]) === startClass) {
    i += 1;
    removed += 1;
  }
  return removed;
}

function countLineStartLen(text: string, offset: number): number {
  // Length to delete from `offset` back to the start of the line.
  let i = offset;
  while (i > 0 && text[i - 1] !== '\n') i -= 1;
  return offset - i;
}

function countLineEndLen(text: string, offset: number): number {
  let i = offset;
  while (i < text.length && text[i] !== '\n') i += 1;
  return i - offset;
}

function isWordChar(ch: string | undefined): boolean {
  if (!ch) return false;
  return /[A-Za-z0-9_]/.test(ch);
}
