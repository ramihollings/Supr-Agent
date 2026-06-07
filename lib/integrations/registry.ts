import type {
  AdapterRuntimeOptions,
  CapabilityDescriptor,
  IntegrationHealth,
  ToolAdapter,
  ToolContext,
  ToolResult,
} from './contracts';

class IntegrationRegistry {
  private adapters = new Map<string, ToolAdapter>();
  private options = new Map<string, Required<AdapterRuntimeOptions>>();
  private failures = new Map<string, { count: number; openedAt?: number }>();
  private healthCache = new Map<string, { health: IntegrationHealth; checkedAt: number }>();

  register(id: string, adapter: ToolAdapter, options: AdapterRuntimeOptions = {}) {
    this.adapters.set(id, adapter);
    this.options.set(id, {
      timeoutMs: options.timeoutMs ?? 60_000,
      retryLimit: options.retryLimit ?? 1,
      circuitBreakerThreshold: options.circuitBreakerThreshold ?? 3,
      circuitBreakerResetMs: options.circuitBreakerResetMs ?? 30_000,
      healthCacheMs: options.healthCacheMs ?? 30_000,
    });
    this.failures.delete(id);
    this.healthCache.delete(id);
  }

  unregister(id: string) {
    this.adapters.delete(id);
    this.options.delete(id);
    this.failures.delete(id);
    this.healthCache.delete(id);
  }

  has(id: string) {
    return this.adapters.has(id);
  }

  ids() {
    return Array.from(this.adapters.keys());
  }

  async capabilities(): Promise<CapabilityDescriptor[]> {
    return Promise.all(Array.from(this.adapters.entries(), async ([id, adapter]) => {
      try {
        return await adapter.describe();
      } catch {
        return {
          id,
          operations: [],
          permissions: [],
          riskLevel: 'Low',
          availability: 'unavailable',
        };
      }
    }));
  }

  async health(id: string, force = false): Promise<IntegrationHealth> {
    const adapter = this.adapters.get(id);
    if (!adapter) return { status: 'unavailable', latencyMs: 0, message: `Integration '${id}' is not registered.` };
    const options = this.options.get(id)!;
    const cached = this.healthCache.get(id);
    if (!force && cached && Date.now() - cached.checkedAt < options.healthCacheMs) return cached.health;
    const startedAt = Date.now();
    try {
      const health = await adapter.healthCheck();
      this.healthCache.set(id, { health, checkedAt: Date.now() });
      return health;
    } catch (error: any) {
      const health = { status: 'unavailable' as const, latencyMs: Date.now() - startedAt, message: error?.message || String(error) };
      this.healthCache.set(id, { health, checkedAt: Date.now() });
      return health;
    }
  }

  async execute(id: string, context: ToolContext, input: unknown, timeoutMs?: number): Promise<ToolResult> {
    const adapter = this.adapters.get(id);
    if (!adapter) return this.error(id, 'NOT_REGISTERED', `Integration '${id}' is not registered.`, false, 0);
    if (context.signal?.aborted) {
      return this.error(id, 'CANCELLED', String(context.signal.reason || 'Integration execution cancelled.'), false, 0);
    }
    const options = this.options.get(id)!;
    const failure = this.failures.get(id);
    if (failure?.openedAt && Date.now() - failure.openedAt < options.circuitBreakerResetMs) {
      return this.error(id, 'CIRCUIT_OPEN', `Integration '${id}' circuit breaker is open.`, true, 0);
    }
    try {
      const validation = await adapter.validate(input);
      if (!validation.valid) return this.error(id, 'VALIDATION_FAILED', validation.errors.join('; '), false, 0);
    } catch (error: any) {
      return this.error(id, 'VALIDATION_FAILED', error?.message || String(error), false, 0);
    }

    for (let attempt = 0; attempt <= options.retryLimit; attempt += 1) {
      if (context.signal?.aborted) {
        return this.error(id, 'CANCELLED', String(context.signal.reason || 'Integration execution cancelled.'), false, attempt);
      }
      const result = await this.executeOnce(id, adapter, context, input, timeoutMs ?? options.timeoutMs, attempt);
      if (result.ok) {
        this.failures.delete(id);
        return result;
      }
      if (!result.errorDetail?.retryable || attempt >= options.retryLimit) {
        this.recordFailure(id, options);
        return result;
      }
    }
    return this.error(id, 'EXECUTION_FAILED', `Integration '${id}' failed.`, true, options.retryLimit);
  }

  private async executeOnce(
    id: string,
    adapter: ToolAdapter,
    context: ToolContext,
    input: unknown,
    timeoutMs: number,
    attempt: number,
  ): Promise<ToolResult> {
    const controller = new AbortController();
    const abort = () => controller.abort(context.signal?.reason || 'Integration execution cancelled.');
    context.signal?.addEventListener('abort', abort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([
        adapter.execute({ ...context, signal: controller.signal }, input),
        new Promise<ToolResult>((resolve) => {
          timer = setTimeout(() => {
            controller.abort(`Integration '${id}' timed out.`);
            resolve(this.error(id, 'TIMEOUT', `Integration '${id}' timed out after ${timeoutMs}ms.`, true, attempt));
          }, timeoutMs);
        }),
      ]);
      return result.ok || result.errorDetail
        ? result
        : { ...result, errorDetail: { code: 'ADAPTER_ERROR', retryable: false, adapterId: id, attempt } };
    } catch (error: any) {
      const cancelled = controller.signal.aborted && context.signal?.aborted;
      return this.error(
        id,
        cancelled ? 'CANCELLED' : 'ADAPTER_EXCEPTION',
        error?.message || String(error),
        !cancelled,
        attempt,
      );
    } finally {
      if (timer) clearTimeout(timer);
      context.signal?.removeEventListener('abort', abort);
    }
  }

  private recordFailure(id: string, options: Required<AdapterRuntimeOptions>) {
    const failure = this.failures.get(id);
    const count = (failure?.count || 0) + 1;
    this.failures.set(id, {
      count,
      ...(count >= options.circuitBreakerThreshold ? { openedAt: Date.now() } : {}),
    });
  }

  private error(id: string, code: string, error: string, retryable: boolean, attempt: number): ToolResult {
    return { ok: false, error, errorDetail: { code, retryable, adapterId: id, attempt } };
  }
}

export const integrationRegistry = new IntegrationRegistry();
