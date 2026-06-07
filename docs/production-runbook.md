# Supr Production Runbook

## Deploy

1. Run `npm run test:prod`.
2. Run `npm run db:migrate:postgres -- --dry-run` for a one-time SQLite import rehearsal.
3. Apply the one-time import without `--dry-run` only when migrating an existing SQLite deployment.
4. For a new empty PostgreSQL database, run `npm run db:schema:postgres -- --bootstrap-empty`. This command refuses to bootstrap a partial schema and never imports the checkout's `supr_local.db`.
5. Trigger the protected `Deploy Staging` GitHub Actions workflow, or run
   `PROJECT_ID=... STATE_BUCKET=... ./deploy.sh` from an authenticated operator
   environment with the required `TF_VAR_*` secrets.
6. The deploy script runs `npm run staging:accept` against the deployed web URL and records evidence under `release-evidence/`.
7. Verify the authenticated deep health probe.

### Staging Workflow Setup

Create a GitHub environment named `staging` with required reviewers and no
deployment branch other than `main`. Configure:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_DEPLOY_SERVICE_ACCOUNT`
- `DB_PASSWORD`
- `APP_PASSWORD`
- `AUTH_SECRET`

Configure `GEMINI_API_KEY`, `TELEGRAM_BOT_TOKEN`,
`TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHAT_ID`, and `SUPR_GITHUB_TOKEN`
only when their matching workflow input is enabled. The deploy identity must
use Workload Identity Federation; do not configure a long-lived service
account JSON key.
Grant the deploy identity Cloud SQL Client access so the protected schema gate
can connect through the pinned Cloud SQL Auth Proxy.

Secret values must never be supplied through Terraform variables. Terraform
creates only Secret Manager containers and IAM bindings. The protected staging
workflow writes versions directly with `gcloud secrets versions add` and
configures the PostgreSQL user outside Terraform, keeping plaintext credentials
out of Terraform state. Restrict access to the GitHub staging environment
secrets and the Terraform state bucket independently.

For manual deployment, provision required Secret Manager versions and the
`supr` Cloud SQL user before the full apply. `deploy.sh` creates the containers
and database, then fails closed unless every enabled integration has an
accessible latest secret version and the database user exists.

The deploy identity needs narrowly scoped permissions to manage the Terraform
resources, add Secret Manager versions, configure the staging Cloud SQL user,
connect through Cloud SQL Auth Proxy, push Artifact Registry images, and invoke
the protected deployment workflow. Do not grant the runtime web or worker
service accounts permission to add secret versions or administer Cloud SQL.

The workflow is manual, accepts only `main`, always deploys with
`ENVIRONMENT=staging`, serializes deployments, and uploads the staging
acceptance, schema, and durable-runtime evaluation reports for 90 days. Before
Terraform apply, it reruns the complete
application gate, the PostgreSQL integration gate, and a blocking
critical/high vulnerability scan of the staging candidate. That exact scanned
image is pushed to Artifact Registry and supplied to Terraform; deployment does
not rebuild an unscanned replacement. After deployment, the workflow runs the
durable-runtime invariant evaluation against staging Cloud SQL and rejects
reports whose environment or revision does not match the deployment.

## Roll Back

1. Stop new scheduled dispatches by pausing the `supr-scheduler-tick` job.
2. Route Cloud Run traffic to the prior known-good revision.
3. Keep the worker queue paused until database compatibility is confirmed.
4. Resume the queue and scheduler after one successful acceptance execution.

## Restore PostgreSQL

1. Pause Cloud Scheduler and the Cloud Tasks queue.
2. Restore Cloud SQL to a new point-in-time recovery instance.
3. Run migration dry-run, schema gate, and integrity row-count checks.
4. Update service database configuration, deploy, and run readiness checks.
5. Resume Cloud Tasks, then Cloud Scheduler.

## Stuck Executions

An execution is recoverable when its `lease_expires_at` is in the past. Cloud
Tasks may retry it; the worker claim condition prevents concurrent ownership.
Cancel an execution through `POST /api/internal/executions/cancel` only after
confirming no irreversible external side effect is in flight.

## Dead-Letter Executions

After the configured retry limit, an execution remains `failed` with
`dead_lettered_at` and `dead_letter_reason` populated. Diagnose the underlying
integration or configuration failure, then call
`POST /api/internal/executions/requeue` using the scheduler service identity.
The conditional transition permits only one requeue for each dead-letter state.

## Secret Rotation

Create a new Secret Manager version, deploy a new Cloud Run revision, verify
readiness, and disable the previous version. Production settings APIs reject
plaintext secret writes.

## Release Acceptance

- Complete one Web execution and one Telegram execution.
- Confirm an irreversible action pauses for approval and resumes once.
- Terminate a worker during a reversible execution and confirm retry/resume.
- Confirm an unavailable MCP server does not affect `/api/mcp/status`.
- Run a 48-hour staging soak before promoting a production revision.
- Populate a copy of `docs/release-evidence.example.json` with evidence links and timestamps.
- Run `npm run release:verify -- release-evidence/release.json`. A production-ready declaration is blocked until it passes.

### Durable Execution Drill

1. Record the deployed web and worker Cloud Run revision IDs and current queue depth.
2. Submit a uniquely named reversible Web mission and preserve its execution ID.
3. Confirm Cloud Tasks delivers it to the private worker with OIDC and the execution reaches `running`.
4. Terminate the active worker revision before completion, then wait for lease expiry and retry delivery.
5. Confirm the same execution ID resumes, attempt count increases, and no external side effect is duplicated.
6. Repeat delivery of the same task payload and confirm the completed execution is not claimed again.
7. Force a terminal retry failure, confirm dead-letter fields are populated, then requeue it twice and confirm only one request succeeds.
8. Preserve Cloud Tasks logs, execution/session records, action records, and the final evidence artifact.

### Approval Exact-Once Drill

1. Submit a uniquely named mission whose next action is an irreversible but controlled staging side effect.
2. Confirm the action and execution pause in `needs_approval` before the side effect.
3. Send the same approval decision concurrently at least twice.
4. Confirm one decision resumes the execution, one side effect occurs, and later decisions are no-ops.
5. Preserve the approval, action, execution, external-system, and audit-log evidence.

The durable-runtime evaluation artifact is supporting evidence for these
drills, not a substitute for them. Release manifest evidence references must
identify the staging project, revision, execution ID, timestamp, and stored
artifact or log location.
