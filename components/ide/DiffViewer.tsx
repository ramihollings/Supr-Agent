'use client';

import { useMemo, useState } from 'react';
import { computeLineDiff, type DiffHunk, type DiffLine, type DiffResult } from '@/lib/ide/diff';

export type DiffViewerProps = {
  open: boolean;
  original: string;
  proposed: string;
  filename: string;
  diagnosis?: string;
  fix?: string;
  onAcceptAll: () => void;
  onRejectAll: () => void;
  onAcceptHunk: (hunkIndex: number) => void;
  onRejectHunk: (hunkIndex: number) => void;
  onClose: () => void;
};

export function DiffViewer({
  open,
  original,
  proposed,
  filename,
  diagnosis,
  fix,
  onAcceptAll,
  onRejectAll,
  onAcceptHunk,
  onRejectHunk,
  onClose,
}: DiffViewerProps) {
  const diff: DiffResult = useMemo(() => computeLineDiff(original, proposed, 3), [original, proposed]);
  const [rejectedHunks, setRejectedHunks] = useState<Set<number>>(new Set());

  if (!open) return null;

  const acceptAll = () => {
    setRejectedHunks(new Set());
    onAcceptAll();
  };
  const rejectAll = () => {
    setRejectedHunks(new Set(diff.hunks.map((_, i) => i)));
    onRejectAll();
  };

  return (
    <div className="absolute inset-0 z-30 bg-background/95 backdrop-blur-sm flex flex-col" role="dialog" aria-label={`Diff for ${filename}`}>
      <header className="flex items-center justify-between border-b-4 border-primary bg-surface-variant px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary">difference</span>
          <span className="font-headline font-black uppercase text-sm text-primary">Code Agent Diff</span>
          <span className="text-[10px] font-mono text-on-surface-variant">{filename}</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[10px]">
          <span className="text-tertiary">+{diff.added}</span>
          <span className="text-error">−{diff.removed}</span>
          <span className="text-on-surface-variant">={diff.unchanged}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={rejectAll}
            className="px-2 h-7 border-2 border-primary bg-background text-primary hover:bg-error hover:text-on-error font-headline font-bold uppercase text-[10px]"
            title="Reject all hunks"
          >
            <span className="material-symbols-outlined text-[12px] align-middle">block</span>
            <span className="ml-1">Reject All</span>
          </button>
          <button
            onClick={acceptAll}
            className="px-2 h-7 border-2 border-primary bg-primary text-on-primary hover:bg-tertiary hover:text-on-tertiary font-headline font-bold uppercase text-[10px]"
            title="Accept all hunks"
          >
            <span className="material-symbols-outlined text-[12px] align-middle">check_circle</span>
            <span className="ml-1">Accept All</span>
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 border-2 border-primary bg-background text-primary hover:bg-error hover:text-on-error flex items-center justify-center"
            title="Close diff"
            aria-label="Close diff"
          >
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      </header>
      {(diagnosis || fix) && (
        <div className="px-3 py-2 border-b-2 border-primary bg-primary-container text-[10px] font-body text-on-primary-container">
          {diagnosis && <p><strong>Diagnosis:</strong> {diagnosis}</p>}
          {fix && <p><strong>Fix:</strong> {fix}</p>}
        </div>
      )}
      <div className="flex-1 overflow-auto custom-scrollbar bg-surface-container-lowest font-mono text-[12px] leading-[18px]">
        {diff.hunks.length === 0 ? (
          <p className="p-6 text-center text-on-surface-variant text-xs">No changes proposed by the Code Agent.</p>
        ) : (
          <div className="grid grid-cols-2 min-w-full">
            {diff.hunks.map((hunk, hunkIndex) => (
              <HunkRows
                key={`hunk-${hunkIndex}`}
                hunkIndex={hunkIndex}
                hunk={hunk}
                rejected={rejectedHunks.has(hunkIndex)}
                onAccept={() => {
                  setRejectedHunks((prev) => {
                    const next = new Set(prev);
                    next.delete(hunkIndex);
                    return next;
                  });
                  onAcceptHunk(hunkIndex);
                }}
                onReject={() => {
                  setRejectedHunks((prev) => new Set(prev).add(hunkIndex));
                  onRejectHunk(hunkIndex);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function HunkRows({
  hunkIndex,
  hunk,
  rejected,
  onAccept,
  onReject,
}: {
  hunkIndex: number;
  hunk: DiffHunk;
  rejected: boolean;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <>
      <div className="col-span-2 flex items-center gap-2 bg-surface-variant border-y-2 border-primary px-2 py-1 sticky top-0 z-10">
        <span className="font-headline font-black uppercase text-[10px] text-primary">Hunk {hunkIndex + 1}</span>
        <span className="text-[9px] font-mono text-on-surface-variant">{hunk.lines.length} line(s)</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={onReject}
            disabled={rejected}
            className={`px-2 h-6 border border-primary text-[10px] font-bold uppercase ${rejected ? 'bg-error text-on-error' : 'bg-background text-primary hover:bg-error hover:text-on-error'}`}
          >
            <span className="material-symbols-outlined text-[10px] align-middle">close</span>
            <span className="ml-1">{rejected ? 'Rejected' : 'Reject'}</span>
          </button>
          <button
            onClick={onAccept}
            disabled={rejected}
            className={`px-2 h-6 border border-primary text-[10px] font-bold uppercase ${rejected ? 'bg-background text-on-surface-variant' : 'bg-primary text-on-primary hover:bg-tertiary hover:text-on-tertiary'}`}
          >
            <span className="material-symbols-outlined text-[10px] align-middle">check</span>
            <span className="ml-1">Accept</span>
          </button>
        </div>
      </div>
      {hunk.lines.map((row, rowIndex) => {
        if (row.kind === 'spacer') {
          return (
            <div key={`spacer-${hunkIndex}-${rowIndex}`} className="col-span-2 px-2 py-0.5 text-center text-on-surface-variant text-[10px] italic bg-surface">
              ⋯ collapsed unchanged lines ⋯
            </div>
          );
        }
        return (
          <DiffRow key={`${hunkIndex}-${rowIndex}`} row={row} hunkIndex={hunkIndex} rowIndex={rowIndex} />
        );
      })}
    </>
  );
}

function DiffRow({ row, hunkIndex, rowIndex }: { row: DiffLine; hunkIndex: number; rowIndex: number }) {
  const leftTone =
    row.kind === 'delete' || row.kind === 'change'
      ? 'bg-error-container text-on-error-container'
      : 'bg-surface';
  const rightTone =
    row.kind === 'insert' || row.kind === 'change'
      ? 'bg-tertiary-container text-on-tertiary-container'
      : 'bg-surface';
  const prefix =
    row.kind === 'delete' || row.kind === 'change' ? '−' : row.kind === 'insert' ? '+' : ' ';
  return (
    <>
      <div
        className={`flex items-start px-2 whitespace-pre ${leftTone} border-r-2 border-outline-variant`}
        style={{ minHeight: 18 }}
      >
        <span className="w-8 text-right pr-2 text-on-surface-variant text-[10px] select-none">{row.left?.line ?? ''}</span>
        <span className="w-3 text-on-surface-variant text-[10px] select-none">{row.left ? prefix : ''}</span>
        <span className="flex-1 break-all">{row.left?.text ?? ''}</span>
      </div>
      <div
        className={`flex items-start px-2 whitespace-pre ${rightTone}`}
        style={{ minHeight: 18 }}
      >
        <span className="w-8 text-right pr-2 text-on-surface-variant text-[10px] select-none">{row.right?.line ?? ''}</span>
        <span className="w-3 text-on-surface-variant text-[10px] select-none">{row.right ? prefix : ''}</span>
        <span className="flex-1 break-all">{row.right?.text ?? ''}</span>
      </div>
      {/* hunkIndex/rowIndex are used by parent keying; referenced to keep lint happy. */}
      <span hidden data-hunk={hunkIndex} data-row={rowIndex} />
    </>
  );
}
