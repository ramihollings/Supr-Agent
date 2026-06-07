import { describe, it, expect } from 'vitest';
import {
  parseModelToolResponse,
  hasCompletionEvidence,
  hasMeaningfulToolOutput,
  mergeEvidence,
  inferProviderRole,
  withRuntimeTimeout,
  DEFAULT_RUNTIME_BUDGET,
} from '@/lib/runtime/agent-runtime-pure';

describe('parseModelToolResponse', () => {
  it('returns invalid for an empty string', () => {
    const result = parseModelToolResponse('');
    expect(result.type).toBe('invalid');
    if (result.type === 'invalid') {
      expect(result.reason).toMatch(/empty/i);
    }
  });

  it('parses a well-formed tool_call', () => {
    const raw = JSON.stringify({
      type: 'tool_call',
      toolName: 'web_search',
      arguments: { query: 'foo' },
      rationale: 'need to look this up',
    });
    const result = parseModelToolResponse(raw);
    expect(result.type).toBe('tool_call');
    if (result.type === 'tool_call') {
      expect(result.toolName).toBe('web_search');
      expect(result.arguments).toEqual({ query: 'foo' });
      expect(result.rationale).toBe('need to look this up');
    }
  });

  it('parses a final with evidence', () => {
    const raw = JSON.stringify({
      type: 'final',
      summary: 'all done',
      evidence: { artifacts: ['a-1'] },
    });
    const result = parseModelToolResponse(raw);
    expect(result.type).toBe('final');
    if (result.type === 'final') {
      expect(result.summary).toBe('all done');
      expect(result.evidence).toEqual({ artifacts: ['a-1'] });
    }
  });

  it('rejects an unknown type', () => {
    const raw = JSON.stringify({ type: 'nonsense', x: 1 });
    const result = parseModelToolResponse(raw);
    expect(result.type).toBe('invalid');
  });

  it('rejects malformed JSON', () => {
    const result = parseModelToolResponse('not json {');
    expect(result.type).toBe('invalid');
  });

  it('strips model thinking blocks before parsing', () => {
    const raw = '<think>internal</think>' + JSON.stringify({
      type: 'final',
      summary: 'cleaned',
    });
    const result = parseModelToolResponse(raw);
    expect(result.type).toBe('final');
    if (result.type === 'final') expect(result.summary).toBe('cleaned');
  });
});

describe('hasCompletionEvidence', () => {
  it('returns false for undefined', () => {
    expect(hasCompletionEvidence(undefined)).toBe(false);
  });
  it('returns false for an empty bag', () => {
    expect(hasCompletionEvidence({})).toBe(false);
  });
  it('returns false when every category is empty', () => {
    expect(hasCompletionEvidence({ artifacts: [], toolCalls: [] })).toBe(false);
  });
  it('returns true when at least one category has entries', () => {
    expect(hasCompletionEvidence({ artifacts: [], toolCalls: ['t-1'] })).toBe(true);
  });
});

describe('hasMeaningfulToolOutput', () => {
  it('rejects null and undefined', () => {
    expect(hasMeaningfulToolOutput(null)).toBe(false);
    expect(hasMeaningfulToolOutput(undefined)).toBe(false);
  });
  it('rejects empty / whitespace strings', () => {
    expect(hasMeaningfulToolOutput('')).toBe(false);
    expect(hasMeaningfulToolOutput('   ')).toBe(false);
  });
  it('rejects the literal [] and {}', () => {
    expect(hasMeaningfulToolOutput('[]')).toBe(false);
    expect(hasMeaningfulToolOutput('{}')).toBe(false);
  });
  it('accepts non-empty strings', () => {
    expect(hasMeaningfulToolOutput('hello')).toBe(true);
  });
  it('accepts non-empty arrays and objects', () => {
    expect(hasMeaningfulToolOutput([1, 2])).toBe(true);
    expect(hasMeaningfulToolOutput({ a: 1 })).toBe(true);
  });
});

describe('mergeEvidence', () => {
  it('appends and dedupes', () => {
    const current: Record<string, string[]> = { toolCalls: ['a'] };
    mergeEvidence(current, { toolCalls: ['a', 'b'], artifacts: ['x'] });
    expect(current.toolCalls).toEqual(['a', 'b']);
    expect(current.artifacts).toEqual(['x']);
  });

  it('treats undefined next as empty', () => {
    const current: Record<string, string[]> = { toolCalls: ['a'] };
    mergeEvidence(current);
    expect(current).toEqual({ toolCalls: ['a'] });
  });
});

describe('inferProviderRole', () => {
  it('routes web capabilities to research', () => {
    expect(inferProviderRole('web_scrape', 'scrape me')).toBe('research');
  });
  it('routes workspace / execute to code', () => {
    expect(inferProviderRole('workspace_write', 'write a file')).toBe('code');
    expect(inferProviderRole('execute_command', 'run this')).toBe('code');
  });
  it('routes skill or reflection intent to reflection', () => {
    expect(inferProviderRole('skill_invoke', 'invoke')).toBe('reflection');
    expect(inferProviderRole('audit', 'Reflection on prior run')).toBe('reflection');
  });
  it('falls back to supr', () => {
    expect(inferProviderRole('summarize', 'condense this')).toBe('supr');
  });
});

describe('withRuntimeTimeout', () => {
  it('awaits the operation as-is when deadline is null', async () => {
    const result = await withRuntimeTimeout(Promise.resolve('ok'), null, 'op');
    expect(result).toBe('ok');
  });

  it('awaits fast operations under the deadline', async () => {
    const result = await withRuntimeTimeout(
      new Promise((resolve) => setTimeout(() => resolve('fast'), 10)),
      Date.now() + 1000,
      'op',
    );
    expect(result).toBe('fast');
  });

  it('rejects when the operation exceeds the deadline', async () => {
    await expect(
      withRuntimeTimeout(
        new Promise((resolve) => setTimeout(() => resolve('late'), 200)),
        Date.now() + 20,
        'slow-op',
      ),
    ).rejects.toThrow(/Runtime timeout during slow-op\./);
  });

  it('rejects immediately when the deadline has already passed', async () => {
    await expect(
      withRuntimeTimeout(
        new Promise((resolve) => setTimeout(() => resolve('ok'), 5)),
        Date.now() - 1,
        'expired',
      ),
    ).rejects.toThrow(/Runtime timeout before expired\./);
  });
});

describe('DEFAULT_RUNTIME_BUDGET', () => {
  it('matches the documented 60s / 4-step / 0-retry / 4096-token fallback', () => {
    expect(DEFAULT_RUNTIME_BUDGET).toEqual({
      maxSteps: 4,
      timeoutMs: 60_000,
      retryLimit: 0,
      maxOutputTokens: 4096,
    });
  });
});
