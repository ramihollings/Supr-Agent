# `scripts/archive/` — historical one-off patches

The 20 `.mjs` files in this directory are **string-replace one-off
patches** that were used during the Blueprint 5 buildout (May 2026)
to splice new wiring into the Supr codebase. Each script anchors
on an exact substring of its target file and inserts a code
block, so the patches are **fragile**: any upstream edit to the
target file silently breaks them.

The patches all reached their goal and the code they inserted is
already in `main`. The scripts are kept here for three reasons:

1. **Auditability** — the history of what changed and in what
   order is preserved.
2. **Re-run safety** — most scripts no-op when the inserted block
   is already present. Re-running them on a clean tree is a
   no-op.
3. **Rollback** — `revert-hardening.mjs` (kept in the parent
   `scripts/` folder) reverses `auth-hardening.mjs`. No other
   script in this folder has a paired rollback.

> **Do NOT call any script in this folder as part of CI, npm
> scripts, or normal development.** They exist as historical
> artifacts. If you need to re-apply one of these changes, write
> a real migration.

## What each script did

| File | Target | Insertion |
|------|--------|-----------|
| `add-logout.mjs` | `components/Sidebar.tsx` | End-Session button |
| `apply-chat-fixes.mjs` | `app/actions/chat-workspace.ts` | Three patches: always-route default, agentic direct response, "routed" text rewrite |
| `apply-persona-loader.mjs` | `code_agent.md` + `lib/agents.ts` | Real compressed-memory block; persona loader |
| `append-loader.mjs` | `lib/agents.ts` | `loadIdentityProfile` / `loadAllIdentityProfiles` / `parseIdentityMarkdown` |
| `append-session.mjs` | `lib/runtime/agent-session.ts` | `buildSessionPlanFromMission` |
| `auth-final-fix.mjs` | multiple | End-Session button, login layout, route fixes |
| `auth-hardening.mjs` | multiple | 7d→8h TTL, Remember-me, logged-out notice, deep cleanup |
| `complete-session.mjs` | `lib/runtime/agent-session.ts` | (superseded by `append-session.mjs`) |
| `fix-auth-properly.mjs` | `lib/session.ts` + `proxy.ts` | `clearSessionCookie()` + `x-pathname` header |
| `fix-auth-ui.mjs` | `components/Sidebar.tsx` + `app/login/page.tsx` | Hide Sidebar on `/login`, fixed inset-0 |
| `wire-budget-backoff.mjs` | `lib/runtime/agent-runtime-runner.ts` | `costTracker`/`budgetEngine` + `backoffSleepMs()` |
| `wire-chat-streaming.mjs` | `app/actions/chat-workspace.ts` | SSE subscription for chat UI |
| `wire-compaction.mjs` | `lib/runtime/agent-runtime-runner.ts` | Keep-last-6-events compaction pass |
| `wire-glidepath.mjs` | `lib/runtime/project-flow.ts` | Glidepath template selector |
| `wire-memory.mjs` | `lib/runtime/agent-runtime-runner.ts` | Persist `Memory_Section` after `final` |
| `wire-personas.mjs` | `lib/runtime/context-assembler.ts` | `personaContext` injection |
| `wire-reflection.mjs` | `lib/runtime/agent-session.ts` | Replace no-op `runReflection` with real LLM call |
| `wire-sse.mjs` | `app/api/mission/stream/route.ts` | Subscribe to `sessionEventBus` |
| `wire-status.mjs` | `lib/runtime/agent-runtime-runner.ts` | `appendAgentRunStep()` heartbeats |
| `wire-streaming.mjs` | `lib/runtime/agent-runtime-runner.ts` | `model_chunk` / `tool_called` / `tool_completed` events |

## Status of `wire-reflection.mjs`

This script was supposed to replace the no-op `runReflection` with
a real LLM call. **The patch was applied as of commit history, but
the underlying code in `lib/runtime/agent-session.ts` is the
canonical implementation now and supersedes the patch.** As of
2026-06-06 the reflection function calls `getActiveProvider('reflection')`
directly — the script is a no-op.
