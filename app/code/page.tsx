"use client";

import { useState } from 'react';

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
  const [codeHasFix, setCodeHasFix] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  const handleRunTest = async () => {
    if (isRunning) return;
    setIsRunning(true);

    // Add the command
    setTerminalLines(prev => [...prev, { id: Date.now(), type: 'command', content: 'pytest tests/validation.py' }]);

    // Simulate processing delay
    await new Promise(r => setTimeout(r, 1200));

    if (!codeHasFix) {
      // FAILURE path
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
    } else {
      // SUCCESS path
      setTerminalLines(prev => [
        ...prev,
        { id: Date.now() + 1, type: 'output', content: 'collecting tests...' },
        { id: Date.now() + 2, type: 'success', content: 'tests/validation.py::test_analyze_feedback PASSED' },
        { id: Date.now() + 3, type: 'success', content: '1 passed in 0.38s' },
      ]);
      setTriageState('passed');
    }
    setIsRunning(false);
  };

  const handleSuprTriage = async () => {
    setTriageState('triaging');

    // Supr analyzes
    setTerminalLines(prev => [
      ...prev,
      { id: Date.now(), type: 'supr', content: '[SUPR] Triaging failure... Failure type: Context Failure.' },
    ]);

    await new Promise(r => setTimeout(r, 1500));

    setTerminalLines(prev => [
      ...prev,
      { id: Date.now(), type: 'supr', content: '[SUPR] Root cause: mock_tickets.json missing "embedding" column.' },
      { id: Date.now() + 1, type: 'supr', content: '[SUPR] Guidance: Add fallback for missing columns in analyze_feedback().' },
      { id: Date.now() + 2, type: 'supr', content: '[SUPR] Sending revised guidance to Code Agent. Retry authorized.' },
    ]);

    setTriageState('retrying');
  };

  const handleApplyFix = async () => {
    setCodeHasFix(true);
    setTriageState('idle');

    setTerminalLines(prev => [
      ...prev,
      { id: Date.now(), type: 'supr', content: '[CODE AGENT] Applied fix: added column validation with fallback.' },
    ]);
  };

  return (
    <div className="flex-1 md:ml-64 flex flex-col h-screen overflow-hidden bg-surface-container">
      {/* Workspace Header */}
      <header className="flex-none h-16 border-b-4 border-primary bg-background flex justify-between items-center px-4 lg:px-6">
        <div className="flex items-center space-x-4">
          <span className="material-symbols-outlined text-primary text-2xl">folder_open</span>
          <h2 className="font-headline font-bold text-lg md:text-xl uppercase tracking-tight">Project: Cognitive_Core</h2>
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden sm:flex items-center space-x-2 bg-surface-container-high px-3 py-1 border-2 border-primary">
            <span className={`w-3 h-3 border border-primary ${triageState === 'passed' ? 'bg-tertiary' : 'bg-primary-fixed animate-pulse'}`}></span>
            <span className="font-body font-bold text-sm uppercase">
              Agent: Code Agent {triageState === 'passed' ? '✓ Done' : 'Active'}
            </span>
          </div>
          {retryCount > 0 && (
            <div className="hidden sm:flex items-center space-x-1 bg-error-container text-on-error-container px-3 py-1 border-2 border-primary">
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span className="font-body font-bold text-sm uppercase">Retries: {retryCount}</span>
            </div>
          )}
          <button
            onClick={handleRunTest}
            disabled={isRunning || triageState === 'triaging' || triageState === 'retrying'}
            className="bg-primary text-on-primary border-2 border-primary px-4 py-1.5 font-headline font-bold uppercase hover:bg-tertiary hover:text-on-tertiary transition-colors neo-shadow active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">play_arrow</span>
            Run Test
          </button>
        </div>
      </header>

      {/* Split Pane Layout */}
      <div className="flex-1 flex overflow-hidden w-full">
        {/* Left Pane: File Tree */}
        <aside className="w-48 lg:w-64 flex-none border-r-4 border-primary bg-background hidden md:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center">
            <span className="font-headline font-bold uppercase text-sm tracking-widest">Explorer</span>
            <span className="material-symbols-outlined text-sm cursor-pointer hover:text-tertiary">add_box</span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2 font-body text-sm">
            <ul className="space-y-1">
              <li>
                <div className="flex items-center gap-2 py-1 px-2 hover:bg-surface-container cursor-pointer font-bold">
                  <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                  <span className="material-symbols-outlined text-[18px]">folder</span>
                  <span>src</span>
                </div>
                <ul className="ml-6 space-y-1 mt-1">
                  <li>
                    <div
                      onClick={() => setActiveFile('main.py')}
                      className={`flex items-center gap-2 py-1 px-2 cursor-pointer border-2 ${activeFile === 'main.py' ? 'bg-primary-container border-primary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">description</span>
                      <span>main.py</span>
                    </div>
                  </li>
                  <li>
                    <div
                      onClick={() => setActiveFile('feedback_clusters.py')}
                      className={`flex items-center gap-2 py-1 px-2 cursor-pointer border-2 ${activeFile === 'feedback_clusters.py' ? 'bg-primary-container border-primary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container text-on-surface-variant'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">data_object</span>
                      <span>feedback_clusters.py</span>
                    </div>
                  </li>
                </ul>
              </li>
              <li className="mt-2">
                <div className="flex items-center gap-2 py-1 px-2 hover:bg-surface-container cursor-pointer font-bold">
                  <span className="material-symbols-outlined text-[18px]">keyboard_arrow_down</span>
                  <span className="material-symbols-outlined text-[18px]">folder</span>
                  <span>tests</span>
                </div>
                <ul className="ml-6 space-y-1 mt-1">
                  <li>
                    <div
                      onClick={() => setActiveFile('validation.py')}
                      className={`flex items-center gap-2 py-1 px-2 cursor-pointer border-2 ${activeFile === 'validation.py' ? 'bg-primary-container border-primary font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]' : 'border-transparent hover:bg-surface-container text-error font-bold'}`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{triageState === 'passed' ? 'check_circle' : 'warning'}</span>
                      <span>validation.py</span>
                    </div>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </aside>

        {/* Middle Pane: Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative w-full">
          <div className="flex border-b-4 border-primary bg-surface-variant h-10 overflow-x-auto custom-scrollbar shrink-0">
            <div className={`flex items-center space-x-2 px-4 border-r-4 border-primary font-body font-bold text-sm ${activeFile === 'feedback_clusters.py' ? 'bg-background' : 'hover:bg-background cursor-pointer text-on-surface-variant'}`}>
              <span className={activeFile === 'feedback_clusters.py' ? 'text-tertiary' : ''}>feedback_clusters.py</span>
              {codeHasFix && <span className="w-2 h-2 rounded-full bg-tertiary"></span>}
            </div>
            <div className={`flex items-center space-x-2 px-4 border-r-4 border-primary font-body text-sm shrink-0 ${activeFile === 'validation.py' ? 'bg-background font-bold' : 'hover:bg-background cursor-pointer text-on-surface-variant'}`}>
              <span>validation.py</span>
              <span className={`w-2 h-2 rounded-full ${triageState === 'passed' ? 'bg-tertiary' : 'bg-error'}`}></span>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto custom-scrollbar p-4 font-mono text-sm leading-relaxed whitespace-pre bg-surface-container-lowest w-full">
            <span className="text-on-surface-variant"># Cognitive Debt Detection Script{'\n'}</span>
            <span className="text-on-surface-variant"># Author: Supr CodeBot{'\n'}{'\n'}</span>
            <span className="text-tertiary font-bold">import</span> pandas <span className="text-tertiary font-bold">as</span> pd{'\n'}
            <span className="text-tertiary font-bold">import</span> numpy <span className="text-tertiary font-bold">as</span> np{'\n'}
            <span className="text-tertiary font-bold">from</span> sklearn.cluster <span className="text-tertiary font-bold">import</span> KMeans{'\n'}{'\n'}
            
            <span className="text-tertiary font-bold">def</span> <span className="text-primary font-bold">analyze_feedback</span>(data_path: str):{'\n'}
            {'    '}<span className="text-on-surface-variant">{`"""\n    Analyzes ticket feedback to identify clusters.\n    """`}</span>{'\n'}

            {codeHasFix && (
              <>
                <span className="bg-tertiary-container text-on-tertiary-container px-1">{'    '}# [FIX] Validate columns before clustering</span>{'\n'}
                <span className="bg-tertiary-container text-on-tertiary-container px-1">{'    '}df = pd.read_json(data_path)</span>{'\n'}
                <span className="bg-tertiary-container text-on-tertiary-container px-1">{'    '}if &apos;embedding&apos; not in df.columns:</span>{'\n'}
                <span className="bg-tertiary-container text-on-tertiary-container px-1">{'        '}df[&apos;embedding&apos;] = df.apply(lambda r: [0]*128, axis=1)</span>{'\n'}
              </>
            )}
            {!codeHasFix && (
              <>
                <span className="text-tertiary font-bold">{'    '}try</span>:{'\n'}
                {'        '}df = pd.read_json(data_path){'\n'}
              </>
            )}

            {'        '}vectors = np.stack(df[&apos;embedding&apos;].values){'\n'}
            {'        '}kmeans = KMeans(n_clusters=5, random_state=42){'\n'}
            {'        '}df[&apos;cluster&apos;] = kmeans.fit_predict(vectors){'\n'}
            {'        '}<span className="text-tertiary font-bold">return</span> df{'\n'}

            {!codeHasFix && (
              <>
                <span className="text-tertiary font-bold">{'    '}except</span> Exception <span className="text-tertiary font-bold">as</span> e:{'\n'}
                {'        '}<span className="text-secondary font-bold">print</span>(<span className="text-secondary">f&quot;Error: {'{'}<span>e</span>{'}'}&quot;</span>){'\n'}
                {'        '}<span className="text-tertiary font-bold">raise</span> e{'\n'}{'\n'}
              </>
            )}

            <span className="text-on-surface-variant"># Agent actively writing...{'\n'}</span>
            <span className="text-tertiary font-bold">def</span> <span className="text-primary font-bold">generate_report</span>(clustered_df):{'\n'}
            {'    '}<span className={`px-1 font-bold ${codeHasFix ? 'bg-tertiary-container text-on-tertiary-container' : 'bg-primary-fixed text-primary animate-pulse'}`}>
              {codeHasFix ? 'return clustered_df.groupby("cluster").size().to_dict()' : 'pass # TODO: Implement report generation'}
            </span>
          </div>
        </div>

        {/* Right Pane: Terminal & Guidance */}
        <aside className="w-80 lg:w-96 flex-none border-l-4 border-primary bg-background hidden lg:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center">
             <span className="font-headline font-bold uppercase text-sm tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">terminal</span>
                Terminal
             </span>
             <button
               onClick={() => setTerminalLines([])}
               className="text-xs font-bold uppercase hover:text-error transition-colors"
             >Clear</button>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-surface-tint text-[#f5f0e8] font-mono text-xs leading-loose">
             {terminalLines.length === 0 && (
               <div className="text-[#f5f0e8]/50">Terminal ready. Click &quot;Run Test&quot; to begin.</div>
             )}
             {terminalLines.map(line => (
               <div key={line.id} className={`mb-1 ${
                 line.type === 'command' ? '' :
                 line.type === 'error' ? 'text-error font-bold' :
                 line.type === 'success' ? 'text-tertiary font-bold' :
                 line.type === 'supr' ? 'text-primary-fixed font-bold' :
                 'text-[#f5f0e8]/80'
               }`}>
                 {line.type === 'command' && <span className="text-tertiary font-bold">supr@workspace:~$ </span>}
                 {line.content}
               </div>
             ))}
             {isRunning && (
               <div className="flex items-center gap-2 mt-2">
                 <span className="text-tertiary font-bold">supr@workspace:~$</span>
                 <span className="w-2 h-4 bg-background animate-pulse"></span>
               </div>
             )}
          </div>
          
          {/* Guidance overlay */}
          <div className="h-1/3 border-t-4 border-primary bg-background flex flex-col">
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
                  {triageState === 'idle' ? 'Watching' : triageState === 'failed' ? 'Failure Detected' : triageState === 'triaging' ? 'Triaging...' : triageState === 'retrying' ? 'Fix Ready' : 'Passed ✓'}
                </span>
             </div>
             <div className="p-4 flex-1 overflow-y-auto custom-scrollbar text-sm">
                {triageState === 'idle' && (
                  <p className="text-on-surface-variant">Supr is monitoring the Code Agent&apos;s workspace. Click <strong>Run Test</strong> to execute the validation suite.</p>
                )}

                {triageState === 'failed' && (
                  <>
                    <p className="font-bold mb-2 text-error">Failure Detected (Attempt {retryCount})</p>
                    <p className="text-on-surface-variant mb-4">The test failed because <code className="bg-surface-container-high px-1 neo-border">mock_tickets.json</code> is missing the expected <code className="bg-surface-container-high px-1 neo-border">embedding</code> column.</p>
                    <button
                      onClick={handleSuprTriage}
                      className="w-full bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1"
                    >Supr: Triage &amp; Send Guidance</button>
                  </>
                )}

                {triageState === 'triaging' && (
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined animate-spin text-primary">sync</span>
                    <span className="font-bold">Supr is analyzing the failure...</span>
                  </div>
                )}

                {triageState === 'retrying' && (
                  <>
                    <p className="font-bold mb-2">Revised Guidance Sent</p>
                    <p className="text-on-surface-variant mb-4">Supr has identified the root cause and sent the Code Agent revised instructions: add a fallback for missing columns.</p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleApplyFix}
                        className="flex-1 bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1"
                      >Apply Fix</button>
                      <button
                        className="flex-1 bg-background text-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-surface-variant active:translate-x-1 active:translate-y-1"
                      >Escalate</button>
                    </div>
                  </>
                )}

                {triageState === 'passed' && (
                  <>
                    <p className="font-bold mb-2 text-tertiary">All Tests Passed ✓</p>
                    <p className="text-on-surface-variant">Code Agent completed the task after {retryCount} attempt{retryCount > 1 ? 's' : ''}. Supr has validated the output and marked the Code Workspace phase as complete on the Glidepath.</p>
                  </>
                )}
             </div>
          </div>
        </aside>
      </div>

      <footer className={`flex-none h-8 border-t-4 border-primary flex items-center px-4 justify-between font-mono text-xs ${triageState === 'passed' ? 'bg-tertiary text-on-tertiary' : 'bg-primary text-on-primary'}`}>
         <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">{triageState === 'passed' ? 'check_circle' : triageState === 'failed' ? 'error' : 'check_circle'}</span>
              {triageState === 'passed' ? 'Task Complete' : triageState === 'failed' ? 'Failure Detected' : 'System OK'}
            </span>
            {triageState !== 'passed' && (
              <span className="flex items-center gap-1 text-primary-fixed">
                <span className="material-symbols-outlined text-[14px]">sync</span> Code Agent Active
              </span>
            )}
         </div>
      </footer>
    </div>
  );
}
