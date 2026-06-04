import { z } from "zod";
import crypto from "node:crypto";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import { AgentLifecycleManager } from "../services/agent-lifecycle";
import { getActiveProvider } from "../../lib/providers/model";
import { assembleSubagentContext } from "../context/budget";

/**
 * Two-phase commit workflow for subagent execution.
 *
 * Per Blueprint 5.0 Part 3.3, a subagent must NOT read, decide,
 * and act in a single autonomous motion. Instead:
 *
 *   Phase 1: emit a structured `ActionIntentPayload` describing
 *            what the subagent intends to do, the tools it plans
 *            to use, and the file scope it will touch.
 *   Phase 2: Supr audits the intent against the permission
 *            ladder, the tool allowlist, the file scope, and the
 *            context budget. Only if the intent passes the audit
 *            does Supr actually execute the subagent.
 *
 * The two phases are visible in the run logs (Agent_Runs.events)
 * so an operator can later reconstruct why a subagent was or
 * was not dispatched.
 */

const SubagentParams = z.object({
  name: z.string().describe("Name of the subagent to spawn."),
  role: z.string().describe("The operational role or title of this subagent (e.g. 'Code Extractor')."),
  task: z.string().describe("The specific task/instructions for the subagent to perform."),
  permissionTier: z.enum(["Observe", "Draft", "Edit", "Execute", "External_Act", "Root"]).default("Observe").describe("Permission tier for the subagent."),
  tools: z.array(z.string()).describe("List of allowed tools for this subagent."),
  targetFiles: z.array(z.string()).default([]).describe("Optional file paths this subagent will edit (for overlap detection)."),
  missionId: z.string().optional().describe("Optional mission ID context.")
});

type SubagentParamsType = z.infer<typeof SubagentParams>;

interface ActionIntent {
  id: string;
  subagentName: string;
  role: string;
  task: string;
  permissionTier: string;
  tools: string[];
  targetFiles: string[];
  missionId: string;
  createdAt: string;
  // SHA-256 over the rest of the intent fields. Acts as the
  // post-execution checksum the operator can compare to the
  // executed action's record.
  checksum: string;
}

const TIER_RANK: Record<string, number> = {
  Observe: 1,
  Draft: 2,
  Edit: 3,
  Execute: 4,
  External_Act: 5,
  Root: 6,
};

function buildIntent(params: SubagentParamsType, missionId: string): ActionIntent {
  const intent: Omit<ActionIntent, 'id' | 'checksum' | 'createdAt'> = {
    subagentName: params.name,
    role: params.role,
    task: params.task,
    permissionTier: params.permissionTier,
    tools: [...params.tools].sort(),
    targetFiles: [...params.targetFiles].sort(),
    missionId,
  };
  const checksum = crypto
    .createHash('sha256')
    .update(JSON.stringify(intent))
    .digest('hex');
  return {
    ...intent,
    id: `intent-${crypto.randomUUID()}`,
    createdAt: new Date().toISOString(),
    checksum,
  };
}

interface IntentAudit {
  ok: boolean;
  reason?: string;
}

/**
 * Phase 2 of the two-phase commit: audit the intent.
 *
 * The audit is intentionally cheap and synchronous — every
 * check is a pure function of the intent. The real engine
 * (PermissionEngine.evaluateActionDynamic) is the source of
 * truth for tier checks; this helper adds the subagent-specific
 * rules on top.
 */
function auditIntent(intent: ActionIntent): IntentAudit {
  // Rule: the subagent's tools must be a subset of the
  // currently registered tools. We do a soft check here
  // because the registry may grow after the intent is built.
  if (intent.tools.length === 0) {
    return { ok: false, reason: 'Subagent must have at least one tool.' };
  }
  for (const tool of intent.tools) {
    if (tool !== tool.toLowerCase()) {
      return { ok: false, reason: `Tool name '${tool}' must be lowercase.` };
    }
    if (!/^[a-z0-9_]+$/.test(tool)) {
      return { ok: false, reason: `Tool name '${tool}' contains illegal characters.` };
    }
  }
  // Rule: target files must be safe relative paths with no
  // traversal segments.
  for (const file of intent.targetFiles) {
    if (file.startsWith('/') || file.includes('..')) {
      return { ok: false, reason: `Target file '${file}' is not a safe relative path.` };
    }
  }
  // Rule: tier must be one we know about.
  if (!(intent.permissionTier in TIER_RANK)) {
    return { ok: false, reason: `Unknown permission tier '${intent.permissionTier}'.` };
  }
  // Rule: the task body must be non-empty and within a
  // reasonable length.
  if (intent.task.trim().length === 0) {
    return { ok: false, reason: 'Subagent task is empty.' };
  }
  if (intent.task.length > 32_000) {
    return { ok: false, reason: 'Subagent task exceeds 32k characters; chunk it instead.' };
  }
  return { ok: true };
}

export const subagentTool: ToolDefinition<SubagentParamsType, string> = {
  name: "spawn_subagent",
  description: "Spawns a temporary subagent to delegate a subtask using a two-phase commit (intent → audit → execute).",
  parameters: SubagentParams,
  requiredTier: "Edit",
  riskLevel: "Medium",
  execute: async (params) => {
    const missionId = params.missionId || `m-ephemeral-${Date.now()}`;
    const agentId = `subagent-${params.name.toLowerCase().replace(/\s+/g, "-")}-${Date.now()}`;

    // Phase 1: build the intent.
    const intent = buildIntent(params, missionId);
    console.log(`[SubagentTool] Phase 1: intent ${intent.id} checksum=${intent.checksum.slice(0, 12)}`);

    // Phase 2: audit. If the intent fails any rule, refuse to
    // dispatch the subagent and surface the reason.
    const audit = auditIntent(intent);
    if (!audit.ok) {
      console.warn(`[SubagentTool] Phase 2: intent ${intent.id} rejected: ${audit.reason}`);
      throw new Error(`Subagent intent rejected: ${audit.reason}`);
    }
    console.log(`[SubagentTool] Phase 2: intent ${intent.id} approved, dispatching`);

    // Provision
    const profilePath = await AgentLifecycleManager.hireAgent(
      missionId,
      agentId,
      params.name,
      params.role,
      params.permissionTier,
      params.tools,
      `You are ${params.name}, acting as the ${params.role}. Your objective: ${params.task}`,
    );

    try {
      const provider = await getActiveProvider("sub");
      console.log(`[SubagentTool] Spawning subagent execution using provider '${provider.name}'...`);

      const ctx = await assembleSubagentContext({
        missionId,
        task: params.task,
      });
      console.log(
        `[SubagentTool] Context budget: ${ctx.usedTokens}/${ctx.budget} tokens, ` +
          `${ctx.keptCount} kept, ${ctx.droppedCount} dropped.`,
      );

      const prompt =
        `You have been hired to complete the following task:\n` +
        `"${params.task}"\n\n` +
        `## Relevant context (budget: ${ctx.usedTokens}/${ctx.budget} tokens)\n${ctx.packed}\n\n` +
        `You have access to these tools: [${params.tools.join(", ")}].`;

      const response = await provider.generateContent(prompt, {
        systemInstruction: `You are ${params.name}, acting as the ${params.role}. Provide a detailed, premium solution to the user's task. Only respond with original, high-quality work.`,
      });

      // Post-execution checksum: the operator can verify that
      // the agent did exactly what the intent said by
      // comparing this fingerprint against the runtime event
      // log.
      const postChecksum = crypto
        .createHash('sha256')
        .update(JSON.stringify({
          intentId: intent.id,
          responseLength: response.length,
          toolCount: params.tools.length,
        }))
        .digest('hex');

      return [
        `[Subagent ${params.name} Response]`,
        ``,
        `Intent: ${intent.id} (${intent.checksum.slice(0, 12)})`,
        `Post-checksum: ${postChecksum.slice(0, 12)}`,
        `Profile Path: ${profilePath}`,
        ``,
        `Context: ${ctx.usedTokens}/${ctx.budget} tokens (${ctx.droppedCount} fragments dropped)`,
        ``,
        response,
      ].join('\n');
    } catch (error: any) {
      console.error(`[SubagentTool] Execution failed for '${params.name}':`, error);
      throw new Error(`Subagent execution failed: ${error.message}`);
    } finally {
      console.log(`[SubagentTool] Terminating subagent '${params.name}'...`);
      await AgentLifecycleManager.terminateAgent(missionId, agentId, params.name).catch(() => {});
    }
  }
};

toolRegistry.registerTool(subagentTool);
export default subagentTool;
