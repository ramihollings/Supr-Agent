#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REQUIRED_CHECKS = [
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

function argument(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const evidencePath = resolve(argument('input', 'release-evidence/durable-runtime-evaluation.json'));
const expectedEnvironment = argument('environment');
const expectedRevision = argument('revision');
let report;

try {
  report = JSON.parse(await readFile(evidencePath, 'utf8'));
} catch (error) {
  console.error(`Unable to read durable evaluation evidence at ${evidencePath}: ${error instanceof Error ? error.message : error}`);
  process.exit(2);
}

const failures = [];
if (report?.schemaVersion !== 1) failures.push('schemaVersion must be 1');
if (report?.passed !== true) failures.push('report must have passed=true');
if (!report?.runId) failures.push('runId is required');
if (!report?.missionId) failures.push('missionId is required');
if (!Array.isArray(report?.executionIds) || report.executionIds.length < 2) failures.push('at least two executionIds are required');
if (!Array.isArray(report?.sessionIds) || report.sessionIds.length < 2) failures.push('at least two sessionIds are required');
if (expectedEnvironment && report?.environment !== expectedEnvironment) {
  failures.push(`environment must equal ${expectedEnvironment}`);
}
if (expectedRevision && report?.revision !== expectedRevision) {
  failures.push(`revision must equal ${expectedRevision}`);
}

const startedAt = Date.parse(report?.startedAt);
const completedAt = Date.parse(report?.completedAt);
if (!Number.isFinite(startedAt)) failures.push('startedAt must be a valid timestamp');
if (!Number.isFinite(completedAt)) failures.push('completedAt must be a valid timestamp');
if (Number.isFinite(startedAt) && Number.isFinite(completedAt) && completedAt < startedAt) {
  failures.push('completedAt must not precede startedAt');
}

const checks = new Map(Array.isArray(report?.checks) ? report.checks.map((check) => [check?.id, check]) : []);
for (const checkId of REQUIRED_CHECKS) {
  if (checks.get(checkId)?.passed !== true) failures.push(`${checkId} must pass`);
}

if (failures.length > 0) {
  console.error(`Durable evaluation evidence FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Durable evaluation evidence PASS for ${report.environment} revision ${report.revision}; run ${report.runId}.`);
