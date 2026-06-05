'use client';

import { useEffect, useRef, useState } from 'react';

export type FindState = {
  query: string;
  replacement: string;
  caseSensitive: boolean;
  regex: boolean;
  showReplace: boolean;
};

export const defaultFindState: FindState = {
  query: '',
  replacement: '',
  caseSensitive: false,
  regex: false,
  showReplace: false,
};

export function FindBar({
  state,
  onChange,
  onClose,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  matchCount,
  activeIndex,
}: {
  state: FindState;
  onChange: (next: FindState) => void;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  matchCount: number;
  activeIndex: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div
      className="absolute top-0 right-0 z-20 border-l-4 border-b-4 border-primary bg-surface-variant shadow-[4px_4px_0px_0px_rgba(26,26,26,1)] font-body text-xs"
      role="search"
    >
      <div className="flex items-center gap-1 p-1.5">
        <input
          ref={inputRef}
          value={state.query}
          onChange={(e) => onChange({ ...state, query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) onPrev(); else onNext();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder="Find"
          className="w-40 bg-background border-2 border-primary px-2 py-1 font-mono text-[11px] focus:outline-none focus:border-tertiary"
          aria-label="Find text"
        />
        <span className="text-[10px] text-on-surface-variant font-mono px-1 whitespace-nowrap">
          {matchCount === 0 ? 'No results' : `${activeIndex + 1} / ${matchCount}`}
        </span>
        <Toggle label="Aa" active={state.caseSensitive} onClick={() => onChange({ ...state, caseSensitive: !state.caseSensitive })} title="Case sensitive" />
        <Toggle label=".*" active={state.regex} onClick={() => onChange({ ...state, regex: !state.regex })} title="Regular expression" />
        <button onClick={onPrev} title="Previous match" className="w-6 h-6 flex items-center justify-center border border-primary bg-background hover:bg-tertiary hover:text-on-tertiary">
          <span className="material-symbols-outlined text-[12px]">expand_less</span>
        </button>
        <button onClick={onNext} title="Next match" className="w-6 h-6 flex items-center justify-center border border-primary bg-background hover:bg-tertiary hover:text-on-tertiary">
          <span className="material-symbols-outlined text-[12px]">expand_more</span>
        </button>
        <button
          onClick={() => onChange({ ...state, showReplace: !state.showReplace })}
          title="Toggle replace"
          className={`w-6 h-6 flex items-center justify-center border border-primary ${state.showReplace ? 'bg-primary text-on-primary' : 'bg-background hover:bg-tertiary hover:text-on-tertiary'}`}
        >
          <span className="material-symbols-outlined text-[12px]">find_replace</span>
        </button>
        <button onClick={onClose} title="Close" className="w-6 h-6 flex items-center justify-center border border-primary bg-background hover:bg-error hover:text-on-error">
          <span className="material-symbols-outlined text-[12px]">close</span>
        </button>
      </div>
      {state.showReplace && (
        <div className="flex items-center gap-1 p-1.5 border-t-2 border-primary">
          <input
            value={state.replacement}
            onChange={(e) => onChange({ ...state, replacement: e.target.value })}
            placeholder="Replace"
            className="w-40 bg-background border-2 border-primary px-2 py-1 font-mono text-[11px] focus:outline-none focus:border-tertiary"
            aria-label="Replacement"
          />
          <button onClick={onReplace} title="Replace current match" className="px-2 h-6 border border-primary bg-background text-[10px] uppercase font-bold hover:bg-tertiary hover:text-on-tertiary">
            Replace
          </button>
          <button onClick={onReplaceAll} title="Replace all matches" className="px-2 h-6 border border-primary bg-background text-[10px] uppercase font-bold hover:bg-tertiary hover:text-on-tertiary">
            All
          </button>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, active, onClick, title }: { label: string; active: boolean; onClick: () => void; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`w-6 h-6 flex items-center justify-center border border-primary text-[9px] font-bold ${active ? 'bg-primary text-on-primary' : 'bg-background hover:bg-tertiary hover:text-on-tertiary'}`}
    >
      {label}
    </button>
  );
}
