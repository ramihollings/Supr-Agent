'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

export type Command = {
  id: string;
  label: string;
  description?: string;
  group: 'File' | 'Edit' | 'View' | 'Run' | 'Code Agent';
  shortcut?: string;
  icon?: string;
  keywords?: string[];
  run: () => void;
};

export function CommandPalette({
  open,
  commands,
  onClose,
}: {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((cmd) => {
      const haystack = [cmd.label, cmd.description, cmd.group, ...(cmd.keywords || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [commands, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filtered[active];
        if (cmd) {
          cmd.run();
          onClose();
        }
      }
    }
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, filtered, active, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/40 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="bg-background border-4 border-primary w-full max-w-lg shadow-[8px_8px_0px_0px_rgba(26,26,26,1)]">
        <div className="flex items-center border-b-4 border-primary px-3 py-2 gap-2">
          <span className="material-symbols-outlined text-primary">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command (e.g. 'Run', 'Save', 'Find', 'Diagnose')"
            className="flex-1 bg-transparent font-body text-sm focus:outline-none placeholder:text-on-surface-variant"
          />
          <span className="text-[10px] font-mono text-on-surface-variant">Esc</span>
        </div>
        <div className="max-h-80 overflow-y-auto custom-scrollbar">
          {filtered.length === 0 ? (
            <p className="p-4 text-center text-on-surface-variant text-xs">No commands match.</p>
          ) : (
            <ul>
              {filtered.map((cmd, i) => (
                <li
                  key={cmd.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => {
                    cmd.run();
                    onClose();
                  }}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-b border-outline-variant ${
                    i === active ? 'bg-primary text-on-primary' : 'hover:bg-surface-container'
                  }`}
                >
                  {cmd.icon && <span className="material-symbols-outlined text-[16px]">{cmd.icon}</span>}
                  <div className="flex-1 min-w-0">
                    <p className="font-headline font-bold text-xs uppercase truncate">{cmd.label}</p>
                    {cmd.description && (
                      <p className={`text-[10px] truncate ${i === active ? 'text-on-primary/80' : 'text-on-surface-variant'}`}>
                        {cmd.description}
                      </p>
                    )}
                  </div>
                  <span className={`text-[9px] font-mono ${i === active ? 'text-on-primary' : 'text-on-surface-variant'}`}>
                    {cmd.group}
                  </span>
                  {cmd.shortcut && (
                    <kbd className={`text-[9px] font-mono border px-1 ${i === active ? 'border-on-primary' : 'border-primary'}`}>
                      {cmd.shortcut}
                    </kbd>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
