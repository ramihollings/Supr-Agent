export type IdeLanguage = 'python' | 'javascript' | 'typescript' | 'json' | 'markdown' | 'bash' | 'plaintext';

const LANGUAGE_BY_EXT: { ext: string; lang: IdeLanguage; hljs: string }[] = [
  { ext: '.py', lang: 'python', hljs: 'python' },
  { ext: '.js', lang: 'javascript', hljs: 'javascript' },
  { ext: '.jsx', lang: 'javascript', hljs: 'javascript' },
  { ext: '.mjs', lang: 'javascript', hljs: 'javascript' },
  { ext: '.cjs', lang: 'javascript', hljs: 'javascript' },
  { ext: '.ts', lang: 'typescript', hljs: 'typescript' },
  { ext: '.tsx', lang: 'typescript', hljs: 'typescript' },
  { ext: '.json', lang: 'json', hljs: 'json' },
  { ext: '.md', lang: 'markdown', hljs: 'markdown' },
  { ext: '.sh', lang: 'bash', hljs: 'bash' },
  { ext: '.bash', lang: 'bash', hljs: 'bash' },
  { ext: '.zsh', lang: 'bash', hljs: 'bash' },
];

export function detectLanguage(filename: string): { lang: IdeLanguage; hljs: string } {
  const lower = filename.toLowerCase();
  const match = LANGUAGE_BY_EXT.find((entry) => lower.endsWith(entry.ext));
  return match ? { lang: match.lang, hljs: match.hljs } : { lang: 'plaintext', hljs: 'plaintext' };
}

export function languageLabel(lang: IdeLanguage): string {
  switch (lang) {
    case 'python': return 'Python';
    case 'javascript': return 'JavaScript';
    case 'typescript': return 'TypeScript';
    case 'json': return 'JSON';
    case 'markdown': return 'Markdown';
    case 'bash': return 'Shell';
    default: return 'Plain Text';
  }
}

export function getEol(text: string): 'LF' | 'CRLF' | 'Mixed' {
  const lf = text.includes('\n');
  const crlf = /\r\n/.test(text);
  if (crlf && lf && text.split('\n').some((line) => line.endsWith('\r'))) return 'Mixed';
  if (crlf) return 'CRLF';
  if (lf) return 'LF';
  return 'LF';
}

export function getIndentUnit(text: string): string {
  const firstLine = text.split('\n').find((line) => line.startsWith(' ') || line.startsWith('\t')) || '';
  if (firstLine.startsWith('\t')) return 'Tab';
  const match = firstLine.match(/^( {2,})/);
  if (match) return `Spaces: ${match[1].length}`;
  return 'Spaces: 4';
}
