import type { RiskLevel } from '@/lib/runtime/types';

export interface CapabilityDescriptor {
  id: string;
  operations: string[];
  permissions: string[];
  riskLevel: RiskLevel;
  estimatedCost?: number;
  availability: 'available' | 'degraded' | 'unavailable';
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface IntegrationHealth {
  status: 'available' | 'degraded' | 'unavailable';
  latencyMs: number;
  message?: string;
}

export interface ToolContext {
  sessionId?: string;
  missionId?: string;
  agentId?: string;
  agentActionId?: string;
  signal?: AbortSignal;
}

export interface ToolResult {
  ok: boolean;
  output?: unknown;
  error?: string;
  errorDetail?: {
    code: string;
    retryable: boolean;
    adapterId?: string;
    attempt?: number;
  };
}

export interface ToolAdapter {
  describe(): Promise<CapabilityDescriptor>;
  validate(input: unknown): Promise<ValidationResult>;
  execute(context: ToolContext, input: unknown): Promise<ToolResult>;
  healthCheck(): Promise<IntegrationHealth>;
}

export interface AdapterRuntimeOptions {
  timeoutMs?: number;
  retryLimit?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
  healthCacheMs?: number;
}
