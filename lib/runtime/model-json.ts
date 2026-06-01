export function stripModelThinking(raw: string) {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
}

export function extractFirstJsonObject(raw: string) {
  const text = stripModelThinking(raw);
  const start = text.indexOf('{');
  if (start === -1) return text;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return text;
}

export function parseModelJson<T = any>(raw: string): T {
  return JSON.parse(extractFirstJsonObject(raw)) as T;
}
