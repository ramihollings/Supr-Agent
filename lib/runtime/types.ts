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
export type RuntimeMode = 'real';

export interface AgentRuntimeBudget {
  maxSteps?: number;
  timeoutMs?: number;
  retryLimit?: number;
}

export interface AgentRuntimeRunInput {
  actionId: string;
  missionId?: string;
  agentId?: string;
  mode?: RuntimeMode;
  budget?: AgentRuntimeBudget;
  cancellationToken?: { aborted?: boolean; reason?: string };
  /**
   * @deprecated The runtime is single-shot: a 5-step timeout produces a
   * failed action and a fresh runtime call has to re-read the action
   * from the DB to resume. The previous resumeCursor was never
   * written or read anywhere; removed to keep the type honest.
   */
}

export interface AgentRuntimeRunResult {
  status: AgentActionStatus;
  action: AgentActionRecord;
  agentRunId?: string;
  finalSummary?: string;
  evidenceIds: string[];
  transcriptIds: string[];
  metricIds: string[];
  failureReason?: string;
  result?: unknown;
}

export type AgentRuntimeStepKind =
  | 'model'
  | 'tool'
  | 'command'
  | 'diff'
  | 'approval'
  | 'warning'
  | 'final';

export interface AgentRuntimeStep {
  id: string;
  runId: string;
  kind: AgentRuntimeStepKind;
  status: 'pending' | 'running' | 'succeeded' | 'warning' | 'failed';
  summary: string;
  detail?: string;
  evidenceIds?: string[];
  createdAt?: string;
}

export interface AgentContextBundle {
  mission: Record<string, unknown>;
  task?: Record<string, unknown> | null;
  agent?: Record<string, unknown> | null;
  action: AgentActionRecord;
  memoryContext: string;
  guidelineContext: string;
  recentTranscript: string;
  artifacts: Array<Record<string, unknown>>;
  approvals: Array<Record<string, unknown>>;
  tools: Array<Record<string, unknown>>;
  skillContext?: string;
  skillMatches?: SkillMatch[];
  injectedSections: string[];
}

export type ModelToolResponse =
  | { type: 'message'; content: string }
  | { type: 'tool_call'; toolName: string; arguments: Record<string, unknown>; rationale?: string }
  | { type: 'needs_approval'; reason: string }
  | { type: 'final'; summary: string; evidence?: Record<string, string[]> }
  | { type: 'invalid'; reason: string; raw?: string };

export interface CompletionEvidencePolicy {
  capability: string;
  requiredKinds: Array<'artifacts' | 'memory' | 'events' | 'toolCalls' | 'sources' | 'commands' | 'diffs'>;
}

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

export interface LearnedSkillDraft {
  id: string;
  missionId: string;
  agentRunId: string;
  proposedName: string;
  markdown: string;
  sourceRunIds: string[];
  evidenceIds: string[];
  riskFindings: string[];
  status: 'draft' | 'review_requested' | 'approved' | 'rejected' | 'promoted';
  reviewerAgentId?: string | null;
  approvalId?: string | null;
}

export interface SkillMatch {
  name: string;
  description: string;
  path: string;
  matchReason: string;
  confidence: number;
  injected: 'summary' | 'full';
}

export interface ReplanDecision {
  id: string;
  missionId: string;
  flowRunId: string;
  trigger: string;
  affectedNodeIds: string[];
  plannerSource: 'model' | 'preset_fallback' | 'none';
  insertedActionIds: string[];
  removedActionIds: string[];
}

export interface ProviderRouteDecision {
  id: string;
  missionId?: string | null;
  agentRunId?: string | null;
  agentRole: 'supr' | 'code' | 'research' | 'reflection' | 'sub';
  provider: string;
  model?: string | null;
  fallbackProvider?: string | null;
  runtimeMode: RuntimeMode;
  failureReason?: string | null;
}

export interface MessagingGatewayAdapter {
  source: 'telegram' | 'slack' | 'discord';
  supportsSource(source: string): boolean;
  normalizeActor(payload: unknown): string | null;
  receive(payload: unknown): Promise<{ actorId: string | null; content: string; attachments?: unknown[] }>;
  send(input: { actorId: string; text: string; missionId?: string | null; reason: string }): Promise<{ ok: boolean; deliveryId?: string; error?: string }>;
}

export interface CommandExecutionPolicy {
  requestedCommand: string;
  agentId?: string | null;
  riskLevel: RiskLevel;
  selectedEnvironment: 'local' | 'docker' | 'remote' | 'blocked';
  approvalRequired: boolean;
  evidenceLabel: string;
  reason: string;
}
