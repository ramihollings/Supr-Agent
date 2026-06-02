const SENSITIVE_FIELD = /token|secret|password|authorization|api[_-]?key|signature|cookie/i;

export function scrubChannelPayload(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => scrubChannelPayload(item));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const scrubbed: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    scrubbed[key] = SENSITIVE_FIELD.test(key) ? '[SCRUBBED]' : scrubChannelPayload(child);
  }
  return scrubbed;
}

export function serializeChannelPayload(value: unknown) {
  return JSON.stringify(scrubChannelPayload(value));
}
