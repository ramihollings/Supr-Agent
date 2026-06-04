# Supr Production Runbook

## Required Environment

Set these before exposing Supr outside local development:

```env
NODE_ENV=production
APP_PASSWORD=<strong operator password>
AUTH_SECRET=<long random secret>
MINIMAX_API_KEY=<real MiniMax key>
```

Optional:

```env
DATABASE_URL=<postgres connection string>
PORT=3001
TELEGRAM_BOT_TOKEN=<telegram bot token>
TELEGRAM_CHAT_ID=<private chat id>
TELEGRAM_WEBHOOK_SECRET=<webhook secret>
SLACK_SIGNING_SECRET=<slack signing secret>
DISCORD_WEBHOOK_TOKEN=<discord inbound token>
```

Channels are opt-in. The default/preferred channel is Telegram, but Telegram is still disabled until `channels_telegram=true` is set in Settings or the database.

## VPS Deployment

1. Install Node.js matching the project runtime.
2. Install dependencies with `npm ci`.
3. Set the production environment variables.
4. Build with `npm run build`.
5. Start with `npm run start` or a process manager such as systemd/PM2.
6. Put Supr behind HTTPS through Nginx, Caddy, or another reverse proxy.
7. Verify `x-forwarded-proto=https` is passed so secure session cookies work correctly.

Smoke test:

```bash
npm run build
curl -f https://<host>/api/health/production
curl -f "https://<host>/api/health/production?probe=model"
```

## Google Cloud Run Deployment

1. Build the app into a container image.
2. Configure Cloud Run service environment variables.
3. Set `NODE_ENV=production`.
4. Store secrets in Secret Manager where possible.
5. Use Cloud SQL/Postgres for durable production database state if the service must scale or survive container replacement.
6. Deploy with HTTPS enabled by Cloud Run.

Required Cloud Run notes:

- Do not rely on SQLite for multi-instance production.
- Keep concurrency conservative until agent/tool workloads are profiled.
- Mount or externalize any workspace storage that must survive redeploys.

## Health Endpoint

Authenticated endpoint:

```text
/api/health/production
```

Live model probe:

```text
/api/health/production?probe=model
```

Expected production status is `pass`. `warn` is acceptable during staging only when warnings are intentional, such as optional channels being disabled.

## Channel Policy

- Telegram: preferred/default channel, disabled until explicitly enabled.
- Slack: disabled until explicitly enabled.
- Discord: disabled until explicitly enabled.
- Disabled channel webhooks return `ok: true`, `ignored: true` and do not block core runtime.
- Inbound channel payload logs are scrubbed before storage.

## Cutover Checklist

1. `APP_PASSWORD` is strong and not default-looking.
2. `AUTH_SECRET` is set and not derived from the app password.
3. MiniMax key is configured and `/api/health/production?probe=model` passes.
4. Channels are enabled only when credentials and intended routing are configured.
5. `npm run lint`, `npm run test:security`, and `npm run build` pass.
6. Supr Chat direct response works.
7. One explicit Project Flow task completes with evidence visible in Supervisor.

## Rollback

VPS:

- Stop the service.
- Restore the previous release directory or image.
- Restore the database backup if schema/data changes were applied.
- Restart the service and run `/api/health/production`.

Cloud Run:

- Roll traffic back to the previous revision.
- Restore database backup only if the failed release changed persistent data.
