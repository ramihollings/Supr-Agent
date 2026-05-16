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
  type: 'code' | 'markdown' | 'data';
  content: string;
}

export interface ActivityEvent {
  id: string;
  eventType: 'approval' | 'failure' | 'task_complete' | 'agent_action' | 'supr_decision' | 'permission';
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
