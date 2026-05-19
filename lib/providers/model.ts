import { GoogleGenAI } from '@google/genai';
import db from '@/lib/database/init';

export interface ModelOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Abstract base — any provider must implement these two methods
// ─────────────────────────────────────────────────────────────────────────────
export abstract class ModelProvider {
  abstract readonly name: string;

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
  private ai: GoogleGenAI;
  private defaultModel = 'gemini-2.0-flash';

  constructor(apiKey?: string) {
    super();
    this.ai = new GoogleGenAI(apiKey ? { apiKey } : {});
  }

  async generateContent(prompt: string, options?: ModelOptions): Promise<string> {
    const response = await this.ai.models.generateContent({
      model: options?.model || this.defaultModel,
      contents: prompt,
      config: {
        systemInstruction: options?.systemInstruction,
        temperature: options?.temperature,
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
        temperature: options?.temperature,
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
        temperature: options?.temperature ?? 0.7,
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
        temperature: options?.temperature ?? 0.7,
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

// ─────────────────────────────────────────────────────────────────────────────
// Fallback Provider
// ─────────────────────────────────────────────────────────────────────────────
export class FallbackProvider extends ModelProvider {
  readonly name: string;
  private primary: ModelProvider;
  private backup: ModelProvider;

  constructor(primary: ModelProvider, backup: ModelProvider) {
    super();
    this.primary = primary;
    this.backup = backup;
    this.name = `${primary.name} → ${backup.name} (fallback)`;
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

// Helper to query SQLite settings synchronously
function getSetting(key: string): string | null {
  try {
    const row = db.prepare('SELECT value FROM Settings WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? row.value : null;
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
// global SQLite keys, and finally process.env.
// ─────────────────────────────────────────────────────────────────────────────
export function getActiveProvider(agentRole?: 'supr' | 'code' | 'research' | 'sub'): ModelProvider {
  // 1. Resolve Global Keys (SQLite overrides first, then process.env)
  const minimaxKey  = getSetting('global_minimax_key')  || process.env.MINIMAX_API_KEY;
  const geminiKey   = getSetting('global_gemini_key')   || process.env.GEMINI_API_KEY;
  const backupKey   = getSetting('global_backup_key')   || process.env.BACKUP_LLM_API_KEY;
  const backupUrl   = getSetting('global_backup_url')   || process.env.BACKUP_LLM_BASE_URL || 'https://api.openai.com/v1';
  const backupModel = getSetting('global_backup_model') || process.env.BACKUP_LLM_MODEL   || 'gpt-4o-mini';
  const backupName  = getSetting('global_backup_name')  || process.env.BACKUP_LLM_NAME    || 'OpenAI';

  // 2. Helper builders
  const buildMinimax = (key: string, model: string = 'MiniMax-M2.7') => new OpenAICompatibleProvider({
    name: 'MiniMax-M2.7',
    apiKey: key,
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: model,
  });

  const buildGemini = (key?: string) => new GeminiProvider(key);

  const buildBackup = (key: string, url: string, model: string, name: string) => new OpenAICompatibleProvider({
    name: name,
    apiKey: key,
    baseUrl: url,
    defaultModel: model,
  });

  // 3. Resolve role-specific custom settings if provided
  if (agentRole) {
    const roleProvider = getSetting(`llm_provider_${agentRole}`) || 'default';
    const roleKey      = getSetting(`llm_key_${agentRole}`);
    const roleModel    = getSetting(`llm_model_${agentRole}`);
    const roleUrl      = getSetting(`llm_url_${agentRole}`);

    if (roleProvider !== 'default') {
      if (roleProvider === 'gemini') {
        const key = roleKey || geminiKey;
        return buildGemini(key);
      }
      if (roleProvider === 'minimax') {
        const key = roleKey || minimaxKey;
        if (!key) {
          throw new Error(`MiniMax API Key is missing for agent role '${agentRole}'. Please configure it in settings.`);
        }
        return buildMinimax(key, roleModel || 'MiniMax-M2.7');
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
  }

  if (primary && backupKey) {
    return new FallbackProvider(primary, buildBackup(backupKey, backupUrl, backupModel, backupName));
  }

  if (primary) return primary;
  if (backupKey) return buildBackup(backupKey, backupUrl, backupModel, backupName);

  // Return standard GeminiProvider if all else fails
  return new GeminiProvider();
}
