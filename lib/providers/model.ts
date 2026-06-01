import { GoogleGenAI } from '@google/genai';
import { getSecretSetting, getSettingValue } from '@/lib/secrets';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_BACKUP_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_MINIMAX_MODEL,
  DEFAULT_OPENAI_MODEL,
  OPENAI_COMPATIBLE_BASE_URLS,
  defaultModelForProvider,
} from '@/lib/providers/catalog';

export interface ModelOptions {
  model?: string;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Abstract base — any provider must implement these two methods
// ─────────────────────────────────────────────────────────────────────────────
export abstract class ModelProvider {
  abstract readonly name: string;
  abstract readonly modelName: string;

  /** Generates a complete text response for a given prompt. */
  abstract generateContent(prompt: string, options?: ModelOptions): Promise<string>;

  /** Streams the response for a given prompt. */
  abstract streamContent(prompt: string, options?: ModelOptions): AsyncGenerator<string>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini Provider (primary — uses GEMINI_API_KEY)
// ─────────────────────────────────────────────────────────────────────────────
export class GeminiProvider extends ModelProvider {
  readonly name = 'Gemini';
  readonly modelName: string;
  private ai: GoogleGenAI;
  private defaultModel: string;

  constructor(apiKey?: string, defaultModel = DEFAULT_GEMINI_MODEL) {
    super();
    this.ai = new GoogleGenAI(apiKey ? { apiKey } : {});
    this.defaultModel = defaultModel;
    this.modelName = defaultModel;
  }

  async generateContent(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: options?.model || this.defaultModel,
      contents: prompt,
      config: {
        systemInstruction: options?.systemInstruction,
        maxOutputTokens: options?.maxOutputTokens,
      }
    });
    return response.text || '';
  }

  async *streamContent(prompt: string, options?: ModelOptions): AsyncGenerator<string> {
    const responseStream = await this.ai.models.generateContentStream({
      model: options?.model || this.defaultModel,
      contents: prompt,
      config: {
        systemInstruction: options?.systemInstruction,
        maxOutputTokens: options?.maxOutputTokens,
      }
    });
    for await (const chunk of responseStream) {
      if (chunk.text) yield chunk.text;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI-Compatible Provider
// ─────────────────────────────────────────────────────────────────────────────
export class OpenAICompatibleProvider extends ModelProvider {
  readonly name: string;
  readonly modelName: string;
  private apiKey: string;
  private baseUrl: string;
  private defaultModel: string;

  constructor(config: {
    name?: string;
    apiKey: string;
    baseUrl: string;
    defaultModel: string;
  }) {
    super();
    this.name = config.name || 'OpenAI-Compatible';
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl.replace(/\/$/, ''); // strip trailing slash
    this.defaultModel = config.defaultModel;
    this.modelName = config.defaultModel;
  }

  private buildMessages(prompt: string, systemInstruction?: string) {
    const messages: { role: string; content: string }[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  async generateContent(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages: this.buildMessages(prompt, options?.systemInstruction),
        max_tokens: options?.maxOutputTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`${this.name} API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  async *streamContent(prompt: string, options?: ModelOptions): AsyncGenerator<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options?.model || this.defaultModel,
        messages: this.buildMessages(prompt, options?.systemInstruction),
        max_tokens: options?.maxOutputTokens ?? 2048,
        stream: true,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`${this.name} stream error ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const clean = line.replace(/^data:\s*/, '').trim();
        if (!clean || clean === '[DONE]') continue;
        try {
          const parsed = JSON.parse(clean);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  }
}

export class AnthropicProvider extends ModelProvider {
  readonly name = 'Anthropic';
  readonly modelName: string;
  private apiKey: string;

  constructor(apiKey: string, model = DEFAULT_ANTHROPIC_MODEL) {
    super();
    this.apiKey = apiKey;
    this.modelName = model;
  }

  async generateContent(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options?.model || this.modelName,
        system: options?.systemInstruction,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options?.maxOutputTokens ?? 2048,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`${this.name} API error ${response.status}: ${errBody}`);
    }

    const data = await response.json();
    return Array.isArray(data.content)
      ? data.content.map((part: any) => typeof part?.text === 'string' ? part.text : '').join('')
      : '';
  }

  async *streamContent(prompt: string, options?: ModelOptions): AsyncGenerator<string> {
    yield await this.generateContent(prompt, options);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Provider
// ─────────────────────────────────────────────────────────────────────────────
export class FallbackProvider extends ModelProvider {
  readonly name: string;
  readonly modelName: string;
  private primary: ModelProvider;
  private backup: ModelProvider;

  constructor(primary: ModelProvider, backup: ModelProvider) {
    super();
    this.primary = primary;
    this.backup = backup;
    this.name = `${primary.name} -> ${backup.name} (fallback)`;
    this.modelName = primary.modelName;
  }

  async generateContent(prompt: string, options?: ModelOptions): Promise<string> {
    try {
      const result = await this.primary.generateContent(prompt, options);
      return result;
    } catch (primaryErr: any) {
      console.warn(`[FallbackProvider] ${this.primary.name} failed: ${primaryErr.message}. Falling back to ${this.backup.name}.`);
      return this.backup.generateContent(prompt, options);
    }
  }

  async *streamContent(prompt: string, options?: ModelOptions): AsyncGenerator<string> {
    try {
      yield* this.primary.streamContent(prompt, options);
    } catch (primaryErr: any) {
      console.warn(`[FallbackProvider] ${this.primary.name} stream failed: ${primaryErr.message}. Falling back to ${this.backup.name}.`);
      yield* this.backup.streamContent(prompt, options);
    }
  }
}

// Helper to query settings asynchronously
async function getSetting(key: string): Promise<string | null> {
  try {
    return await getSettingValue(key);
  } catch (err) {
    console.error(`[model.ts] Failed to query setting ${key}:`, err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getActiveProvider(agentRole)
//
// Singleton/factory. Dynamically returns the provider configured for the
// requested agent role, checking SQLite overrides first, then falling back to
// global settings, and finally process.env.
// ─────────────────────────────────────────────────────────────────────────────
export async function getActiveProvider(agentRole?: 'supr' | 'code' | 'research' | 'reflection' | 'sub'): Promise<ModelProvider> {
  // 1. Resolve Global Keys (SQLite overrides first, then process.env)
  const minimaxKey  = await getSecretSetting('global_minimax_key', process.env.MINIMAX_API_KEY);
  const geminiKey   = await getSecretSetting('global_gemini_key', process.env.GEMINI_API_KEY);
  const openaiKey   = await getSecretSetting('global_openai_key', process.env.OPENAI_API_KEY);
  const anthropicKey = await getSecretSetting('global_anthropic_key', process.env.ANTHROPIC_API_KEY);
  const xaiKey      = await getSecretSetting('global_xai_key', process.env.XAI_API_KEY);
  const openrouterKey = await getSecretSetting('global_openrouter_key', process.env.OPENROUTER_API_KEY);
  const groqKey     = await getSecretSetting('global_groq_key', process.env.GROQ_API_KEY);
  const mistralKey  = await getSecretSetting('global_mistral_key', process.env.MISTRAL_API_KEY);
  const deepseekKey = await getSecretSetting('global_deepseek_key', process.env.DEEPSEEK_API_KEY);
  const backupKey   = await getSecretSetting('global_backup_key', process.env.BACKUP_LLM_API_KEY);
  const backupUrl   = await getSetting('global_backup_url')   || process.env.BACKUP_LLM_BASE_URL || 'https://api.openai.com/v1';
  const backupModel = await getSetting('global_backup_model') || process.env.BACKUP_LLM_MODEL   || DEFAULT_BACKUP_MODEL;
  const backupName  = await getSetting('global_backup_name')  || process.env.BACKUP_LLM_NAME    || 'OpenAI';

  // 2. Helper builders
  const buildMinimax = (key: string, model: string = DEFAULT_MINIMAX_MODEL) => new OpenAICompatibleProvider({
    name: 'MiniMax',
    apiKey: key,
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: model,
  });

  const buildGemini = (key?: string, model: string = DEFAULT_GEMINI_MODEL) => new GeminiProvider(key, model);

  const buildBackup = (key: string, url: string, model: string, name: string) => new OpenAICompatibleProvider({
    name: name,
    apiKey: key,
    baseUrl: url,
    defaultModel: model,
  });

  const buildOpenAICompatiblePreset = (provider: string, key: string, model?: string | null) => new OpenAICompatibleProvider({
    name: provider === 'openai' ? 'OpenAI' : provider,
    apiKey: key,
    baseUrl: OPENAI_COMPATIBLE_BASE_URLS[provider],
    defaultModel: model || defaultModelForProvider(provider) || DEFAULT_OPENAI_MODEL,
  });

  const providerKeys: Record<string, string | null | undefined> = {
    minimax: minimaxKey,
    openai: openaiKey,
    xai: xaiKey,
    openrouter: openrouterKey,
    groq: groqKey,
    mistral: mistralKey,
    deepseek: deepseekKey,
  };

  // 3. Resolve role-specific custom settings if provided
  if (agentRole) {
    const roleProvider = await getSetting(`llm_provider_${agentRole}`) || 'default';
    const roleKey      = await getSecretSetting(`llm_key_${agentRole}`);
    const roleModel    = await getSetting(`llm_model_${agentRole}`);
    const roleUrl      = await getSetting(`llm_url_${agentRole}`);

    if (roleProvider !== 'default') {
      if (roleProvider === 'gemini') {
        const key = roleKey || geminiKey;
        return buildGemini(key || undefined, roleModel || DEFAULT_GEMINI_MODEL);
      }
      if (roleProvider === 'minimax') {
        const key = roleKey || minimaxKey;
        if (!key) {
          throw new Error(`MiniMax API Key is missing for agent role '${agentRole}'. Please configure it in settings.`);
        }
        return buildMinimax(key, roleModel || DEFAULT_MINIMAX_MODEL);
      }
      if (roleProvider === 'anthropic') {
        const key = roleKey || anthropicKey;
        if (!key) {
          throw new Error(`Anthropic API Key is missing for agent role '${agentRole}'. Please configure it in settings.`);
        }
        return new AnthropicProvider(key, roleModel || DEFAULT_ANTHROPIC_MODEL);
      }
      if (OPENAI_COMPATIBLE_BASE_URLS[roleProvider]) {
        const key = roleKey || providerKeys[roleProvider];
        if (!key) {
          throw new Error(`${roleProvider} API Key is missing for agent role '${agentRole}'. Please configure it in settings.`);
        }
        return buildOpenAICompatiblePreset(roleProvider, key, roleModel);
      }
      if (roleProvider === 'openai_compat') {
        const key = roleKey || backupKey;
        const url = roleUrl || backupUrl;
        const model = roleModel || backupModel;
        if (!key) {
          throw new Error(`OpenAI-compatible API Key is missing for agent role '${agentRole}'. Please configure it in settings.`);
        }
        return buildBackup(key, url, model, `Custom-${agentRole}`);
      }
    }
  }

  // 4. Fallback to Global priority chain (MiniMax > Gemini > Backup)
  let primary: ModelProvider | null = null;
  if (minimaxKey) {
    primary = buildMinimax(minimaxKey);
  } else if (geminiKey) {
    primary = buildGemini(geminiKey);
  } else if (openaiKey) {
    primary = buildOpenAICompatiblePreset('openai', openaiKey, DEFAULT_OPENAI_MODEL);
  } else if (anthropicKey) {
    primary = new AnthropicProvider(anthropicKey, DEFAULT_ANTHROPIC_MODEL);
  }

  if (primary && backupKey) {
    return new FallbackProvider(primary, buildBackup(backupKey, backupUrl, backupModel, backupName));
  }

  if (primary) return primary;
  if (backupKey) return buildBackup(backupKey, backupUrl, backupModel, backupName);

  throw new Error('No model provider is configured. Live runtime requires MiniMax or another configured LLM provider.');
}
