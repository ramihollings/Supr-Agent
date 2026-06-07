import { describe, it, expect } from 'vitest';
import { estimateInputTokens, estimateOutputTokens } from '@/lib/providers/model';

describe('estimateInputTokens / estimateOutputTokens', () => {
  it('returns at least 1 for input on any non-empty string', () => {
    expect(estimateInputTokens('')).toBe(1);
    expect(estimateInputTokens('x')).toBe(1);
  });

  it('rounds up by 4-character windows', () => {
    // 4 chars == 1 token
    expect(estimateInputTokens('abcd')).toBe(1);
    // 5 chars == 2 tokens
    expect(estimateInputTokens('abcde')).toBe(2);
    // 8 chars == 2 tokens
    expect(estimateInputTokens('abcdefgh')).toBe(2);
  });

  it('returns 0 for empty output', () => {
    expect(estimateOutputTokens('')).toBe(0);
  });

  it('rounds up by 4-character windows for output', () => {
    expect(estimateOutputTokens('abcd')).toBe(1);
    expect(estimateOutputTokens('abcde')).toBe(2);
  });
});
