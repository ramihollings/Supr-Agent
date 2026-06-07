import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const gateIds = [
  'ci_security',
  'postgres_migration_restore',
  'worker_interruption_recovery',
  'provider_degradation',
  'approval_exactly_once',
  'telegram_end_to_end',
  'staging_soak',
  'production_rollback',
  'documentation_accuracy',
];

function evidence(status: 'pass' | 'pending', soakHours = 48) {
  const completedAt = '2026-06-07T12:00:00.000Z';
  return {
    schemaVersion: 1,
    environment: 'staging',
    revision: 'revision-1',
    gates: Object.fromEntries(gateIds.map((id) => [id, {
      status,
      completedAt: status === 'pass' ? completedAt : null,
      evidence: status === 'pass' ? [`gs://evidence/${id}.json`] : [],
    }])),
    soak: {
      startedAt: completedAt,
      endedAt: new Date(Date.parse(completedAt) + soakHours * 3_600_000).toISOString(),
      stuckExecutions: 0,
    },
  };
}

describe('release evidence gate', () => {
  it('passes only complete evidence with at least a 48-hour soak', () => {
    const directory = mkdtempSync(join(tmpdir(), 'supr-release-'));
    try {
      const validPath = join(directory, 'valid.json');
      writeFileSync(validPath, JSON.stringify(evidence('pass')));
      const valid = spawnSync(process.execPath, [resolve('scripts/verify-release-evidence.mjs'), validPath], { encoding: 'utf8' });
      expect(valid.status).toBe(0);
      expect(valid.stdout).toContain('Release evidence PASS');

      const invalidPath = join(directory, 'invalid.json');
      writeFileSync(invalidPath, JSON.stringify(evidence('pass', 47)));
      const invalid = spawnSync(process.execPath, [resolve('scripts/verify-release-evidence.mjs'), invalidPath], { encoding: 'utf8' });
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain('at least 48 hours');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('durable runtime evaluation evidence gate', () => {
  it('requires every invariant and matching staging provenance', () => {
    const directory = mkdtempSync(join(tmpdir(), 'supr-durable-evidence-'));
    const requiredChecks = [
      'idempotent_submission',
      'single_execution_claim',
      'expired_lease_recovery',
      'approval_resume_exactly_once',
      'side_effect_exactly_once',
      'cancellation_exactly_once',
      'terminal_cancellation_noop',
      'dead_letter_requeue_exactly_once',
      'provider_degradation',
    ];
    try {
      const report = {
        schemaVersion: 1,
        environment: 'staging',
        revision: 'revision-1',
        runId: 'run-1',
        missionId: 'mission-1',
        executionIds: ['execution-1', 'execution-2'],
        sessionIds: ['session-1', 'session-2'],
        startedAt: '2026-06-07T12:00:00.000Z',
        completedAt: '2026-06-07T12:01:00.000Z',
        passed: true,
        checks: requiredChecks.map((id) => ({ id, passed: true, details: {} })),
      };
      const validPath = join(directory, 'valid.json');
      writeFileSync(validPath, JSON.stringify(report));
      const valid = spawnSync(process.execPath, [
        resolve('scripts/verify-durable-evaluation.mjs'),
        '--input', validPath,
        '--environment', 'staging',
        '--revision', 'revision-1',
      ], { encoding: 'utf8' });
      expect(valid.status).toBe(0);
      expect(valid.stdout).toContain('Durable evaluation evidence PASS');

      const invalidPath = join(directory, 'invalid.json');
      writeFileSync(invalidPath, JSON.stringify({ ...report, revision: 'wrong-revision' }));
      const invalid = spawnSync(process.execPath, [
        resolve('scripts/verify-durable-evaluation.mjs'),
        '--input', invalidPath,
        '--environment', 'staging',
        '--revision', 'revision-1',
      ], { encoding: 'utf8' });
      expect(invalid.status).toBe(1);
      expect(invalid.stderr).toContain('revision must equal revision-1');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
