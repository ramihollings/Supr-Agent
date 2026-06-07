/**
 * Tiny in-memory token-bucket rate limiter for unauthenticated routes.
 *
 * Used by the disabled-channel webhook handlers to keep unauthenticated
 * traffic from filling the database with 'ignored' Channel_Commands rows
 * when an operator has turned a channel off. The bucket is per-route and
 * per-process — sufficient to stop a noisy bot, not designed for
 * distributed rate limiting (which would need Redis or similar).
 *
 * Each call to `consume(key, max, windowMs)` returns true if the request
 * is within the budget and false if it should be dropped.
 */
type Bucket = { tokens: number; resetAt: number };
const buckets = new Map<string, Bucket>();

export function consume(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { tokens: max - 1, resetAt: now + windowMs });
    return true;
  }
  if (bucket.tokens <= 0) return false;
  bucket.tokens -= 1;
  return true;
}

export async function consumeDurable(key: string, max: number, windowMs: number): Promise<boolean> {
  const { default: dbClient } = await import('@/lib/database/db_client');
  const now = new Date();
  const row = await dbClient.queryOne<{ count: number; reset_at: string }>(
    'SELECT count, reset_at FROM Rate_Limits WHERE key = ?',
    [key],
  ).catch(() => undefined);
  const resetAt = row?.reset_at ? new Date(row.reset_at) : null;
  if (!row || !resetAt || resetAt <= now) {
    await dbClient.execute(
      `INSERT INTO Rate_Limits (key, count, reset_at, updated_at) VALUES (?, 1, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET count = 1, reset_at = excluded.reset_at, updated_at = CURRENT_TIMESTAMP`,
      [key, new Date(now.getTime() + windowMs).toISOString()],
    );
    return true;
  }
  if (Number(row.count) >= max) return false;
  await dbClient.execute(`UPDATE Rate_Limits SET count = count + 1, updated_at = CURRENT_TIMESTAMP WHERE key = ?`, [key]);
  return true;
}

/**
 * Check the `channels_<name>_debug` setting. When enabled, disabled-
 * channel webhooks persist their ignored payload to Channel_Commands so
 * operators can inspect what traffic is arriving. Default is off so a
 * noisy bot cannot fill the DB.
 */
export async function isChannelDebugEnabled(channel: string): Promise<boolean> {
  const { getSettingValue } = await import('@/lib/secrets');
  return (await getSettingValue(`channels_${channel}_debug`)) === 'true';
}
