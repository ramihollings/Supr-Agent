# Supr

**Supr** is a governed autonomous-agent supervisor and developer workspace. It
orchestrates multi-agent missions using **LangGraph on Vertex AI**, coordinates
tool use across GitHub, filesystem, browser, and MCP adapters, and enforces a
**Human-in-the-Loop governance gate** before any irreversible action — schema
migrations, production deployments, or destructive file operations — is applied.

Built for the Google Cloud x Agent Platform Hackathon (Track 1: Responsible AI).

---

## 🏗️ Architecture

| Layer | Technology |
|---|---|
| **Orchestration** | LangGraph (StateGraph) on Vertex AI Gemini 2.0 Flash |
| **Hosting** | Cloud Run (auto-scaled, min 0) |
| **Database** | Cloud SQL — PostgreSQL 15 |
| **Secrets** | Secret Manager (zero-hardcoded credentials) |
| **Job Queue** | Cloud Tasks + Cloud Scheduler (durable executions) |
| **Integrations** | GitHub MCP, Composio, Telegram, Browser Agent |
| **UI** | Next.js 16 standalone, deployed via Cloud Build |

```
Browser / Telegram
      │
      ▼
  Cloud Run (supr-web)
      │  REST / SSE
      ▼
  LangGraph Runtime  ──────▶  Vertex AI (Gemini 2.0 Flash)
      │
      ├──▶  GitHub MCP (read repos, issues, diffs)
      ├──▶  Code Agent (draft fixes)
      ├──▶  QA Critic (flag risk, trigger governance gate)
      └──▶  Human Approval Gate ──▶  Cloud SQL audit log
```

---

## 🚀 Live Demo

The app is deployed and running on Google Cloud:

**URL:** `https://supr-agent-370633661485.us-central1.run.app`

Demo target repositories used in the scenario:
- [`ramihollings/supr-demo-target-alpha`](https://github.com/ramihollings/supr-demo-target-alpha) — missing rate-limiting table
- [`ramihollings/supr-demo-target-beta`](https://github.com/ramihollings/supr-demo-target-beta) — memory leak in worker

---

## 🛠️ Local Development

Requires Node.js ≥ 20.

```bash
npm ci
cp .env.example .env   # Add your GEMINI_API_KEY
npm run dev
```

Open `http://localhost:3001`. SQLite is used for local development only.

---

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Build the standalone production artifact |
| `npm run test:unit` | Run fast behavioral tests (Vitest) |
| `npm run test:security` | Run security and architecture regressions |
| `npm run smoke` | Boot and probe the standalone production server |
| `npm run test:prod` | Full local release gate |
| `npm run db:migrate:postgres` | Apply the full PostgreSQL schema |

---

## Health Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/health/live` | Dependency-free liveness |
| `GET /api/health/ready` | DB + config readiness |
| `GET /api/health/production` | Authenticated deep diagnostics |

---

## Deployment

Infrastructure is provisioned via Terraform under `terraform/`.

```bash
chmod +x deploy.sh
PROJECT_ID=my-project STATE_BUCKET=my-terraform-state ./deploy.sh
```

To build and deploy the container directly:

```bash
gcloud builds submit --tag us-central1-docker.pkg.dev/$PROJECT_ID/supr-repo/supr-agent
gcloud run deploy supr-agent --image ... --region us-central1
```

---

## Safety Model

Supr runs reversible actions (research, read, draft, test) autonomously.
Irreversible actions — `git push`, schema migrations, deployments, purchases —
require an explicit human approval before execution. All approvals are logged
with a tamper-evident audit trail for SOC2 compliance.

---

## Production Architecture

- `Cloud Run` serves the UI, APIs, and Telegram webhook
- `Cloud SQL PostgreSQL` is the authoritative application store
- `Cloud Tasks` dispatches idempotent durable executions
- `GCS` stores artifacts and workspace snapshots
- `Secret Manager` holds all production credentials — nothing is hardcoded

---

<details>
<summary>Evaluation Notes</summary>

> The following is intended for hackathon reviewers evaluating this submission.

The live instance is pre-seeded with demo data and fully functional.
To explore the platform, use the following operator access:

```
URL:  https://supr-agent-370633661485.us-central1.run.app
Pass: 4c017a7bcjeiednxr1223
```

**Suggested walkthrough:**
1. Log in with the password above (no username needed)
2. Click **New Mission** and describe a task referencing `ramihollings/supr-demo-target-alpha`
3. Watch the multi-agent LangGraph canvas execute in real-time
4. When the QA Critic flags a schema change, approve it via the governance gate
5. Observe the audit trail generated in the Objects rail

</details>
