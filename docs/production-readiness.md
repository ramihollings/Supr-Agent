# Production Readiness Status

## Implemented And Locally Verified

- Standalone production build, liveness, readiness, smoke, and browser E2E.
- Unit, security, diagnostics, lint, whitespace, and high-severity dependency gates.
- Durable execution/session records, persisted continuations, idempotent submission,
  atomic leases/action claims/approval decisions, Cloud Tasks dispatch, and scheduler APIs.
- PostgreSQL schema/import command with dry-run rollback, exact row counts, semantic
  checksums, and a representative local PostgreSQL migration/integration test.
- Original integration adapter contracts, certification tests, typed autonomy policy,
  execution-workspace-scoped filesystem tools, and fixed-endpoint native GitHub
  repository/issue adapters with idempotent issue creation.
- Durable scheduler facades without process-local recurring timers, persisted
  dead-letter recovery, and queue-age/stuck-lease/budget telemetry alerts.
- GCS-backed artifact versions and checksummed execution workspace snapshots.
- OIDC-protected internal APIs, durable rate limits, secret handling, browser SSRF controls, and production CSP.
- Private-worker Cloud Run, Cloud SQL, Cloud Tasks, Cloud Scheduler, separate
  artifact/snapshot GCS buckets, Secret Manager, IAM, alerting, and Artifact Registry Terraform.
- Terraform formatting, initialization without a backend, and validation.
- Deployment, rollback, restore, secret rotation, stuck execution, and evaluation runbooks.

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
