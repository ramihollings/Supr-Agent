/**
 * SKILL.md parsing and validation per the Agent Skills specification.
 * Handles YAML frontmatter metadata and markdown body.
 */

export interface SkillFrontmatter {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata: Record<string, string>;
}

export interface SkillSpec {
  frontmatter: SkillFrontmatter;
  body: string;
}

const NAME_MAX_LEN = 64;
const DESC_MAX_LEN = 1024;
const COMPAT_MAX_LEN = 500;

/**
 * Validate a skill name against the Agent Skills specification.
 * Rules:
 * - 1-64 characters
 * - Lowercase alphanumeric and hyphens only
 * - Must not start or end with a hyphen
 * - Must not contain consecutive hyphens
 */
export function validateSkillName(name: string): void {
  if (!name) {
    throw new Error("Skill name must not be empty");
  }

  if (name.length > NAME_MAX_LEN) {
    throw new Error(`Skill name must be at most ${NAME_MAX_LEN} characters, got ${name.length}`);
  }

  const nameRegex = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  if (!nameRegex.test(name)) {
    throw new Error(
      `Skill name '${name}' is invalid: must contain only lowercase alphanumeric characters and hyphens, must not start or end with a hyphen, and must not contain consecutive hyphens`
    );
  }
}

/**
 * Validate that a skill's directory name matches its declared name.
 */
export function validateSkillDirName(skillName: string, dirName: string): void {
  if (skillName !== dirName) {
    throw new Error(
      `Skill name '${skillName}' does not match directory name '${dirName}': the spec requires these to be identical`
    );
  }
}

/**
 * Parse a simple YAML frontmatter block.
 */
function parseFrontmatterYaml(yamlStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = yamlStr.split(/\r?\n/);
  let currentSection: string | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Determine indentation
    const indent = line.match(/^\s*/)?.[0].length || 0;

    // Handle nested metadata mapping (indented lines under a metadata key)
    if (indent > 0 && currentSection === "metadata") {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx !== -1) {
        const k = trimmed.substring(0, colonIdx).trim();
        let v = trimmed.substring(colonIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.substring(1, v.length - 1);
        }
        if (!result.metadata) result.metadata = {};
        result.metadata[k] = v;
      }
      continue;
    }

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx !== -1) {
      const k = trimmed.substring(0, colonIdx).trim();
      let v = trimmed.substring(colonIdx + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.substring(1, v.length - 1);
      }

      if (k === "metadata") {
        currentSection = "metadata";
      } else {
        currentSection = null;
        result[k] = v;
      }
    }
  }

  return result;
}

/**
 * Parse and validate a SKILL.md file into a SkillSpec.
 */
export function parseSkillMd(raw: string): SkillSpec {
  const trimmed = raw.trim();
  const lines = trimmed.split(/\r?\n/);

  if (lines.length === 0 || lines[0].trim() !== "---") {
    throw new Error("SKILL.md must start with '---' frontmatter delimiter");
  }

  let closeIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      closeIdx = i;
      break;
    }
  }

  if (closeIdx === -1) {
    throw new Error("SKILL.md missing closing '---' frontmatter delimiter");
  }

  const yamlBlock = lines.slice(1, closeIdx).join("\n");
  const body = lines.slice(closeIdx + 1).join("\n").trim();

  const parsed = parseFrontmatterYaml(yamlBlock);

  if (!parsed.name) {
    throw new Error("SKILL.md missing required field: 'name'");
  }
  const name = String(parsed.name);
  validateSkillName(name);

  if (!parsed.description) {
    throw new Error("SKILL.md missing required field: 'description'");
  }
  const description = String(parsed.description);
  if (description.length > DESC_MAX_LEN) {
    throw new Error(`Skill description must be at most ${DESC_MAX_LEN} characters, got ${description.length}`);
  }

  let compatibility: string | undefined = undefined;
  if (parsed.compatibility) {
    compatibility = String(parsed.compatibility);
    if (compatibility.length > COMPAT_MAX_LEN) {
      throw new Error(`Skill compatibility must be at most ${COMPAT_MAX_LEN} characters, got ${compatibility.length}`);
    }
  }

  const license = parsed.license ? String(parsed.license) : undefined;
  const metadata = parsed.metadata || {};

  return {
    frontmatter: {
      name,
      description,
      license,
      compatibility,
      metadata,
    },
    body,
  };
}
