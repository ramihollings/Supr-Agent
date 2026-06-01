"use client";

import type { Artifact, Mission } from '@/types';

type ReportManifestPanelProps = {
  mission: Mission;
  checklist: Record<string, boolean>;
  onDownloadArtifact?: (artifact: Artifact) => void;
  onDownloadBundle?: () => void;
};

export function ReportManifestPanel({
  mission,
  checklist,
  onDownloadArtifact,
  onDownloadBundle,
}: ReportManifestPanelProps) {
  const artifacts = mission.artifacts || [];
  const unresolvedFailures = mission.failures?.filter((failure) => !failure.resolved).length || 0;
  const completeChecks = Object.values(checklist).filter(Boolean).length;
  const totalChecks = Object.values(checklist).length;

  return (
    <section className="bg-background neo-border shadow-[6px_6px_0px_0px_rgba(26,26,26,1)]">
      <header className="p-4 border-b-4 border-primary bg-surface-container-high flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="font-headline text-2xl font-black uppercase text-primary tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-2xl">account_tree</span>
            Source Manifest
          </h2>
          <p className="font-body text-xs text-on-surface-variant mt-1">Export-ready bundle map with evidence status, file ownership, and unresolved failure count.</p>
        </div>
        <button
          onClick={onDownloadBundle}
          className="bg-primary text-on-primary border-2 border-primary px-4 py-2 font-headline font-bold uppercase text-xs hover:bg-tertiary hover:text-on-tertiary"
        >
          <span className="material-symbols-outlined text-sm align-middle mr-1">archive</span>
          Export bundle
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 border-b-4 border-primary divide-x-2 divide-primary">
        <Metric label="Artifacts" value={artifacts.length} />
        <Metric label="Checklist" value={`${completeChecks}/${totalChecks}`} />
        <Metric label="Failures" value={unresolvedFailures} />
        <Metric label="Readiness" value={`${mission.readinessScore || 0}%`} />
      </div>

      <div className="p-4 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        <div className="border-2 border-primary bg-surface p-3">
          <h3 className="font-headline font-black uppercase text-xs text-primary mb-3">Evidence Tree</h3>
          <ul className="space-y-2 font-mono text-[10px] uppercase">
            <li className="flex items-center justify-between gap-2">
              <span className="truncate">/mission/{mission.id}</span>
              <span className="text-secondary">{mission.status}</span>
            </li>
            <li className="pl-3 border-l-2 border-primary flex items-center justify-between gap-2">
              <span className="truncate">/artifacts</span>
              <span>{artifacts.length}</span>
            </li>
            <li className="pl-3 border-l-2 border-primary flex items-center justify-between gap-2">
              <span className="truncate">/memory</span>
              <span>{mission.memoryItems?.length || 0}</span>
            </li>
            <li className="pl-3 border-l-2 border-primary flex items-center justify-between gap-2">
              <span className="truncate">/failures</span>
              <span>{unresolvedFailures}</span>
            </li>
          </ul>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
          {artifacts.length === 0 ? (
            <p className="font-body text-xs text-on-surface-variant border-2 border-dashed border-primary p-4">No artifacts are attached to this report yet.</p>
          ) : artifacts.map((artifact) => (
            <article key={artifact.id} className="border-2 border-primary bg-surface p-3 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-headline font-bold uppercase text-sm text-primary truncate">{artifact.filename}</h3>
                <p className="font-body text-[10px] text-on-surface-variant line-clamp-2">{artifact.content.length.toLocaleString()} chars / {artifact.type} / durable report evidence</p>
              </div>
              <button
                onClick={() => onDownloadArtifact?.(artifact)}
                className="bg-background text-primary border-2 border-primary px-3 py-2 font-headline font-bold uppercase text-[10px] hover:bg-primary hover:text-on-primary shrink-0"
              >
                <span className="material-symbols-outlined text-sm align-middle mr-1">download</span>
                File
              </button>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="p-3 bg-surface">
      <p className="font-headline font-black text-2xl text-secondary">{value}</p>
      <p className="font-headline font-bold uppercase text-[9px] text-on-surface-variant">{label}</p>
    </div>
  );
}
