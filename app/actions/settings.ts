/**
 * Settings actions.
 *
 * Per Blueprint 5.0's extensibility guidance, the original
 * `app/actions.ts` god file is being split by domain. This
 * module owns all settings-related server actions: CRUD over
 * the Settings table, bootstrap state, live model provider
 * refresh, shadow mode, and glidepath updates.
 *
 * The public API is preserved — `app/actions.ts` re-exports
 * every function from this file, so existing call sites
 * (`useServerAction(...)`, etc.) keep working.
 */
import { z } from 'zod';
import dbClient from '@/lib/database/db_client';
import { hasConfiguredModelProvider } from '@/lib/runtime/runtime-mode';
import { getSecretSetting, isSecretSettingKey, redactSettings } from '@/lib/secrets';
import { DEFAULT_GEMINI_MODEL, OPENAI_COMPATIBLE_BASE_URLS } from '@/lib/providers/catalog';
import { invalidateProviderCache } from '@/lib/providers/model';
import type { Phase, Task } from '@/types';

export async function fetchSettingsAction() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Settings`);
    return redactSettings(rows);
  } catch (error) {
    console.error("Failed to fetch settings:", error);
    return {};
  }
}

/**
 * Resolve whether the SetupWizard still needs to be shown.
 *
 * The wizard should only force itself when there is real work to do:
 *   - the user has never completed the wizard before, AND
 *   - there is no live LLM provider available from env or stored keys.
 *
 * Previously the gate only looked at `global_minimax_key_configured`, which
 * missed valid VPS deployments where `MINIMAX_API_KEY` (or any other
 * provider key) is set via env. That kept the wizard popping up even
 * though the runtime was healthy.
 */
export async function fetchBootstrapStateAction(): Promise<{
  wizardRequired: boolean;
  hasProvider: boolean;
  wizardCompleted: boolean;
  reason: string;
}> {
  const [rows, hasProvider] = await Promise.all([
    dbClient.query<{ key: string; value: string }>(`SELECT * FROM Settings`).catch(() => [] as { key: string; value: string }[]),
    hasConfiguredModelProvider().catch(() => false),
  ]);

  const settings: Record<string, string> = {};
  for (const row of rows) settings[row.key] = row.value;
  const wizardCompleted = settings.has_completed_wizard === 'true';
  const wizardRequired = !wizardCompleted && !hasProvider;

  let reason: string;
  if (wizardRequired) {
    reason = 'No live LLM provider is configured and the bootstrap wizard has not been completed yet.';
  } else if (!wizardCompleted) {
    reason = 'A live LLM provider is already configured; the bootstrap wizard can be skipped.';
  } else {
    reason = 'Bootstrap wizard has been completed.';
  }

  return { wizardRequired, hasProvider, wizardCompleted, reason };
}

  export async function updateSettingAction(key: string, value: string) {
    try {
    z.string().min(1).max(128).regex(/^[a-z0-9_]+$/i).parse(key);
    z.string().max(isSecretSettingKey(key) ? 8192 : 2048).parse(value);

      if (key.endsWith('_configured')) {
        return { success: false, error: 'Configured flags are read-only.' };
      }

      if (process.env.NODE_ENV === 'production' && isSecretSettingKey(key)) {
        return { success: false, error: 'Production secrets must be configured through Secret Manager.' };
      }

    if (isSecretSettingKey(key) && value.trim() === '') {
      return { success: true, unchanged: true };
    }

    const sql = `
      INSERT INTO Settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `;
    await dbClient.execute(sql, [key, value]);
    // Any LLM or runtime mode change must invalidate the provider cache
    // so the next getActiveProvider() call re-resolves from settings.
    if (key.startsWith('llm_') || key.startsWith('global_') || key === 'runtime_mode' || key === 'operating_mode') {
      invalidateProviderCache();
    }
    return { success: true };
  } catch (error) {
    console.error(`Failed to update setting ${key}:`, error);
    return { success: false, error: String(error) };
  }
}

const LIVE_MODEL_PROVIDER_KEYS: Record<string, { setting: string; env?: string }> = {
  minimax: { setting: 'global_minimax_key', env: process.env.MINIMAX_API_KEY },
  openai: { setting: 'global_openai_key', env: process.env.OPENAI_API_KEY },
  anthropic: { setting: 'global_anthropic_key', env: process.env.ANTHROPIC_API_KEY },
  xai: { setting: 'global_xai_key', env: process.env.XAI_API_KEY },
  openrouter: { setting: 'global_openrouter_key', env: process.env.OPENROUTER_API_KEY },
  groq: { setting: 'global_groq_key', env: process.env.GROQ_API_KEY },
  mistral: { setting: 'global_mistral_key', env: process.env.MISTRAL_API_KEY },
  deepseek: { setting: 'global_deepseek_key', env: process.env.DEEPSEEK_API_KEY },
};

function normalizeModelRows(data: any): { label: string; value: string }[] {
  const rows = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  return rows
    .map((row: any) => {
      const id = String(row?.id || row?.name || '').replace(/^models\//, '').trim();
      return id ? { label: id, value: id } : null;
    })
    .filter(Boolean)
    .slice(0, 80) as { label: string; value: string }[];
}

export async function fetchLiveProviderModelsAction(provider: string): Promise<{ success: boolean; models: { label: string; value: string }[]; error?: string }> {
  try {
    const providerId = z.string().min(1).max(40).parse(provider);
    if (providerId === 'default' || providerId === 'openai_compat') return { success: true, models: [] };

    if (providerId === 'gemini') {
      const apiKey = await getSecretSetting('global_gemini_key', process.env.GEMINI_API_KEY);
      if (!apiKey) return { success: false, models: [], error: 'Gemini API key is not configured.' };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) return { success: false, models: [], error: `Gemini models request failed: ${response.status}` };
      return { success: true, models: normalizeModelRows(await response.json()) };
    }

    if (providerId === 'anthropic') {
      const apiKey = await getSecretSetting('global_anthropic_key', process.env.ANTHROPIC_API_KEY);
      if (!apiKey) return { success: false, models: [], error: 'Anthropic API key is not configured.' };
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: { Accept: 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        cache: 'no-store',
      });
      if (!response.ok) return { success: false, models: [], error: `Anthropic models request failed: ${response.status}` };
      return { success: true, models: normalizeModelRows(await response.json()) };
    }

    const keySpec = LIVE_MODEL_PROVIDER_KEYS[providerId];
    const baseUrl = providerId === 'groq' ? 'https://api.groq.com/openai/v1' : OPENAI_COMPATIBLE_BASE_URLS[providerId];
    if (!keySpec || !baseUrl) return { success: false, models: [], error: `Live model refresh is not configured for ${providerId}.` };

    const apiKey = await getSecretSetting(keySpec.setting, keySpec.env);
    if (!apiKey) return { success: false, models: [], error: `${providerId} API key is not configured.` };
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/models`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    });
    if (!response.ok) return { success: false, models: [], error: `${providerId} models request failed: ${response.status}` };
    return { success: true, models: normalizeModelRows(await response.json()) };
  } catch (error: any) {
    return { success: false, models: [], error: error.message || String(error) };
  }
}

export async function checkShadowModeAction(): Promise<{ active: boolean; expiresAt: string | null }> {
  try {
    const rows = await dbClient.query(`SELECT * FROM Settings WHERE key IN ('shadow_mode_active', 'shadow_mode_expires_at')`);
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }
    const active = settings.shadow_mode_active === 'true';
    const expiresAt = settings.shadow_mode_expires_at || null;

    if (active && expiresAt) {
      if (new Date().getTime() > new Date(expiresAt).getTime()) {
        // Expired! Auto-deactivate
        await updateSettingAction('shadow_mode_active', 'false');
        return { active: false, expiresAt: null };
      }
      return { active: true, expiresAt };
    }
    return { active: false, expiresAt: null };
  } catch (error) {
    console.error("Failed to check shadow mode:", error);
    return { active: false, expiresAt: null };
  }
}

export async function toggleShadowModeAction(active: boolean, durationMinutes: number = 5) {
  try {
    if (active) {
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
      await Promise.all([
        updateSettingAction('shadow_mode_active', 'true'),
        updateSettingAction('shadow_mode_expires_at', expiresAt)
      ]);
      return { success: true, active: true, expiresAt };
    } else {
      await Promise.all([
        updateSettingAction('shadow_mode_active', 'false'),
        updateSettingAction('shadow_mode_expires_at', '')
      ]);
      return { success: true, active: false, expiresAt: null };
    }
  } catch (error) {
    console.error("Failed to toggle shadow mode:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateGlidepathAction(missionId: string, phases: Phase[], tasks: Task[]) {
  try {
    const shadow = await checkShadowModeAction();
    if (shadow.active) return { success: true };
    const sql = `UPDATE Glidepaths SET phases = ?, tasks = ? WHERE mission_id = ?`;
    await dbClient.execute(sql, [JSON.stringify(phases), JSON.stringify(tasks), missionId]);
    return { success: true };
  } catch (error) {
    console.error("Failed to update glidepath:", error);
    return { success: false, error: String(error) };
  }
}
