import dbClient from '@/lib/database/db_client';

const SECRET_KEY_PATTERNS = [
  /_key$/i,
  /_token$/i,
  /_secret$/i,
  /^integrations_/i,
  /^app_password$/i,
];

export function isSecretSettingKey(key: string) {
  return SECRET_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

export async function getSettingValue(key: string) {
  const row = await dbClient.queryOne<{ value: string }>('SELECT value FROM Settings WHERE key = ?', [key]);
  return row?.value || null;
}

export async function getSecretSetting(key: string, envFallback?: string) {
  return await getSettingValue(key) || envFallback || null;
}

export function redactSettings(rows: Array<{ key: string; value: string }>) {
  const settingsObj: Record<string, string> = {};
  for (const row of rows) {
    if (isSecretSettingKey(row.key) && row.value) {
      settingsObj[row.key] = '';
      settingsObj[`${row.key}_configured`] = 'true';
    } else {
      settingsObj[row.key] = row.value;
    }
  }
  return settingsObj;
}

