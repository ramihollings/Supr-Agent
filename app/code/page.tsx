"use client";

import { useState, useEffect } from 'react';
import { TopNav } from '@/components/TopNav';
import { 
  fetchMissionState, 
  recordFailureAction, 
  updateTaskStatusAction, 
  fetchWorkspaceFilesAction,
  readWorkspaceFileAction,
  writeWorkspaceFileAction,
  deleteWorkspaceFileAction,
  executeCodeAction,
  fetchSettingsAction,
  updateSettingAction
} from '@/app/actions';
import { Mission, Artifact } from '@/types';

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
  const [activeFile, setActiveFile] = useState<string>('');
  const [editorContent, setEditorContent] = useState<string>('');
  
  // Real filesystem files list
  const [filesList, setFilesList] = useState<{ filename: string; size: number; updatedAt: string; type: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [allowApiKeys, setAllowApiKeys] = useState(false);

  const [activeResearch, setActiveResearch] = useState<Artifact | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mission, setMission] = useState<Mission | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'editing'>('saved');

  // New file modal state
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [newFilename, setNewFilename] = useState('');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  const loadWorkspace = async () => {
    setIsLoading(true);
    // Fetch settings
    const settings = await fetchSettingsAction();
    setAllowApiKeys(settings?.sandbox_allow_api_keys === 'true');

    // Fetch active mission
    const activeMission = await fetchMissionState();
    if (activeMission) {
      setMission(activeMission);
      // Sync retry count from mission failures if any
      const codeFailures = activeMission.failures?.filter(f => f.agentName === 'Code Agent');
      if (codeFailures) setRetryCount(codeFailures.length);
    }

    // Fetch files
    let list = await fetchWorkspaceFilesAction();
    if (list.length === 0) {
      // Seed default files
      const seeds: Record<string, string> = {
        'main.py': `# Core entry point\nimport feedback_clusters as fc\n\ndef run_pipeline():\n    print("Starting Cognitive Pipeline...")\n    print("Loading datasets...")\n    print("Pipeline run completed successfully.")\n\nif __name__ == "__main__":\n    run_pipeline()`,
        'feedback_clusters.py': `# Cognitive Debt Detection Script\n# Author: Supr CodeBot\nimport numpy as np\n\ndef analyze_feedback(data_path: str):\n    """\n    Analyzes ticket feedback to identify clusters.\n    """\n    print("Analyzing feedback embeddings...")\n    return {"status": "success", "clusters": 5}\n`,
        'validation.py': `# Pytest Verification Suite\n# Author: QA Sentinel\nimport pytest\nfrom feedback_clusters import analyze_feedback\n\ndef test_analyze_feedback():\n    # Active mock verification\n    print("Running verification tests...")\n    result = analyze_feedback("mock_tickets.json")\n    assert result["status"] == "success"\n    print("Test validation.py PASSED.")\n\nif __name__ == "__main__":\n    test_analyze_feedback()`
      };

      for (const [fname, content] of Object.entries(seeds)) {
        await writeWorkspaceFileAction(fname, content);
      }
      list = await fetchWorkspaceFilesAction();
    }
    setFilesList(list);
    
    // Select first file if available and none selected yet
    if (list.length > 0) {
      const defaultFile = list.find(f => f.filename === 'main.py') || list[0];
      setActiveFile(defaultFile.filename);
      const content = await readWorkspaceFileAction(defaultFile.filename);
      setEditorContent(content);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    loadWorkspace();
  }, []);

  const selectFile = async (filename: string) => {
    setActiveFile(filename);
    setSaveStatus('saved');
    const content = await readWorkspaceFileAction(filename);
    setEditorContent(content);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSaveStatus('editing');
    setEditorContent(e.target.value);
  };

  const handleSaveFile = async () => {
    if (!activeFile) return;
    try {
      const res = await writeWorkspaceFileAction(activeFile, editorContent);
      if (res.success) {
        setSaveStatus('saved');
        showToast(`${activeFile} saved to workspace! ✓`);
        setTerminalLogsAction(`[Workspace Storage] Synchronized ${activeFile} with secure workspace.`);
        // Reload list for updated sizes
        const list = await fetchWorkspaceFilesAction();
        setFilesList(list);
      } else {
        showToast(`Failed to save: ${res.error}`);
      }
    } catch (err) {
      console.error(err);
      showToast(`Failed to save: ${String(err)}`);
    }
  };

  const setTerminalLogsAction = (msg: string) => {
    setTerminalLines(prev => [...prev, { id: Date.now(), type: 'output', content: msg }]);
  };

  const handleCreateFile = async () => {
    if (!newFilename.trim()) return;
    const name = newFilename.trim();
    const defaultContent = `# New file: ${name}\n`;
    await writeWorkspaceFileAction(name, defaultContent);
    await loadWorkspace();
    await selectFile(name);
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
      if (list.length > 0) {
        await selectFile(list[0].filename);
      } else {
        setActiveFile('');
        setEditorContent('');
      }
    }
  };

  const handleToggleApiKeys = async (checked: boolean) => {
    setAllowApiKeys(checked);
    await updateSettingAction('sandbox_allow_api_keys', checked ? 'true' : 'false');
    showToast(`API key sharing ${checked ? 'enabled' : 'disabled'} for secure workspace`);
  };

  const handleRunTest = async () => {
    if (!activeFile || isRunning) return;
    setIsRunning(true);
    setTerminalLines(prev => [...prev, { id: Date.now(), type: 'command', content: `python ${activeFile}` }]);

    // Auto save
    if (saveStatus !== 'saved') {
      await handleSaveFile();
    }

    await new Promise(r => setTimeout(r, 600));

    const res = await executeCodeAction(activeFile, activeFile.endsWith('.py') ? 'python' : 'javascript');
    const timeNow = Date.now();
    if (res.success) {
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
      const errorContent = res.stderr || res.error || 'Execution failed with non-zero exit code.';
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
          fileContent: editorContent,
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
                setEditorContent(msg.fixedCode);
                await writeWorkspaceFileAction(activeFile, msg.fixedCode);
                setSaveStatus('saved');
              }

              const resultLines: TerminalLine[] = [
                { id: Date.now(), type: 'supr', content: `[CODE AGENT] Diagnosis: ${msg.diagnosis}` },
                { id: Date.now() + 1, type: 'supr', content: `[CODE AGENT] Fix applied: ${msg.fix}` },
                { id: Date.now() + 2, type: msg.passed ? 'success' : 'error', content: `Test result: ${msg.testResult}` },
              ];

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

  return (
    <div className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden bg-surface-container relative">
      {toastMessage && (
        <div className="fixed bottom-12 right-8 bg-surface-container-high border-4 border-primary p-4 z-50 neo-shadow font-headline font-bold uppercase text-sm animate-bounce">
          {toastMessage}
        </div>
      )}
      
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

        {/* Middle Pane: Active Workspace Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative w-full border-r-4 border-primary">
          <div className="flex border-b-4 border-primary bg-surface-variant h-10 overflow-x-auto custom-scrollbar shrink-0">
            {filesList.map(file => (
              <div 
                key={file.filename}
                onClick={() => selectFile(file.filename)}
                className={`flex items-center space-x-2 px-4 border-r-4 border-primary font-body font-bold text-xs shrink-0 cursor-pointer ${activeFile === file.filename ? 'bg-background text-primary' : 'hover:bg-background text-on-surface-variant'}`}
              >
                <span>{file.filename}</span>
                {saveStatus !== 'saved' && activeFile === file.filename && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex-1 flex flex-col relative overflow-hidden bg-surface-container-lowest">
            {/* Interactive textarea editor */}
            <textarea
              value={editorContent}
              onChange={handleTextChange}
              className="flex-1 p-4 font-mono text-xs leading-relaxed bg-surface-container-lowest text-on-surface focus:outline-none resize-none custom-scrollbar w-full"
              placeholder="# Type code here..."
              disabled={!activeFile}
            />
            
            {/* Save Toolbar */}
            <div className="p-3 border-t-4 border-primary bg-surface-container-high flex justify-between items-center shrink-0">
              <span className="font-mono text-[10px] text-on-surface-variant flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${saveStatus === 'saved' ? 'bg-tertiary' : 'bg-amber-500 animate-pulse'}`}></span>
                {saveStatus === 'saved' ? 'Saved to workspace' : 'Unsaved modifications...'}
              </span>
              <button
                onClick={handleSaveFile}
                disabled={!activeFile}
                className="bg-secondary text-on-secondary border-2 border-primary px-3 py-1 text-xs font-headline font-bold uppercase hover:bg-tertiary hover:text-on-tertiary transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5 disabled:opacity-50"
              >
                Save File
              </button>
            </div>
          </div>
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
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-black text-green-400 font-mono text-xs leading-loose">
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
