import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import dbClient from "../../lib/database/db_client";
import { getActiveProvider } from "../../lib/providers/model";
import { stripModelThinking } from "../../lib/runtime/model-json";
import { hasConfiguredModelProvider } from "../../lib/runtime/runtime-mode";
import { parseSkillMd, validateSkillDirName } from "./skill-parser";
import type { LearnedSkillDraft } from "../../lib/runtime/types";

export const MIN_COMPLEX_TOOL_CALLS = 3;
const APPROVED_SKILL_ROOT = ".agents/skills";

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function slugifySkillName(value: string) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
  return slug || "learned-runtime-pattern";
}

function stripMarkdownFence(raw: string) {
  return stripModelThinking(raw).replace(/^```(?:markdown|md)?\s*/i, "").replace(/```\s*$/i, "").trim();
}

function buildSkillMarkdown(input: { proposedName: string; summary: string; evidenceIds: string[]; toolSequence?: string[] }) {
  return [
    "---",
    `name: ${input.proposedName}`,
    `description: Learned Supr runtime pattern extracted from governed mission evidence.`,
    "metadata:",
    "  source: supr-sial",
    "  status: draft",
    "---",
    "",
    "# Learned Runtime Pattern",
    "",
    "Use this skill when a future mission resembles the source run and the supervisor has approved the learned pattern.",
    "",
    "## Evidence Summary",
    input.summary || "Runtime completed with multiple governed tool calls.",
    "",
    "## Procedure",
    ...(input.toolSequence?.length
      ? input.toolSequence.map((tool, index) => `${index + 1}. Use \`${tool}\` only when the current context and governance tier allow it.`)
      : ["1. Inspect current runtime context and evidence before acting.", "2. Reproduce the successful tool sequence only when it still applies.", "3. Store durable evidence before marking the task complete."]),
    "",
    "## Failure Signals",
    "- Required evidence is missing or empty.",
    "- Tool output contradicts downstream assumptions.",
    "- A higher-risk capability is needed without approval.",
    "",
    "## Evidence IDs",
    ...input.evidenceIds.map((evidenceId) => `- ${evidenceId}`),
    "",
    "## Guardrails",
    "- Treat this as advisory context, not permission to bypass governance.",
    "- Re-check current files and runtime state before applying the pattern.",
    "- Request approval for higher-risk tools or environment changes.",
  ].join("\n");
}

export class SkillLearningService {
  private async distillSkillMarkdown(input: {
    proposedName: string;
    run: any;
    toolCalls: any[];
    evidenceIds: string[];
    fallbackSummary: string;
  }) {
    const fallback = buildSkillMarkdown({
      proposedName: input.proposedName,
      summary: input.fallbackSummary,
      evidenceIds: input.evidenceIds,
      toolSequence: input.toolCalls.map((tool) => String(tool.tool_name || tool.toolName || "tool")),
    });

    if (!await hasConfiguredModelProvider()) {
      throw new Error("Skill learning requires MiniMax or another configured model provider in live runtime.");
    }

    try {
      const provider = await getActiveProvider("reflection");
      const prompt = [
        "Distill this completed Supr run into a reusable Agent Skill.",
        "Return only a complete SKILL.md file with YAML frontmatter.",
        `The frontmatter name must be exactly: ${input.proposedName}`,
        "The body must include Procedure, Failure Signals, Evidence IDs, and Guardrails.",
        "Do not include secrets, raw prompts, private file bodies, tokens, or credentials.",
        "",
        `Run result: ${String(input.run.result || input.run.logs || "").slice(0, 4000)}`,
        `Tool sequence: ${input.toolCalls.map((tool) => `${tool.tool_name}:${tool.status}`).join(" -> ")}`,
        `Evidence IDs: ${input.evidenceIds.join(", ")}`,
      ].join("\n");
      const raw = await provider.generateContent(prompt, {
        systemInstruction: "You are Supr SIAL. Produce valid reviewed-draft SKILL.md markdown only.",
        maxOutputTokens: 1800,
      });
      const markdown = stripMarkdownFence(raw);
      const parsed = parseSkillMd(markdown);
      validateSkillDirName(parsed.frontmatter.name, input.proposedName);
      return markdown;
    } catch (error: any) {
      console.warn(`[SkillLearning] Model distillation failed; using deterministic fallback: ${error.message}`);
      return fallback;
    }
  }

  async evaluateCompletedRun(agentRunId: string): Promise<LearnedSkillDraft | null> {
    const run = await dbClient.queryOne<any>(`SELECT * FROM Agent_Runs WHERE id = ? AND status = 'completed'`, [agentRunId]);
    if (!run) return null;

    const toolCalls = await dbClient.query<any>(
      `SELECT id, tool_name, status, output FROM Tool_Invocations WHERE agent_run_id = ? AND status = 'completed' ORDER BY created_at ASC`,
      [agentRunId],
    );
    if (toolCalls.length < MIN_COMPLEX_TOOL_CALLS) return null;

    const existing = await dbClient.queryOne<any>(`SELECT * FROM Learned_Skill_Drafts WHERE agent_run_id = ? LIMIT 1`, [agentRunId]);
    if (existing) return this.mapDraft(existing);

    const result = safeJson<Record<string, any>>(run.result, {});
    const evidenceIds = Array.from(new Set([
      ...toolCalls.map((tool) => tool.id),
      ...(Array.isArray(result?.evidence?.artifacts) ? result.evidence.artifacts : []),
      ...(Array.isArray(result?.evidence?.events) ? result.evidence.events : []),
    ]));
    const proposedName = slugifySkillName(`${run.agent_id || "agent"}-${run.agent_action_id || "runtime"}-pattern`);
    const markdown = await this.distillSkillMarkdown({
      proposedName,
      run,
      toolCalls,
      evidenceIds,
      fallbackSummary: String(result?.summary || run.logs || "Complex run completed."),
    });
    parseSkillMd(markdown);

    const draftId = id("skill-draft");
    const riskFindings = ["Draft only: Security Agent governance_review is required before promotion."];
    await dbClient.execute(
      `INSERT INTO Learned_Skill_Drafts
        (id, mission_id, agent_run_id, proposed_name, markdown, source_run_ids, evidence_ids, risk_findings, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft')`,
      [
        draftId,
        run.mission_id,
        agentRunId,
        proposedName,
        markdown,
        JSON.stringify([agentRunId]),
        JSON.stringify(evidenceIds),
        JSON.stringify(riskFindings),
      ],
    );

    const artifactId = id("art");
    await dbClient.execute(
      `INSERT INTO Artifacts (id, mission_id, type, title, content, created_by_agent_id, quality_status, evidence_refs)
       VALUES (?, ?, 'learned_skill_draft', ?, ?, ?, 'draft', ?)`,
      [
        artifactId,
        run.mission_id,
        `${proposedName}.SKILL.md`,
        markdown,
        run.agent_id || null,
        JSON.stringify(evidenceIds),
      ],
    );

    return {
      id: draftId,
      missionId: run.mission_id,
      agentRunId,
      proposedName,
      markdown,
      sourceRunIds: [agentRunId],
      evidenceIds,
      riskFindings,
      status: "draft",
      reviewerAgentId: null,
      approvalId: null,
    };
  }

  async listDrafts(missionId?: string | null): Promise<LearnedSkillDraft[]> {
    const rows = missionId
      ? await dbClient.query<any>(`SELECT * FROM Learned_Skill_Drafts WHERE mission_id = ? ORDER BY created_at DESC`, [missionId])
      : await dbClient.query<any>(`SELECT * FROM Learned_Skill_Drafts ORDER BY created_at DESC LIMIT 30`);
    return rows.map((row) => this.mapDraft(row));
  }

  private async findSecurityReviewer(fallbackAgentId?: string | null) {
    const reviewer = await dbClient.queryOne<any>(
      `SELECT id FROM Agents WHERE lower(name) LIKE '%security%' OR lower(role) LIKE '%security%' ORDER BY id ASC LIMIT 1`,
    );
    return reviewer?.id || fallbackAgentId || "security-agent";
  }

  async requestSecurityReview(draftId: string, reviewerAgentId?: string | null) {
    const draft = await dbClient.queryOne<any>(`SELECT * FROM Learned_Skill_Drafts WHERE id = ?`, [draftId]);
    if (!draft) throw new Error(`Learned skill draft not found: ${draftId}`);
    if (draft.approval_id && draft.status === "review_requested") return draft.approval_id;
    const reviewer = await this.findSecurityReviewer(reviewerAgentId);
    const approvalId = id("approval");
    await dbClient.execute(
      `INSERT INTO Approvals
        (id, mission_id, requesting_agent_id, action, required_permission, risk_level, reason, status, created_at, updated_at)
       VALUES (?, ?, ?, 'governance_review', 'Edit', 'Medium', ?, 'pending', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        approvalId,
        draft.mission_id,
        reviewer,
        `Review learned skill draft ${draft.proposed_name} before promotion.`,
      ],
    );
    await dbClient.execute(
      `UPDATE Learned_Skill_Drafts SET status = 'review_requested', reviewer_agent_id = ?, approval_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reviewer, approvalId, draftId],
    );
    return approvalId;
  }

  async rejectDraft(draftId: string, reviewerAgentId?: string | null) {
    const draft = await dbClient.queryOne<any>(`SELECT * FROM Learned_Skill_Drafts WHERE id = ?`, [draftId]);
    if (!draft) throw new Error(`Learned skill draft not found: ${draftId}`);
    const reviewer = await this.findSecurityReviewer(reviewerAgentId);
    await dbClient.execute(
      `UPDATE Learned_Skill_Drafts SET status = 'rejected', reviewer_agent_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [reviewer, draftId],
    );
    if (draft.approval_id) {
      await dbClient.execute(`UPDATE Approvals SET status = 'rejected', decision = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [draft.approval_id]);
    }
    return this.mapDraft({ ...draft, status: "rejected", reviewer_agent_id: reviewer });
  }

  async promoteApprovedDraft(draftId: string): Promise<string> {
    const draft = await dbClient.queryOne<any>(`SELECT * FROM Learned_Skill_Drafts WHERE id = ?`, [draftId]);
    if (!draft) throw new Error(`Learned skill draft not found: ${draftId}`);
    if (!draft.approval_id) throw new Error("Approval is required before writing learned skills.");
    const approval = await dbClient.queryOne<any>(`SELECT * FROM Approvals WHERE id = ? AND status = 'approved'`, [draft.approval_id]);
    if (!approval) throw new Error("Approval is required before writing learned skills.");

    const spec = parseSkillMd(draft.markdown);
    validateSkillDirName(spec.frontmatter.name, draft.proposed_name);
    const skillRoot = path.join(/* turbopackIgnore: true */ process.cwd(), APPROVED_SKILL_ROOT);
    const skillDir = path.join(skillRoot, draft.proposed_name);
    const skillPath = path.join(skillDir, "SKILL.md");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(skillPath, draft.markdown, "utf8");
    await dbClient.execute(
      `UPDATE Learned_Skill_Drafts SET status = 'promoted', promoted_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [skillPath, draftId],
    );
    return skillPath;
  }

  private mapDraft(row: any): LearnedSkillDraft {
    return {
      id: row.id,
      missionId: row.mission_id,
      agentRunId: row.agent_run_id,
      proposedName: row.proposed_name,
      markdown: row.markdown,
      sourceRunIds: safeJson(row.source_run_ids, []),
      evidenceIds: safeJson(row.evidence_ids, []),
      riskFindings: safeJson(row.risk_findings, []),
      status: row.status,
      reviewerAgentId: row.reviewer_agent_id,
      approvalId: row.approval_id,
    };
  }
}

export const skillLearningService = new SkillLearningService();
