# Supr

> An enterprise-grade AI Agent Supervisor and Collaboration Workspace.

Supr is a centralized orchestration layer that tracks, guides, and audits both
**Permanent** and **Temporary** AI agents as they execute complex workflows —
projects, code, research, and approvals. It runs locally on Windows/macOS or
scales to production on a VPS or Google Cloud Run.

---

## Quickstart (local)

Requires Node.js (LTS) and a MiniMax or Gemini API key.

```bash
# 1. Install dependencies
npm install

# 2. Copy the env template and add your LLM key
cp .env.example .env

# 3. Run the dev server
npm run dev
```

Open `http://localhost:3001`. On first run Supr will walk you through a
3-step bootstrap to set your AI provider key, runtime policy, and verify
the live health probe.

> Tip: the default visual style is **Supr Clean** (rounded, soft borders).
> Switch to **Neo-Brutalist** or any of the other 7 themes in
> Settings → Appearance. 15 color palettes are available.

---

## Stack

- **Framework:** Next.js 16 (App Router, Server Actions, Standalone builds)
- **Database:** SQLite (`better-sqlite3`, WAL) — or PostgreSQL for multi-instance
- **AI:** MiniMax (primary) via `@google/genai`; Gemini, OpenAI, Anthropic,
  xAI, OpenRouter, Groq, Mistral, and DeepSeek also supported
- **Styling:** Tailwind CSS with 7 layout themes × 15 color palettes
- **Sandbox runner:** Node.js child process (local) or Docker

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server on `:3001` |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run test:security` | 39 server/security regression tests |
| `npm run smoke` | Boots the prod build and probes `/login`, `/api/auth/status`, `/api/health/production` |
| `npm run test:prod` | `lint` + `test:security` + `build` + `smoke` (full pre-deploy gate) |

---

## Production deployment

Three supported targets. Pick the one that matches your scale.

### VPS (recommended for SQLite)

```bash
APP_PASSWORD=<strong operator password>
AUTH_SECRET=<long random secret>
MINIMAX_API_KEY=<real MiniMax key>
```

```bash
docker compose up -d --build
```

Reverse proxy with Caddy or Nginx for TLS. Health check:
`GET https://yourdomain.com/api/health/production` (auth required, returns
`pass` / `warn` / `fail`).

### Google Cloud Run (serverless)

For stateless containers, mount a Cloud Storage FUSE bucket for the SQLite
file. See `INFRASTRUCTURE.md` for the full walkthrough.

```bash
chmod +x deploy.sh
./deploy.sh
```

### Self-host without Docker

```bash
NODE_ENV=production npm ci
npm run build
npm run start
```

Behind Nginx/Caddy, with `x-forwarded-proto=https` for secure session cookies.

---

## Security baseline

- **Auth gate:** when `APP_PASSWORD` is set, all routes except `/login` and
  webhook endpoints require a valid `supr_auth_token` cookie. Rate-limited
  to 10 login attempts / 15 min per IP.
- **SSRF protection:** the research proxy (`/api/proxy`) rejects loopback
  addresses and resolves DNS to check against RFC 1918 + link-local subnets.
- **Workspace sandboxing:** all file reads/writes go through `path.basename`
  to block directory traversal.
- **Secrets:** store LLM and integration keys in `.env` or Secret Manager
  in production; never commit them.

---

## Architecture

```
app/                  # Next.js App Router pages, server actions, API routes
components/           # Reusable React components
lib/                  # Backend logic (db, auth, runtime, agents, tools)
scripts/              # Build & smoke test scripts
supr_workspaces/      # Physical folder for sandboxed script executions
.agents/              # Persistent agent identity profiles (.md files)
proxy.ts              # Auth middleware
tests/                # Server/security regression tests
```

The runtime is structured around four stateful resources:

1. **SQLite database** — missions, glidepaths, tasks, approvals, artifacts,
   memory items, and the event log.
2. **`.agents/`** — markdown identity profiles for each agent.
3. **`supr_workspaces/`** — temp directories for code execution.
4. **`.env`** — runtime config and secrets.

For the full design, schema, and code reference see
`SUPR_COMPLETE_REFERENCE_GUIDE.md.md`.

---

## License

Private / internal — not currently published to npm.
