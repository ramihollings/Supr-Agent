# Production Readiness Status

## Implemented And Locally Verified

- Standalone production build, liveness, readiness, smoke, and browser E2E.
- Unit, security, diagnostics, lint, whitespace, and high-severity dependency gates.
- Durable execution/session records, idempotent submission, leases, Cloud Tasks dispatch, and scheduler APIs.
- PostgreSQL schema/import command with dry-run, row counts, and source checksums.
- Original integration adapter contracts and typed autonomy policy.
- OIDC-protected internal APIs, durable rate limits, secret handling, browser SSRF controls, and production CSP.
- Cloud Run, Cloud SQL, Cloud Tasks, Cloud Scheduler, GCS, Secret Manager, IAM, and Artifact Registry Terraform.
- Deployment, rollback, restore, secret rotation, stuck execution, and evaluation runbooks.

## Required Before Production Certification

- Run the migration dry-run and import against a representative PostgreSQL database.
- Validate and apply Terraform in the target Google Cloud staging project.
- Verify Cloud Tasks OIDC dispatch, duplicate retries, lease-expiry recovery, and cancellation.
- Complete real Web and Telegram unattended acceptance executions.
- Complete approval pause/resume and irreversible side-effect idempotency drills.
- Complete Cloud SQL restore, Cloud Run rollback, and secret rotation drills.
- Run the required 48-hour staging soak with alerts enabled.

Supr must not be labeled production-ready until every external gate above has
recorded evidence and passed.
