import { redactSensitive, serializeRedacted } from '@/lib/security/redaction';

export function scrubChannelPayload(value: unknown): unknown {
  return redactSensitive(value);
}

export function serializeChannelPayload(value: unknown) {
  return serializeRedacted(value);
}
