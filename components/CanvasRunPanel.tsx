"use client";

export interface RunOutput {
  success: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
}

interface CanvasRunPanelProps {
  loading: boolean;
  output: RunOutput | null;
}

export function CanvasRunPanel({ loading, output }: CanvasRunPanelProps) {
  if (loading) {
    return (
      <div className="flex-1 flex flex-col space-y-4">
        <div className="border-b border-primary pb-1">
          <span className="font-headline font-black uppercase text-xs text-primary">Terminal Execution Logs</span>
        </div>
        <div className="p-6 bg-black text-amber-500 font-mono text-xs flex items-center gap-2 neo-border">
          <span className="material-symbols-outlined animate-spin text-sm">sync</span>
          Executing script inside sandbox...
        </div>
      </div>
    );
  }
  if (!output) {
    return (
      <div className="flex-1 flex flex-col space-y-4">
        <div className="border-b border-primary pb-1">
          <span className="font-headline font-black uppercase text-xs text-primary">Terminal Execution Logs</span>
        </div>
        <p className="text-on-surface-variant text-[10px] italic text-center p-6 bg-background border border-dashed border-primary">
          No active script execution has been initialized. Run a script inside Editor Preview!
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col space-y-4">
      <div className="border-b border-primary pb-1">
        <span className="font-headline font-black uppercase text-xs text-primary">Terminal Execution Logs</span>
      </div>
      <div className="flex-1 bg-black text-white font-mono text-[11px] p-4 neo-border overflow-y-auto custom-scrollbar flex flex-col gap-3">
        {output.success ? (
          <div className="text-green-500 font-bold uppercase text-[9px] flex items-center gap-1 border-b border-green-950 pb-1">
            <span className="material-symbols-outlined text-xs">check_circle</span>
            Execution Succeeded
          </div>
        ) : (
          <div className="text-red-500 font-bold uppercase text-[9px] flex items-center gap-1 border-b border-red-955 pb-1">
            <span className="material-symbols-outlined text-xs">error</span>
            Execution Failed (Code {output.error ? 1 : 0})
          </div>
        )}

        {output.stdout && (
          <div>
            <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">STDOUT:</span>
            <pre className="text-green-400 whitespace-pre-wrap">{output.stdout}</pre>
          </div>
        )}

        {output.stderr && (
          <div>
            <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">STDERR:</span>
            <pre className="text-red-400 whitespace-pre-wrap">{output.stderr}</pre>
          </div>
        )}

        {output.error && (
          <div>
            <span className="text-[9px] font-bold text-gray-500 uppercase block mb-1">SYSTEM EXCEPTION:</span>
            <pre className="text-red-500 whitespace-pre-wrap">{output.error}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
