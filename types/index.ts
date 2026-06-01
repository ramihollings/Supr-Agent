export type PhaseStatus = 'Pending' | 'Active' | 'Done' | 'Blocked' | 'Gate_Pending';
export type TaskStatus = 'Active' | 'Done' | 'Blocked' | 'Pending';

export interface Phase {
  id: string;
  name: string;
  status: PhaseStatus;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  agentName: string;
  agentIcon: string;
  status: TaskStatus;
}

export interface Agent {
  id: string;
  name: string;
  role: string;
  icon: string;
  isActive: boolean;
  permissionTier: string;
  isPermanent: boolean;
  description: string;
  isSupervisor?: boolean;
  reportsTo?: string;
}

export interface ApprovalRequest {
  id: string;
  requestingAgent: string;
  action: string;
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  permission: string;
  reason: string;
  suprRecommendation: string;
}

export interface Message {
  id: number;
  sender: string;
  text: string;
  isUser: boolean;
  approvalRequest?: ApprovalRequest;
}

export interface Artifact {
  id: string;
  filename: string;
  type: 'code' | 'markdown' | 'data' | 'json';
  content: string;
}

export interface ActivityEvent {
  id: string;
  eventType: 'approval' | 'failure' | 'task_complete' | 'agent_action' | 'supr_decision' | 'permission' | 'delegation' | 'handoff' | 'review' | 'escalation' | 'governance';
  actor: string;
  actorIcon: string;
  summary: string;
  detail: string;
  timestamp: string;
}

export interface FailureEvent {
  id: string;
  taskId: string;
  agentName: string;
  failureType: string;
  attemptNumber: number;
  summary: string;
  suprGuidance: string;
  resolved: boolean;
}

export interface MemoryItem {
  id: string;
  key: string;
  value: string;
  importance: 'Low' | 'Medium' | 'High';
}

export interface Mission {
  id: string;
  parentId?: string;
  subMissionIds?: string[];
  name: string;
  objective: string;
  status: 'Active' | 'Done' | 'Failed';
  readinessScore: number;
  phases: Phase[];
  tasks: Task[];
  messages: Message[];
  artifacts?: Artifact[];
  activityLog?: ActivityEvent[];
  failures?: FailureEvent[];
  memoryItems?: MemoryItem[];
}

export interface DatabaseSchema {
  missions: Mission[];
  agents: Agent[];
}

export type DashboardObjectType =
  | 'project'
  | 'file'
  | 'message'
  | 'sub-agent'
  | 'artifact'
  | 'report'
  | 'memory'
  | 'guideline'
  | 'approval'
  | 'provider';

export type ObjectActionKind =
  | 'create'
  | 'edit'
  | 'delete'
  | 'upload'
  | 'download'
  | 'duplicate'
  | 'export'
  | 'archive'
  | 'inspect-evidence'
  | 'attach'
  | 'pin'
  | 'retry'
  | 'approve'
  | 'reject'
  | 'open';

export interface ObjectAction {
  id: ObjectActionKind;
  label: string;
  icon: string;
  enabled: boolean;
  risk?: 'low' | 'medium' | 'high';
  reason?: string;
}

export interface DashboardObject {
  id: string;
  type: DashboardObjectType;
  title: string;
  status: string;
  owner: string;
  description?: string;
  provenance?: string;
  createdAt?: string;
  updatedAt?: string;
  evidenceCount?: number;
  metadata?: Record<string, string | number | boolean | null | undefined>;
  actions: ObjectAction[];
}

export type RunEventKind =
  | 'command'
  | 'tool'
  | 'diff'
  | 'stderr'
  | 'system'
  | 'approval'
  | 'artifact'
  | 'memory'
  | 'failure';

export interface ExecutionEvidence {
  id: string;
  label: string;
  href?: string;
  durable: boolean;
  detail?: string;
}

export interface RunEvent {
  id: string;
  kind: RunEventKind;
  title: string;
  detail: string;
  actor: string;
  timestamp: string;
  status: 'pending' | 'running' | 'succeeded' | 'warning' | 'failed';
  evidence?: ExecutionEvidence[];
  command?: {
    command?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    durationMs?: number;
  };
  raw?: unknown;
}

export interface DashboardArtifact {
  id: string;
  filename: string;
  type: Artifact['type'] | string;
  source: string;
  preview?: string;
  status: 'streaming' | 'draft' | 'approved' | 'final';
  provenance: string;
  linkedMissionId?: string;
  linkedReportId?: string;
  exportName?: string;
}
