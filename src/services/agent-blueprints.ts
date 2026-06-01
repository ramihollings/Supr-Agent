import crypto from "node:crypto";
import type { PermissionTier } from "../../lib/services/governance";
import dbClient from "../../lib/database/db_client";

export interface AgentBlueprint {
  id: string;
  missionId?: string | null;
  prompt: string;
  role: string;
  instructions: string;
  permissionTier: PermissionTier;
  tools: string[];
  skills: string[];
  provider: string;
  memoryScope: "mission" | "workspace" | "user";
  budgetProfile: Record<string, unknown>;
  rationale: string;
}

function id() {
  return `blueprint-${crypto.randomUUID()}`;
}

function inferRole(prompt: string) {
  const lower = prompt.toLowerCase();
  if (lower.includes("review") || lower.includes("test") || lower.includes("qa")) return "QA Reviewer";
  if (lower.includes("code") || lower.includes("build") || lower.includes("implement")) return "Code Agent";
  if (lower.includes("research") || lower.includes("analyze")) return "Research Agent";
  if (lower.includes("publish") || lower.includes("notify") || lower.includes("deliver")) return "Signal Agent";
  return "Generalist Agent";
}

export class AgentBlueprintService {
  suggest(input: { prompt: string; missionId?: string | null; provider?: string }): Omit<AgentBlueprint, "id"> {
    const prompt = input.prompt.trim();
    const role = inferRole(prompt);
    const isCode = role === "Code Agent";
    const isExternal = role === "Signal Agent";
    const isReview = role === "QA Reviewer";

    const tools = isCode
      ? ["workspace_write_file", "workspace_validate_outputs", "execute_command"]
      : isExternal
        ? ["delivery_package", "slack_send_message"]
        : isReview
          ? ["workspace_validate_outputs", "governance_review"]
          : ["web_scrape", "governance_review"];

    const skills = isCode
      ? ["code-refactor", "frontend-design"]
      : isReview
        ? ["code-refactor", "webapp-testing"]
        : ["pdf", "docx"];

    return {
      missionId: input.missionId || null,
      prompt,
      role,
      instructions: `Act as ${role}. Keep work evidence-backed, explain governance-sensitive choices, and hand results back to the supervisor for review.`,
      permissionTier: isExternal ? "External_Act" : isCode ? "Execute" : isReview ? "Draft" : "Observe",
      tools,
      skills,
      provider: input.provider || "default",
      memoryScope: "mission",
      budgetProfile: { maxRunMinutes: isCode ? 30 : 15, hardStopOnApproval: true },
      rationale: `Suggested from prompt intent. ${role} gets the minimum practical tier and tools for supervisor-governed work.`,
    };
  }

  async create(input: { prompt: string; missionId?: string | null; provider?: string }): Promise<AgentBlueprint> {
    const blueprint = { id: id(), ...this.suggest(input) };
    await dbClient.execute(
      `INSERT INTO Agent_Blueprints
        (id, mission_id, prompt, role, instructions, permission_tier, tools, skills, provider, memory_scope, budget_profile, rationale)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        blueprint.id,
        blueprint.missionId || null,
        blueprint.prompt,
        blueprint.role,
        blueprint.instructions,
        blueprint.permissionTier,
        JSON.stringify(blueprint.tools),
        JSON.stringify(blueprint.skills),
        blueprint.provider,
        blueprint.memoryScope,
        JSON.stringify(blueprint.budgetProfile),
        blueprint.rationale,
      ],
    );
    return blueprint;
  }

  async list(missionId?: string | null): Promise<AgentBlueprint[]> {
    const rows = missionId
      ? await dbClient.query<any>(`SELECT * FROM Agent_Blueprints WHERE mission_id = ? ORDER BY created_at DESC`, [missionId])
      : await dbClient.query<any>(`SELECT * FROM Agent_Blueprints ORDER BY created_at DESC LIMIT 20`);
    return rows.map((row) => ({
      id: row.id,
      missionId: row.mission_id,
      prompt: row.prompt,
      role: row.role,
      instructions: row.instructions,
      permissionTier: row.permission_tier,
      tools: JSON.parse(row.tools || "[]"),
      skills: JSON.parse(row.skills || "[]"),
      provider: row.provider,
      memoryScope: row.memory_scope,
      budgetProfile: JSON.parse(row.budget_profile || "{}"),
      rationale: row.rationale || "",
    }));
  }
}

export const agentBlueprintService = new AgentBlueprintService();
