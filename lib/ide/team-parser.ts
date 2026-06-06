/**
 * Robust parser for a team member's LLM response.
 *
 * Members are asked to emit a structured payload so the team
 * coordinator can extract the work (the prose) and any
 * key=value pairs the member wants to write to the shared
 * `Team_Context`. The model may respond in any of these shapes:
 *
 *   1. Strict JSON: `{"work": "...", "context": {"k": "v", ...}}`
 *   2. A fenced JSON block: ```json\n{"work":"...","context":{...}}\n```
 *   3. The legacy `<work>...</work>` + `<context>...</context>`
 *      XML-ish format, possibly with leading/trailing prose, mixed
 *      case, and nested closing tags.
 *   4. Free-form prose (the fallback): the entire response is the
 *      work, and no context is written.
 *
 * The parser tries them in order and returns the first successful
 * match. It never throws; on a totally unparseable response it
 * returns the full text as `work` and an empty context.
 */
export interface ParsedMemberOutput {
  work: string;
  context: Record<string, string>;
}

const STRICT_JSON_RE = /^\s*\{[\s\S]*\}\s*$/;
const FENCED_JSON_RE = /```(?:json)?\s*\n([\s\S]*?)\n```/i;
const WORK_TAG_RE = /<work[^>]*>([\s\S]*?)<\/work\s*>/i;
const CONTEXT_TAG_RE = /<context[^>]*>([\s\S]*?)<\/context\s*>/i;

function extractContextFromBlock(block: string): Record<string, string> {
  const ctx: Record<string, string> = {};
  // Context lines are `key=value`, one per line. Whitespace around
  // the `=` is fine; values are trimmed.
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!key) continue;
    if (!/^[A-Za-z0-9_.-]+$/.test(key)) continue;
    ctx[key] = value;
  }
  return ctx;
}

function safeParseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function fromParsedObject(obj: Record<string, unknown>): ParsedMemberOutput | null {
  if (typeof obj.work !== 'string') return null;
  const work = obj.work.trim();
  const ctx: Record<string, string> = {};
  if (obj.context && typeof obj.context === 'object' && !Array.isArray(obj.context)) {
    for (const [k, v] of Object.entries(obj.context as Record<string, unknown>)) {
      if (typeof v === 'string') ctx[k] = v;
      else ctx[k] = JSON.stringify(v);
    }
  }
  return { work: work || '', context: ctx };
}

export function parseStructuredMemberOutput(rawResponse: string): ParsedMemberOutput {
  const text = (rawResponse || '').trim();
  if (!text) return { work: '', context: {} };

  // 1) Strict JSON
  if (STRICT_JSON_RE.test(text)) {
    const obj = safeParseJsonObject(text);
    if (obj) {
      const parsed = fromParsedObject(obj);
      if (parsed) return parsed;
    }
  }

  // 2) Fenced JSON
  const fenced = text.match(FENCED_JSON_RE);
  if (fenced) {
    const obj = safeParseJsonObject(fenced[1]);
    if (obj) {
      const parsed = fromParsedObject(obj);
      if (parsed) return parsed;
    }
    // The fenced block might be a naked object without the
    // work/context keys — fall through.
  }

  // 3) Legacy <work> / <context> tags, tolerant of mixed case +
  // trailing whitespace + nested closing tags. We strip the
  // context block from the work so the prose reads cleanly.
  const workMatch = text.match(WORK_TAG_RE);
  const ctxMatch = text.match(CONTEXT_TAG_RE);
  if (workMatch) {
    const work = workMatch[1].replace(/<\/work\s*>/i, '').trim();
    const ctx = ctxMatch ? extractContextFromBlock(ctxMatch[1]) : {};
    return { work, context: ctx };
  }
  if (ctxMatch) {
    // Only a context block was emitted — return empty work and
    // the parsed context. Operators will see the prose-less output
    // and can intervene.
    return { work: '', context: extractContextFromBlock(ctxMatch[1]) };
  }

  // 4) Free-form fallback: the entire response is the work.
  return { work: text, context: {} };
}
