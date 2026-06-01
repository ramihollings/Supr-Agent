import { getSecretSetting, getSettingValue } from '@/lib/secrets';
import type { RuntimeMode } from './types';

const MODES = new Set<RuntimeMode>(['real', 'demo', 'offline']);

export function parseRuntimeMode(value: unknown): RuntimeMode {
  const mode = String(value || '').toLowerCase();
  return MODES.has(mode as RuntimeMode) ? (mode as RuntimeMode) : 'demo';
}

export async function getRuntimeMode(): Promise<RuntimeMode> {
  return parseRuntimeMode(process.env.SUPR_RUNTIME_MODE || await getSettingValue('runtime_mode') || await getSettingValue('operating_mode'));
}

export async function hasConfiguredModelProvider(): Promise<boolean> {
  const minimaxKey = await getSecretSetting('global_minimax_key', process.env.MINIMAX_API_KEY);
  const geminiKey = await getSecretSetting('global_gemini_key', process.env.GEMINI_API_KEY);
  const backupKey = await getSecretSetting('global_backup_key', process.env.BACKUP_LLM_API_KEY);
  return Boolean(minimaxKey || geminiKey || backupKey);
}

export async function assertRealRuntimeReady(feature: string): Promise<void> {
  const mode = await getRuntimeMode();
  if (mode !== 'real') return;
  if (!await hasConfiguredModelProvider()) {
    throw new Error(`${feature} requires a configured model provider in real runtime mode.`);
  }
}

export function isMockAllowed(mode: RuntimeMode): boolean {
  return mode === 'demo' || mode === 'offline';
}
