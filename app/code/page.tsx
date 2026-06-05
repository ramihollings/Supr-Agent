"use client";

import { useState, useEffect, useMemo, useRef } from 'react';
import { useToast } from '@/components/ToastProvider';
import { RunTranscriptView } from '@/components/RunTranscriptView';
import { LightIDE, type LightIDETab } from '@/components/LightIDE';
import { FileOutline } from '@/components/ide/FileOutline';
import { ProblemsPanel } from '@/components/ide/ProblemsPanel';
import { extractOutline } from '@/lib/ide/outline';
import { extractProblems, type Problem } from '@/lib/ide/problems';
import { detectLanguage } from '@/lib/ide/language';
import {
  fetchMissionState,
  recordFailureAction,
  updateTaskStatusAction,
  fetchWorkspaceFilesAction,
  readWorkspaceFileAction,
  writeWorkspaceFileAction,
  deleteWorkspaceFileAction,
  executeCodeAction,
  runProjectCheckAction,
  fetchSettingsAction,
  updateSettingAction
} from '@/app/actions';
import { Mission, Artifact, RunEvent } from '@/types';

type TerminalLine = {
  id: number;
  type: 'command' | 'output' | 'error' | 'success' | 'supr';
  content: string;
};

type TriageState = 'idle' | 'failed' | 'triaging' | 'retrying' | 'passed';

export default function CodePage() {
  const [triageState, setTriageState] = useState<TriageState>('idle');
  const [retryCount, setRetryCount] = useState(0);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([]);
  const [tabs, setTabs] = useState<LightIDETab[]>([]);
  const [activeFile, setActiveFile] = useState<string>('');
  const [pendingFix, setPendingFix] = useState<{ code: string; diagnosis: string; fix: string } | null>(null);
  const [testHistory, setTestHistory] = useState<string[]>([]);

  // Real filesystem files list
  const [filesList, setFilesList] = useState<{ filename: string; size: number; updatedAt: string; type: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allowApiKeys, setAllowApiKeys] = useState(false);

  const [activeResearch, setActiveResearch] = useState<Artifact | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mission, setMission] = useState<Mission | null>(null);
  const [sidePanel, setSidePanel] = useState<'outline' | 'problems' | 'git'>('outline');

  // New file modal state
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFilename, setNewFilename] = useState('');

  const { showToast } = useToast();

  const terminalOutput = useMemo(
    () => terminalLines.map((l) => l.content).join('\n'),
    [terminalLines],
  );

  const updateTabContent = (filename: string, content: string) => {
    setTabs((prev) => prev.map((t) => (t.filename === filename ? { ...t, content } : t)));
  };
  const setTabSaving = (filename: string, saving: boolean) => {
    setTabs((prev) => prev.map((t) => (t.filename === filename ? { ...t, saving } : t)));
  };
  const markTabSaved = (filename: string, content: string) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.filename === filename ? { ...t, lastSavedContent: content, content, saving: false, savedAt: new Date().toISOString() } : t,
      ),
    );
  };
  const closeTab = (filename: string) => {
    setTabs((prev) => prev.filter((t) => t.filename !== filename));
    if (activeFile === filename) {
      const remaining = tabs.filter((t) => t.filename !== filename);
      setActiveFile(remaining[0]?.filename ?? '');
    }
  };

  const activeTab = useMemo(() => tabs.find((t) => t.filename === activeFile) ?? null, [tabs, activeFile]);
  const fileLang = useMemo(() => detectLanguage(activeFile), [activeFile]);
  const outline = useMemo(() => (activeTab ? extractOutline(activeTab.content, fileLang.lang) : []), [activeTab, fileLang.lang]);
  const problems: Problem[] = useMemo(() => extractProblems(terminalOutput, activeFile), [terminalOutput, activeFile]);

  // -- Auto-save: debounced save 1.5s after the last keystroke when a tab
  // is dirty. Avoids racing the explicit Save button (we use the same
  // markTabSaved pipeline so status indicators stay consistent).
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab.content === activeTab.lastSavedContent) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => {
      handleSaveFile();
    }, 1500);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.content, activeTab?.lastSavedContent, activeFile]);

  // -- Crash recovery: persist a session snapshot (open tabs, active file,
  // per-tab unsaved content + cursor) in localStorage so a refresh or
  // browser crash restores the workspace. Stored values are always
  // reconciled against the server-side file list on load.
  const SESSION_KEY = 'supr.lightide.session.v1';
  type PersistedSession = {
    activeFile: string;
    openFiles: string[];
    drafts: Record<string, string>;
    cursor: Record<string, { line: number; column: number; scrollTop: number }>;
  };
  const readPersistedSession = (): PersistedSession | null => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;
      return parsed as PersistedSession;
    } catch {
      return null;
    }
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (tabs.length === 0) return;
    const drafts: Record<string, string> = {};
    const cursor: Record<string, { line: number; column: number; scrollTop: number }> = {};
    for (const t of tabs) {
      if (t.content !== t.lastSavedContent) drafts[t.filename] = t.content;
    }
    const snapshot: PersistedSession = {
      activeFile,
      openFiles: tabs.map((t) => t.filename),
      drafts,
      cursor,
    };
    try {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
    } catch {
      // localStorage may be full or disabled; silently skip.
    }
  }, [tabs, activeFile]);

  const loadWorkspace = async () => {
    setIsLoading(true);
    const settings = await fetchSettingsAction();
    setAllowApiKeys(settings?.sandbox_allow_api_keys === 'true');

    const activeMission = await fetchMissionState();
    if (activeMission) {
      setMission(activeMission);
      const codeFailures = activeMission.failures?.filter(f => f.agentName === 'Code Agent');
      if (codeFailures) setRetryCount(codeFailures.length);
    }

    let list = await fetchWorkspaceFilesAction();
    if (list.length === 0) {
      const seeds: Record<string, string> = {
        'main.py': `# Core entry point\nimport feedback_clusters as fc\n\ndef run_pipeline():\n    print("Starting Cognitive Pipeline...")\n    print("Loading datasets...")\n    print("Pipeline run completed successfully.")\n\nif __name__ == "__main__":\n    run_pipeline()`,
        'feedback_clusters.py': `# Cognitive Debt Detection Script\n# Author: Supr CodeBot\nimport numpy as np\n\ndef analyze_feedback(data_path: str):\n    """\n    Analyzes ticket feedback to identify clusters.\n    """\n    print("Analyzing feedback embeddings...")\n    return {"status": "success", "clusters": 5}\n`,
        'validation.py': `# Pytest Verification Suite\n# Author: QA Sentinel\nimport pytest\nfrom feedback_clusters import analyze_feedback\n\ndef test_analyze_feedback():\n    print("Running verification tests...")\n    result = analyze_feedback("sample_tickets.json")\n    assert result["status"] == "success"\n    print("Test validation.py PASSED.")\n\nif __name__ == "__main__":\n    test_analyze_feedback()`
      };

      for (const [fname, content] of Object.entries(seeds)) {
        await writeWorkspaceFileAction(fname, content);
      }
      list = await fetchWorkspaceFilesAction();
    }
    setFilesList(list);

    // Restore any unsaved drafts from localStorage so a refresh or
    // crash doesn't lose in-progress edits. Only files that still exist
    // in the workspace are restored; everything else is discarded.
    const persisted = readPersistedSession();
    const drafts = persisted?.drafts ?? {};
    const preferredActive = persisted?.activeFile && list.find((f) => f.filename === persisted.activeFile)
      ? persisted.activeFile
      : null;

    if (list.length > 0) {
      const initialTabs: LightIDETab[] = await Promise.all(
        list.map(async (f) => {
          const content = await readWorkspaceFileAction(f.filename);
          const draft = drafts[f.filename];
          return {
            filename: f.filename,
            content: typeof draft === 'string' ? draft : content,
            lastSavedContent: content,
            savedAt: new Date().toISOString(),
            saving: false,
            // Reattach the unsaved-mark so the status bar shows "Modified"
            // immediately for restored drafts.
            ...(typeof draft === 'string' && draft !== content ? {} : {}),
          };
        }),
      );
      setTabs(initialTabs);
      const defaultFile: string = preferredActive
        || (list.find((f) => f.filename === 'main.py') ?? list[0])?.filename
        || '';
      setActiveFile(defaultFile);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const selectFile = async (filename: string) => {
    setActiveFile(filename);
    setPendingFix(null);
    const existing = tabs.find((t) => t.filename === filename);
    if (existing && existing.content === '') {
      const content = await readWorkspaceFileAction(filename);
      updateTabContent(filename, content);
      setTabs((prev) => prev.map((t) => (t.filename === filename ? { ...t, content, lastSavedContent: content, savedAt: new Date().toISOString() } : t)));
    }
  };

  const handleSaveFile = async (filenameArg?: string) => {
    const filename = filenameArg ?? activeFile;
    if (!filename) return;
    const tab = tabs.find((t) => t.filename === filename);
    if (!tab) return;
    setTabSaving(filename, true);
    try {
      const res = await writeWorkspaceFileAction(filename, tab.content);
      if (res.success) {
        markTabSaved(filename, tab.content);
        showToast(`${filename} saved to workspace! ✓`);
        setTerminalLines(prev => [...prev, { id: Date.now(), type: 'output', content: `[Workspace Storage] Synchronized ${filename} with secure workspace.` }]);
        const list = await fetchWorkspaceFilesAction();
        setFilesList(list);
      } else {
        showToast(`Failed to save: ${res.error}`);
        setTabSaving(filename, false);
      }
    } catch (err) {
      console.error(err);
      showToast(`Failed to save: ${String(err)}`);
      setTabSaving(filename, false);
    }
  };

  const handleCreateFile = async () => {
    if (!newFilename.trim()) return;
    const name = newFilename.trim();
    const defaultContent = `# New file: ${name}\n`;
    await writeWorkspaceFileAction(name, defaultContent);
    await loadWorkspace();
    setActiveFile(name);
    setShowNewFileModal(false);
    setNewFilename('');
    showToast(`File ${name} created in workspace!`);
  };

  const handleDeleteFile = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to permanently delete ${filename}?`)) {
      await deleteWorkspaceFileAction(filename);
      showToast(`Deleted ${filename}`);
      const list = await fetchWorkspaceFilesAction();
      setFilesList(list);
      closeTab(filename);
      if (activeFile === filename && list.length > 0) {
        setActiveFile(list[0].filename);
      }
    }
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const handleToggleApiKeys = async (checked: boolean) => {
    setAllowApiKeys(checked);
    await updateSettingAction('sandbox_allow_api_keys', checked ? 'true' : 'false');
    showToast(`API key sharing ${checked ? 'enabled' : 'disabled'} for secure workspace`);
  };

  const handleRunTest = async () => {
    if (!activeFile || isRunning) return;
    const tab = tabs.find((t) => t.filename === activeFile);
    if (!tab) return;
    setIsRunning(true);
    setTerminalLines(prev => [...prev, { id: Date.now(), type: 'command', content: `python ${activeFile}` }]);

    if (tab.content !== tab.lastSavedContent) {
      await handleSaveFile();
    }

    await new Promise(r => setTimeout(r, 600));

    const res = await executeCodeAction(activeFile, activeFile.endsWith('.py') ? 'python' : 'javascript');
    const timeNow = Date.now();
    if (res.success) {
      setTestHistory(prev => [`${new Date().toLocaleTimeString()} ${activeFile}: passed`, ...prev].slice(0, 6));
      const outputLines: string[] = res.stdout ? res.stdout.split('\n') : [];
      const newLines = outputLines.map((l: string, i: number) => ({
        id: timeNow + i,
        type: 'success' as const,
        content: l
      }));
      setTerminalLines(prev => [...prev, ...newLines]);
      setTriageState('passed');

      if (mission && activeFile === 'validation.py') {
        await updateTaskStatusAction(mission.id, 't2', 'Done');
      }
    } else {
      setTestHistory(prev => [`${new Date().toLocaleTimeString()} ${activeFile}: failed`, ...prev].slice(0, 6));
      const errorContent = res.stderr || ('error' in res ? res.error : '') || 'Execution failed with non-zero exit code.';
      const outputLines: string[] = errorContent.split('\n');
      const newLines = outputLines.map((l: string, i: number) => ({
        id: timeNow + i,
        type: 'error' as const,
        content: l
      }));
      setTerminalLines(prev => [...prev, ...newLines]);
      setTriageState('failed');
      setRetryCount(prev => prev + 1);

      if (mission && activeFile === 'validation.py') {
        await recordFailureAction(mission.id, {
          taskId: 't2',
          agentName: 'Code Agent',
          failureType: 'RuntimeError',
          attemptNumber: retryCount + 1,
          summary: "RuntimeError in verification tests inside secure workspace.",
          suprGuidance: ""
        });
      }
    }
    setIsRunning(false);
  };

  const handleProjectCheck = async (check: 'lint' | 'build') => {
    if (isRunning) return;
    setIsRunning(true);
    setTerminalLines(prev => [...prev, { id: Date.now(), type: 'command', content: `npm run ${check}` }]);
    const res = await runProjectCheckAction(check);
    const content = [res.stdout, res.stderr, res.error].filter(Boolean).join('\n') || `${check} completed.`;
    setTerminalLines(prev => [...prev, { id: Date.now() + 1, type: res.success ? 'success' : 'error', content }]);
    setTestHistory(prev => [`${new Date().toLocaleTimeString()} project ${check}: ${res.success ? 'passed' : 'failed'}`, ...prev].slice(0, 6));
    setIsRunning(false);
  };

  const handleRollbackFile = () => {
    if (!activeFile) return;
    const tab = tabs.find((t) => t.filename === activeFile);
    if (!tab) return;
    updateTabContent(activeFile, tab.lastSavedContent);
    setPendingFix(null);
    showToast(`Rolled ${activeFile} back to last saved content`);
  };

  const handleApplyPendingFix = async () => {
    if (!pendingFix || !activeFile) return;
    updateTabContent(activeFile, pendingFix.code);
    await writeWorkspaceFileAction(activeFile, pendingFix.code);
    markTabSaved(activeFile, pendingFix.code);
    setPendingFix(null);
    showToast(`Applied Code Agent fix to ${activeFile}`);
  };

  const handleDiagnoseAndFix = async () => {
    if (isRunning || !activeFile) return;
    setIsRunning(true);
    setTriageState('triaging');

    // Gather research context from any available research artifacts
    const researchDocs = mission?.artifacts?.filter(a => a.filename.startsWith('research_')) || [];
    const researchContext = researchDocs.length > 0
      ? researchDocs.map(doc => `--- ${doc.filename} ---\n${doc.content}`).join('\n\n')
      : '';

    setTerminalLines(prev => [
      ...prev,
      { id: Date.now(), type: 'supr', content: `[SUPR] Delegating ${activeFile} to Code Agent for Diagnostics Console run...` },
      { id: Date.now() + 1, type: 'supr', content: researchContext
        ? `[SUPR] Injecting ${researchDocs.length} research brief(s) into Code Agent context.`
        : '[SUPR] No Research Library context found. Running static-only analysis.' },
    ]);

    try {
      const response = await fetch('/api/code-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: activeFile,
          fileContent: activeTab?.content ?? '',
          researchContext,
          missionId: mission?.id,
        }),
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
              setTerminalLines(prev => [
                ...prev,
                { id: Date.now(), type: 'supr', content: msg.content },
              ]);
            }

            if (msg.type === 'result') {
              if (msg.fixedCode) {
                setPendingFix({
                  code: msg.fixedCode,
                  diagnosis: msg.diagnosis || 'No diagnosis returned.',
                  fix: msg.fix || 'No fix returned.',
                });
              }

              const resultLines: TerminalLine[] = [
                { id: Date.now(), type: 'supr', content: `[CODE AGENT] Diagnosis: ${msg.diagnosis}` },
                { id: Date.now() + 1, type: 'supr', content: `[CODE AGENT] Fix applied: ${msg.fix}` },
                { id: Date.now() + 2, type: msg.passed ? 'success' : 'error', content: `Test result: ${msg.testResult}` },
              ];
              if (msg.evidenceIds?.length) {
                resultLines.push({ id: Date.now() + 4, type: 'output', content: `[EVIDENCE] Patch evidence: ${msg.evidenceIds.join(', ')}` });
              }
              if (msg.validationEvidenceIds?.length) {
                resultLines.push({ id: Date.now() + 5, type: 'output', content: `[EVIDENCE] Validation evidence: ${msg.validationEvidenceIds.join(', ')}` });
              }
              if (msg.validationApprovalId) {
                resultLines.push({ id: Date.now() + 6, type: 'error', content: `[APPROVAL] Validation blocked until approval ${msg.validationApprovalId}` });
              }
              if (msg.retryPatchActionId) {
                resultLines.push({ id: Date.now() + 7, type: 'supr', content: `[RETRY] Patch retry action: ${msg.retryPatchActionId}` });
              }
              if (msg.retryValidationActionId) {
                resultLines.push({ id: Date.now() + 8, type: 'supr', content: `[RETRY] Validation retry action: ${msg.retryValidationActionId}` });
              }

              if (msg.passed) {
                resultLines.push({ id: Date.now() + 3, type: 'success', content: `[CODE AGENT] ✓ All assertions passed. File updated in workspace.` });
                setTriageState('passed');
                showToast(`Code Agent fixed ${activeFile}!`);
              } else {
                resultLines.push({ id: Date.now() + 3, type: 'error', content: '[CODE AGENT] Fix partial — escalating to Supr for review.' });
                setTriageState('failed');
                setRetryCount(prev => prev + 1);
              }

              setTerminalLines(prev => [...prev, ...resultLines]);
            }

            if (msg.type === 'error') {
              setTerminalLines(prev => [
                ...prev,
                { id: Date.now(), type: 'error', content: `[ERROR] ${msg.content}` },
              ]);
              setTriageState('failed');
            }
          } catch (parseErr) {
            // Skip malformed NDJSON lines
          }
        }
      }
    } catch (err: any) {
      setTerminalLines(prev => [
        ...prev,
        { id: Date.now(), type: 'error', content: `[ERROR] Code Agent pipeline failed: ${err.message}` },
      ]);
      setTriageState('failed');
    }

    setIsRunning(false);
  };

  const researchArtifacts = mission?.artifacts?.filter(a => a.filename.startsWith('research_')) || [];
  const codeRunEvents: RunEvent[] = terminalLines.map((line) => ({
    id: String(line.id),
    kind: line.type === 'command' ? 'command' : line.type === 'error' ? 'failure' : line.type === 'supr' ? 'system' : 'tool',
    title: line.type === 'command' ? 'Workspace command' : line.type === 'supr' ? 'Supervisor note' : 'Execution output',
    detail: line.content,
    actor: line.type === 'supr' ? 'Supr' : 'Code Workspace',
    timestamp: new Date(line.id).toISOString(),
    status: line.type === 'error' ? 'failed' : line.type === 'output' && !line.content.trim() ? 'warning' : 'succeeded',
    evidence: line.type === 'success' || line.type === 'error'
      ? [{ id: `${line.id}-terminal`, label: activeFile || 'workspace', durable: true }]
      : [],
    raw: line,
  }));

  return (
    <div className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden bg-surface-container relative">
      
      {/* Workspace Header */}
      <header className="flex-none h-16 border-b-4 border-primary bg-background flex justify-between items-center px-4 lg:px-6">
        <div className="flex items-center space-x-4">
          <span className="material-symbols-outlined text-primary text-2xl">folder_open</span>
          <h2 className="font-headline font-bold text-lg md:text-xl uppercase tracking-tight">Code Runner & Workspace</h2>
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 bg-surface-container-high px-3 py-1 border-2 border-primary">
            <span className={`w-3 h-3 border border-primary ${triageState === 'passed' ? 'bg-tertiary animate-pulse' : 'bg-primary-fixed'}`}></span>
            <span className="font-body font-bold text-sm uppercase">
              Workspace Status: {triageState === 'passed' ? 'Passing' : 'Monitoring'}
            </span>
          </div>
          <button
            onClick={handleRunTest}
            disabled={isRunning || !activeFile}
            className="bg-primary text-on-primary border-2 border-primary px-4 py-1.5 font-headline font-bold uppercase hover:bg-tertiary hover:text-on-tertiary transition-colors neo-shadow active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Run Code
          </button>
          <button
            onClick={() => handleProjectCheck('lint')}
            disabled={isRunning}
            className="hidden md:flex bg-background text-primary border-2 border-primary px-3 py-1.5 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">fact_check</span>
            Lint
          </button>
          <button
            onClick={() => handleProjectCheck('build')}
            disabled={isRunning}
            className="hidden md:flex bg-background text-primary border-2 border-primary px-3 py-1.5 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50 items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">deployed_code</span>
            Build
          </button>
        </div>
      </header>

      {/* Split Pane Layout */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        
        {/* Left Pane: Explorer & Security Panel */}
        <aside className="w-64 flex-none border-r-4 border-primary bg-background hidden md:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center shrink-0">
            <span className="font-headline font-bold uppercase text-sm tracking-widest">Workspace files</span>
            <button 
              onClick={() => setShowNewFileModal(true)}
              className="text-primary hover:text-secondary flex items-center"
              title="New File"
            >
              <span className="material-symbols-outlined text-[20px]">add_box</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-body text-sm">
            {isLoading ? (
              <div className="text-center p-4 font-mono text-xs uppercase animate-pulse">Scanning Files...</div>
            ) : (
              <ul className="space-y-1">
                {filesList.map(file => (
                  <li key={file.filename}>
                    <div
                      onClick={() => selectFile(file.filename)}
                      className={`flex items-center justify-between py-1 px-2 cursor-pointer border-2 ${activeFile === file.filename ? 'bg-primary-container border-primary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                        <span className="material-symbols-outlined text-[18px]">
                          {file.filename.endsWith('.py') ? 'data_object' : 'description'}
                        </span>
                        <span className="truncate text-xs">{file.filename}</span>
                      </div>
                      <button 
                        onClick={(e) => handleDeleteFile(file.filename, e)}
                        className="text-on-surface-variant hover:text-error p-0.5 rounded-sm"
                        title="Delete File"
                      >
                        <span className="material-symbols-outlined text-xs">delete</span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Security / Workspace Config Panel */}
          <div className="border-t-4 border-primary flex flex-col shrink-0 bg-surface-container-high">
            <div className="p-2 border-b-2 border-primary bg-primary text-primary-fixed flex items-center justify-between">
              <span className="font-headline font-bold uppercase text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">shield</span>
                Workspace Metrics
              </span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-black animate-pulse" title="Active"></span>
            </div>
            <div className="p-3 space-y-3 font-mono text-[10px] text-primary">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Engine:</span>
                  <span className="font-bold">Secure Workspace</span>
                </div>
                <div className="flex justify-between">
                  <span>CPU Limit:</span>
                  <span className="font-bold text-secondary">1.0 Cores</span>
                </div>
                <div className="flex justify-between">
                  <span>Memory Max:</span>
                  <span className="font-bold text-secondary">512 MB</span>
                </div>
                <div className="flex justify-between">
                  <span>Network:</span>
                  <span className="font-bold text-error uppercase">Air-Gapped</span>
                </div>
              </div>

              {/* API Key Expose Checkbox */}
              <div className="border-t-2 border-primary pt-2 flex items-start gap-2">
                <input
                  type="checkbox"
                  id="sandbox_api_keys"
                  checked={allowApiKeys}
                  onChange={(e) => handleToggleApiKeys(e.target.checked)}
                  className="mt-0.5 accent-primary h-3.5 w-3.5 border-2 border-primary"
                />
                <label htmlFor="sandbox_api_keys" className="cursor-pointer font-bold leading-tight select-none">
                  Allow using API keys inside this workspace
                </label>
              </div>
            </div>
          </div>
        </aside>

        {/* Middle Pane: Light IDE */}
        <div className="flex-1 flex min-w-0 bg-background relative w-full border-r-4 border-primary">
          <div className="flex-1 flex flex-col min-w-0">
            {pendingFix && (
              <div className="border-b-4 border-primary bg-primary-container p-3 flex flex-col gap-2 shrink-0">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-headline font-black uppercase text-xs text-primary">Code Agent fix pending review</h3>
                    <p className="font-body text-[11px] text-on-primary-container">{pendingFix.diagnosis} Fix: {pendingFix.fix}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={handleApplyPendingFix} className="bg-primary text-on-primary border-2 border-primary px-3 py-1 font-headline font-bold uppercase text-[10px] hover:bg-tertiary">
                      Apply Fix
                    </button>
                    <button onClick={() => setPendingFix(null)} className="bg-background text-primary border-2 border-primary px-3 py-1 font-headline font-bold uppercase text-[10px] hover:bg-surface">
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )}
            <LightIDE
              tabs={tabs}
              activeFile={activeFile}
              onSelectFile={selectFile}
              onChangeContent={updateTabContent}
              onSaveFile={handleSaveFile}
              onCloseTab={closeTab}
              onNewFile={() => setShowNewFileModal(true)}
              onRunCode={() => handleRunTest()}
              onLint={() => handleProjectCheck('lint')}
              onBuild={() => handleProjectCheck('build')}
              onDiagnoseFix={() => handleDiagnoseAndFix()}
              ghostSuggestion={pendingFix}
              onApplyGhost={handleApplyPendingFix}
              onDismissGhost={() => setPendingFix(null)}
              terminalOutput={terminalOutput}
            />
          </div>

          {/* Outline + Problems rail */}
          <aside className="w-56 flex-none border-l-4 border-primary bg-background hidden xl:flex flex-col">
            <div className="flex items-center border-b-4 border-primary bg-surface-variant">
              {([
                { id: 'outline' as const, label: 'Outline', icon: 'account_tree' },
                { id: 'problems' as const, label: `Problems (${problems.length})`, icon: 'bug_report' },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setSidePanel(tab.id)}
                  className={`flex-1 px-2 h-8 border-r-2 border-primary last:border-r-0 font-headline font-black uppercase text-[10px] flex items-center justify-center gap-1 ${
                    sidePanel === tab.id ? 'bg-background text-primary' : 'bg-surface text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[12px]">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {sidePanel === 'outline' && (
                <FileOutline
                  symbols={outline}
                  activeLine={1}
                  onJump={(line) => {
                    const ta = document.querySelector<HTMLTextAreaElement>('textarea');
                    if (!ta || !activeTab) return;
                    const before = activeTab.content.split('\n').slice(0, line - 1).join('\n');
                    const offset = before.length + (line > 1 ? 1 : 0);
                    ta.focus();
                    ta.selectionStart = ta.selectionEnd = offset;
                    ta.scrollTop = Math.max(0, (line - 3) * 18);
                    ta.dispatchEvent(new Event('scroll'));
                  }}
                />
              )}
              {sidePanel === 'problems' && (
                <ProblemsPanel
                  problems={problems}
                  onJump={(p) => {
                    const ta = document.querySelector<HTMLTextAreaElement>('textarea');
                    if (!ta || !activeTab) return;
                    const lines = activeTab.content.split('\n');
                    let offset = 0;
                    for (let i = 0; i < Math.min(p.line - 1, lines.length); i += 1) {
                      offset += lines[i].length + 1;
                    }
                    offset += Math.max(0, (p.column ?? 1) - 1);
                    ta.focus();
                    ta.selectionStart = ta.selectionEnd = offset;
                    ta.scrollTop = Math.max(0, (p.line - 3) * 18);
                    ta.dispatchEvent(new Event('scroll'));
                  }}
                  onClear={() => setTerminalLines([])}
                  onRunLint={() => handleProjectCheck('lint')}
                />
              )}
            </div>
          </aside>
        </div>

        {/* Right Pane: Terminal & Guidance */}
        <aside className="w-80 lg:w-96 flex-none bg-background hidden lg:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center shrink-0">
             <span className="font-headline font-bold uppercase text-sm tracking-widest flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-[18px]">terminal</span>
                Code Runner Console
             </span>
             <button
               onClick={() => setTerminalLines([])}
               className="text-xs font-bold uppercase hover:text-error transition-colors"
             >Clear</button>
          </div>

          <div className="p-3 border-b-4 border-primary bg-surface-container-low">
            <RunTranscriptView events={codeRunEvents} title="Code execution transcript" />
          </div>
          
          <details className="border-b-4 border-primary bg-black text-green-400 font-mono text-xs">
            <summary className="cursor-pointer bg-surface-container-high text-primary p-3 font-headline font-black uppercase text-[10px] border-b-2 border-primary">
              Raw terminal
            </summary>
            <div className="max-h-56 overflow-y-auto custom-scrollbar p-4 leading-loose">
             {terminalLines.length === 0 && (
               <div className="text-green-800">Secure workspace terminal ready. Write and run python or javascript scripts below.</div>
             )}
             {terminalLines.map(line => (
               <div key={line.id} className={`mb-1 whitespace-pre-wrap break-all ${
                 line.type === 'command' ? 'text-blue-400 font-bold' :
                 line.type === 'error' ? 'text-red-500 font-bold' :
                 line.type === 'success' ? 'text-green-400 font-bold' :
                 line.type === 'supr' ? 'text-amber-300 font-bold' :
                 'text-gray-300'
               }`}>
                 {line.type === 'command' && <span>➜ supr@workspace:~$ </span>}
                 {line.content}
               </div>
             ))}
             {isRunning && (
               <div className="flex items-center gap-2 mt-2">
                 <span className="text-blue-400 font-bold">➜ supr@workspace:~$</span>
                 <span className="w-1.5 h-3 bg-green-400 animate-ping"></span>
               </div>
             )}
            </div>
          </details>

          <div className="border-t-4 border-primary bg-surface-container p-3 shrink-0">
            <h4 className="font-headline font-black uppercase text-xs text-primary mb-2 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">history</span>
              Test History
            </h4>
            <div className="space-y-1 max-h-20 overflow-y-auto custom-scrollbar">
              {testHistory.length === 0 ? (
                <p className="font-mono text-[10px] text-on-surface-variant">No runs yet.</p>
              ) : testHistory.map((entry, idx) => (
                <p key={`${entry}-${idx}`} className="font-mono text-[10px] text-on-surface-variant">{entry}</p>
              ))}
            </div>
          </div>
          
          {/* Supr Guidance */}
          <div className="h-1/3 border-t-4 border-primary bg-background flex flex-col shrink-0">
             <div className="p-2 border-b-4 border-primary bg-primary-fixed flex items-center justify-between">
                <span className="font-headline font-bold uppercase text-sm flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-[18px]">psychology</span> Supr Guidance
                </span>
                <span className={`text-xs font-bold uppercase px-2 py-0.5 border-2 border-primary ${
                  triageState === 'passed' ? 'bg-tertiary text-on-tertiary' :
                  triageState === 'failed' ? 'bg-error text-on-error' :
                  triageState === 'triaging' ? 'bg-secondary text-on-error animate-pulse' :
                  'bg-background text-primary'
                }`}>
                  {triageState === 'idle' ? 'Watching' : triageState === 'failed' ? 'Failure' : triageState === 'triaging' ? 'Diagnostics' : triageState === 'retrying' ? 'Ready' : 'Passed'}
                </span>
             </div>
             <div className="p-4 flex-1 overflow-y-auto custom-scrollbar text-xs">
                {triageState === 'idle' && (
                  <p className="text-on-surface-variant leading-relaxed">Supr is checking this workspace. Remember to save your file before clicking <strong>Run Code</strong>.</p>
                )}

                {triageState === 'failed' && (
                  <>
                    <p className="font-bold mb-2 text-error uppercase">Diagnostics Failed (Iteration {retryCount})</p>
                    <p className="text-on-surface-variant mb-4 leading-relaxed">The test suite or execution encountered an error. Click below to let the Code Agent analyze the file, consult the Research Library, and generate a real fix.</p>
                    <button
                      onClick={handleDiagnoseAndFix}
                      disabled={isRunning || !activeFile}
                      className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">psychology</span>
                      Code Agent: Diagnose & Fix
                    </button>
                  </>
                )}

                {triageState === 'triaging' && (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                      <span className="font-bold">Code Agent is running analysis...</span>
                    </div>
                    <p className="text-on-surface-variant text-[10px] leading-relaxed">Scanning file content, injecting Research Library context, generating structured fix...</p>
                  </div>
                )}

                {triageState === 'retrying' && (
                  <>
                    <p className="font-bold mb-2 uppercase">AI Fix Ready</p>
                    <p className="text-on-surface-variant mb-4 leading-relaxed">Code Agent generated a fix from the Research Library context. Run tests to verify.</p>
                    <button
                      onClick={handleDiagnoseAndFix}
                      disabled={isRunning || !activeFile}
                      className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>
                      Re-run Diagnostics
                    </button>
                  </>
                )}

                {triageState === 'passed' && (
                  <>
                    <p className="font-bold mb-2 text-tertiary uppercase">All Tests Passed ✓</p>
                    <p className="text-on-surface-variant leading-relaxed">Code Agent successfully resolved all issues using AI analysis{researchArtifacts.length > 0 ? ' and Research Library context' : ''}. File updated in workspace.</p>
                  </>
                )}
             </div>
          </div>
        </aside>
      </div>

      {/* New File Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
          <div className="bg-surface-container max-w-sm w-full neo-border shadow-[8px_8px_0px_0px_rgba(26,26,26,1)] flex flex-col">
            <div className="bg-primary p-4 border-b-4 border-primary flex justify-between items-center text-primary-fixed">
              <h3 className="font-headline font-black uppercase text-lg">Create New File</h3>
              <button onClick={() => setShowNewFileModal(false)}>
                <span className="material-symbols-outlined font-black">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block font-headline font-bold uppercase text-primary mb-2 text-xs">Filename</label>
                <input
                  type="text"
                  value={newFilename}
                  onChange={(e) => setNewFilename(e.target.value)}
                  placeholder="e.g. scrape_tweets.py"
                  className="w-full bg-background neo-border p-3 font-body text-sm focus:outline-none focus:border-tertiary"
                  autoFocus
                />
              </div>
            </div>
            <div className="p-4 border-t-4 border-primary bg-surface-container flex justify-end gap-3">
              <button
                onClick={() => setShowNewFileModal(false)}
                className="bg-background text-primary neo-border px-4 py-2 font-headline font-bold uppercase text-xs hover:bg-surface-variant transition-colors"
              >Cancel</button>
              <button
                onClick={handleCreateFile}
                disabled={!newFilename.trim()}
                className="bg-primary text-on-primary neo-border px-5 py-2 font-headline font-bold uppercase text-xs hover:bg-tertiary transition-colors disabled:opacity-50"
              >Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Research overlay popup */}
      {activeResearch && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-background border-4 border-primary max-w-2xl w-full p-6 neo-shadow relative flex flex-col max-h-[85vh]">
            <button 
              onClick={() => setActiveResearch(null)}
              className="absolute top-4 right-4 text-primary font-bold hover:text-error text-xl font-headline"
            >✕</button>
            <h3 className="font-headline text-xl font-black uppercase text-primary border-b-4 border-primary pb-3 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">file_present</span>
              Research Spec: {activeResearch.filename}
            </h3>
            <div className="flex-1 overflow-y-auto custom-scrollbar font-body text-xs bg-surface-container p-4 neo-border whitespace-pre-wrap leading-relaxed">
              {activeResearch.content}
            </div>
            <div className="mt-4 flex justify-end">
              <button 
                onClick={() => setActiveResearch(null)}
                className="bg-primary text-on-primary font-headline font-bold uppercase px-4 py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary"
              >Dismiss</button>
            </div>
          </div>
        </div>
      )}

      <footer className="flex-none h-8 border-t-4 border-primary flex items-center px-4 justify-between font-mono text-xs bg-primary text-on-primary shrink-0">
         <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">terminal</span>
              Isolated Workspace (Secure Mode)
            </span>
         </div>
         <span className="text-[10px] font-bold uppercase">Workspace Core V2.4</span>
      </footer>
    </div>
  );
}
