import dbClient from '@/lib/database/db_client';
import { getStoredAppPassword } from '@/lib/auth';
import { getActiveProvider } from '@/lib/providers/model';
import { getRuntimeMode, hasConfiguredModelProvider } from '@/lib/runtime/runtime-mode';
import { getAuthSecretMetadata } from '@/lib/session';
import { getSecretSetting, getSettingValue } from '@/lib/secrets';
import { DEFAULT_MINIMAX_MODEL } from '@/lib/providers/catalog';

type HealthState = 'pass' | 'warn' | 'fail';

function isPlaceholder(value?: string | null) {
  if (!value) return false;
  return /your_|placeholder|change[_-]?me|admin123|password|example|^sk-?test/i.test(value);
}

// Lazy import the MCP registry so production-health doesn't pull
// in the stdio transport on every health check. The registry
// function is safe to call from the supervisor console because it
// only reads the static JSON config — it never launches a process.
let cachedMcpRegistry: ReturnType<typeof import('@/lib/mcp/registry').loadMcpRegistry> | null = null;
function loadMcpRegistrySafe() {
  if (cachedMcpRegistry) return cachedMcpRegistry;
  try {
    const { loadMcpRegistry } = require('@/lib/mcp/registry');
    cachedMcpRegistry = loadMcpRegistry();
    return cachedMcpRegistry;
  } catch {
    return { version: 0, description: '', servers: [] };
  }
}

function stateFromIssues(failures: unknown[], warnings: unknown[]): HealthState {
  if (failures.length > 0) return 'fail';
  if (warnings.length > 0) return 'warn';
  return 'pass';
}

async function withTimeout<T>(operation: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function runModelProbe() {
  const provider = await getActiveProvider('supr');
  const startedAt = Date.now();
  const response = await withTimeout(provider.generateContent(
    'Return exactly this JSON and nothing else: {"ok":true}',
    {
      systemInstruction: 'You are a production health probe. Return only JSON.',
      maxOutputTokens: 32,
    },
  ), 15000, 'model probe');

  // Strict shape check: must be valid JSON, must be exactly { ok: true }.
  // Previously this was a regex that matched any string containing "ok",
  // which produced false green checks against responses like
  // "All systems ok" or "ok, I'll continue".
  let parsed: unknown;
  try {
    parsed = JSON.parse(response);
  } catch {
    return { ok: false, provider: provider.name, model: provider.modelName, latencyMs: Date.now() - startedAt, reason: 'Model probe did not return valid JSON.' };
  }
  const ok = typeof parsed === 'object' && parsed !== null
    && (parsed as Record<string, unknown>).ok === true
    && Object.keys(parsed as Record<string, unknown>).length === 1;
  return {
    ok,
    provider: provider.name,
    model: provider.modelName,
    latencyMs: Date.now() - startedAt,
    ...(ok ? {} : { reason: 'Model probe JSON did not match the expected { ok: true } shape.' }),
  };
}

export async function getProductionHealth(options: { probeModel?: boolean } = {}) {
  const failures: string[] = [];
  const warnings: string[] = [];

  // Probe the CloakBrowser binary path. We don't try to launch the
  // process here (production-health is called frequently from the
  // supervisor console) — we just verify the configured binary exists
  // and is executable. The Research page does a real launch probe.
  const cloakPath = process.env.CLOAKBROWSER_PATH || null;

  let cloakBrowser: { configured: boolean; path: string | null; exists: boolean; executable: boolean; note?: string } = {
    configured: false,
    path: null,
    exists: false,
    executable: false,
    note: 'CLOAKBROWSER_PATH is not set. Live web research is disabled until the env var points at a browser binary.',
  };
  if (cloakPath) {
    try {
      const fs = await import('fs');
      const exists = fs.existsSync(cloakPath);
      let executable = false;
      try {
        if (exists) {
          fs.accessSync(cloakPath, fs.constants.X_OK);
          executable = true;
        }
      } catch {
        executable = false;
      }
      cloakBrowser = { configured: true, path: cloakPath, exists, executable };
      if (!exists) {
        warnings.push(`CloakBrowser path ${cloakPath} does not exist.`);
      } else if (!executable) {
        warnings.push(`CloakBrowser path ${cloakPath} is not executable.`);
      }
    } catch (error: any) {
      warnings.push(`CloakBrowser probe failed: ${error.message || String(error)}`);
    }
  } else {
    warnings.push(cloakBrowser.note!);
  }

  let dbReachable = false;
  let recentFailures: any[] = [];
  try {
    await dbClient.queryOne(`SELECT 1 as ok`);
    dbReachable = true;
    recentFailures = await dbClient.query<any>(
      `SELECT id, status, error, completed_at, updated_at
       FROM Agent_Runs
       WHERE status = 'failed' OR error IS NOT NULL
       ORDER BY COALESCE(completed_at, updated_at, started_at) DESC
       LIMIT 5`,
    ).catch(() => []);
  } catch (error: any) {
    failures.push(`Database unreachable: ${error.message || String(error)}`);
  }

  const runtimeMode = await getRuntimeMode();
  const modelConfigured = await hasConfiguredModelProvider();
  if (!modelConfigured) failures.push('No live LLM provider is configured.');

  const minimaxKey = await getSecretSetting('global_minimax_key', process.env.MINIMAX_API_KEY);
  const minimaxConfigured = Boolean(minimaxKey);
  const minimaxPlaceholder = isPlaceholder(minimaxKey);
  if (!minimaxConfigured) warnings.push('MiniMax key is not configured; Supr will use another configured LLM provider if available.');
  if (minimaxPlaceholder) failures.push('MiniMax key looks like a placeholder.');

  let activeProvider = null as null | { name: string; model: string };
  if (modelConfigured) {
    try {
      const provider = await getActiveProvider('supr');
      activeProvider = { name: provider.name, model: provider.modelName };
    } catch (error: any) {
      failures.push(`Active provider failed to resolve: ${error.message || String(error)}`);
    }
  }

  let modelProbe = null as null | { ok: boolean; provider?: string; model?: string; latencyMs?: number; error?: string; reason?: string };
  if (options.probeModel) {
    try {
      modelProbe = await runModelProbe();
      if (!modelProbe.ok) warnings.push(`Model probe did not confirm readiness${modelProbe.reason ? `: ${modelProbe.reason}` : ''}.`);
    } catch (error: any) {
      modelProbe = { ok: false, error: error.message || String(error) };
      failures.push(`Model probe failed: ${modelProbe.error}`);
    }
  }

  const storedPassword = await getStoredAppPassword();
  const authSecret = getAuthSecretMetadata();
  const authWarnings: string[] = [];
  if (!storedPassword) authWarnings.push('Application password is not configured.');
  if (isPlaceholder(storedPassword)) authWarnings.push('Application password looks like a default or placeholder.');
  if (authSecret.usesDefaultSecret) authWarnings.push('Auth session secret is using the local development default.');
  warnings.push(...authWarnings);

  const channels = await Promise.all(['telegram', 'slack', 'discord'].map(async (channel) => {
    const enabled = await getSettingValue(`channels_${channel}`);
    const isEnabled = enabled === 'true';
    return {
      id: channel,
      enabled: isEnabled,
      blockingRuntime: false,
      status: isEnabled ? 'enabled' : 'disabled_optional',
    };
  }));
  const defaultChannel = await getSettingValue('default_channel') || 'telegram';

  const status = stateFromIssues(failures, warnings);
  return {
    status,
    generatedAt: new Date().toISOString(),
    runtime: {
      mode: runtimeMode,
      liveOnly: true,
    },
    database: {
      reachable: dbReachable,
    },
    llm: {
      configured: modelConfigured,
      activeProvider,
      minimaxConfigured,
      minimaxModel: DEFAULT_MINIMAX_MODEL,
      minimaxPlaceholder,
      modelProbe,
    },
    auth: {
      secured: Boolean(storedPassword),
      passwordLooksDefault: isPlaceholder(storedPassword),
      sessionSecretSource: authSecret.source,
      secureCookiePolicy: process.env.NODE_ENV === 'production' ? 'secure_in_production' : 'secure_on_https',
    },
    channels,
    defaultChannel,
    cloakBrowser,
    // Per-MCP-server health so the supervisor can see at a glance
    // which servers are enabled, which need env keys, and which
    // transports are in use. We don't try to launch the servers
    // here (the supervisor refreshes on user action); we just
    // report the registry's static state.
    mcpServers: (loadMcpRegistrySafe()?.servers ?? []).map((s: any) => {
      const envKeys: string[] = s.env_keys ?? [];
      const envKeysOk = envKeys.every((k: string) => !!process.env[k]);
      return {
        id: s.id,
        name: s.name,
        transport: s.transport,
        enabled: s.enabled,
        envKeys,
        envKeysOk,
        requiredTier: s.required_tier,
      };
    }),
    recentFailures: recentFailures.map((row) => ({
      id: row.id,
      status: row.status,
      error: row.error ? String(row.error).slice(0, 240) : null,
      at: row.completed_at || row.updated_at || null,
    })),
    failures,
    warnings,
  };
}
