"use client";

import { useMemo, useState } from 'react';
import type { DashboardArtifact } from '@/types';

type ArtifactSourcePreviewProps = {
  artifact: DashboardArtifact | null;
  isEditing?: boolean;
  editableSource?: string;
  onCopy?: (content: string) => void;
  onDownload?: (artifact: DashboardArtifact) => void;
  onToggleEdit?: () => void;
  onSave?: () => void;
  onDelete?: () => void;
  onSourceChange?: (content: string) => void;
};

export function ArtifactSourcePreview({
  artifact,
  isEditing = false,
  editableSource,
  onCopy,
  onDownload,
  onToggleEdit,
  onSave,
  onDelete,
  onSourceChange,
}: ArtifactSourcePreviewProps) {
  const defaultMode = artifact?.status === 'streaming' || artifact?.type === 'code' ? 'source' : 'preview';
  const [mode, setMode] = useState<'source' | 'preview'>(defaultMode);
  const preview = useMemo(() => artifact ? artifact.preview || renderPreview(artifact.source, artifact.type) : '', [artifact]);

  if (!artifact) {
    return (
      <div className="flex-1 flex flex-col justify-center items-center p-8 bg-surface-container-lowest text-center">
        <span className="material-symbols-outlined text-6xl text-primary/30 mb-4">draft</span>
        <h3 className="font-headline text-lg font-black uppercase text-primary mb-2">No artifact selected</h3>
        <p className="font-body text-xs text-on-surface-variant max-w-sm">Select a file or deliverable to inspect source, preview, provenance, and export actions.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="p-4 border-b-4 border-primary bg-surface-variant shrink-0 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-headline font-black text-xl uppercase truncate max-w-lg">{artifact.filename}</h3>
          <p className="text-[10px] text-on-surface-variant uppercase font-mono font-bold mt-1">
            {artifact.type} / {artifact.status} / {artifact.provenance}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['source', 'preview'] as const).map((item) => (
            <button
              key={item}
              onClick={() => setMode(item)}
              className={`border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase ${mode === item ? 'bg-primary text-on-primary' : 'bg-background text-primary hover:bg-surface-container'}`}
            >
              {item}
            </button>
          ))}
          {onToggleEdit && (
            <button
              onClick={onToggleEdit}
              className="bg-background text-primary border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-surface-container"
            >
              {isEditing ? 'Preview' : 'Edit'}
            </button>
          )}
          {onSave && (
            <button
              onClick={onSave}
              disabled={!isEditing}
              className="bg-secondary text-on-secondary border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-tertiary disabled:opacity-50"
            >
              Save
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="bg-error text-on-error border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-primary"
            >
              Delete
            </button>
          )}
          <button
            onClick={() => onCopy?.(artifact.source)}
            className="bg-background text-primary border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-surface-container"
          >
            Copy
          </button>
          <button
            onClick={() => onDownload?.(artifact)}
            className="bg-primary text-on-primary border-2 border-primary py-1 px-3 text-xs font-headline font-bold uppercase hover:bg-tertiary"
          >
            Download
          </button>
        </div>
      </header>

      <div className="flex-1 p-6 overflow-y-auto custom-scrollbar bg-surface-container-lowest">
        {isEditing ? (
          <textarea
            value={editableSource ?? artifact.source}
            onChange={(event) => onSourceChange?.(event.target.value)}
            className="w-full min-h-full font-mono text-xs p-5 border-2 border-primary bg-background whitespace-pre-wrap leading-relaxed overflow-x-auto text-on-background shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] focus:outline-none focus:border-tertiary resize-none"
            spellCheck={false}
          />
        ) : mode === 'source' ? (
          <pre className="font-mono text-xs p-5 border-2 border-primary bg-background whitespace-pre-wrap leading-relaxed overflow-x-auto text-on-background shadow-[4px_4px_0px_0px_rgba(26,26,26,1)]">
            {artifact.source || '# Artifact source is empty'}
          </pre>
        ) : (
          <article className="font-body text-sm p-5 border-2 border-primary bg-background leading-relaxed text-on-background shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] whitespace-pre-wrap">
            {preview || 'No preview is available yet. Streaming and code artifacts stay in source mode until a final preview exists.'}
          </article>
        )}
      </div>
    </div>
  );
}

function renderPreview(source: string, type: string) {
  if (!source.trim()) return '';
  if (type === 'json') {
    try {
      return JSON.stringify(JSON.parse(source), null, 2);
    } catch {
      return source;
    }
  }
  if (type === 'markdown') {
    return source
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/`{1,3}/g, '');
  }
  return source;
}
