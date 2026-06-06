# Supr Skill Registry

This document outlines the engineering skills available to Supr and its subagents. Skills are small, composable, and inspectable procedures (inspired by Matt Pocock-style engineering patterns) that accelerate workflows.

## Core Engineering Skills

### 1. Toprank SEO Audits (`/toprank:*`)
- **Description**: Evaluates generated content and HTML structures for SEO best practices.
- **Usage**: Used primarily by the Research or QA agents during GrowthOps workflows.
- **Implementation**: Adapts open-source Toprank capabilities to analyze semantic HTML, meta tags, and keyword density.

### 2. CloakBrowser Wrappers
- **Description**: Provides safe, structured web scraping and interaction capabilities.
- **Usage**: Allows the Web Research agent to navigate complex DOMs, handle cookie banners, and extract structured JSON from unstructured pages.
- **Implementation**: A Puppeteer/Playwright abstraction wrapped behind the `SandboxProvider` for secure external access.

### 3. AST-Based Self-Healing Exceptions
- **Description**: Analyzes Abstract Syntax Trees (AST) of failed code to propose structural fixes rather than just regex replacements.
- **Usage**: Used by the Code Agent when encountering compile-time errors or syntax faults in the code workspace.
- **Implementation**: Parses code into AST, identifies missing imports, type mismatches, or malformed structures, and rewrites the problematic nodes automatically before retrying.

### 4. HTML-Anything Artifact Generation
- **Description**: Safely renders structured data, code summaries, or reports into interactive HTML previews.
- **Usage**: Invoked by the Planner or Demo agent to populate the Artifact Studio.
- **Implementation**: Utilizes a strict Content Security Policy iframe rendering pipeline to ensure safe preview of LLM-generated UI code.

### 5. Chrome DevTools MCP Browser Automation (`/devtools:*`)
- **Description**: High-fidelity, ultra-fast headless browser control, screenshot capturing, JS execution, emulation, and Lighthouse diagnostics.
- **Usage**: Invoked by the Web Research or QA agents to automate interactions, run web diagnostics, capture screenshots, and perform visual validation of pages.
- **Implementation**: Leverages the bundled Chrome DevTools MCP server (`chrome-devtools-mcp`) integrated natively with the Antigravity v2.0 engine.

## Live UI Surfaces

A snapshot of which Supr pages are wired to the live runtime, what feeds them, and where the source of truth lives. Every page below renders a `Live / Connecting… / Offline` badge in the header so the operator can see at a glance when the stream is healthy.

| Page | Source of truth | Refresh cadence | Notes |
| --- | --- | --- | --- |
| `/` (Mission Control) | `Event_Log` + `Agent_Runs` via SSE `/api/mission/stream` | SSE + 400ms debounce | Shows last event time, `web_scrape` call count, latest event summary. |
| `/code` (LightIDE) | Workspace files (Code Agent) + auto-save | Debounced 1.5s save + localStorage `supr.lightide.session.v1` | Auto-save + crash recovery for unsaved drafts, cursor, scroll. |
| `/research` (LiveCloakBrowser) | Real CloakBrowser binary at `CLOAKBROWSER_PATH` via `/api/research/navigate` | Per-navigation | Sandbox iframe preview; on research completion the active source is auto-navigated. |
| `/reasoning` (Reasoning Core) | `Event_Log` + `Agent_Runs` via `/api/reasoning/tree` | 5s poll | "Live Reasoning / Demo Tree" badge + event/run/failure counts. |
| `/orchestration` (Observance Hub) | `Event_Log` via SSE | SSE + 30s safety-net poll | Tool-call activity strip + working-agent counters. |
| `/project-report` (Handover) | `Mission` via SSE | SSE + 400ms debounce | Reflects the latest mission export, including artifacts and failures. |
| `/library` (Universal Library Explorer) | Workspace files + `Artifacts` | SSE on `artifact` events + 30s workspace poll | New deliverables appear without manual refresh. |
| `/skills` (Agent Skills Registry) | `SkillsState` + `/api/skills/lessons` | 5s poll + 10s lesson poll + SSE | Toasts on new skills + new lessons. |
| `/agents` (AI Team Manager) | `Agents` + `Agent_Blueprints` | SSE on blueprint/group events | Refreshes when a new agent is spawned. |
| `/cron-jobs` (Scheduled Automations) | `Cron_Jobs` | 1s ticker + 30s poll + SSE | "next: 5m 23s" countdown per schedule. |
| `/supr-chat` (Supr Chat) | SSE `/api/mission/stream` | Streaming | Model chunk typewriter + tool call strip. |
| `/mcp` (MCP Dashboard) | `MCP_Servers` | 5s poll | Status of registered MCP servers. |
| `/supervisor` (Supervisor Console) | `getProductionHealth` | On-demand | Includes CloakBrowser binary readiness card. |

## Concierge Handshake Protocol (Default Chat Mode)

The Concierge protocol decouples Chat State from Mission State. It is the
default behaviour in `app/supr-chat/page.tsx` and is gated by the
`concierge_mode_enabled` setting (default ON; set to "false" to revert to
the legacy auto-spawn behaviour).

### Loop
1. **Consult:** Supr reads the user's request, asks clarifying questions,
   optionally calls `conciergePeekAction` to gather evidence from the
   workspace. NEVER writes to `Missions` / `Glidepaths` directly.
2. **Propose:** Supr emits a JSON plan wrapped in a ```` ```plan ````
   fence. The shape is enforced by `InitiateMissionPlanSchema` in
   `lib/concierge/handshake.ts` (1-5 phases, each 1-20 tasks).
3. **Handshake:** When the user's message contains a "go" phrase
   (`looks good, let's do it`, `proceed`, `ship it`, `approved`, `go
   ahead`, etc.) the chat UI stages the plan and renders a
   confirmation card with Approve / Cancel buttons.
4. **Initiate:** Clicking Approve calls `conciergeInitiateAction`
   which routes through `toolRegistry.executeTool('initiate_mission')`
   to atomically write the mission, glidepath, tasks, seed
   artifacts, and Event_Log row.
5. **Revise / Reject:** If the user says "tweak", "change", "cancel",
   "nevermind", or "replan", the pending plan is dropped and the
   conversation continues without writing.

### Operator Knobs
- `Settings.concierge_mode_enabled` ("true" | "false" | "1" | "0")
  toggles the entire protocol. Default ON.
- `lib/concierge/handshake.ts::GO_PHRASE_PATTERNS` is the canonical
  list of "go" triggers. Add new phrases here, not in the chat UI.
- The `initiate_mission` tool is registered in
  `lib/tools/initiate-mission.ts` and re-validated at the write
  site -- a future schema change is enforced both at the registry
  boundary and the execute() body.

### Audit Trail
- Every successful initiate emits an `Event_Log` row with
  `summary = "Mission initiated via Concierge Handshake (approved by
  <user>, source=<surface>)"`.
- The Event_Log metadata includes the full plan JSON, the approver
  identity, and the source surface (supr-chat, telegram, slack, ...).
- Test coverage: `tests/concierge-handshake.test.mjs`.

## Live CloakBrowser Integration

The real CloakBrowser binary (CloakHQ) is integrated via `lib/tools/browser.ts` and exposed as the `web_scrape` tool. The Research page calls it directly through `/api/research/navigate` (rather than through the runtime registry) to avoid clashing with the lighter `web_scrape` defined in `lib/tools/project-flow.ts`. The tool accepts a `format` parameter:
- `format: 'text'` (default) — returns the legacy string body text.
- `format: 'html'` / `'both'` — returns structured `{url, finalUrl, title, text, html, statusCode, retrievedAt}` so the Research viewport can render the captured page inside a sandboxed `<iframe srcdoc>`.

Set `CLOAKBROWSER_PATH=/usr/bin/cloakbrowser` in the environment to enable live navigation. The Production Health card and the Research page Supr Guidance both surface the binary's status (configured / present / executable).


