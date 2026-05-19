import { GoogleGenAI } from '@google/genai';

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
//
// Works with ANY OpenAI-compatible API endpoint, including:
//   • OpenAI         (BACKUP_LLM_BASE_URL = https://api.openai.com/v1)
//   • Groq           (BACKUP_LLM_BASE_URL = https://api.groq.com/openai/v1)
//   • Together AI    (BACKUP_LLM_BASE_URL = https://api.together.xyz/v1)
//   • Ollama (local) (BACKUP_LLM_BASE_URL = http://localhost:11434/v1)
//   • Anthropic      (BACKUP_LLM_BASE_URL = https://api.anthropic.com/v1) *
//   • Azure OpenAI   (BACKUP_LLM_BASE_URL = https://<resource>.openai.azure.com/openai/deployments/<model>)
//   * Anthropic requires the openai-compat adapter to be enabled
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
//
// Wraps a primary + backup provider. If the primary throws any error,
// it transparently retries with the backup and logs which was used.
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

// ─────────────────────────────────────────────────────────────────────────────
// ModelRouter — named provider registry (unchanged API, extended capability)
// ─────────────────────────────────────────────────────────────────────────────
export class ModelRouter {
  private providers: Record<string, ModelProvider> = {};

  registerProvider(name: string, provider: ModelProvider) {
    this.providers[name] = provider;
  }

  getProvider(name: string): ModelProvider {
    const provider = this.providers[name];
    if (!provider) throw new Error(`ModelProvider '${name}' not found.`);
    return provider;
  }

  async generate(providerName: string, prompt: string, options?: ModelOptions): Promise<string> {
    return this.getProvider(providerName).generateContent(prompt, options);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// getActiveProvider()
//
// Singleton factory. Returns the best available provider based on env vars.
//
//  Priority order:
//    1. MiniMax M2.7 (MINIMAX_API_KEY)       ← primary if set
//    2. Gemini        (GEMINI_API_KEY)        ← primary if MiniMax not set
//    3. Backup LLM    (BACKUP_LLM_API_KEY)    ← auto-fallback for either above
//
//  If MiniMax + Gemini + Backup → MiniMax → Gemini → Backup chain
//  If MiniMax + Backup           → FallbackProvider(MiniMax, Backup)
//  If Gemini + Backup            → FallbackProvider(Gemini, Backup)
//  If only MiniMax               → MiniMaxProvider (OpenAI-compat)
//  If only Gemini                → GeminiProvider
//  If only Backup                → OpenAICompatibleProvider
//  If none                       → GeminiProvider (fails at call time)
// ─────────────────────────────────────────────────────────────────────────────
export function getActiveProvider(): ModelProvider {
  const minimaxKey = process.env.MINIMAX_API_KEY;
  const geminiKey  = process.env.GEMINI_API_KEY;
  const backupKey  = process.env.BACKUP_LLM_API_KEY;
  const backupUrl  = process.env.BACKUP_LLM_BASE_URL || 'https://api.openai.com/v1';
  const backupModel = process.env.BACKUP_LLM_MODEL   || 'gpt-4o-mini';
  const backupName  = process.env.BACKUP_LLM_NAME    || 'OpenAI';

  // Build individual providers lazily
  const buildMinimax = (): ModelProvider => new OpenAICompatibleProvider({
    name: 'MiniMax-M2.7',
    apiKey: minimaxKey!,
    baseUrl: 'https://api.minimax.io/v1',
    defaultModel: 'MiniMax-M2.7',
  });

  const buildGemini = (): ModelProvider => new GeminiProvider(geminiKey);

  const buildBackup = (): ModelProvider => new OpenAICompatibleProvider({
    name: backupName,
    apiKey: backupKey!,
    baseUrl: backupUrl,
    defaultModel: backupModel,
  });

  // Resolve the primary (MiniMax > Gemini > nothing)
  let primary: ModelProvider | null = null;
  if (minimaxKey) primary = buildMinimax();
  else if (geminiKey) primary = buildGemini();

  // If both a primary and a backup exist, chain them
  if (primary && backupKey) {
    return new FallbackProvider(primary, buildBackup());
  }

  // Primary only (no backup configured)
  if (primary) return primary;

  // Backup only (no primary key configured)
  if (backupKey) return buildBackup();

  // No keys at all — return Gemini so the error is readable
  console.warn('[getActiveProvider] No LLM API keys found. Set MINIMAX_API_KEY, GEMINI_API_KEY, or BACKUP_LLM_API_KEY.');
  return new GeminiProvider();
}
