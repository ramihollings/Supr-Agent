"use client";

import type { ChangeEvent } from "react";

export interface CanvasFileContent {
  filename: string;
  content: string;
}

interface CanvasEditorPanelProps {
  file: CanvasFileContent | null;
  onChangeContent: (next: string) => void;
  onSave: () => void;
  onRun: () => void;
}

export function CanvasEditorPanel({ file, onChangeContent, onSave, onRun }: CanvasEditorPanelProps) {
  if (!file) {
    return (
      <div className="flex-1 flex flex-col space-y-4">
        <p className="text-on-surface-variant text-[10px] italic text-center p-6 bg-background border border-dashed border-primary">
          Select a document from Sandbox Files to view or edit its contents.
        </p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col space-y-3">
      <div className="flex justify-between items-center border-b border-primary pb-1">
        <span className="font-mono text-[10px] font-bold text-primary">{file.filename}</span>
        <div className="flex gap-2">
          <button
            onClick={onSave}
            className="px-2 py-0.5 border border-primary bg-surface font-bold uppercase text-[9px] hover:bg-primary hover:text-on-primary"
          >
            Save Changes
          </button>
          <button
            onClick={onRun}
            className="px-2 py-0.5 border border-primary bg-primary text-on-primary font-bold uppercase text-[9px] hover:bg-tertiary"
          >
            Execute Code
          </button>
        </div>
      </div>
      <textarea
        value={file.content}
        onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChangeContent(e.target.value)}
        className="flex-1 bg-black text-green-400 font-mono text-[11px] leading-relaxed p-4 neo-border focus:outline-none custom-scrollbar resize-none"
      />
    </div>
  );
}
