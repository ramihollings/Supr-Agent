import type { PermissionTier } from '@/lib/services/governance';

export interface ActionPolicyDecision {
  outcome: 'allow' | 'require_approval' | 'deny';
  reason: string;
  irreversible: boolean;
  requiredPermissions: PermissionTier[];
}

const DENIED_COMMANDS = [
  /\brm\s+-rf\s+(\/|~|\$HOME)(?:\s|$)/i,
  /\bremove-item\b[^\r\n]*(?:[a-z]:\\|~|\$home)[^\r\n]*-recurse\b/i,
  /\b(format|mkfs|diskpart)\b/i,
  /\bdd\s+if=.*\bof=\/dev\//i,
  /\b(shutdown|reboot|halt)\b/i,
  /\b(?:curl|wget|invoke-webrequest|invoke-restmethod)\b[^\r\n]*\b(?:localhost|127(?:\.\d{1,3}){3}|0\.0\.0\.0|10(?:\.\d{1,3}){3}|169\.254(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2}|192\.168(?:\.\d{1,3}){2}|metadata\.google\.internal)\b/i,
  /\b(printenv|env|set)\b(?:\s|$)/i,
  /(?:\$env:|\$\{?|%)[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|API[_-]?KEY)[A-Z0-9_]*(?:\}?|%)/i,
  /\bdocker\b[^\r\n]*(?:--privileged|-v\s+\/:|\/var\/run\/docker\.sock)/i,
  /\b(?:nsenter|unshare)\b/i,
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
  const operation = String(args.operation || args.action || '');
  if (DENIED_COMMANDS.some((pattern) => pattern.test(command))) {
    return {
      outcome: 'deny',
      reason: 'The action matches a hard-denied destructive, secret-exfiltration, or metadata-access pattern.',
      irreversible: true,
      requiredPermissions: [requiredPermission],
    };
  }
  if (
    APPROVAL_TOOLS.test(toolName)
    || APPROVAL_TOOLS.test(operation)
    || APPROVAL_COMMANDS.some((pattern) => pattern.test(command))
  ) {
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
