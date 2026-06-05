'use client';

import type { OutlineSymbol } from '@/lib/ide/outline';
import { symbolIcon } from '@/lib/ide/outline';

export function FileOutline({
  symbols,
  activeLine,
  onJump,
}: {
  symbols: OutlineSymbol[];
  activeLine: number;
  onJump: (line: number) => void;
}) {
  if (symbols.length === 0) {
    return (
      <p className="text-on-surface-variant text-[10px] font-body italic p-3 text-center">
        No outline available.
      </p>
    );
  }
  return (
    <ul className="font-mono text-[11px]" role="tree">
      {symbols.map((s) => {
        const isActive = activeLine === s.line;
        return (
          <li
            key={s.id}
            role="treeitem"
            aria-selected={isActive}
            onClick={() => onJump(s.line)}
            className={`group flex items-center gap-1.5 px-2 py-1 cursor-pointer border-l-2 ${
              isActive
                ? 'bg-primary-container text-on-primary-container border-primary'
                : 'border-transparent hover:bg-surface-container text-on-surface'
            }`}
            title={`${s.name} (line ${s.line})`}
          >
            <span className="material-symbols-outlined text-[12px] text-primary shrink-0">{symbolIcon(s.kind)}</span>
            <span className="truncate">{s.name}</span>
            <span className="ml-auto text-[9px] text-on-surface-variant uppercase">{s.kind}</span>
          </li>
        );
      })}
    </ul>
  );
}
