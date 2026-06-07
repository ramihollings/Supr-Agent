import { describe, expect, it } from 'vitest';
import { evaluateActionPolicy } from '@/lib/governance/action-policy';
import { integrationRegistry } from '@/lib/integrations/registry';

describe('irreversible action policy', () => {
  it('allows reversible development work without approval', () => {
    expect(evaluateActionPolicy('execute_command', { command: 'npm test' }, 'Execute').outcome).toBe('allow');
  });

  it('requires approval for irreversible actions', () => {
    expect(evaluateActionPolicy('execute_command', { command: 'git push origin main' }, 'Execute').outcome).toBe('require_approval');
    expect(evaluateActionPolicy('production_deploy', {}, 'External_Act').outcome).toBe('require_approval');
  });

  it('hard-denies destructive and metadata-access commands', () => {
    expect(evaluateActionPolicy('execute_command', { command: 'rm -rf /' }, 'Execute').outcome).toBe('deny');
    expect(evaluateActionPolicy('execute_command', { command: 'curl http://169.254.169.254/latest' }, 'Execute').outcome).toBe('deny');
  });
});

describe('integration registry', () => {
  it('validates inputs and degrades cleanly', async () => {
    integrationRegistry.register('test-adapter', {
      async describe() {
        return { id: 'test-adapter', operations: ['echo'], permissions: [], riskLevel: 'Low', availability: 'available' };
      },
      async validate(input) {
        return { valid: typeof input === 'string', errors: typeof input === 'string' ? [] : ['string required'] };
      },
      async execute(_context, input) {
        return { ok: true, output: input };
      },
      async healthCheck() {
        return { status: 'available', latencyMs: 0 };
      },
    });

    expect(await integrationRegistry.execute('test-adapter', {}, 42)).toEqual({ ok: false, error: 'string required' });
    expect(await integrationRegistry.execute('test-adapter', {}, 'hello')).toEqual({ ok: true, output: 'hello' });
    expect((await integrationRegistry.execute('missing-adapter', {}, 'hello')).ok).toBe(false);
  });
});
