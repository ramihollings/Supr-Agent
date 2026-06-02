# Changelog

All notable changes to Supr are documented here. The format is loosely based on
[Keep a Changelog](https://keepachangelog.com/) and the project is not yet
semver-versioned.

## [Unreleased] — Front-facing UX, A11y, and Production Hardening

### Added
- New **`theme-supr-clean`** — calmer default theme with 10px radius, 1px borders,
  soft shadows, and 15px body type. Neo-brutalist is still available in Settings.
- New **`components/ToastProvider.tsx`** + `useToast()` hook. All 8 pages now use
  the shared toast instead of duplicating state. Toast renders a persistent
  `role="status"` region for screen readers.
- New **`lib/hooks/useFocusTrap.ts`** — generic focus trap with `Esc` support.
  Applied to `SetupWizard`, `MissionWizard`, and `DashboardObjectDrawer`.
- New **`components/OperationsPanel.tsx`** — right-rail of the dashboard
  (runtime console, approvals, teams, runbooks, providers). Extracted from
  `app/page.tsx`.
- New **`components/ObjectsRail.tsx`** — left-rail of the dashboard (projects,
  sub-agents, workspace files, all objects). Extracted from `app/page.tsx`.
- New **`components/WorkPanel.tsx`** — center of the dashboard (project header,
  workflow canvas, run transcript, evidence/deliverables/memory cards).
  Extracted from `app/page.tsx`.
- New **`scripts/smoke.mjs`** — boots `next start`, authenticates against
  `APP_PASSWORD`, probes `/api/auth/status`, `/api/auth/login`, and
  `/api/health/production` (must be `pass` or `warn`). Also asserts 6 security
  headers on every response. Wired into `npm run smoke` and `npm run test:prod`.
- New **`playwright.config.ts`** + **`tests/e2e/happy-path.spec.ts`** — 2 e2e
  tests covering login → dashboard → project builder → Escape-to-close, and
  the `role="status"` toast region. Wired into `npm run test:e2e` and CI.
- **Structured request logging** in `proxy.ts` — every proxied request gets a
  `x-request-id` header and is logged as a single-line JSON event with
  `{level, type, requestId, method, path, status, durationMs, ts}`. Wire-ready
  for any log shipper.
- **Security headers** in `next.config.ts` — `Content-Security-Policy`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`, `Strict-Transport-Security` applied to every route.
- **Skip-to-content link** in the root layout, plus a `<main id="main-content"
  tabIndex={-1}>` wrapper for keyboard users.
- **`aria-current="page"`** on active Sidebar links, **`aria-label`** on every
  icon-only button (notifications, settings, hamburger), **`role="radiogroup"`**
  on the interface-level selector, **`aria-busy`** on the Back up now button.
- **`aria-label`** on all 14 password inputs in Settings.
- **`htmlFor`/`id`** associations on the Project Name, Core Objective, and
  Project Status fields in `MissionWizard`.
- **Live preview swatches** on the theme and palette pickers in Settings
  (border-radius + shadow samples; background + 3-tone swatches).
- **`loadSelectedProject`** and **`loadBaseData`** split in the dashboard for
  faster first paint.
- Real empty states with icon + 1-sentence copy + primary CTA on all three
  evidence/deliverables/memory cards, the sub-agents list, and the all-objects
  list.

### Changed
- Dashboard default is now **`supr-clean`**. Existing users keep their stored
  theme.
- `app/page.tsx` shrank from **838 → 486 lines** (-42%).
- All 8 pages (dashboard, settings, code, library, agents, skills, reasoning,
  cron-jobs) consolidated to a single `<Toast>` mounted at the root.
- TopNav mobile hamburger is hidden at `md+` so it no longer duplicates the
  Sidebar on tablets.
- The `mobile / pro / dev` mode selector in the Sidebar is now labeled
  `Interface level` with `Essential / Pro / Dev` buttons and tooltip
  descriptions.
- `SetupWizard` step 1 now leads with "Welcome to Supr" and a 1-2-3 plan
  instead of jumping to readiness checks.
- `SetupWizard` step 2 has explicit `htmlFor`/`id` on the MiniMax key input.
- The hardcoded "Autopilot: Active" pill in `TopNav` was removed; only the
  real `systemMode` pill (driven by `/api/health/production`) remains.
- Dashboard mobile panel switcher stays at `xl:hidden` to match the rest of
  the dashboard's `xl` breakpoint.
- `README.md` rewritten from scratch — quickstart, stack, scripts table, three
  deployment paths, security baseline, file map.
- `.env.example` reorganized into sections and aligned with every env var the
  code actually reads; legacy variables (`APP_URL`, `GMAIL_*`, `SANDBOX_*`,
  `GITHUB_TOKEN`) kept only when still in active use.
- "Export Organization Data" panel renamed to "Back up workspace" with
  friendlier copy, a spinner icon while in flight (`aria-busy`), and a
  "Last backup: {timestamp}" line after success.

### Fixed
- Dashboard used to depend on `app/api/auth/status` returning `secured: true`
  for routing decisions. That part of the bootstrap check now uses
  `settings.has_completed_wizard` + `settings.global_minimax_key_configured`.
- `Toast` previously timed out via `setTimeout` in every page; now centralized
  to the `ToastProvider` so the timer is correct and not duplicated.
- Several form inputs used `placeholder` as the only label; all have explicit
  `aria-label` and `htmlFor`/`id` associations now.
- Sidebar active link was styled but not programmatically announced; now uses
  `aria-current="page"`.
- `MissionWizard` and `SetupWizard` did not trap focus; modals now trap Tab
  and close on `Esc` (only when the wizard is non-required; the required
  bootstrap cannot be dismissed).
- The build emitted a hardcoded `Your AI Studio app` README; the README now
  accurately describes Supr.

### Removed
- "Object Inspector" section on the dashboard (duplicate of the all-objects
  list).
- The hardcoded "Autopilot: Active" pill from `TopNav`.

## Tooling

- Added `scripts/smoke.mjs` and `playwright.config.ts`.
- Added `.github/workflows/ci.yml` — runs `lint` + `test:security` + `build` +
  `smoke` + `test:e2e` on every push and PR. Installs Playwright Chromium,
  uploads the trace on failure.
- Added `@playwright/test` as a dev dependency.
- `npm run test:prod` is now the full pre-deploy gate: lint + 39 security
  tests + build + smoke + Playwright.

## Notes

- Internal env var changes: no renames. New env vars documented in
  `.env.example`.
- Database schema: no migrations required. All changes are additive
  (new components, new hooks, new env vars, no new tables).
- Backups: the existing `exportOrganizationAction` is now exposed as a
  "Back up now" button in Settings → Backups, with a last-backup timestamp.
