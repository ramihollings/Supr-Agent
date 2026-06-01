export const DEFAULT_MINIMAX_MODEL = 'MiniMax-M3';
export const DEFAULT_GEMINI_MODEL = 'gemini-3-pro-preview';
export const DEFAULT_OPENAI_MODEL = 'gpt-5.5';
export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-4-8';
export const DEFAULT_BACKUP_MODEL = DEFAULT_OPENAI_MODEL;

export const PROVIDER_MODEL_OPTIONS: Record<string, { label: string; value: string }[]> = {
  minimax: [
    { label: 'MiniMax M3', value: DEFAULT_MINIMAX_MODEL },
    { label: 'MiniMax M2.7', value: 'MiniMax-M2.7' },
    { label: 'MiniMax M2.7 Highspeed', value: 'MiniMax-M2.7-highspeed' },
    { label: 'MiniMax M2.5', value: 'MiniMax-M2.5' },
    { label: 'MiniMax M2.1', value: 'MiniMax-M2.1' },
  ],
  gemini: [
    { label: 'Gemini 3 Pro Preview', value: DEFAULT_GEMINI_MODEL },
    { label: 'Gemini 3 Flash Preview', value: 'gemini-3-flash-preview' },
    { label: 'Gemini 3 Pro Image Preview', value: 'gemini-3-pro-image-preview' },
  ],
  openai: [
    { label: 'GPT-5.5', value: DEFAULT_OPENAI_MODEL },
    { label: 'GPT-5.5 Pro', value: 'gpt-5.5-pro' },
    { label: 'Chat Latest', value: 'chat-latest' },
  ],
  anthropic: [
    { label: 'Claude Opus 4.8', value: DEFAULT_ANTHROPIC_MODEL },
    { label: 'Claude Opus 4.7', value: 'claude-opus-4-7' },
    { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
    { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5' },
  ],
  xai: [
    { label: 'Grok 4.20', value: 'grok-4-20' },
    { label: 'Grok 4', value: 'grok-4' },
    { label: 'Grok 3 Mini', value: 'grok-3-mini' },
  ],
  openrouter: [
    { label: 'Auto Router', value: 'openrouter/auto' },
    { label: 'MiniMax M3', value: 'minimax/minimax-m3' },
    { label: 'Claude Opus 4.7', value: 'anthropic/claude-opus-4.7' },
    { label: 'GPT-5.5', value: 'openai/gpt-5.5' },
  ],
  groq: [
    { label: 'Llama 4 Maverick', value: 'meta-llama/llama-4-maverick-17b-128e-instruct' },
    { label: 'DeepSeek R1 Distill Llama 70B', value: 'deepseek-r1-distill-llama-70b' },
    { label: 'Qwen 3 32B', value: 'qwen/qwen3-32b' },
  ],
  mistral: [
    { label: 'Magistral Medium', value: 'magistral-medium-latest' },
    { label: 'Mistral Large', value: 'mistral-large-latest' },
    { label: 'Codestral', value: 'codestral-latest' },
  ],
  deepseek: [
    { label: 'DeepSeek Chat', value: 'deepseek-chat' },
    { label: 'DeepSeek Reasoner', value: 'deepseek-reasoner' },
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
