import type { CapabilityDescriptor, ToolAdapter, ToolContext, ToolResult } from './contracts';

class IntegrationRegistry {
  private adapters = new Map<string, ToolAdapter>();
  private failures = new Map<string, { count: number; openedAt?: number }>();

  register(id: string, adapter: ToolAdapter) {
    this.adapters.set(id, adapter);
  }

  async capabilities(): Promise<CapabilityDescriptor[]> {
    return Promise.all(Array.from(this.adapters.values(), (adapter) => adapter.describe()));
  }

  async execute(id: string, context: ToolContext, input: unknown, timeoutMs = 60_000): Promise<ToolResult> {
    const adapter = this.adapters.get(id);
    if (!adapter) return { ok: false, error: `Integration '${id}' is not registered.` };
    const failure = this.failures.get(id);
    if (failure?.openedAt && Date.now() - failure.openedAt < 30_000) {
      return { ok: false, error: `Integration '${id}' circuit breaker is open.` };
    }
    const validation = await adapter.validate(input);
    if (!validation.valid) return { ok: false, error: validation.errors.join('; ') };
    try {
      const result = await Promise.race([
        adapter.execute(context, input),
        new Promise<ToolResult>((_, reject) => setTimeout(() => reject(new Error(`Integration '${id}' timed out.`)), timeoutMs)),
      ]);
      this.failures.delete(id);
      return result;
    } catch (error: any) {
      const count = (failure?.count || 0) + 1;
      this.failures.set(id, { count, ...(count >= 3 ? { openedAt: Date.now() } : {}) });
      return { ok: false, error: error?.message || String(error) };
    }
  }
}

export const integrationRegistry = new IntegrationRegistry();
