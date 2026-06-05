'use client';

import { getEol, getIndentUnit, languageLabel } from '@/lib/ide/language';

export type StatusBarProps = {
  file: string;
  languageLabel: ReturnType<typeof languageLabel>;
  cursorLine: number;
  cursorColumn: number;
  selectionLength: number;
  totalLines: number;
  isDirty: boolean;
  eol: ReturnType<typeof getEol>;
  indent: string;
  saving?: boolean;
  lastSavedAt?: string | null;
  encoding: string;
};

export function StatusBar(props: StatusBarProps) {
  const { file, languageLabel: lang, cursorLine, cursorColumn, selectionLength, totalLines, isDirty, eol, indent, saving, lastSavedAt, encoding } = props;
  return (
    <div className="flex items-center border-t-4 border-primary bg-primary text-on-primary font-mono text-[10px] h-6 px-2 gap-3 select-none shrink-0">
      <span className="flex items-center gap-1 font-bold uppercase">
        <span className="material-symbols-outlined text-[12px]">description</span>
        {file || 'untitled'}
      </span>
      <span className={`px-1.5 py-0.5 ${isDirty ? 'bg-amber-500 text-black' : 'bg-tertiary text-on-tertiary'}`}>
        {saving ? 'Saving…' : isDirty ? 'Modified' : 'Saved'}
      </span>
      <span>Ln {cursorLine}, Col {cursorColumn}</span>
      {selectionLength > 0 && <span>({selectionLength} sel)</span>}
      <span>{totalLines} lines</span>
      <span>{lang}</span>
      <span>EOL: {eol}</span>
      <span>Indent: {indent}</span>
      <span>UTF-8/{encoding}</span>
      <span className="ml-auto">
        {lastSavedAt ? `Last save ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Not saved yet'}
      </span>
    </div>
  );
}
