import type { IdeLanguage } from './language';

export type OutlineSymbol = {
  id: string;
  name: string;
  kind: 'function' | 'class' | 'method' | 'import' | 'variable' | 'section' | 'constant';
  line: number;
  column: number;
};

const PY_PATTERNS: Array<{ re: RegExp; kind: OutlineSymbol['kind'] }> = [
  { re: /^\s*def\s+([A-Za-z_][\w]*)\s*\(/, kind: 'function' },
  { re: /^\s*class\s+([A-Za-z_][\w]*)\s*[:\(]/, kind: 'class' },
  { re: /^\s*async\s+def\s+([A-Za-z_][\w]*)\s*\(/, kind: 'function' },
  { re: /^\s*from\s+([\w.]+)\s+import\s+(.+?)$/, kind: 'import' },
  { re: /^\s*import\s+([\w.]+)/, kind: 'import' },
];

const JS_TS_PATTERNS: Array<{ re: RegExp; kind: OutlineSymbol['kind'] }> = [
  { re: /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/, kind: 'function' },
  { re: /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/, kind: 'class' },
  { re: /^\s*(?:public|private|protected|static|async|readonly|\s)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*[:{]/, kind: 'method' },
  { re: /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/, kind: 'variable' },
  { re: /^\s*import\s+.+?\s+from\s+['"]([^'"]+)['"]/, kind: 'import' },
];

const MD_PATTERNS: Array<{ re: RegExp; kind: OutlineSymbol['kind'] }> = [
  { re: /^(#{1,6})\s+(.*?)\s*$/, kind: 'section' },
];

const JSON_PATTERNS: Array<{ re: RegExp; kind: OutlineSymbol['kind'] }> = [
  { re: /^\s*"([^"]+)"\s*:\s*\{/, kind: 'section' },
];

const BASH_PATTERNS: Array<{ re: RegExp; kind: OutlineSymbol['kind'] }> = [
  { re: /^\s*(?:function\s+)?([A-Za-z_][\w]*)\s*\(\s*\)\s*\{/, kind: 'function' },
  { re: /^\s*export\s+([A-Za-z_][\w]*)=/, kind: 'variable' },
];

export function extractOutline(code: string, lang: IdeLanguage): OutlineSymbol[] {
  const patterns = patternsFor(lang);
  if (patterns.length === 0) return [];
  const symbols: OutlineSymbol[] = [];
  const lines = code.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    for (const { re, kind } of patterns) {
      const match = line.match(re);
      if (match) {
        const name = (match[1] || match[2] || '').trim();
        if (!name) continue;
        symbols.push({
          id: `${i}-${name}`,
          name,
          kind,
          line: i + 1,
          column: line.indexOf(name) + 1,
        });
        break;
      }
    }
  }
  return symbols;
}

function patternsFor(lang: IdeLanguage): Array<{ re: RegExp; kind: OutlineSymbol['kind'] }> {
  switch (lang) {
    case 'python': return PY_PATTERNS;
    case 'javascript':
    case 'typescript': return JS_TS_PATTERNS;
    case 'markdown': return MD_PATTERNS;
    case 'json': return JSON_PATTERNS;
    case 'bash': return BASH_PATTERNS;
    case 'plaintext':
    default: return [];
  }
}

export function symbolIcon(kind: OutlineSymbol['kind']): string {
  switch (kind) {
    case 'function': return 'function';
    case 'class': return 'class';
    case 'method': return 'methodology';
    case 'import': return 'input';
    case 'variable': return 'tag';
    case 'section': return 'tag';
    case 'constant': return 'lock';
    default: return 'label';
  }
}
