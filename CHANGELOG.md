# Changelog

All notable changes to Supr are documented here. The format is
loosely based on [Keep a Changelog](https://keepachangelog.com/) and
this project does not yet follow SemVer.

## [Unreleased] — 2026-06-04

### Added (Blueprint 5.0)

- **MCP server infrastructure** — `config/mcp-servers.json`
  registry, `lib/mcp/{registry,stdio,http,audit}.ts`, `/api/mcp/*`
  routes, `/mcp` UI page at `app/mcp/page.tsx`. Subagents must go
  through the unified router; direct server connections bypass
  governance.
- **Composio bridge** — `lib/tools/composio.ts` exposes
  `ComposioBridge` with `listApps`, `listConnections`,
  `initiateConnection`, `executeAction`. CLI at
  `bin/supr-composio.mjs` for operators. Settings secret
  resolution is re-read on every call so rotations take effect
  immediately.
- **Skill feedback loop** — `lib/skills/lessons.ts` reads/writes
  `.agents/skills/<name>/.lessons.md`. Past lessons are injected
  into the next invocation's prompt. Pinned entries survive
  GC. UI at `components/SkillsLessonsPanel.tsx` (mounted in
  Settings) and `/api/skills/lessons` route.
- **Two-phase commit for `spawn_subagent`** — Phase 1 builds
  `ActionIntent` with SHA-256 checksum; Phase 2 audits the
  intent (tool allowlist regex, path-traversal check, tier,
  task length) before execution. Post-execution checksum
  emitted for operator verification.
- **Context budget** — `lib/context/budget.ts` packs context
  fragments under a 1,900-token default cap (configurable via
  `Settings.subagent_token_budget`). `spawn_subagent` now uses
  `assembleSubagentContext`.
- **Semantic routing** — `lib/routing/semantic.ts` with 5
  canonical subagent routes (Code, Research, Planner, QA,
  Signal). `embedTextAsync()` uses the active LLM's
  `embedContent` (Gemini implemented) with a deterministic
  SHA-256 hash fallback.
- **Context compaction** — `lib/context/compaction.ts` is
  event-driven: when uncompacted `Event_Log` rows for a
  mission cross the threshold (default 50), a compaction
  pass summarizes them via the LLM and writes the result
  to `Memory_Items.section='compaction'`. Configurable via
  `Settings.compaction_config` and exposed in the UI at
  `components/CompactionPanel.tsx` + `/api/context/compaction`.

### Added (Security Audit Response)

- **Auth fail-closed cache fix** (`lib/auth.ts`) — replaced
  boolean `productionEnvChecked` flag with result-object cache
  `productionEnvResult` so a failed assertion stays failed for
  the process lifetime.
- **Telegram webhook forgery protection**
  (`app/api/telegram/route.ts`) — requires
  `X-Telegram-Bot-Api-Secret-Token` with `safeEqual` constant-time
  comparison; 401 on mismatch, 503 on missing config. Pinned
  to the registered chat id.
- **Telegram rate limiting** for disabled channels
  (5 requests/60s) via `lib/route-rate-limit.ts`. Default is
  no-persist; opt-in persistence via `channels_<name>_debug`.
- **Tool invocation SQL fix**
  (`lib/runtime/agent-runtime-runner.ts`) — added the missing
  `invocationId` to the params array.
- **web_search SSRF** — extracted shared `lib/net/safe-fetch.ts`
  with DNS pinning, private-IP block, redirect re-validation,
  and size cap. The previous bare `fetch(params.url)` direct
  call has been replaced.
- **Sandbox path containment**
  (`lib/providers/local-node-sandbox.ts`) — `isValidSessionId`
  regex allowlist, `path.relative` containment,
  `crypto.randomUUID()` for session ids.
- **Plugin symlink containment**
  (`lib/services/plugin-workers.ts`) — `fs.realpathSync` checks
  for `pluginsDir`, `pluginRoot`, `entryPath` before forking.
- **Plugin secret boundary** — only `secret_<pluginId>_<key>`
  values are returned; no `process.env` fallback.
- **Shell approval guard** — `assertExecutionAllowedOrThrow`
  runs **before** `runLocalCommand` (not after, which was the
  previous bug). The agent registry now passes
  `trustedApprovedActionId` so an already-approved action
  doesn't re-block.
- **Composio key from Settings** — `getComposioClient()`
  resolves `integrations_composio` from the Settings table
  on every call (no forever-cached client).
- **Persisted IDs** — replaced `Date.now()` with
  `crypto.randomUUID()` in `lib/db.ts`, `app/actions.ts`,
  `lib/services/budget-engine.ts`, `lib/services/activity-log.ts`,
  `lib/services/cost-tracker.ts`, `lib/services/plugin-host.ts`,
  `lib/tools/todo.ts`.

### Changed

- **`app/actions.ts` split** — 2340-line monolith broken into
  4 domain files: `app/actions/skills.ts`,
  `app/actions/settings.ts`, `app/actions/memory.ts`,
  `app/actions/chat-workspace.ts`. The facade re-exports each
  function as a `const` (because `use server` files can only
  export async functions).
- **`lib/runtime/agent-runtime-runner.ts` two-phase
  refactor** — `parseModelToolResponse`, `hasCompletionEvidence`,
  `hasMeaningfulToolOutput`, `mergeEvidence`,
  `inferProviderRole`, `withRuntimeTimeout`,
  `DEFAULT_RUNTIME_BUDGET`, `effectiveBudget` extracted to
  `lib/runtime/agent-runtime-pure.ts` for testability without a
  database.
- **E2E uses standalone server** (`playwright.config.ts`) —
  `node .next/standalone/server.js` instead of `next start`.
  `scripts/copy-standalone-assets.mjs` runs as a `postbuild`
  hook to copy `.next/static` and `public/` into the
  standalone directory.
- **Telegram config docs** — `.env.example`,
  `PRODUCTION.md`, and `app/settings/page.tsx` all document
  `telegram_webhook_secret` / `TELEGRAM_WEBHOOK_SECRET` and
  the inbound/outbound secret model.
- **README** test count updated from "115+" to "215+".
- **`lib/runtime/context-assembler.ts` per-mission cache
  with TTL** — `MISSION_CACHE_TTL_MS = 1_000` in `lib/db.ts`.
- **`lib/runtime/project-flow.ts` `web_scrape` tool** routes
  user-controlled URLs through `safeFetchText` instead of
  bare `fetch`.

### Removed

- 9 unused components + `lib/utils.ts` from a prior cleanup.
- `test_keys_direct.js`, `cloudflared.exe`, trailing-space
  folder (tightened `.gitignore`).
- `lib/route-rate-limit.ts` was created to support disabled-channel
  rate limiting; no deletion of the previous direct `Channel_Commands`
  insert was needed because the rate-limited path was added
  alongside.

### Fixed

- Dashboard live updates wired to actual `EventSource` against
  `/api/mission/stream` (was previously only reloading on mount).
- Drawer project actions now use `object.id` (was using
  `selectedProject`, so clicking export on Project B while A
  was selected would export A).
- Busy states can't get stuck — `handleFlowControl` and
  `handleSpawnProjectAgent` use `try/catch/finally`.

## Test counts

| Suite | Count |
|-------|-------|
| Security (`npm run test:security`) | 215 |
| E2E (Playwright) | 6 |
| Combined prod gate (`npm run test:prod`) | ✅ all green |
