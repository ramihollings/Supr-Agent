import type { PermissionTier } from '@/lib/services/governance';

export type AgentActionStatus =
  | 'draft'
  | 'approved'
  | 'pending_approval'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'revised'
  | 'cancelled';

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface AgentActionInput {
  missionId: string;
  taskId?: string | null;
  agentId: string;
  capability: string;
  intent: string;
  inputs?: Record<string, unknown>;
  riskLevel?: RiskLevel;
  requiredPermission?: PermissionTier;
  metadata?: Record<string, unknown>;
}

export interface AgentActionRecord extends AgentActionInput {
  id: string;
  status: AgentActionStatus;
  approvalId?: string | null;
  result?: string | null;
  error?: string | null;
  traceId: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ExecutionResult {
  status: AgentActionStatus;
  action: AgentActionRecord;
  result?: unknown;
  approvalId?: string | null;
  reason?: string;
}
