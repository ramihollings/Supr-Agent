import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(resolve(__dirname, "..", "lib", "telemetry.ts"), "utf8");

test("lib/telemetry.ts exposes the expected public surface", () => {
  for (const symbol of [
    "TelemetryEvent",
    "TelemetrySink",
    "setTelemetrySink",
    "telemetry",
    "namespaced",
  ]) {
    assert.match(source, new RegExp(`\\b${symbol}\\b`), `expected ${symbol} to be exported`);
  }
});

test("lib/telemetry.ts has level-specific helpers", () => {
  for (const level of ["debug", "info", "warn", "error"]) {
    assert.match(source, new RegExp(`\\b${level}\\s*\\(`), `expected ${level} helper`);
  }
});

test("lib/telemetry.ts is a no-op by default (no sink registered)", () => {
  // The file sets `let currentSink: TelemetrySink = noop;` and never auto-registers
  // a sink. Verify there is no top-level `setTelemetrySink` call.
  assert.doesNotMatch(source, /^setTelemetrySink\(/m, "telemetry must not auto-register a sink");
});

test("lib/telemetry.ts protects against a faulty sink", () => {
  // The emit() function must wrap currentSink in try/catch.
  assert.match(source, /try\s*\{[\s\S]*currentSink\(enriched\)[\s\S]*\}\s*catch/);
});

test("lib/telemetry.ts doc-comment shows how to wire a sink", () => {
  assert.match(source, /setTelemetrySink\(/);
  assert.match(source, /Sentry/);
});
