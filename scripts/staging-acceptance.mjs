#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const baseUrl = String(argument('url', process.env.SUPR_WEB_URL || '')).replace(/\/+$/, '');
const outputPath = resolve(argument('output', 'release-evidence/staging-acceptance.json'));
const environment = argument('environment', process.env.ENVIRONMENT || 'staging');
const revision = argument('revision', process.env.REVISION || 'unknown');

if (!baseUrl.startsWith('https://') && !baseUrl.startsWith('http://127.0.0.1') && !baseUrl.startsWith('http://localhost')) {
  console.error('Usage: node scripts/staging-acceptance.mjs --url https://supr-web.example');
  process.exit(2);
}

async function probe(name, path, options, acceptedStatuses) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
      ...options,
    });
    return {
      name,
      method: options?.method || 'GET',
      path,
      status: response.status,
      passed: acceptedStatuses.includes(response.status),
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      name,
      method: options?.method || 'GET',
      path,
      status: null,
      passed: false,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

const jsonPost = {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ executionId: 'public-acceptance-probe' }),
};
const probes = await Promise.all([
  probe('liveness', '/api/health/live', undefined, [200]),
  probe('readiness', '/api/health/ready', undefined, [200]),
  probe('scheduler rejects public traffic', '/api/internal/scheduler/tick', { method: 'POST' }, [401, 403]),
  probe('worker rejects public traffic', '/api/internal/executions/run', jsonPost, [401, 403]),
  probe('cancel rejects public traffic', '/api/internal/executions/cancel', jsonPost, [401, 403]),
  probe('requeue rejects public traffic', '/api/internal/executions/requeue', jsonPost, [401, 403]),
]);

const report = {
  schemaVersion: 1,
  environment,
  revision,
  baseUrl,
  checkedAt: new Date().toISOString(),
  passed: probes.every((probeResult) => probeResult.passed),
  probes,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
for (const result of probes) {
  console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.method} ${result.path} -> ${result.status ?? result.error}`);
}
console.log(`Evidence written to ${outputPath}`);
process.exit(report.passed ? 0 : 1);
