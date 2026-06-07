# Production Readiness Status

## Implemented And Locally Verified

- Standalone production build, liveness, readiness, smoke, and browser E2E.
- Unit, security, diagnostics, lint, whitespace, and high-severity dependency gates.
- Blocking production-container build and critical/high vulnerability scan in CI.
- Durable execution/session records, persisted continuations, idempotent submission,
  PostgreSQL `FOR UPDATE SKIP LOCKED` claims, atomic leases/action claims/approval
  decisions, deterministic per-attempt Cloud Tasks dispatch, and scheduler APIs.
- Executable durable-runtime evaluation covering concurrent submission and claims,
  expired-lease recovery, approval and side-effect exact-once behavior, dead-letter
  requeue, and provider circuit-breaker degradation; staging preserves revision-bound evidence.
- PostgreSQL schema/import command with dry-run rollback, exact row counts, semantic
  checksums, and a representative local PostgreSQL migration/integration test.
- Readiness and protected staging deployment verify the critical durable PostgreSQL
  schema; a fresh empty database is bootstrapped without importing local operator data,
  while partial schemas fail closed.
- Production database access fails closed without PostgreSQL; SQLite requires an
  explicit local-test-only override and is never configured by Terraform.
- Original integration adapter contracts, certification tests, typed autonomy policy,
  execution-workspace-scoped filesystem tools, and fixed-endpoint native GitHub
  repository/issue adapters with idempotent issue creation.
- Durable scheduler facades without process-local recurring timers, persisted
  dead-letter recovery, and queue-age/stuck-lease/budget telemetry alerts.
- GCS-backed artifact versions and checksummed execution workspace snapshots.
- OIDC-protected internal APIs, durable rate limits, secret handling, browser SSRF controls, and production CSP.
- Hard-denied shell actions cannot be overridden by approval and cover system
  destruction, private-network access, secret enumeration, and sandbox escape patterns.
- Private-worker Cloud Run, Cloud SQL, Cloud Tasks, Cloud Scheduler, separate
  artifact/snapshot GCS buckets, per-secret least-privilege Secret Manager IAM,
  alerting, and Artifact Registry Terraform.
- Protected deployment provisions secret values and the PostgreSQL password
  outside Terraform, preventing plaintext credentials from entering Terraform state.
- Terraform formatting, initialization without a backend, and validation.
- Deployment, rollback, restore, secret rotation, stuck execution, and evaluation runbooks.
- Protected, manual, keyless staging deployment workflow that deploys the exact
  scanned candidate and uploads schema and acceptance evidence.

## Required Before Production Certification

- Apply Terraform in the target Google Cloud staging project.
- Run migration and restore drills against staging Cloud SQL using production-shaped data.
- Verify real Cloud Tasks OIDC dispatch, duplicate retries, worker termination,
  lease-expiry recovery, cancellation, and dead-letter handling.
- Complete real Web and Telegram unattended acceptance executions.
- Complete approval pause/resume and integration-specific irreversible side-effect
  idempotency drills.
- Complete real GitHub, browser, filesystem, and selected MCP adapter acceptance tests.
- Complete Cloud SQL restore, Cloud Run rollback, and secret rotation drills.
- Run the required 48-hour staging soak with alerts enabled.

Supr must not be labeled production-ready until every external gate above has
recorded evidence and passed.

Run `npm run staging:accept -- --url <web-url>` after each staging deployment
to record health and internal-API isolation evidence. Populate a release
manifest from `docs/release-evidence.example.json`, then run
`npm run release:verify -- <manifest>`. The verifier blocks certification
unless every required gate passes and the soak spans at least 48 hours with
zero stuck executions.
