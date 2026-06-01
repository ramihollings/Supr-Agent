import { getSecretSetting, getSettingValue } from '@/lib/secrets';
import type { RuntimeMode } from './types';

const MODES = new Set<RuntimeMode>(['real']);

export function parseRuntimeMode(value: unknown): RuntimeMode {
  const mode = String(value || '').toLowerCase();
  return MODES.has(mode as RuntimeMode) ? (mode as RuntimeMode) : 'real';
}

export async function getRuntimeMode(): Promise<RuntimeMode> {
  return parseRuntimeMode(process.env.SUPR_RUNTIME_MODE || await getSettingValue('runtime_mode') || await getSettingValue('operating_mode'));
}

export async function hasConfiguredModelProvider(): Promise<boolean> {
  const minimaxKey = await getSecretSetting('global_minimax_key', process.env.MINIMAX_API_KEY);
  const geminiKey = await getSecretSetting('global_gemini_key', process.env.GEMINI_API_KEY);
  const openaiKey = await getSecretSetting('global_openai_key', process.env.OPENAI_API_KEY);
  const anthropicKey = await getSecretSetting('global_anthropic_key', process.env.ANTHROPIC_API_KEY);
  const xaiKey = await getSecretSetting('global_xai_key', process.env.XAI_API_KEY);
  const openrouterKey = await getSecretSetting('global_openrouter_key', process.env.OPENROUTER_API_KEY);
  const groqKey = await getSecretSetting('global_groq_key', process.env.GROQ_API_KEY);
  const mistralKey = await getSecretSetting('global_mistral_key', process.env.MISTRAL_API_KEY);
  const deepseekKey = await getSecretSetting('global_deepseek_key', process.env.DEEPSEEK_API_KEY);
  const backupKey = await getSecretSetting('global_backup_key', process.env.BACKUP_LLM_API_KEY);
  return Boolean(minimaxKey || geminiKey || openaiKey || anthropicKey || xaiKey || openrouterKey || groqKey || mistralKey || deepseekKey || backupKey);
}

export async function assertRealRuntimeReady(feature: string): Promise<void> {
  if (!await hasConfiguredModelProvider()) {
    throw new Error(`${feature} requires a configured model provider in real runtime mode.`);
  }
}

export function isMockAllowed(_mode: RuntimeMode): boolean {
  return false;
}
