import { afterEach, describe, expect, it } from 'vitest';
import { redactSensitive, redactSensitiveText, serializeRedacted } from '@/lib/security/redaction';
import { setTelemetrySink, telemetry, type TelemetryEvent } from '@/lib/telemetry';

afterEach(() => {
  setTelemetrySink(null);
  delete process.env.OPENAI_API_KEY;
});

describe('secret redaction', () => {
  it('redacts sensitive fields and secrets embedded in strings', () => {
    const githubToken = `ghp_${'a'.repeat(36)}`;
    const value = redactSensitive({
      safe: 'visible',
      nested: {
        authorization: `Bearer ${githubToken}`,
        note: `Deploy with token=${githubToken}`,
      },
    });

    expect(value).toEqual({
      safe: 'visible',
      nested: {
        authorization: '[REDACTED]',
        note: 'Deploy with token=[REDACTED]',
      },
    });
    expect(serializeRedacted(value)).not.toContain(githubToken);
  });

  it('redacts configured secret values and private keys from ordinary text', () => {
    process.env.OPENAI_API_KEY = 'sk-production-secret-value';
    const text = [
      'key=sk-production-secret-value',
      '-----BEGIN PRIVATE KEY-----',
      'private-key-material',
      '-----END PRIVATE KEY-----',
    ].join('\n');

    const redacted = redactSensitiveText(text);
    expect(redacted).not.toContain('sk-production-secret-value');
    expect(redacted).not.toContain('private-key-material');
    expect(redacted).toContain('[REDACTED]');
  });
});

describe('telemetry redaction', () => {
  it('redacts custom sink attributes and errors before emitting', () => {
    const events: TelemetryEvent[] = [];
    setTelemetrySink((event) => events.push(event));

    telemetry.error(
      'integration.failed',
      new Error('Authorization: Bearer top-secret-token-value'),
      { password: 'plain-password', detail: 'api_key=embedded-secret-value' },
    );

    expect(events).toHaveLength(1);
    expect(JSON.stringify(events[0])).not.toContain('top-secret-token-value');
    expect(JSON.stringify(events[0])).not.toContain('plain-password');
    expect(JSON.stringify(events[0])).not.toContain('embedded-secret-value');
  });
});
