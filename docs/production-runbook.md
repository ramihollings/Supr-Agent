# Supr Production Runbook

## Deploy

1. Run `npm run test:prod`.
2. Run `npm run db:migrate:postgres -- --dry-run` against a staging database.
3. Apply the migration without `--dry-run`.
4. Run `PROJECT_ID=... STATE_BUCKET=... ./deploy.sh`.
5. Verify `/api/health/live`, `/api/health/ready`, and the authenticated deep health probe.

## Roll Back

1. Stop new scheduled dispatches by pausing the `supr-scheduler-tick` job.
2. Route Cloud Run traffic to the prior known-good revision.
3. Keep the worker queue paused until database compatibility is confirmed.
4. Resume the queue and scheduler after one successful acceptance execution.

## Restore PostgreSQL

1. Pause Cloud Scheduler and the Cloud Tasks queue.
2. Restore Cloud SQL to a new point-in-time recovery instance.
3. Run migration dry-run and integrity row-count checks.
4. Update service database configuration, deploy, and run readiness checks.
5. Resume Cloud Tasks, then Cloud Scheduler.

## Stuck Executions

An execution is recoverable when its `lease_expires_at` is in the past. Cloud
Tasks may retry it; the worker claim condition prevents concurrent ownership.
Cancel an execution through `POST /api/internal/executions/cancel` only after
confirming no irreversible external side effect is in flight.

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
