/**
 * Telemetry abstraction.
 *
 * The default implementation is a no-op. To wire a real backend, call
 * `setTelemetrySink(...)` once at process start (e.g. in instrumentation.ts
 * or at the top of proxy.ts) with an adapter that forwards events to
 * Sentry, Datadog, Honeycomb, OpenTelemetry, etc.
 *
 * All calls are safe to make from server-side code, route handlers, server
 * actions, and the proxy middleware. They never throw.
 */
import { redactSensitive } from '@/lib/security/redaction';

export type TelemetryLevel = "debug" | "info" | "warn" | "error";

export interface TelemetryEvent {
  /** Logical event name, e.g. "http.request", "auth.login". */
  name: string;
  /** Severity. "error" should page; "warn" should not. */
  level: TelemetryLevel;
  /** Free-form attributes. Must be JSON-serializable. */
  attributes?: Record<string, unknown>;
  /** Optional error / exception. */
  error?: unknown;
  /** Optional request id, for cross-referencing with the request logger. */
  requestId?: string;
  /** ISO-8601 timestamp; set automatically if omitted. */
  timestamp?: string;
}

export type TelemetrySink = (event: TelemetryEvent) => void;

const noop: TelemetrySink = () => {};
const productionConsoleSink: TelemetrySink = (event) => {
  const payload = JSON.stringify({
    type: 'telemetry',
    ...event,
    error: event.error instanceof Error ? event.error.message : event.error,
  });
  if (event.level === 'error') console.error(payload);
  else if (event.level === 'warn') console.warn(payload);
  else console.log(payload);
};

let currentSink: TelemetrySink = process.env.NODE_ENV === 'production' ? productionConsoleSink : noop;

/** Replace the global sink. Pass `null` to disable. */
export function setTelemetrySink(sink: TelemetrySink | null | undefined): void {
  currentSink = sink ?? noop;
}

function emit(event: TelemetryEvent): void {
  const enriched = redactSensitive({
    timestamp: new Date().toISOString(),
    ...event,
    attributes: {
      service: "supr",
      env: process.env.NODE_ENV ?? "development",
      ...event.attributes,
    },
  }) as TelemetryEvent;
  try {
    currentSink(enriched);
  } catch (e) {
    // Telemetry must never break the app.
    console.error("telemetry sink threw", e);
  }
}

export const telemetry = {
  debug(name: string, attributes?: Record<string, unknown>, requestId?: string) {
    emit({ name, level: "debug", attributes, requestId });
  },
  info(name: string, attributes?: Record<string, unknown>, requestId?: string) {
    emit({ name, level: "info", attributes, requestId });
  },
  warn(name: string, attributes?: Record<string, unknown>, requestId?: string) {
    emit({ name, level: "warn", attributes, requestId });
  },
  error(name: string, error?: unknown, attributes?: Record<string, unknown>, requestId?: string) {
    emit({ name, level: "error", error, attributes, requestId });
  },
};

/** Build a child sink that prefixes every event name with a namespace. */
export function namespaced(prefix: string): Pick<typeof telemetry, "debug" | "info" | "warn" | "error"> {
  return {
    debug: (name, attrs, rid) => telemetry.debug(`${prefix}.${name}`, attrs, rid),
    info: (name, attrs, rid) => telemetry.info(`${prefix}.${name}`, attrs, rid),
    warn: (name, attrs, rid) => telemetry.warn(`${prefix}.${name}`, attrs, rid),
    error: (name, err, attrs, rid) => telemetry.error(`${prefix}.${name}`, err, attrs, rid),
  };
}

/**
 * Example adapter. Wire it from a real Sentry/Datadog init like so:
 *
 *   if (process.env.SENTRY_DSN) {
 *     const Sentry = await import("@sentry/nextjs");
 *     Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 0.2 });
 *     setTelemetrySink((event) => {
 *       if (event.level === "error") {
 *         Sentry.captureException(event.error ?? new Error(event.name), {
 *           tags: { level: event.level, name: event.name },
 *           extra: event.attributes,
 *         });
 *       } else {
 *         Sentry.addBreadcrumb({
 *           category: event.name,
 *           level: event.level === "warn" ? "warning" : event.level,
 *           data: event.attributes,
 *         });
 *       }
 *     });
 *   }
 *
 * Keep adapters out of the bundle until they are needed by gating on the
 * presence of their env var.
 */
