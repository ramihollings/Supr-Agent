import dbClient from '@/lib/database/db_client';

const COOLDOWN_MS = 5 * 60 * 1000;

export async function getProviderHealth(id: string) {
  return dbClient.queryOne<any>(`SELECT * FROM Provider_Health WHERE id = ?`, [id]);
}

export async function recordProviderSuccess(id: string, name = id, providerType = 'llm') {
  await dbClient.execute(
    `INSERT INTO Provider_Health (id, name, provider_type, status, failure_count, last_success, last_error, cooldown_until, updated_at)
     VALUES (?, ?, ?, 'healthy', 0, ?, NULL, NULL, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET status = 'healthy', failure_count = 0, last_success = excluded.last_success, last_error = NULL, cooldown_until = NULL, updated_at = CURRENT_TIMESTAMP`,
    [id, name, providerType, new Date().toISOString()]
  );
}

export async function recordProviderFailure(id: string, error: string, name = id, providerType = 'llm') {
  const current = await getProviderHealth(id);
  const failures = (current?.failure_count || 0) + 1;
  const cooldown = failures >= 3 ? new Date(Date.now() + COOLDOWN_MS).toISOString() : null;
  const status = cooldown ? 'cooldown' : 'degraded';
  await dbClient.execute(
    `INSERT INTO Provider_Health (id, name, provider_type, status, failure_count, last_error, cooldown_until, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, failure_count = excluded.failure_count, last_error = excluded.last_error, cooldown_until = excluded.cooldown_until, updated_at = CURRENT_TIMESTAMP`,
    [id, name, providerType, status, failures, error, cooldown]
  );
}

export async function isProviderAvailable(id: string) {
  const health = await getProviderHealth(id);
  if (!health?.cooldown_until) return true;
  return new Date(health.cooldown_until).getTime() <= Date.now();
}
