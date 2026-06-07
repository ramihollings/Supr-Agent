import { integrationRegistry } from './registry';

export interface AdapterCertificationReport {
  adapterId: string;
  passed: boolean;
  checks: {
    descriptor: boolean;
    passiveHealth: boolean;
    cancellation: boolean;
  };
  errors: string[];
}

export async function certifyRegisteredAdapter(adapterId: string): Promise<AdapterCertificationReport> {
  const errors: string[] = [];
  const descriptor = (await integrationRegistry.capabilities()).find((entry) => entry.id === adapterId);
  const descriptorOk = Boolean(
    descriptor
    && descriptor.operations.length > 0
    && descriptor.permissions.length > 0
    && ['Low', 'Medium', 'High', 'Critical'].includes(descriptor.riskLevel),
  );
  if (!descriptorOk) errors.push('Capability descriptor is incomplete.');

  const health = await integrationRegistry.health(adapterId);
  const passiveHealthOk = ['available', 'degraded', 'unavailable'].includes(health.status)
    && Number.isFinite(health.latencyMs);
  if (!passiveHealthOk) errors.push('Passive health contract failed.');

  const controller = new AbortController();
  controller.abort('certification cancellation');
  const cancelled = await integrationRegistry.execute(adapterId, { signal: controller.signal }, {});
  const cancellationOk = cancelled.errorDetail?.code === 'CANCELLED' && cancelled.errorDetail.retryable === false;
  if (!cancellationOk) errors.push('Cancellation contract failed.');

  return {
    adapterId,
    passed: errors.length === 0,
    checks: { descriptor: descriptorOk, passiveHealth: passiveHealthOk, cancellation: cancellationOk },
    errors,
  };
}
