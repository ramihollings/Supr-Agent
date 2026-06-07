import dbClient from "../../lib/database/db_client";
import type { CommandExecutionPolicy, RiskLevel } from "../../lib/runtime/types";
import { evaluateActionPolicy } from "../../lib/governance/action-policy";

function riskRank(risk: RiskLevel) {
  return { Low: 1, Medium: 2, High: 3, Critical: 4 }[risk] || 1;
}

async function getSetting(key: string) {
  const row = await dbClient.queryOne<any>(`SELECT value FROM Settings WHERE key = ?`, [key]);
  return row?.value ? String(row.value) : "";
}

export async function isDockerAvailable() {
  return (await getSetting("docker_available")) === "true" || process.env.SUPR_DOCKER_AVAILABLE === "true";
}

export async function resolveCommandExecutionPolicy(input: {
  command: string;
  agentId?: string | null;
  riskLevel?: RiskLevel;
  requestedEnvironment?: "local" | "docker" | "remote";
}): Promise<CommandExecutionPolicy> {
  const riskLevel = input.riskLevel || "High";
  const remoteEnabled = (await getSetting("remote_execution_enabled")) === "true";
  const dockerAvailable = await isDockerAvailable();
  const requested = input.requestedEnvironment || (riskRank(riskLevel) >= 3 ? "docker" : "local");
  const actionPolicy = evaluateActionPolicy("execute_command", { command: input.command }, "Execute");

  if (actionPolicy.outcome === "deny") {
    return {
      requestedCommand: input.command,
      agentId: input.agentId || null,
      riskLevel,
      selectedEnvironment: "blocked",
      approvalRequired: false,
      evidenceLabel: "hard_denied",
      reason: actionPolicy.reason,
    };
  }

  if (requested === "remote" && !remoteEnabled) {
    return {
      requestedCommand: input.command,
      agentId: input.agentId || null,
      riskLevel,
      selectedEnvironment: "blocked",
      approvalRequired: true,
      evidenceLabel: "remote_disabled",
      reason: "Remote command execution is disabled by default and requires explicit host configuration.",
    };
  }

  if (requested === "docker" && !dockerAvailable) {
    return {
      requestedCommand: input.command,
      agentId: input.agentId || null,
      riskLevel,
      selectedEnvironment: "local",
      approvalRequired: actionPolicy.outcome === "require_approval",
      evidenceLabel: "docker_unavailable_local_policy",
      reason: "Docker sandbox was requested by policy, but docker_available is not enabled; using governed local execution label.",
    };
  }

  return {
    requestedCommand: input.command,
    agentId: input.agentId || null,
    riskLevel,
    selectedEnvironment: requested,
    approvalRequired: actionPolicy.outcome === "require_approval",
    evidenceLabel: requested === "docker" ? "docker_available" : requested === "remote" ? "remote_configured" : "local_governed",
    reason: requested === "docker"
      ? "Command selected Docker sandbox execution by governance policy."
      : requested === "remote"
        ? "Command selected configured remote execution by governance policy."
        : "Command selected governed local execution.",
  };
}
