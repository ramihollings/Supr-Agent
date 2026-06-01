import type {
  Agent,
  Artifact,
  DashboardObject,
  DashboardObjectType,
  ObjectAction,
  RunEvent,
} from '@/types';

type MissionLike = {
  id: string;
  name: string;
  objective?: string;
  status: string;
  readinessScore?: number;
  tasks?: { status: string }[];
  artifacts?: Artifact[];
  failures?: { resolved: boolean }[];
};

type WorkspaceFileLike = {
  filename: string;
  size: number;
  type: string;
  updatedAt?: string;
};

type TimelineLike = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  actor?: string;
  timestamp?: string;
  source?: string;
  mode?: string;
  command?: RunEvent['command'];
};

function action(
  id: ObjectAction['id'],
  label: string,
  icon: string,
  enabled = true,
  risk: ObjectAction['risk'] = 'low',
  reason?: string,
): ObjectAction {
  return { id, label, icon, enabled, risk, reason };
}

export function buildObjectActions(type: DashboardObjectType, canMutate = true): ObjectAction[] {
  const disabledReason = canMutate ? undefined : 'Permission boundary blocks this action.';
  const mutate = (id: ObjectAction['id'], label: string, icon: string, risk: ObjectAction['risk'] = 'medium') =>
    action(id, label, icon, canMutate, risk, disabledReason);

  const common = [
    action('open', 'Open', 'open_in_new'),
    action('inspect-evidence', 'Evidence', 'fact_check'),
  ];

  if (type === 'project') {
    return [
      ...common,
      mutate('edit', 'Edit', 'edit'),
      action('export', 'Export', 'archive'),
      action('download', 'Download', 'download'),
      mutate('duplicate', 'Duplicate', 'content_copy'),
      mutate('delete', 'Delete', 'delete', 'high'),
    ];
  }

  if (type === 'file' || type === 'artifact' || type === 'report') {
    return [
      ...common,
      mutate('edit', 'Edit', 'edit'),
      action('download', 'Download', 'download'),
      mutate('pin', 'Pin', 'push_pin'),
      mutate('attach', 'Attach', 'attach_file'),
      mutate('delete', 'Delete', 'delete', 'high'),
    ];
  }

  if (type === 'sub-agent') {
    return [
      ...common,
      mutate('edit', 'Edit', 'edit'),
      mutate('retry', 'Retry', 'replay'),
      mutate('archive', 'Archive', 'archive'),
      mutate('delete', 'Delete', 'delete', 'high'),
    ];
  }

  if (type === 'approval') {
    return [
      action('inspect-evidence', 'Evidence', 'fact_check'),
      mutate('approve', 'Approve', 'check_circle', 'medium'),
      mutate('reject', 'Reject', 'cancel', 'medium'),
    ];
  }

  return [...common, mutate('edit', 'Edit', 'edit'), mutate('archive', 'Archive', 'archive')];
}

export function missionToDashboardObject(mission: MissionLike): DashboardObject {
  const unresolved = mission.failures?.filter((failure) => !failure.resolved).length || 0;
  return {
    id: mission.id,
    type: 'project',
    title: mission.name,
    status: mission.status,
    owner: 'Supr Supervisor',
    description: mission.objective || 'No objective recorded.',
    provenance: 'Mission database',
    evidenceCount: (mission.artifacts?.length || 0) + unresolved,
    metadata: {
      readiness: mission.readinessScore || 0,
      tasks: mission.tasks?.length || 0,
      unresolvedFailures: unresolved,
    },
    actions: buildObjectActions('project'),
  };
}

export function fileToDashboardObject(file: WorkspaceFileLike): DashboardObject {
  return {
    id: file.filename,
    type: 'file',
    title: file.filename,
    status: file.type,
    owner: 'Workspace',
    description: `${file.size.toLocaleString()} bytes in the secure workspace.`,
    provenance: 'supr_workspaces',
    updatedAt: file.updatedAt,
    metadata: { size: file.size, extension: file.type },
    actions: buildObjectActions('file'),
  };
}

export function agentToDashboardObject(agent: Agent): DashboardObject {
  return {
    id: agent.id,
    type: 'sub-agent',
    title: agent.name,
    status: agent.isActive ? 'Active' : 'Archived',
    owner: agent.reportsTo || 'Supr',
    description: agent.description || agent.role,
    provenance: 'Agent roster',
    metadata: {
      role: agent.role,
      tier: agent.permissionTier,
      permanent: agent.isPermanent,
    },
    actions: buildObjectActions('sub-agent', agent.name !== 'Supr'),
  };
}

export function timelineToRunEvents(timeline: TimelineLike[]): RunEvent[] {
  return timeline.map((item) => {
    const type = item.type || item.source || 'system';
    const isFailure = type.includes('failure') || type.includes('error');
    const isApproval = type.includes('approval');
    const isArtifact = type.includes('artifact');
    const isMemory = type.includes('memory');
    const isTool = type.includes('agent_action') || type.includes('tool');
    const isCommand = type.includes('command');
    const hasDetail = Boolean(item.detail?.trim());
    const commandStatus = item.command?.exitCode === undefined
      ? undefined
      : item.command.exitCode === 0 ? 'succeeded' : 'failed';
    const status: RunEvent['status'] = isFailure
      ? 'failed'
      : commandStatus
        ? commandStatus
      : !hasDetail && (isTool || isApproval)
        ? 'warning'
        : type.includes('pending')
          ? 'pending'
          : 'succeeded';

    return {
      id: item.id,
      kind: isFailure
        ? 'failure'
        : isCommand
          ? 'command'
        : isApproval
          ? 'approval'
          : isArtifact
            ? 'artifact'
            : isMemory
              ? 'memory'
              : isTool
                ? 'tool'
                : 'system',
      title: item.title,
      detail: item.detail || 'No output body was recorded for this step.',
      actor: item.actor || 'Supr',
      timestamp: item.timestamp || new Date().toISOString(),
      status,
      evidence: hasDetail
        ? [{ id: `${item.id}-detail`, label: item.source || 'timeline', durable: true, detail: item.mode }]
        : [],
      command: item.command,
      raw: item,
    };
  });
}
