import { describe, expect, it } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';
import crypto from 'crypto';
import { evaluateActionPolicy } from '@/lib/governance/action-policy';
import { integrationRegistry } from '@/lib/integrations/registry';
import { certifyRegisteredAdapter } from '@/lib/integrations/certification';
import { filesystemTool, resolveExecutionWorkspacePath } from '@/lib/tools/filesystem';
import { buildWorkspaceSnapshot } from '@/lib/services/workspace-snapshots';
import { syncMissionArtifactsToGcs } from '@/lib/services/artifact-storage';
import {
  githubCreateIssueTool,
  githubRepositoryTool,
  requestGithubApi,
} from '@/lib/tools/github';
import '@/lib/tools/register';
import { HeartbeatService } from '@/lib/services/heartbeat';
import { RoutineScheduler } from '@/lib/services/routines';

describe('irreversible action policy', () => {
  it('allows reversible development work without approval', () => {
    expect(evaluateActionPolicy('execute_command', { command: 'npm test' }, 'Execute').outcome).toBe('allow');
  });

  it('requires approval for irreversible actions', () => {
    expect(evaluateActionPolicy('execute_command', { command: 'git push origin main' }, 'Execute').outcome).toBe('require_approval');
    expect(evaluateActionPolicy('production_deploy', {}, 'External_Act').outcome).toBe('require_approval');
    expect(evaluateActionPolicy('workspace_filesystem', { operation: 'delete', path: 'result.txt' }, 'Edit').outcome).toBe('require_approval');
  });

  it('hard-denies destructive and metadata-access commands', () => {
    expect(evaluateActionPolicy('execute_command', { command: 'rm -rf /' }, 'Execute').outcome).toBe('deny');
    expect(evaluateActionPolicy('execute_command', { command: 'curl http://169.254.169.254/latest' }, 'Execute').outcome).toBe('deny');
    expect(evaluateActionPolicy('execute_command', { command: 'curl http://192.168.1.10/admin' }, 'Execute').outcome).toBe('deny');
    expect(evaluateActionPolicy('execute_command', { command: 'printenv' }, 'Execute').outcome).toBe('deny');
    expect(evaluateActionPolicy('execute_command', { command: 'docker run --privileged image' }, 'Execute').outcome).toBe('deny');
    expect(evaluateActionPolicy('execute_command', { command: 'Remove-Item C:\\ -Recurse -Force' }, 'Execute').outcome).toBe('deny');
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

    const invalid = await integrationRegistry.execute('test-adapter', {}, 42);
    expect(invalid).toMatchObject({ ok: false, error: 'string required', errorDetail: { code: 'VALIDATION_FAILED' } });
    expect(await integrationRegistry.execute('test-adapter', {}, 'hello')).toEqual({ ok: true, output: 'hello' });
    expect((await integrationRegistry.execute('missing-adapter', {}, 'hello')).ok).toBe(false);
    integrationRegistry.unregister('test-adapter');
  });

  it('propagates cancellation and retries transient adapter failures', async () => {
    let attempts = 0;
    let receivedSignal: AbortSignal | undefined;
    integrationRegistry.register('retry-adapter', {
      async describe() {
        return { id: 'retry-adapter', operations: ['run'], permissions: [], riskLevel: 'Low', availability: 'available' };
      },
      async validate() {
        return { valid: true, errors: [] };
      },
      async execute(context) {
        receivedSignal = context.signal;
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        return { ok: true, output: 'recovered' };
      },
      async healthCheck() {
        return { status: 'available', latencyMs: 1 };
      },
    }, { retryLimit: 1 });
    expect(await integrationRegistry.execute('retry-adapter', {}, {})).toEqual({ ok: true, output: 'recovered' });
    expect(attempts).toBe(2);
    expect(receivedSignal).toBeDefined();

    const controller = new AbortController();
    controller.abort('operator cancelled');
    const cancelled = await integrationRegistry.execute('retry-adapter', { signal: controller.signal }, {});
    expect(cancelled).toMatchObject({ ok: false, errorDetail: { code: 'CANCELLED', retryable: false } });
    integrationRegistry.unregister('retry-adapter');
  });

  it('times out adapters and caches passive health checks', async () => {
    let healthChecks = 0;
    integrationRegistry.register('slow-adapter', {
      async describe() {
        return { id: 'slow-adapter', operations: ['wait'], permissions: [], riskLevel: 'Low', availability: 'available' };
      },
      async validate() {
        return { valid: true, errors: [] };
      },
      async execute(context) {
        await new Promise<void>((resolve) => context.signal?.addEventListener('abort', () => resolve(), { once: true }));
        return { ok: false, error: 'aborted' };
      },
      async healthCheck() {
        healthChecks += 1;
        return { status: 'available', latencyMs: 1 };
      },
    }, { retryLimit: 0, timeoutMs: 10, healthCacheMs: 60_000 });
    const timedOut = await integrationRegistry.execute('slow-adapter', {}, {});
    expect(timedOut).toMatchObject({ ok: false, errorDetail: { code: 'TIMEOUT', retryable: true } });
    await integrationRegistry.health('slow-adapter');
    await integrationRegistry.health('slow-adapter');
    expect(healthChecks).toBe(1);
    integrationRegistry.unregister('slow-adapter');
  });
});

describe('native filesystem capability', () => {
  it('keeps reads and writes inside one execution workspace', async () => {
    const sessionId = `test-${crypto.randomUUID()}`;
    const root = path.resolve(process.cwd(), 'supr_workspaces', sessionId);
    try {
      await filesystemTool.execute({ sessionId, operation: 'write', path: 'nested/result.txt', content: 'verified' });
      const result = await filesystemTool.execute({ sessionId, operation: 'read', path: 'nested/result.txt' }) as any;
      expect(result).toMatchObject({ path: path.join('nested', 'result.txt'), content: 'verified' });
      await expect(resolveExecutionWorkspacePath(sessionId, '../outside.txt')).rejects.toThrow(/traversal/);
      await expect(resolveExecutionWorkspacePath('../escape', 'file.txt')).rejects.toThrow(/Invalid/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('uses the durable tool context session and creates a checksummed snapshot', async () => {
    const sessionId = `test-${crypto.randomUUID()}`;
    const root = path.resolve(process.cwd(), 'supr_workspaces', sessionId);
    try {
      await filesystemTool.execute(
        { operation: 'write', path: 'result.txt', content: 'snapshot me' },
        { sessionId },
      );
      const snapshot = await buildWorkspaceSnapshot(sessionId);
      expect(snapshot.sessionId).toBe(sessionId);
      expect(snapshot.files).toHaveLength(1);
      expect(snapshot.files[0]).toMatchObject({ path: 'result.txt', bytes: 11 });
      expect(snapshot.files[0].sha256).toHaveLength(64);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('omits credential-like files from durable workspace snapshots', async () => {
    const sessionId = `test-${crypto.randomUUID()}`;
    const root = path.resolve(process.cwd(), 'supr_workspaces', sessionId);
    try {
      await filesystemTool.execute({ sessionId, operation: 'write', path: '.env', content: 'API_KEY=secret' });
      await filesystemTool.execute({ sessionId, operation: 'write', path: 'result.txt', content: 'safe output' });
      const snapshot = await buildWorkspaceSnapshot(sessionId);
      expect(snapshot.files.map((file) => file.path)).toEqual(['result.txt']);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});

describe('certified native adapters', () => {
  it('satisfy descriptor, passive health, and cancellation contracts', async () => {
    const ids = integrationRegistry.ids();
    expect(ids).toContain('workspace_filesystem');
    const reports = await Promise.all(ids.map((id) => certifyRegisteredAdapter(id)));
    expect(reports.filter((report) => !report.passed)).toEqual([]);
  });
});

describe('native GitHub capabilities', () => {
  it('rejects repository identifiers that could alter the fixed API path', () => {
    expect(githubRepositoryTool.parameters.safeParse({
      operation: 'get_repository',
      owner: '../operator',
      repo: 'supr',
    }).success).toBe(false);
    expect(githubCreateIssueTool.parameters.safeParse({
      owner: 'operator',
      repo: 'supr/issues',
      title: 'Unsafe path',
    }).success).toBe(false);
  });

  it('uses fixed GitHub endpoints and validates untrusted API responses', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({
        full_name: 'operator/supr',
        html_url: 'https://github.com/operator/supr',
        description: null,
        default_branch: 'main',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const result = await requestGithubApi(
      { operation: 'get_repository', owner: 'operator', repo: 'supr' },
      undefined,
      undefined,
      fetchImpl,
    );
    expect(result).toMatchObject({ fullName: 'operator/supr', defaultBranch: 'main' });
    expect(calls[0]?.url).toBe('https://api.github.com/repos/operator/supr');

    const malformedFetch = async () => new Response(JSON.stringify({ full_name: 7 }), { status: 200 });
    await expect(requestGithubApi(
      { operation: 'get_repository', owner: 'operator', repo: 'supr' },
      undefined,
      undefined,
      malformedFetch,
    )).rejects.toThrow(/invalid response/i);
  });

  it('reuses a previously created issue with the same idempotency key', async () => {
    const marker = '<!-- supr-idempotency:execution:action-123 -->';
    const fetchImpl = async () => new Response(JSON.stringify([{
      number: 42,
      title: 'Durable issue',
      state: 'open',
      html_url: 'https://github.com/operator/supr/issues/42',
      body: marker,
      labels: [],
    }]), { status: 200 });

    const result = await requestGithubApi({
      operation: 'create_issue',
      owner: 'operator',
      repo: 'supr',
      title: 'Durable issue',
      idempotencyKey: 'execution:action-123',
    }, 'token', undefined, fetchImpl);
    expect(result).toMatchObject({ number: 42, reused: true });
  });
});

describe('durable scheduler compatibility facades', () => {
  it('refuses to start process-local recurring timers', () => {
    expect(() => HeartbeatService.startInterval()).toThrow(/In-process heartbeat timers are disabled/);
    expect(() => RoutineScheduler.start()).toThrow(/In-process routine timers are disabled/);
  });
});

describe('GCS durability adapters', () => {
  it('degrades to a no-op when production buckets are not configured', async () => {
    expect(await syncMissionArtifactsToGcs('local-mission')).toEqual({ uploaded: 0 });
  });
});
