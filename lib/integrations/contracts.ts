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
  missionId?: string;
  agentId?: string;
  signal?: AbortSignal;
}

export interface ToolResult {
  ok: boolean;
  output?: unknown;
  error?: string;
}

export interface ToolAdapter {
  describe(): Promise<CapabilityDescriptor>;
  validate(input: unknown): Promise<ValidationResult>;
  execute(context: ToolContext, input: unknown): Promise<ToolResult>;
  healthCheck(): Promise<IntegrationHealth>;
}
