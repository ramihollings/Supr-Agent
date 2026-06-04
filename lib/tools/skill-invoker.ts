import { z } from "zod";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import { skillCatalog } from "../services/skill-catalog";
import { getActiveProvider } from "../../lib/providers/model";
import { appendLesson, renderLessonsSection } from "../skills/lessons";

const SkillInvokerParams = z.object({
  skillName: z.string().describe("The name of the discovered skill to invoke (e.g. 'Toprank SEO')."),
  instruction: z.string().describe("The specific task/instructions to run using the skill guidelines.")
});

type SkillInvokerParamsType = z.infer<typeof SkillInvokerParams>;

export const skillInvokerTool: ToolDefinition<SkillInvokerParamsType, string> = {
  name: "invoke_skill",
  description: "Loads and runs a registered skill guide (like PDF parsing or SEO) over user inputs via LLM reasoning.",
  parameters: SkillInvokerParams,
  requiredTier: "Observe",
  riskLevel: "Low",
  execute: async (params) => {
    const hasSkill = await skillCatalog.hasSkill(params.skillName);
    if (!hasSkill) {
      throw new Error(`Skill '${params.skillName}' is not discovered or registered in the catalog.`);
    }

    const skillPrompt = await skillCatalog.getSkillPrompt(params.skillName);
    const provider = await getActiveProvider("sub");
    // Per Blueprint 5.0 Part 3.2, read the most recent lessons
    // for this skill and prepend them so the agent can adapt
    // its behavior based on past runs.
    const lessonsSection = renderLessonsSection(params.skillName, 5);
    const start = Date.now();
    let response: string;
    try {
      const prompt = `You are executing a task using the specialized skill guide below.

=== SPECIALIZED SKILL GUIDE ===
${skillPrompt}
===============================
${lessonsSection}

Your current task instructions:
"${params.instruction}"

Please complete the task strictly adhering to the guidelines and specifications in the skill guide. Provide a comprehensive output.`;

      response = await provider.generateContent(prompt);
      // Record a positive lesson so future runs know this
      // worked. We keep the body short — the lessons file is
      // pruned to the most recent 20 by default.
      await appendLesson(params.skillName, {
        timestamp: new Date().toISOString(),
        observation: `Skill ran successfully in ${Date.now() - start}ms.`,
        correctiveAction: 'No correction needed; the previous guidance was sufficient.',
        tags: ['ok'],
      });
      return response;
    } catch (error: any) {
      // Record a failure lesson so future runs see the
      // failure mode and adapt.
      try {
        await appendLesson(params.skillName, {
          timestamp: new Date().toISOString(),
          observation: `Skill failed after ${Date.now() - start}ms: ${error.message || String(error)}.`,
          correctiveAction: 'Add fallback or validation step to handle this error class before retrying.',
          tags: ['error', error.name || 'unknown'],
        });
      } catch {}
      throw new Error(`Skill invocation failed: ${error.message}`);
    }
  }
};

toolRegistry.registerTool(skillInvokerTool);
export default skillInvokerTool;
