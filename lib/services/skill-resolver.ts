import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { parseSkillMd, validateSkillDirName } from "./skill-parser";

export interface DiscoveredSkill {
  name: string;
  description: string;
  path: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
}

export class SkillResolver {
  private searchPaths: string[];
  private skillsCache: Map<string, DiscoveredSkill> = new Map();

  constructor(searchPaths: string[] = [".agents/skills"]) {
    this.searchPaths = searchPaths;
  }

  /**
   * Resets and re-scans the configured paths for skill directories.
   */
  async discover(): Promise<DiscoveredSkill[]> {
    this.skillsCache.clear();
    const discovered: DiscoveredSkill[] = [];

    for (const basePath of this.searchPaths) {
      if (!existsSync(basePath)) {
        continue;
      }

      try {
        const entries = await fs.readdir(basePath, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const skillDir = path.join(/* turbopackIgnore: true */ basePath, entry.name);
            const skillFiles = ["SKILL.md", "skill.md"];
            let foundSkillFile = false;
            let rawContent = "";

            for (const filename of skillFiles) {
              const p = path.join(/* turbopackIgnore: true */ skillDir, filename);
              if (existsSync(p)) {
                rawContent = await fs.readFile(p, "utf8");
                foundSkillFile = true;
                break;
              }
            }

            if (!foundSkillFile) {
              continue;
            }

            try {
              const spec = parseSkillMd(rawContent);
              validateSkillDirName(spec.frontmatter.name, entry.name);

              const skill: DiscoveredSkill = {
                name: spec.frontmatter.name,
                description: spec.frontmatter.description,
                path: skillDir,
                license: spec.frontmatter.license,
                compatibility: spec.frontmatter.compatibility,
                metadata: spec.frontmatter.metadata,
              };

              this.skillsCache.set(skill.name, skill);
              discovered.push(skill);
            } catch (err: any) {
              console.warn(`[SkillResolver] Skipping skill in '${skillDir}': ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        console.error(`[SkillResolver] Error reading search path '${basePath}':`, err);
      }
    }

    return discovered;
  }

  /**
   * Check if a skill exists, performing discovery on cache miss.
   */
  async has(name: string): Promise<boolean> {
    if (this.skillsCache.has(name)) {
      return true;
    }
    await this.discover();
    return this.skillsCache.has(name);
  }

  /**
   * Retrieve a skill from the cache.
   */
  async get(name: string): Promise<DiscoveredSkill | undefined> {
    if (!this.skillsCache.has(name)) {
      await this.discover();
    }
    return this.skillsCache.get(name);
  }

  /**
   * Load the formatted skill content fresh from disk.
   */
  async loadContent(name: string): Promise<string> {
    const skill = await this.get(name);
    if (!skill) {
      throw new Error(`Skill not discovered: ${name}`);
    }

    const skillFiles = ["SKILL.md", "skill.md"];
    let rawContent = "";
    let found = false;

    for (const filename of skillFiles) {
      const p = path.join(/* turbopackIgnore: true */ skill.path, filename);
      if (existsSync(p)) {
        rawContent = await fs.readFile(p, "utf8");
        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error(`Failed to read SKILL.md in ${skill.path}`);
    }

    try {
      const spec = parseSkillMd(rawContent);
      const normalizedPath = path.resolve(/* turbopackIgnore: true */ skill.path).replace(/\\/g, "/");
      return `Base directory for this skill: ${normalizedPath}\n\n${spec.body}`;
    } catch (err: any) {
      throw new Error(`Failed to parse SKILL.md in ${skill.path}: ${err.message}`);
    }
  }
}
