if (process.env.APP_PASSWORD) {
  process.env.APP_PASSWORD = process.env.APP_PASSWORD.trim();
}
if (process.env.AUTH_SECRET) {
  process.env.AUTH_SECRET = process.env.AUTH_SECRET.trim();
}

let productionEnvResult: { ok: true } | { ok: false; reason: string } | null = null;

/**
 * Fail-closed assertion for production deployments.
 *
 * Without `APP_PASSWORD` set, the login flow falls back to a hash stored
 * in SQLite, and without `AUTH_SECRET` set, the session HMAC uses a
 * well-known local development default. Neither is acceptable for a VPS
 * exposed to the network.
 *
 * This is invoked once per process from the proxy and the auth routes.
 * If anything is missing in production, the process logs the error and
 * the first protected request returns 503, making the misconfig obvious
 * instead of silently shipping with a default secret.
 *
 * The result object is cached so a failed assertion stays failed for the
 * rest of the process lifetime — we never silently flip to `{ ok: true }`
 * after a startup failure. A previous version of this function cached a
 * boolean and returned `{ ok: true }` after the first call regardless of
 * outcome, which is the exact bug the auditor flagged.
 */
export function assertProductionAuthEnvironment(): { ok: true } | { ok: false; reason: string } {
  if (process.env.NODE_ENV !== 'production') return { ok: true };
  if (productionEnvResult) return productionEnvResult;

  const missing: string[] = [];
  if (!process.env.APP_PASSWORD) missing.push('APP_PASSWORD');
  if (!process.env.AUTH_SECRET) missing.push('AUTH_SECRET');

  productionEnvResult = missing.length
    ? {
        ok: false,
        reason: `Refusing to start in production: missing required env var(s) ${missing.join(', ')}. Both APP_PASSWORD and AUTH_SECRET must be set before exposing Supr to the network.`,
      }
    : { ok: true };

  if (!productionEnvResult.ok) {
    console.error(`[Supr] ${productionEnvResult.reason}`);
  }

  return productionEnvResult;
}
