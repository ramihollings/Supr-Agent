// Ambient module declaration for highlight.js (no @types package shipped).
declare module 'highlight.js' {
  export interface HighlightResult {
    value: string;
    language: string;
    relevance: number;
    illegal: boolean;
    top?: unknown;
  }
  export interface HighlightAutoResult extends HighlightResult {
    secondBest?: HighlightResult;
    language: string;
  }
  export function highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): HighlightResult;
  export function highlightAuto(code: string, languageSubset?: string[]): HighlightAutoResult;
  export function highlightAll(): void;
  export function registerLanguage(name: string, language: unknown): void;
  export const listLanguages: () => string[];
  const hljs: {
    highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): HighlightResult;
    highlightAuto(code: string, languageSubset?: string[]): HighlightAutoResult;
    registerLanguage(name: string, language: unknown): void;
    listLanguages: () => string[];
  };
  export default hljs;
}

import type { IdeLanguage } from './language';

let hljsPromise: Promise<typeof import('highlight.js')> | null = null;

async function loadHljs() {
  if (!hljsPromise) {
    hljsPromise = import('highlight.js');
  }
  return hljsPromise;
}

export async function highlightCode(code: string, hljsLanguage: string): Promise<string> {
  try {
    const mod = await loadHljs();
    return mod.default.highlight(code, { language: hljsLanguage, ignoreIllegals: true }).value;
  } catch {
    return escapeHtml(code);
  }
}

export async function highlightForLang(code: string, lang: IdeLanguage): Promise<string> {
  if (lang === 'plaintext') return escapeHtml(code);
  const map: Record<Exclude<IdeLanguage, 'plaintext'>, string> = {
    python: 'python',
    javascript: 'javascript',
    typescript: 'typescript',
    json: 'json',
    markdown: 'markdown',
    bash: 'bash',
  };
  return highlightCode(code, map[lang as Exclude<IdeLanguage, 'plaintext'>] ?? 'plaintext');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
