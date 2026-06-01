"use client";

import { useMemo, useState } from 'react';
import type { RunEvent, RunEventKind } from '@/types';

type TranscriptMode = 'nice' | 'raw';
type TranscriptDensity = 'comfortable' | 'compact';

type RunTranscriptViewProps = {
  events: RunEvent[];
  title?: string;
};

const kindIcon: Record<RunEventKind, string> = {
  command: 'terminal',
  tool: 'build',
  diff: 'difference',
  stderr: 'warning',
  system: 'settings_suggest',
  approval: 'approval_delegation',
  artifact: 'draft',
  memory: 'memory',
  failure: 'error',
};

const statusClass: Record<RunEvent['status'], string> = {
  pending: 'bg-surface-container text-on-surface-variant',
  running: 'bg-primary-container text-primary',
  succeeded: 'bg-tertiary-container text-on-tertiary-container',
  warning: 'bg-secondary-container text-secondary',
  failed: 'bg-error text-on-error',
};

export function RunTranscriptView({ events, title = 'Run Transcript' }: RunTranscriptViewProps) {
  const [mode, setMode] = useState<TranscriptMode>('nice');
  const [density, setDensity] = useState<TranscriptDensity>('compact');
  const grouped = useMemo(() => groupEvents(events), [events]);

  return (
    <section className="bg-background neo-border">
      <header className="border-b-4 border-primary p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface-container-high">
        <div>
          <h3 className="font-headline font-black uppercase text-sm text-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">receipt_long</span>
            {title}
          </h3>
          <p className="font-body text-[10px] text-on-surface-variant">Grouped timeline with warnings for steps that produced no durable output.</p>
        </div>
        <div className="flex gap-2">
          {(['nice', 'raw'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={`border-2 border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] ${mode === item ? 'bg-primary text-on-primary' : 'bg-background text-primary'}`}
            >
              {item}
            </button>
          ))}
          {(['compact', 'comfortable'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setDensity(item)}
              className={`border-2 border-primary px-2 py-1 font-headline font-bold uppercase text-[9px] ${density === item ? 'bg-secondary text-on-secondary' : 'bg-background text-primary'}`}
            >
              {item}
            </button>
          ))}
        </div>
      </header>

      <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y-2 divide-primary/20">
        {events.length === 0 ? (
          <div className="p-4 font-body text-xs text-on-surface-variant">No transcript yet.</div>
        ) : mode === 'raw' ? (
          <pre className="p-4 font-mono text-[10px] whitespace-pre-wrap overflow-x-auto">
            {JSON.stringify(events, null, 2)}
          </pre>
        ) : (
          Object.entries(grouped).map(([kind, rows]) => (
            <details key={kind} open={kind === 'failure' || kind === 'approval' || rows.some((row) => row.status === 'warning')} className="group">
              <summary className="cursor-pointer list-none p-3 bg-surface hover:bg-surface-container flex items-center justify-between gap-3">
                <span className="font-headline font-black uppercase text-[10px] text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">{kindIcon[kind as RunEventKind]}</span>
                  {kind} ({rows.length})
                </span>
                <span className="material-symbols-outlined text-sm group-open:rotate-180 transition-transform">expand_more</span>
              </summary>
              <div className="p-3 space-y-2 bg-surface-container-lowest">
                {rows.map((event) => (
                  <article key={event.id} className={`border-2 border-primary bg-background ${density === 'compact' ? 'p-2' : 'p-3'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className="font-headline font-bold uppercase text-[11px] text-primary truncate">{event.title}</h4>
                        <p className="font-mono text-[9px] text-on-surface-variant uppercase">{event.actor} / {new Date(event.timestamp).toLocaleString()}</p>
                      </div>
                      <span className={`font-mono text-[8px] uppercase px-2 py-1 border border-primary shrink-0 ${statusClass[event.status]}`}>
                        {event.status}
                      </span>
                    </div>
                    <p className={`font-body text-[11px] text-on-surface-variant mt-2 whitespace-pre-wrap ${density === 'compact' ? 'line-clamp-2' : ''}`}>{event.detail}</p>
                    {event.command && (
                      <div className="mt-2 grid gap-2 font-mono text-[9px]">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="uppercase border border-primary px-1.5 py-0.5 bg-surface-container">
                            Exit {event.command.exitCode ?? 'unknown'}
                          </span>
                          {typeof event.command.durationMs === 'number' && (
                            <span className="uppercase border border-primary px-1.5 py-0.5 bg-surface-container">
                              {event.command.durationMs}ms
                            </span>
                          )}
                        </div>
                        {event.command.command && (
                          <pre className="bg-black text-green-300 border border-primary p-2 whitespace-pre-wrap overflow-x-auto">{event.command.command}</pre>
                        )}
                        {event.command.stdout && (
                          <div>
                            <p className="font-headline font-black uppercase text-[8px] text-tertiary mb-1">STDOUT</p>
                            <pre className="bg-black text-green-300 border border-primary p-2 whitespace-pre-wrap overflow-x-auto">{event.command.stdout}</pre>
                          </div>
                        )}
                        {event.command.stderr && (
                          <div>
                            <p className="font-headline font-black uppercase text-[8px] text-error mb-1">STDERR</p>
                            <pre className="bg-black text-red-300 border border-primary p-2 whitespace-pre-wrap overflow-x-auto">{event.command.stderr}</pre>
                          </div>
                        )}
                      </div>
                    )}
                    {event.evidence && event.evidence.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {event.evidence.map((evidence) => (
                          <span key={evidence.id} className="font-mono text-[8px] uppercase border border-primary bg-primary-container text-primary px-1.5 py-0.5">
                            {evidence.durable ? 'durable' : 'volatile'}: {evidence.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}

function groupEvents(events: RunEvent[]) {
  return events.reduce<Record<string, RunEvent[]>>((acc, event) => {
    acc[event.kind] ||= [];
    acc[event.kind].push(event);
    return acc;
  }, {});
}
