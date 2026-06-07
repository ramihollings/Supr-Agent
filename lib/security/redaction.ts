const REDACTED = '[REDACTED]';

const SENSITIVE_FIELD =
  /token|secret|password|authorization|api[_-]?key|signature|cookie|credential|private[_-]?key/i;

const SECRET_ENV_NAMES = [
  'APP_PASSWORD',
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'GITHUB_TOKEN',
  'TELEGRAM_BOT_TOKEN',
  'TELEGRAM_WEBHOOK_SECRET',
  'MINIMAX_API_KEY',
  'GEMINI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'XAI_API_KEY',
  'OPENROUTER_API_KEY',
  'GROQ_API_KEY',
  'MISTRAL_API_KEY',
  'DEEPSEEK_API_KEY',
  'COMPOSIO_API_KEY',
  'TAVILY_API_KEY',
  'SLACK_SIGNING_SECRET',
  'DISCORD_WEBHOOK_TOKEN',
  'PGPASSWORD',
] as const;

const TEXT_PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}=*/gi,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{16,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\b\d{6,12}:[A-Za-z0-9_-]{20,}\b/g,
];

function configuredSecretValues() {
  return SECRET_ENV_NAMES
    .map((name) => process.env[name])
    .filter((value): value is string => Boolean(value && value.length >= 8))
    .sort((left, right) => right.length - left.length);
}

export function redactSensitiveText(text: string): string {
  let redacted = text;
  for (const secret of configuredSecretValues()) {
    redacted = redacted.split(secret).join(REDACTED);
  }
  for (const pattern of TEXT_PATTERNS) {
    redacted = redacted.replace(pattern, REDACTED);
  }
  return redacted.replace(
    /(\b(?:api[_-]?key|token|secret|password|authorization|credential)\b\s*[:=]\s*["']?)([^\s"',;}]+)/gi,
    `$1${REDACTED}`,
  );
}

export function redactSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactSensitiveText(value);
  if (value instanceof Error) {
    const error = new Error(redactSensitiveText(value.message));
    error.name = value.name;
    return error;
  }
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item, seen));
  if (!value || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (seen.has(value)) return '[REDACTED:CIRCULAR]';
  seen.add(value);

  const redacted: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = SENSITIVE_FIELD.test(key) ? REDACTED : redactSensitive(child, seen);
  }
  return redacted;
}

export function serializeRedacted(value: unknown, maxChars?: number): string {
  const serialized = JSON.stringify(redactSensitive(value)) ?? 'null';
  if (!maxChars || serialized.length <= maxChars) return serialized;
  return `${serialized.slice(0, Math.max(0, maxChars - 3))}...`;
}
