import { SkillResolver, type DiscoveredSkill } from "./skill-resolver";
import { writeIdentityProfile, type AgentIdentityProfile } from "../../lib/agents";

function defaultSkillSearchPaths() {
  return [".agents/skills"];
}

export class SkillCatalog {
  private resolver: SkillResolver;

  constructor(searchPaths: string[] = defaultSkillSearchPaths()) {
    this.resolver = new SkillResolver(searchPaths);
  }

  /**
   * Lists discovered skills, optionally filtered by a search query.
   */
  async listSkills(query?: { q?: string }): Promise<DiscoveredSkill[]> {
    const skills = await this.resolver.discover();
    if (!query || !query.q) {
      return skills;
    }

    const searchTerm = query.q.toLowerCase();
    return skills.filter((skill) => {
      const matchName = skill.name.toLowerCase().includes(searchTerm);
      const matchDesc = skill.description.toLowerCase().includes(searchTerm);
      const matchMetadata = Object.entries(skill.metadata).some(
        ([k, v]) => k.toLowerCase().includes(searchTerm) || v.toLowerCase().includes(searchTerm),
      );
      return matchName || matchDesc || matchMetadata;
    });
  }

  /**
   * Retrieves a specific skill by name.
   */
  async getSkill(name: string): Promise<DiscoveredSkill | undefined> {
    return this.resolver.get(name);
  }

  /**
   * Checks if a skill exists.
   */
  async hasSkill(name: string): Promise<boolean> {
    return this.resolver.has(name);
  }

  /**
   * Loads the formatted instruction block for a skill.
   */
  async getSkillPrompt(name: string): Promise<string> {
    return this.resolver.loadContent(name);
  }

  /**
   * Injects the content of selected skills into an agent's identity profile,
   * rewriting the identity profile on disk.
   */
  async injectSkillsIntoAgent(agentProfile: AgentIdentityProfile, skillNames: string[]): Promise<string> {
    const injectedBlocks: string[] = [];

    for (const name of skillNames) {
      try {
        if (await this.resolver.has(name)) {
          const content = await this.resolver.loadContent(name);
          injectedBlocks.push(`## Skill: ${name}\n${content}`);
        } else {
          console.warn(`[SkillCatalog] Skill '${name}' not found during agent prompt injection.`);
        }
      } catch (err: any) {
        console.error(`[SkillCatalog] Error loading skill '${name}':`, err);
      }
    }

    const updatedProfile: AgentIdentityProfile = {
      ...agentProfile,
      injectedSkills: injectedBlocks.length > 0 ? injectedBlocks.join("\n\n") : undefined,
    };

    return writeIdentityProfile(updatedProfile);
  }
}
export const skillCatalog = new SkillCatalog();
