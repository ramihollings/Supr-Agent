export default function CodePage() {
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
            <span className="w-3 h-3 bg-primary-fixed border border-primary animate-pulse"></span>
            <span className="font-body font-bold text-sm uppercase">Agent: CodeBot Active</span>
          </div>
          <button className="bg-surface text-primary border-2 border-primary px-4 py-1.5 font-headline font-bold uppercase hover:bg-primary hover:text-on-primary transition-colors neo-shadow active:translate-x-0.5 active:translate-y-0.5 active:shadow-none">
            Pause
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
                    <div className="flex items-center gap-2 py-1 px-2 hover:bg-surface-container cursor-pointer text-on-surface-variant border-transparent border-2">
                      <span className="material-symbols-outlined text-[18px]">description</span>
                      <span>main.py</span>
                    </div>
                  </li>
                  <li>
                    <div className="flex items-center gap-2 py-1 px-2 bg-primary-container border-2 border-primary cursor-pointer font-bold shadow-[2px_2px_0px_0px_rgba(26,26,26,1)]">
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
                    <div className="flex items-center gap-2 py-1 px-2 hover:bg-surface-container cursor-pointer text-error font-bold border-transparent border-2">
                      <span className="material-symbols-outlined text-[18px]">warning</span>
                      <span>validation.py</span>
                    </div>
                  </li>
                </ul>
              </li>
            </ul>
          </div>
        </aside>

        {/* Middle Pane: Editor */}
        <div className="flex-1 flex flex-col min-w-0 bg-background relative w-full lg:max-w-[calc(100vw-64rem)]">
          <div className="flex border-b-4 border-primary bg-surface-variant h-10 overflow-x-auto custom-scrollbar shrink-0">
            <div className="flex items-center space-x-2 px-4 border-r-4 border-primary bg-background font-body font-bold text-sm">
              <span className="text-tertiary">feedback_clusters.py</span>
              <span className="material-symbols-outlined text-[16px] hover:text-error cursor-pointer">close</span>
            </div>
            <div className="flex items-center space-x-2 px-4 border-r-4 border-primary hover:bg-background cursor-pointer font-body text-sm text-on-surface-variant border-t-2 border-t-transparent hover:border-t-primary shrink-0">
              <span>validation.py</span>
              <span className="w-2 h-2 rounded-full bg-error"></span>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto custom-scrollbar p-4 font-mono text-sm leading-relaxed whitespace-pre bg-surface-container-lowest w-full">
            <span className="text-on-surface-variant"># Cognitive Debt Detection Script{'\n'}</span>
            <span className="text-on-surface-variant"># Author: Supr CodeBot{'\n'}{'\n'}</span>
            <span className="text-tertiary font-bold">import</span> pandas <span className="text-tertiary font-bold">as</span> pd{'\n'}
            <span className="text-tertiary font-bold">import</span> numpy <span className="text-tertiary font-bold">as</span> np{'\n'}
            <span className="text-tertiary font-bold">from</span> sklearn.cluster <span className="text-tertiary font-bold">import</span> KMeans{'\n'}{'\n'}
            
            <span className="text-tertiary font-bold">def</span> <span className="text-primary font-bold">analyze_feedback</span>(data_path: str):{'\n'}
            {'    '}<span className="text-on-surface-variant">"""{'\n'}    Analyzes ticket feedback to identify clusters.{'\n'}    """</span>{'\n'}
            <span className="text-tertiary font-bold">try</span>:{'\n'}
            {'        '}df = pd.read_json(data_path){'\n'}
            {'        '}vectors = np.stack(df['embedding'].values){'\n'}
            {'        '}kmeans = KMeans(n_clusters=5, random_state=42){'\n'}
            {'        '}df['cluster'] = kmeans.fit_predict(vectors){'\n'}
            {'        '}<span className="text-tertiary font-bold">return</span> df{'\n'}
            <span className="text-tertiary font-bold">except</span> Exception <span className="text-tertiary font-bold">as</span> e:{'\n'}
            {'        '}<span className="text-secondary font-bold">print</span>(<span className="text-secondary">f"Error: {'{'}e{'}'}"</span>){'\n'}
            {'        '}<span className="text-tertiary font-bold">raise</span> e{'\n'}{'\n'}

            <span className="text-on-surface-variant"># Agent actively writing...{'\n'}</span>
            <span className="text-tertiary font-bold">def</span> <span className="text-primary font-bold">generate_report</span>(clustered_df):{'\n'}
            {'    '}<span className="bg-primary-fixed text-primary px-1 font-bold animate-pulse">pass # TODO: Implement report generation</span>
          </div>
        </div>

        {/* Right Pane: Terminal & Guidance */}
        <aside className="w-80 lg:w-96 flex-none border-l-4 border-primary bg-background hidden lg:flex flex-col">
          <div className="p-3 border-b-4 border-primary bg-surface-variant flex justify-between items-center">
             <span className="font-headline font-bold uppercase text-sm tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">terminal</span>
                Terminal
             </span>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 bg-surface-tint text-[#f5f0e8] font-mono text-xs leading-loose">
             <div className="mb-2"><span className="text-tertiary font-bold">supr@workspace:~$</span> pytest tests/validation.py</div>
             <div className="mb-4 text-error font-bold flex flex-col gap-1">
                 <span>============================== FAILURES ==============================</span>
                 <span>_ test_analyze_feedback _</span>
                 <span className="pl-4 border-l-2 border-error text-error break-all">E AssertionError: assert 'cluster' in Index</span>
             </div>
             <div className="flex items-center gap-2">
                <span className="text-tertiary font-bold">supr@workspace:~$</span>
                <span className="w-2 h-4 bg-background animate-pulse"></span>
             </div>
          </div>
          
          {/* Guidance overlay */}
          <div className="h-1/3 border-t-4 border-primary bg-background flex flex-col">
             <div className="p-2 border-b-4 border-primary bg-primary-fixed flex items-center justify-between">
                <span className="font-headline font-bold uppercase text-sm flex items-center gap-2 text-primary">
                    <span className="material-symbols-outlined text-[18px]">psychology</span> Supr Guidance
                </span>
                <span className="text-xs font-bold uppercase bg-background text-primary px-2 py-0.5 border-2 border-primary">Triaging</span>
             </div>
             <div className="p-4 flex-1 overflow-y-auto custom-scrollbar text-sm">
                <p className="font-bold mb-2">Issue Detected:</p>
                <p className="text-on-surface-variant mb-4">The test failed because <code className="bg-surface-container-high px-1 neo-border">mock_tickets.json</code> is missing the expected <code className="bg-surface-container-high px-1 neo-border">embedding</code> column.</p>
                <div className="flex gap-2">
                    <button className="flex-1 bg-primary text-on-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-tertiary hover:text-on-tertiary active:translate-x-1 active:translate-y-1">Fix Fixture</button>
                    <button className="flex-1 bg-background text-primary font-headline font-bold uppercase py-2 neo-border neo-shadow text-xs hover:bg-surface-variant active:translate-x-1 active:translate-y-1">Ignore</button>
                </div>
             </div>
          </div>
        </aside>
      </div>

      <footer className="flex-none h-8 border-t-4 border-primary bg-primary flex items-center px-4 justify-between text-on-primary font-mono text-xs">
         <div className="flex items-center gap-4">
            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">check_circle</span> System OK</span>
            <span className="flex items-center gap-1 text-primary-fixed"><span className="material-symbols-outlined text-[14px]">sync</span> CodeBot Computing...</span>
         </div>
      </footer>
    </div>
  );
}
