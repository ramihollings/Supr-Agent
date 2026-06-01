export const DEFAULT_MINIMAX_MODEL = 'MiniMax-M3';
export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-7';
export const DEFAULT_BACKUP_MODEL = DEFAULT_OPENAI_MODEL;

export const PROVIDER_MODEL_OPTIONS: Record<string, { label: string; value: string }[]> = {
  minimax: [
    { label: 'MiniMax M3', value: DEFAULT_MINIMAX_MODEL },
    { label: 'MiniMax M2.5', value: 'MiniMax-M2.5' },
    { label: 'MiniMax M2.5 Highspeed', value: 'MiniMax-M2.5-highspeed' },
    { label: 'MiniMax M2.1', value: 'MiniMax-M2.1' },
    { label: 'MiniMax M2.1 Highspeed', value: 'MiniMax-M2.1-highspeed' },
    { label: 'MiniMax M2', value: 'MiniMax-M2' },
  ],
  gemini: [
    { label: 'Gemini 3.5 Flash', value: DEFAULT_GEMINI_MODEL },
    { label: 'Gemini 3.1 Pro Preview', value: 'gemini-3.1-pro-preview' },
    { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 3.1 Flash-Lite', value: 'gemini-3.1-flash-lite' },
    { label: 'Gemini 2.5 Pro', value: 'gemini-2.5-pro' },
    { label: 'Gemini 2.5 Flash', value: 'gemini-2.5-flash' },
  ],
  openai: [
    { label: 'GPT-5.5', value: DEFAULT_OPENAI_MODEL },
    { label: 'GPT-5.4', value: 'gpt-5.4' },
    { label: 'GPT-5.4 Mini', value: 'gpt-5.4-mini' },
    { label: 'GPT-5.4 Nano', value: 'gpt-5.4-nano' },
  ],
  anthropic: [
    { label: 'Claude Opus 4.7', value: DEFAULT_ANTHROPIC_MODEL },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5' },
  ],
  xai: [
    { label: 'Grok 4.3', value: 'grok-4.3' },
    { label: 'Grok 4.3 Latest', value: 'grok-4.3-latest' },
    { label: 'Grok 4', value: 'grok-4' },
    { label: 'Grok 4 Fast', value: 'grok-4-fast' },
  ],
  openrouter: [
    { label: 'Auto Router', value: 'openrouter/auto' },
    { label: 'GPT-5.5', value: 'openai/gpt-5.5' },
    { label: 'Claude Opus 4.7', value: 'anthropic/claude-opus-4.7' },
    { label: 'Gemini 3.5 Flash', value: 'google/gemini-3.5-flash' },
    { label: 'Gemini 3 Flash Preview', value: 'google/gemini-3-flash-preview' },
    { label: 'Grok 4.3', value: 'x-ai/grok-4.3' },
  ],
  groq: [
    { label: 'Groq Compound', value: 'groq/compound' },
    { label: 'GPT OSS 120B', value: 'openai/gpt-oss-120b' },
    { label: 'Llama 4 Scout 17B 16E', value: 'meta-llama/llama-4-scout-17b-16e-instruct' },
    { label: 'Qwen 3 32B', value: 'qwen/qwen3-32b' },
  ],
  mistral: [
    { label: 'Mistral Medium Latest', value: 'mistral-medium-latest' },
    { label: 'Mistral Medium 3.5', value: 'mistral-medium-3.5' },
    { label: 'Mistral Small Latest', value: 'mistral-small-latest' },
    { label: 'Devstral Latest', value: 'devstral-latest' },
    { label: 'Codestral Latest', value: 'codestral-latest' },
  ],
  deepseek: [
    { label: 'DeepSeek V4 Pro', value: 'deepseek-v4-pro' },
    { label: 'DeepSeek V4 Flash', value: 'deepseek-v4-flash' },
  ],
};

export const PROVIDER_OPTIONS = [
  { value: 'default', label: 'Default (Global Flow)' },
  { value: 'minimax', label: 'MiniMax' },
  { value: 'gemini', label: 'Google Gemini' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'xai', label: 'xAI' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'groq', label: 'Groq' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'openai_compat', label: 'Custom OpenAI-Compatible' },
];

export const OPENAI_COMPATIBLE_BASE_URLS: Record<string, string> = {
  minimax: 'https://api.minimax.io/v1',
  openai: 'https://api.openai.com/v1',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com/v1',
};

export function defaultModelForProvider(provider: string) {
  return PROVIDER_MODEL_OPTIONS[provider]?.[0]?.value || '';
}
