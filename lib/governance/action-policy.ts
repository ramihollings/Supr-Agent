import type { PermissionTier } from '@/lib/services/governance';

export interface ActionPolicyDecision {
  outcome: 'allow' | 'require_approval' | 'deny';
  reason: string;
  irreversible: boolean;
  requiredPermissions: PermissionTier[];
}

const DENIED_COMMANDS = [
  /\brm\s+-rf\s+(\/|~|\$HOME)(?:\s|$)/i,
  /\b(format|mkfs|diskpart)\b/i,
  /\bdd\s+if=.*\bof=\/dev\//i,
  /\b(shutdown|reboot|halt)\b/i,
  /\bcurl\b.*\b(169\.254\.169\.254|metadata\.google\.internal)\b/i,
  /\b(printenv|set)\b.*\b(secret|token|password|api[_-]?key)\b/i,
];

const APPROVAL_COMMANDS = [
  /\bgit\s+push\b/i,
  /\b(gcloud|kubectl|terraform)\s+(deploy|apply|destroy|delete)\b/i,
  /\b(npm|pnpm|yarn)\s+publish\b/i,
  /\b(rm|del|remove-item)\b/i,
];

const APPROVAL_TOOLS = /deploy|publish|purchase|payment|rotate_secret|delete|remove|change_permission|git_push/i;

export function evaluateActionPolicy(
  toolName: string,
  args: Record<string, unknown> = {},
  requiredPermission: PermissionTier = 'Observe',
): ActionPolicyDecision {
  const command = String(args.command || args.cmd || args.CommandLine || '');
  if (DENIED_COMMANDS.some((pattern) => pattern.test(command))) {
    return {
      outcome: 'deny',
      reason: 'The action matches a hard-denied destructive, secret-exfiltration, or metadata-access pattern.',
      irreversible: true,
      requiredPermissions: [requiredPermission],
    };
  }
  if (APPROVAL_TOOLS.test(toolName) || APPROVAL_COMMANDS.some((pattern) => pattern.test(command))) {
    return {
      outcome: 'require_approval',
      reason: 'The action can create an irreversible external or destructive side effect.',
      irreversible: true,
      requiredPermissions: [requiredPermission],
    };
  }
  return {
    outcome: 'allow',
    reason: 'The action is reversible or bounded by the execution environment.',
    irreversible: false,
    requiredPermissions: [requiredPermission],
  };
}
