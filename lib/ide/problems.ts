export type Problem = {
  id: string;
  file: string;
  line: number;
  column: number | null;
  severity: 'error' | 'warning' | 'info';
  message: string;
  source: 'pytest' | 'eslint' | 'npm' | 'tsc' | 'python' | 'runtime' | 'unknown';
};

const PATTERNS: Array<{ re: RegExp; source: Problem['source']; severity: Problem['severity'] }> = [
  // pytest / Python: "path/to/file.py:42: AssertionError" or "line 42, in foo"
  { re: /([\w./-]+\.[Pp]y):(\d+):\s*(.+)$/, source: 'pytest', severity: 'error' },
  { re: /File "([\w./-]+\.[Pp]y)", line (\d+)/, source: 'python', severity: 'error' },
  // eslint: "path/file.js:42:7  error  message  rule-name"
  { re: /([\w./-]+\.[jt]sx?):(\d+):(\d+)?\s+(error|warning)\s+(.+?)(?:\s{2,}([\w-]+))?$/, source: 'eslint', severity: 'error' },
  // TypeScript: "file.ts(42,7): error TS1234: message"
  { re: /([\w./-]+\.[Tt]sx?)\((\d+),(\d+)\):\s+(error|warning)\s+(.+)$/, source: 'tsc', severity: 'error' },
  // npm/build: "npm ERR! file:line"
  { re: /([\w./-]+\.[A-Za-z]+):(\d+):(\d+)$/, source: 'npm', severity: 'error' },
  // Generic Python traceback tail: "NameError: name 'x' is not defined"
  { re: /^([A-Z][\w]*Error):\s+(.+)$/, source: 'runtime', severity: 'error' },
];

export function extractProblems(output: string, currentFile?: string): Problem[] {
  if (!output) return [];
  const problems: Problem[] = [];
  const lines = output.split('\n');
  let idx = 0;
  for (const raw of lines) {
    const line = raw.trim();
    for (const { re, source, severity } of PATTERNS) {
      const m = line.match(re);
      if (m) {
        const file = m[1] && /\.\w+/.test(m[1]) ? m[1] : (currentFile || '<buffer>');
        const lineNum = parseInt(m[2], 10);
        const colNum = m[3] ? parseInt(m[3], 10) : null;
        const message = (m[m.length - 1] || line).trim();
        problems.push({
          id: `p-${idx++}-${file}-${lineNum}-${colNum ?? 0}`,
          file,
          line: Number.isFinite(lineNum) ? lineNum : 0,
          column: colNum,
          severity: severity,
          message,
          source,
        });
        break;
      }
    }
  }
  return problems;
}
