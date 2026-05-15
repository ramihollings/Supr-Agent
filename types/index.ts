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

export interface Mission {
  id: string;
  name: string;
  objective: string;
  status: 'Active' | 'Done' | 'Failed';
  readinessScore: number;
  phases: Phase[];
  tasks: Task[];
  messages: Message[];
}

export interface DatabaseSchema {
  missions: Mission[];
  agents: Agent[];
}
