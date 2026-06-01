"use client";

import type { RunEvent } from '@/types';

type EvidenceSource = {
  id: string;
  title: string;
  detail: string;
  sourceType: 'web' | 'file' | 'artifact' | 'memory' | 'system';
  confidence?: 'low' | 'medium' | 'high';
  href?: string;
};

type EvidenceSourcePanelProps = {
  sources: EvidenceSource[];
  events?: RunEvent[];
  title?: string;
  emptyMessage?: string;
};

const confidenceClass = {
  low: 'bg-error text-on-error',
  medium: 'bg-secondary-container text-secondary',
  high: 'bg-tertiary-container text-on-tertiary-container',
};

const sourceIcon: Record<EvidenceSource['sourceType'], string> = {
  web: 'language',
  file: 'draft',
  artifact: 'inventory_2',
  memory: 'memory',
  system: 'settings_suggest',
};

export function EvidenceSourcePanel({
  sources,
  events = [],
  title = 'Evidence Sources',
  emptyMessage = 'No evidence sources have been captured yet.',
}: EvidenceSourcePanelProps) {
  return (
    <section className="bg-background neo-border">
      <header className="p-3 border-b-4 border-primary bg-surface-container-high flex items-center justify-between gap-3">
        <h3 className="font-headline font-black uppercase text-xs text-primary flex items-center gap-1.5">
          <span className="material-symbols-outlined text-sm">fact_check</span>
          {title}
        </h3>
        <span className="font-mono text-[9px] uppercase text-on-surface-variant">{sources.length} sources / {events.length} events</span>
      </header>

      <div className="p-3 space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
        {sources.length === 0 ? (
          <p className="font-body text-xs text-on-surface-variant">{emptyMessage}</p>
        ) : sources.map((source) => (
          <article key={source.id} className="border-2 border-primary bg-surface p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h4 className="font-headline font-bold uppercase text-[10px] text-primary flex items-center gap-1.5 truncate">
                  <span className="material-symbols-outlined text-sm">{sourceIcon[source.sourceType]}</span>
                  <span className="truncate">{source.title}</span>
                </h4>
                <p className="font-body text-[10px] text-on-surface-variant mt-1 line-clamp-2">{source.detail}</p>
              </div>
              <span className={`font-mono text-[8px] uppercase px-1.5 py-0.5 border border-primary shrink-0 ${confidenceClass[source.confidence || 'medium']}`}>
                {source.confidence || 'medium'}
              </span>
            </div>
            {source.href && (
              <a href={source.href} className="mt-2 inline-flex items-center gap-1 font-headline font-bold uppercase text-[9px] text-primary hover:text-tertiary">
                <span className="material-symbols-outlined text-xs">open_in_new</span>
                Open source
              </a>
            )}
          </article>
        ))}
      </div>

      {events.length > 0 && (
        <details className="border-t-2 border-primary bg-surface-container-lowest">
          <summary className="cursor-pointer p-3 font-headline font-black uppercase text-[10px] text-primary flex items-center gap-1.5">
            <span className="material-symbols-outlined text-sm">timeline</span>
            Raw evidence timeline
          </summary>
          <div className="p-3 space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
            {events.map((event) => (
              <div key={event.id} className="border-l-4 border-secondary pl-3 py-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-headline font-bold uppercase text-[10px] text-primary truncate">{event.title}</span>
                  <span className="font-mono text-[8px] uppercase text-on-surface-variant">{event.status}</span>
                </div>
                <p className="font-body text-[10px] text-on-surface-variant line-clamp-2">{event.detail}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
