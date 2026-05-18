"use client";

import { useState, useEffect } from 'react';
import { fetchMissionState, logActivityAction, recordFailureAction, updateTaskStatusAction, addArtifactAction, updateArtifactAction } from '@/app/actions';
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
  const [activeFile, setActiveFile] = useState('feedback_clusters.py');
  
  // Dynamic SQLite backed file contents
  const [files, setFiles] = useState<Record<string, string>>({
    'main.py': `# Core Orchestrator entry point\nimport src.feedback_clusters as fc\n\ndef run_pipeline():\n    print("Starting Cognitive Pipeline...")\n    fc.analyze_feedback("mock_tickets.json")\n\nif __name__ == "__main__":\n    run_pipeline()`,
    'feedback_clusters.py': `# Cognitive Debt Detection Script\n# Author: Supr CodeBot\nimport pandas as pd\nimport numpy as np\nfrom sklearn.cluster import KMeans\n\ndef analyze_feedback(data_path: str):\n    """\n    Analyzes ticket feedback to identify clusters.\n    """\n    try:\n        df = pd.read_json(data_path)\n    except Exception as e:\n        print(f"Error: {e}")\n        raise e\n\n    vectors = np.stack(df['embedding'].values)\n    kmeans = KMeans(n_clusters=5, random_state=42)\n    df['cluster'] = kmeans.fit_predict(vectors)\n    return df\n\ndef generate_report(clustered_df):\n    pass # TODO: Implement report generation`,
    'validation.py': `# Pytest Verification Suite\n# Author: QA Sentinel\nimport pytest\nfrom src.feedback_clusters import analyze_feedback\n\ndef test_analyze_feedback():\n    # Active mock verification\n    result = analyze_feedback("mock_tickets.json")\n    assert 'cluster' in result.columns`
  });

  const [activeResearch, setActiveResearch] = useState<Artifact | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [mission, setMission] = useState<Mission | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'editing'>('saved');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Load and seed dynamic artifacts in SQLite database
  useEffect(() => {
    async function init() {
      const activeMission = await fetchMissionState();
      if (activeMission) {
        setMission(activeMission);
        
        // Seed default code files in SQLite if not present
        const dbFiles = ['main.py', 'feedback_clusters.py', 'validation.py'];
        let updatedFiles = { ...files };
        
        for (const fname of dbFiles) {
          const existing = activeMission.artifacts?.find(a => a.filename === fname);
          if (existing) {
            updatedFiles[fname] = existing.content;
          } else {
            // Seed to database
            await addArtifactAction(activeMission.id, {
              filename: fname,
              type: 'code',
              content: files[fname]
            });
          }
        }
        setFiles(updatedFiles);

        // Sync retry count from mission failures if any
        const codeFailures = activeMission.failures?.filter(f => f.agentName === 'Code Agent');
        if (codeFailures) setRetryCount(codeFailures.length);
      }
    }
    init();
  }, []);

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSaveStatus('editing');
    setFiles(prev => ({
      ...prev,
      [activeFile]: e.target.value
    }));
  };

  const handleSaveFile = async () => {
    if (!mission) return;
    try {
      await updateArtifactAction(mission.id, activeFile, files[activeFile]);
      setSaveStatus('saved');
      showToast(`${activeFile} saved to sandbox container! ✓`);
      
      setTerminalLogsAction(`[Sandbox Storage] Synchronized ${activeFile} with gVisor workspace.`);
    } catch (err) {
      console.error(err);
      showToast(`Failed to save: ${String(err)}`);
    }
  };

  const setTerminalLogsAction = (msg: string) => {
    setTerminalLines(prev => [...prev, { id: Date.now(), type: 'output', content: msg }]);
  };

  const handleRunTest = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setTerminalLines(prev => [...prev, { id: Date.now(), type: 'command', content: 'pytest tests/validation.py' }]);

    await new Promise(r => setTimeout(r, 1200));

    // Dynamic execution logic checks the actual text content of feedback_clusters.py
    const code = files['feedback_clusters.py'] || '';
    const hasFix = code.includes('embedding') && (code.includes('not in') || code.includes('not') || code.includes('if'));

    if (!hasFix) {
      // Test fails
      setTerminalLines(prev => [
        ...prev,
        { id: Date.now() + 1, type: 'output', content: 'collecting tests...' },
        { id: Date.now() + 2, type: 'error', content: '============================== FAILURES ==============================' },
        { id: Date.now() + 3, type: 'error', content: '_ test_analyze_feedback _' },
        { id: Date.now() + 4, type: 'error', content: "E   AssertionError: assert 'cluster' in Index" },
        { id: Date.now() + 5, type: 'error', content: '1 failed, 0 passed in 0.42s' },
      ]);
      setTriageState('failed');
      setRetryCount(prev => prev + 1);

      if (mission) {
        await recordFailureAction(mission.id, {
          taskId: 't2',
          agentName: 'Code Agent',
          failureType: 'AssertionError',
          attemptNumber: retryCount + 1,
          summary: "AssertionError: assert 'cluster' in Index",
          suprGuidance: ""
        });
        await logActivityAction(mission.id, {
          eventType: 'failure',
          actor: 'Code Agent',
          actorIcon: 'code',
          summary: 'AssertionError in Code Workspace',
          detail: 'Tests failed on assert "cluster" in Index. Missing spec context.'
        });
      }
    } else {
      // Test passes
      setTerminalLines(prev => [
        ...prev,
        { id: Date.now() + 1, type: 'output', content: 'collecting tests...' },
        { id: Date.now() + 2, type: 'success', content: 'tests/validation.py::test_analyze_feedback PASSED' },
        { id: Date.now() + 3, type: 'success', content: '1 passed in 0.38s' },
      ]);
      setTriageState('passed');

      if (mission) {
        await updateTaskStatusAction(mission.id, 't2', 'Done');
        await logActivityAction(mission.id, {
          eventType: 'task_complete',
          actor: 'Code Agent',
          actorIcon: 'code',
          summary: 'Task complete: Resolve Column Assertions',
          detail: `All tests passed in gVisor sandbox after ${retryCount + 1} iterations.`
        });
      }
    }
    setIsRunning(false);
  };

  const handleSuprTriage = async () => {
    setTriageState('triaging');
    setTerminalLines(prev => [
      ...prev,
      { id: Date.now(), type: 'supr', content: '[SUPR] Triaging failure... Context scanner active.' },
    ]);

    await new Promise(r => setTimeout(r, 1500));

    // Dynamic guidance adapts depending on whether a research artifact was created by the Research Agent
    const researchDocs = mission?.artifacts?.filter(a => a.filename.startsWith('research_')) || [];
    const hasResearch = researchDocs.length > 0;

    if (hasResearch) {
      const topResearch = researchDocs[0];
      setTerminalLines(prev => [
        ...prev,
        { id: Date.now(), type: 'supr', content: `[SUPR] Found active OSINT specs in Research Library: ${topResearch.filename}` },
        { id: Date.now() + 1, type: 'supr', content: `[SUPR] Recommended Fix: "embedding" column must default to [0]*128 if missing.` },
        { id: Date.now() + 2, type: 'supr', content: '[SUPR] Sending guidance payload to Code Agent sandbox. Code updated.' },
      ]);
    } else {
      setTerminalLines(prev => [
        ...prev,
        { id: Date.now(), type: 'supr', content: '[SUPR] WARNING: No active research specs compiled in the Research Library.' },
        { id: Date.now() + 1, type: 'supr', content: '[SUPR] Triaged default guidance: Check for "embedding" schema keys and add a fallback.' },
      ]);
    }

    if (mission) {
      await logActivityAction(mission.id, {
        eventType: 'supr_decision',
        actor: 'Supr',
        actorIcon: 'psychology',
        summary: 'Transmitted revised specs to Code Agent',
        detail: 'Sent guidance for missing columns fallback validation.'
      });
    }

    setTriageState('retrying');
  };

  // Simulates Code Agent automatically applying the parsed fix from the research spec
  const handleApplyFix = async () => {
    const fixedCode = `# Cognitive Debt Detection Script\n# Author: Supr CodeBot\nimport pandas as pd\nimport numpy as np\nfrom sklearn.cluster import KMeans\n\ndef analyze_feedback(data_path: str):\n    """\n    Analyzes ticket feedback to identify clusters.\n    """\n    try:\n        df = pd.read_json(data_path)\n        # [FIX] Added validation based on Research Library specs\n        if 'embedding' not in df.columns:\n            df['embedding'] = df.apply(lambda r: [0]*128, axis=1)\n    except Exception as e:\n        print(f"Error: {e}")\n        raise e\n\n    vectors = np.stack(df['embedding'].values)\n    kmeans = KMeans(n_clusters=5, random_state=42)\n    df['cluster'] = kmeans.fit_predict(vectors)\n    return df\n\ndef generate_report(clustered_df):\n    return clustered_df.groupby("cluster").size().to_dict()`;

    setFiles(prev => ({
      ...prev,
      'feedback_clusters.py': fixedCode
    }));
    setSaveStatus('editing');
    setTriageState('idle');
    showToast("Code Agent generated fix using Research specifications!");
    
    setTerminalLines(prev => [
      ...prev,
      { id: Date.now(), type: 'supr', content: '[CODE AGENT] Auto-applied research solution into feedback_clusters.py. Click "Run Test" to verify.' },
    ]);
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
          <h2 className="font-headline font-bold text-lg md:text-xl uppercase tracking-tight">Code Workspace Sandbox</h2>
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 bg-surface-container-high px-3 py-1 border-2 border-primary">
            <span className={`w-3 h-3 border border-primary ${triageState === 'passed' ? 'bg-tertiary' : 'bg-primary-fixed animate-pulse'}`}></span>
            <span className="font-body font-bold text-sm uppercase">
              Agent: Code Agent {triageState === 'passed' ? '✓ Passed' : 'Active'}
            </span>
          </div>
          <button
            onClick={handleRunTest}
            disabled={isRunning || triageState === 'triaging'}
            className="bg-primary text-on-primary border-2 border-primary px-4 py-1.5 font-headline font-bold uppercase hover:bg-tertiary hover:text-on-tertiary transition-colors neo-shadow active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Run Test
          </button>
        </div>
      </header>

      {/* Split Pane Layout */}
      <div className="flex-1 flex overflow-hidden w-full relative">
        
        {/* Left Pane: Explorer & OSINT Spec drawer */}
        <aside className="w-64 flex-none border-r-4 border-primary bg-background hidden md:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center shrink-0">
            <span className="font-headline font-bold uppercase text-sm tracking-widest">Explorer</span>
            <span className="material-symbols-outlined text-sm">add_box</span>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-body text-sm">
            <ul className="space-y-1">
              <li>
                <div className="flex items-center gap-2 py-1 px-2 font-bold text-primary">
                  <span className="material-symbols-outlined text-[18px]">folder</span>
                  <span>src</span>
                </div>
                <ul className="ml-4 space-y-1">
                  <li>
                    <div
                      onClick={() => { setActiveFile('main.py'); setSaveStatus('saved'); }}
                      className={`flex items-center gap-2 py-1 px-2 cursor-pointer border-2 ${activeFile === 'main.py' ? 'bg-primary-container border-primary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">description</span>
                      <span>main.py</span>
                    </div>
                  </li>
                  <li>
                    <div
                      onClick={() => { setActiveFile('feedback_clusters.py'); setSaveStatus('saved'); }}
                      className={`flex items-center gap-2 py-1 px-2 cursor-pointer border-2 ${activeFile === 'feedback_clusters.py' ? 'bg-primary-container border-primary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">data_object</span>
                      <span>feedback_clusters.py</span>
                    </div>
                  </li>
                </ul>
              </li>
              <li>
                <div className="flex items-center gap-2 py-1 px-2 font-bold text-primary mt-2">
                  <span className="material-symbols-outlined text-[18px]">folder</span>
                  <span>tests</span>
                </div>
                <ul className="ml-4 space-y-1">
                  <li>
                    <div
                      onClick={() => { setActiveFile('validation.py'); setSaveStatus('saved'); }}
                      className={`flex items-center gap-2 py-1 px-2 cursor-pointer border-2 ${activeFile === 'validation.py' ? 'bg-primary-container border-primary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">check_circle</span>
                      <span>validation.py</span>
                    </div>
                  </li>
                </ul>
              </li>
            </ul>
          </div>

          {/* OSINT Spec Feeds (Bridge to Research Library) */}
          <div className="h-1/2 border-t-4 border-primary flex flex-col shrink-0">
            <div className="p-2 border-b-4 border-primary bg-primary text-primary-fixed flex items-center justify-between">
              <span className="font-headline font-bold uppercase text-xs flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">travel_explore</span>
                OSINT Spec Drawer
              </span>
              <span className="bg-primary-fixed-dim text-primary-fixed px-1.5 py-0.5 text-[8px] font-bold uppercase neo-border">Live Feed</span>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2 bg-surface-container-high">
              {researchArtifacts.length === 0 ? (
                <div className="text-center p-3 font-body text-xs text-on-surface-variant">
                  <p className="font-bold text-error uppercase mb-1">No spec detected</p>
                  <p className="text-[10px]">Execute a search in the Research Library first to feed competitor context to the Code Agent!</p>
                </div>
              ) : (
                researchArtifacts.map(art => (
                  <div 
                    key={art.id}
                    onClick={() => setActiveResearch(art)}
                    className="p-2 border-2 border-primary bg-background hover:bg-primary-container hover:text-on-primary-container cursor-pointer transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-sm text-secondary">file_present</span>
                    <span className="font-body text-[10px] font-bold uppercase truncate">{art.filename}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Middle Pane: Active Sandbox Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative w-full border-r-4 border-primary">
          <div className="flex border-b-4 border-primary bg-surface-variant h-10 overflow-x-auto custom-scrollbar shrink-0">
            {['main.py', 'feedback_clusters.py', 'validation.py'].map(fname => (
              <div 
                key={fname}
                onClick={() => { setActiveFile(fname); setSaveStatus('saved'); }}
                className={`flex items-center space-x-2 px-4 border-r-4 border-primary font-body font-bold text-xs shrink-0 cursor-pointer ${activeFile === fname ? 'bg-background text-primary' : 'hover:bg-background text-on-surface-variant'}`}
              >
                <span>{fname}</span>
                {fname === 'feedback_clusters.py' && (files[fname] || '').includes('embedding') && (files[fname] || '').includes('if') && (
                  <span className="w-1.5 h-1.5 rounded-full bg-tertiary"></span>
                )}
              </div>
            ))}
          </div>
          
          <div className="flex-1 flex flex-col relative overflow-hidden bg-surface-container-lowest">
            {/* Interactive textarea editor */}
            <textarea
              value={files[activeFile] || ''}
              onChange={handleTextChange}
              className="flex-1 p-4 font-mono text-xs leading-relaxed bg-surface-container-lowest text-on-surface focus:outline-none resize-none custom-scrollbar w-full"
              placeholder="# Type code here..."
            />
            
            {/* Save Toolbar */}
            <div className="p-3 border-t-4 border-primary bg-surface-container-high flex justify-between items-center shrink-0">
              <span className="font-mono text-[10px] text-on-surface-variant flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${saveStatus === 'saved' ? 'bg-tertiary' : 'bg-amber-500 animate-pulse'}`}></span>
                {saveStatus === 'saved' ? 'Saved to workspace' : 'Unsaved modifications...'}
              </span>
              <button
                onClick={handleSaveFile}
                className="bg-secondary text-on-secondary border-2 border-primary px-3 py-1 text-xs font-headline font-bold uppercase hover:bg-tertiary hover:text-on-tertiary transition-colors shadow-[2px_2px_0px_0px_rgba(26,26,26,1)] active:translate-x-0.5 active:translate-y-0.5"
              >
                Save File to Sandbox
              </button>
            </div>
          </div>
        </div>

        {/* Right Pane: Terminal & Guidance */}
        <aside className="w-80 lg:w-96 flex-none bg-background hidden lg:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center shrink-0">
             <span className="font-headline font-bold uppercase text-sm tracking-widest flex items-center gap-2 text-primary">
                <span className="material-symbols-outlined text-[18px]">terminal</span>
                Sandbox Console
             </span>
             <button
               onClick={() => setTerminalLines([])}
               className="text-xs font-bold uppercase hover:text-error transition-colors"
             >Clear</button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-black text-green-400 font-mono text-xs leading-loose">
             {terminalLines.length === 0 && (
               <div className="text-green-800">gVisor Sandbox terminal ready. Click "Run Test" to trigger validation pytests.</div>
             )}
             {terminalLines.map(line => (
               <div key={line.id} className={`mb-1 ${
                 line.type === 'command' ? 'text-blue-400 font-bold' :
                 line.type === 'error' ? 'text-red-500 font-bold' :
                 line.type === 'success' ? 'text-green-400 font-bold' :
                 line.type === 'supr' ? 'text-amber-300 font-bold' :
                 'text-gray-300'
               }`}>
                 {line.type === 'command' && <span>➜ supr@gvisor:~$ </span>}
                 {line.content}
               </div>
             ))}
             {isRunning && (
               <div className="flex items-center gap-2 mt-2">
                 <span className="text-blue-400 font-bold">➜ supr@gvisor:~$</span>
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
                  {triageState === 'idle' ? 'Watching' : triageState === 'failed' ? 'Failure' : triageState === 'triaging' ? 'Triaging' : triageState === 'retrying' ? 'Ready' : 'Passed'}
                </span>
             </div>
             <div className="p-4 flex-1 overflow-y-auto custom-scrollbar text-xs">
                {triageState === 'idle' && (
                  <p className="text-on-surface-variant leading-relaxed">Supr is monitoring the Code Agent&apos;s sandbox container. Make sure any code changes are saved before clicking <strong>Run Test</strong>.</p>
                )}

                {triageState === 'failed' && (
                  <>
                    <p className="font-bold mb-2 text-error uppercase">Assertion Error (Iteration {retryCount})</p>
                    <p className="text-on-surface-variant mb-4 leading-relaxed">The pytest suite failed because `mock_tickets.json` does not contain the `embedding` schema key, causing a pandas Stack failure.</p>
                    <button
                      onClick={handleSuprTriage}
                      className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1"
                    >Supr: Triage failure</button>
                  </>
                )}

                {triageState === 'triaging' && (
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                    <span className="font-bold">Supr is checking OSINT logs...</span>
                  </div>
                )}

                {triageState === 'retrying' && (
                  <>
                    <p className="font-bold mb-2 uppercase">Research Guidance Ready</p>
                    <p className="text-on-surface-variant mb-4 leading-relaxed">Supr integrated specs from the Research Library and compiled a self-healing solution for the Code Agent.</p>
                    <button
                      onClick={handleApplyFix}
                      className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1"
                    >Code Agent: Auto-Write Fix</button>
                  </>
                )}

                {triageState === 'passed' && (
                  <>
                    <p className="font-bold mb-2 text-tertiary uppercase">Test Suite Passed ✓</p>
                    <p className="text-on-surface-variant leading-relaxed">The missing columns issue was successfully resolved using the dynamic fallback fix derived from the competitor specs!</p>
                  </>
                )}
             </div>
          </div>
        </aside>
      </div>

      {/* OSINT Research overlay popup */}
      {activeResearch && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
          <div className="bg-background border-4 border-primary max-w-2xl w-full p-6 neo-shadow relative flex flex-col max-h-[85vh]">
            <button 
              onClick={() => setActiveResearch(null)}
              className="absolute top-4 right-4 text-primary font-bold hover:text-error text-xl font-headline"
            >✕</button>
            <h3 className="font-headline text-xl font-black uppercase text-primary border-b-4 border-primary pb-3 mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">file_present</span>
              OSINT Spec: {activeResearch.filename}
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
              gVisor Sandbox
            </span>
         </div>
         <span className="text-[10px] font-bold uppercase">Sandbox Core V2.4</span>
      </footer>
    </div>
  );
}
