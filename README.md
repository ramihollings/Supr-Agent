# Supr

Supr is a governed autonomous-agent supervisor and collaboration workspace. It
coordinates missions, tools, evidence, approvals, scheduled work, and operator
channels without depending on OpenClaw or Hermes source code.

## Local Development

Requires Node.js 20 or newer.

```bash
npm ci
cp .env.example .env
npm run dev
```

Open `http://localhost:3001`. SQLite is supported for local development only.

## Production Architecture

- `supr-web` on Cloud Run serves the UI, authenticated APIs, and Telegram webhook.
- `supr-worker` on Cloud Run executes durable agent sessions.
- Cloud SQL PostgreSQL is the authoritative application store.
- Cloud Tasks dispatches idempotent executions; Cloud Scheduler creates due work.
- GCS stores durable artifacts and workspace snapshots.
- Secret Manager stores production credentials.
- Local container files and process-local event streams are ephemeral.

Web and Telegram are the certified v1 channels. Native tools plus selected
GitHub, filesystem, browser, and MCP adapters are the certified integration
surface. Other channels and integrations remain beta.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local Next.js development server |
| `npm run build` | Build the standalone production artifact |
| `npm run test:unit` | Run fast behavioral tests |
| `npm run test:security` | Run security and architecture regressions |
| `npm run smoke` | Boot and probe the standalone production server |
| `npm run test:prod` | Run the complete local release gate |
| `npm run db:migrate:postgres` | Create/import the full PostgreSQL schema |

Use `npm run db:migrate:postgres -- --dry-run` to validate a migration without
committing it.

## Health Endpoints

- `GET /api/health/live`: dependency-free platform liveness.
- `GET /api/health/ready`: database and required production configuration.
- `GET /api/health/production`: authenticated deep diagnostics.
- `GET /api/health/production?probe=model`: authenticated live model probe.

## Deployment

Terraform under `terraform/` provisions the two Cloud Run services, Cloud SQL,
Cloud Tasks, Cloud Scheduler, GCS, IAM, Artifact Registry, and Secret Manager.

```bash
chmod +x deploy.sh
PROJECT_ID=my-project STATE_BUCKET=my-terraform-state ./deploy.sh
```

Populate the required Terraform secret variables through an approved secret
workflow. Do not store production values in committed `.tfvars` files.

## Safety Model

Supr runs reversible research, edits, tests, and bounded commands autonomously.
Irreversible actions such as destructive deletion, production deployment, git
push, purchases, public publishing, and credential changes require approval.
System destruction, secret exfiltration, sandbox escape, and metadata/private
network access are denied.
