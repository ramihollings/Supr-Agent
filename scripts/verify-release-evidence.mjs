#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REQUIRED_GATES = [
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

const evidencePath = resolve(process.argv[2] || 'release-evidence/release.json');
let report;
try {
  report = JSON.parse(await readFile(evidencePath, 'utf8'));
} catch (error) {
  console.error(`Unable to read release evidence at ${evidencePath}: ${error instanceof Error ? error.message : error}`);
  process.exit(2);
}

const failures = [];
if (report?.schemaVersion !== 1) failures.push('schemaVersion must be 1');
if (!report?.environment) failures.push('environment is required');
if (!report?.revision) failures.push('revision is required');

for (const gateId of REQUIRED_GATES) {
  const gate = report?.gates?.[gateId];
  if (gate?.status !== 'pass') failures.push(`${gateId} must have status "pass"`);
  if (!Array.isArray(gate?.evidence) || gate.evidence.length === 0) failures.push(`${gateId} requires at least one evidence reference`);
  if (!gate?.completedAt || Number.isNaN(Date.parse(gate.completedAt))) failures.push(`${gateId} requires a valid completedAt timestamp`);
}

const soakStart = Date.parse(report?.soak?.startedAt);
const soakEnd = Date.parse(report?.soak?.endedAt);
const soakHours = (soakEnd - soakStart) / 3_600_000;
if (!Number.isFinite(soakHours) || soakHours < 48) failures.push('staging soak must span at least 48 hours');
if (report?.soak?.stuckExecutions !== 0) failures.push('staging soak must report zero stuck executions');

if (failures.length > 0) {
  console.error(`Release evidence FAILED (${failures.length} issue${failures.length === 1 ? '' : 's'}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Release evidence PASS for ${report.environment} revision ${report.revision}; soak ${soakHours.toFixed(1)} hours.`);
