import { z } from "zod";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import { skillCatalog } from "../services/skill-catalog";
import { getActiveProvider } from "../../lib/providers/model";

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

    const prompt = `You are executing a task using the specialized skill guide below.

=== SPECIALIZED SKILL GUIDE ===
${skillPrompt}
===============================

Your current task instructions:
"${params.instruction}"

Please complete the task strictly adhering to the guidelines and specifications in the skill guide. Provide a comprehensive output.`;

    try {
      const response = await provider.generateContent(prompt, {
        temperature: 0.1
      });
      return response;
    } catch (error: any) {
      throw new Error(`Skill invocation failed: ${error.message}`);
    }
  }
};

toolRegistry.registerTool(skillInvokerTool);
export default skillInvokerTool;
