# `lib/diagnostics/` — manual diagnostic probes

These 11 modules probe specific Supr subsystems from the inside.
They are NOT wired into the default `npm test` or
`npm run test:security` runs because most of them require live
external services (LLM providers, Composio, the sandbox runner,
the Playwright browser) and would either fail or be expensive in CI.

## When to run them

Each module is a standalone TypeScript file you can run with `tsx`:

```bash
npx tsx lib/diagnostics/adversarial.ts
npx tsx lib/diagnostics/browser_test.ts
npx tsx lib/diagnostics/composio_test.ts
npx tsx lib/diagnostics/memory.ts
npx tsx lib/diagnostics/replay.ts
npx tsx lib/diagnostics/sandbox_test.ts
npx tsx lib/diagnostics/superpowers_test.ts
npx tsx lib/diagnostics/telemetry.ts
npx tsx lib/diagnostics/toolkit_test.ts
npx tsx lib/diagnostics/triage.ts
```

`npm run test:diagnostics` runs the entire folder in sequence and
prints a pass/fail summary; it returns a non-zero exit code if any
probe fails. Use it as a smoke check after a config change.

## What each probe checks

| File | Probes |
|------|--------|
| `adversarial.ts` | Agent runtime defenses against prompt-injection |
| `browser_test.ts` | CloakBrowser / LiveCloakBrowser integration |
| `composio_test.ts` | Composio bridge connection health |
| `memory.ts` | Memory section + item lifecycle |
| `replay.ts` | Event log replay determinism |
| `sandbox_test.ts` | Local-node sandbox command execution |
| `superpowers_test.ts` | `obra_superpowers` tool gating |
| `telemetry.ts` | Telemetry sink writes |
| `toolkit_test.ts` | Tool registry governance paths |
| `triage.ts` | Failure triage + recovery flow |

## Why aren't these in `test:security`?

The 215-test `test:security` suite is sized to run in under 90
seconds on a clean CI box. The diagnostics require:

- A running LLM provider (Gemini / MiniMax / OpenAI)
- A reachable Composio API
- A real browser binary (Playwright / Chromium)
- A live sandbox runner

Pulling all of those into CI would either make the suite flaky
or 10× more expensive. Instead, the probes are documented here
so an operator can run them by hand after a config change.
