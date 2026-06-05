'use client';

import type { Problem } from '@/lib/ide/problems';

export function ProblemsPanel({
  problems,
  onJump,
  onClear,
  onRunLint,
}: {
  problems: Problem[];
  onJump: (p: Problem) => void;
  onClear: () => void;
  onRunLint: () => void;
}) {
  const errors = problems.filter((p) => p.severity === 'error').length;
  const warnings = problems.filter((p) => p.severity === 'warning').length;
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-2 py-1 border-b-2 border-primary bg-surface-container text-[10px] font-headline font-black uppercase">
        <span className="material-symbols-outlined text-[14px]">bug_report</span>
        <span className="text-error">Errors: {errors}</span>
        <span className="text-amber-600">Warnings: {warnings}</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            onClick={onRunLint}
            className="text-on-surface-variant hover:text-primary uppercase"
            title="Re-run lint to refresh problems"
          >
            <span className="material-symbols-outlined text-[12px] align-middle">refresh</span>
            <span className="ml-1">Lint</span>
          </button>
          <button onClick={onClear} className="text-on-surface-variant hover:text-error uppercase">
            Clear
          </button>
        </span>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {problems.length === 0 ? (
          <p className="p-3 text-on-surface-variant text-[10px] font-body italic text-center">
            No problems detected. Click <em>Lint</em> to refresh.
          </p>
        ) : (
          <ul>
            {problems.map((p) => (
              <li
                key={p.id}
                onClick={() => onJump(p)}
                className="flex items-start gap-2 px-2 py-1 border-b border-outline-variant hover:bg-surface-container cursor-pointer font-mono text-[10px]"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onJump(p);
                  }
                }}
              >
                <span
                  className={`mt-0.5 material-symbols-outlined text-[12px] ${
                    p.severity === 'error' ? 'text-error' : p.severity === 'warning' ? 'text-amber-600' : 'text-on-surface-variant'
                  }`}
                >
                  {p.severity === 'error' ? 'error' : p.severity === 'warning' ? 'warning' : 'info'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`break-words ${p.severity === 'error' ? 'text-error font-bold' : ''}`}>
                    {p.message}
                  </p>
                  <p className="text-on-surface-variant text-[9px] mt-0.5">
                    {p.file}:{p.line}
                    {p.column != null ? `:${p.column}` : ''} · {p.source}
                  </p>
                </div>
                <span className="material-symbols-outlined text-[12px] text-on-surface-variant" title="Jump to problem">arrow_forward</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
