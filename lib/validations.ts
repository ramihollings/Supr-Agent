import { z } from 'zod';

export const PhaseStatusSchema = z.enum(['Pending', 'Active', 'Done', 'Blocked', 'Gate_Pending']);
export const TaskStatusSchema = z.enum(['Active', 'Done', 'Blocked', 'Pending']);

export const PhaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: PhaseStatusSchema,
});

export const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  agentName: z.string(),
  agentIcon: z.string(),
  status: TaskStatusSchema,
});

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  icon: z.string(),
  isActive: z.boolean(),
  permissionTier: z.string(),
  isPermanent: z.boolean(),
  description: z.string(),
  isSupervisor: z.boolean().optional(),
  reportsTo: z.string().optional(),
});

export const ApprovalRequestSchema = z.object({
  id: z.string(),
  requestingAgent: z.string(),
  action: z.string(),
  riskLevel: z.enum(['Low', 'Medium', 'High', 'Critical']),
  permission: z.string(),
  reason: z.string(),
  suprRecommendation: z.string(),
});

export const MessageSchema = z.object({
  id: z.number(),
  sender: z.string(),
  text: z.string(),
  isUser: z.boolean(),
  approvalRequest: ApprovalRequestSchema.optional(),
});

export const ArtifactSchema = z.object({
  id: z.string(),
  filename: z.string(),
  type: z.enum(['code', 'markdown', 'data', 'json']),
  content: z.string(),
});

export const ActivityEventSchema = z.object({
  id: z.string(),
  eventType: z.enum(['approval', 'failure', 'task_complete', 'agent_action', 'supr_decision', 'permission', 'delegation', 'handoff', 'review', 'escalation', 'governance']),
  actor: z.string(),
  actorIcon: z.string(),
  summary: z.string(),
  detail: z.string(),
  timestamp: z.string(),
});

export const FailureEventSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  agentName: z.string(),
  failureType: z.string(),
  attemptNumber: z.number(),
  summary: z.string(),
  suprGuidance: z.string(),
  resolved: z.boolean(),
});

export const MemoryItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  value: z.string(),
  importance: z.enum(['Low', 'Medium', 'High']),
});

export const MissionSchema = z.object({
  id: z.string(),
  parentId: z.string().optional(),
  subMissionIds: z.array(z.string()).optional(),
  name: z.string(),
  objective: z.string(),
  status: z.enum(['Active', 'Done', 'Failed']),
  readinessScore: z.number().min(0).max(100),
  phases: z.array(PhaseSchema),
  tasks: z.array(TaskSchema),
  messages: z.array(MessageSchema),
  artifacts: z.array(ArtifactSchema).optional(),
  activityLog: z.array(ActivityEventSchema).optional(),
  failures: z.array(FailureEventSchema).optional(),
  memoryItems: z.array(MemoryItemSchema).optional(),
});

export const DatabaseSchemaSchema = z.object({
  missions: z.array(MissionSchema),
  agents: z.array(AgentSchema),
});
