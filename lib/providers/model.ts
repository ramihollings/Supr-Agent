import { GoogleGenAI } from '@google/genai';

export interface ModelOptions {
  model?: string;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstruction?: string;
}

export abstract class ModelProvider {
  /**
   * Generates a complete text response for a given prompt.
   */
  abstract generateContent(prompt: string, options?: ModelOptions): Promise<string>;

  /**
   * Streams the response for a given prompt.
   */
  abstract streamContent(prompt: string, options?: ModelOptions): AsyncGenerator<string>;
}

export class GeminiProvider extends ModelProvider {
  private ai: GoogleGenAI;
  private defaultModel = 'gemini-3.0-pro';

  constructor(apiKey?: string) {
    super();
    // In production, instantiate using Workload Identity Federation or Secret Manager
    // For local dev, uses process.env.GEMINI_API_KEY automatically if no key is provided.
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
      if (chunk.text) {
        yield chunk.text;
      }
    }
  }
}

export class ModelRouter {
  private providers: Record<string, ModelProvider> = {};

  registerProvider(name: string, provider: ModelProvider) {
    this.providers[name] = provider;
  }

  getProvider(name: string): ModelProvider {
    const provider = this.providers[name];
    if (!provider) {
      throw new Error(`ModelProvider '${name}' not found.`);
    }
    return provider;
  }

  async generate(providerName: string, prompt: string, options?: ModelOptions): Promise<string> {
    return this.getProvider(providerName).generateContent(prompt, options);
  }
}
