// highlight.js is a CJS module that exports a function-form hljs object
// (no `default` export). We dynamic-import it on the client and cast to
// the surface we need, which keeps the bundle small (only loaded on
// first editor open).

import type { IdeLanguage } from './language';

type HljsSurface = {
  highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): { value: string };
  highlightAuto(code: string, languageSubset?: string[]): { value: string };
  listLanguages: () => string[];
  registerLanguage: (name: string, language: unknown) => void;
};

let hljsPromise: Promise<HljsSurface> | null = null;

async function loadHljs(): Promise<HljsSurface> {
  if (!hljsPromise) {
    // The package's CJS shape: the imported namespace is the hljs object
    // (with `.highlight`, `.highlightAuto`, etc.). We use a require shim
    // via dynamic import so Next.js can chunk it lazily.
    hljsPromise = import('highlight.js').then((mod) => (mod as unknown as { default: HljsSurface }).default ?? (mod as unknown as HljsSurface));
  }
  return hljsPromise;
}

export async function highlightCode(code: string, hljsLanguage: string): Promise<string> {
  try {
    const hljs = await loadHljs();
    return hljs.highlight(code, { language: hljsLanguage, ignoreIllegals: true }).value;
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
