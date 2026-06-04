/**
 * Skill catalog: parses .agents/skills/[name]/SKILL.md front-matter
 * into structured metadata that the agent runtime, MCP router,
 * and Settings UI can consume.
 *
 * Per Blueprint 5.0 Part 3.2, skills are treated as both a
 * prompt/logic layer AND a security clearance. The metadata
 * extracted here feeds:
 *   - The agent runtime's skill-invoker tool
 *   - The MCP `supr-skills` server resource list
 *   - The Settings UI's skill catalog
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const REPO_ROOT = process.cwd();
const SKILLS_DIR = join(REPO_ROOT, '.agents', 'skills');

export type SkillTier = 'Observe' | 'Draft' | 'Edit' | 'Execute' | 'External_Act' | 'Root';

export interface SkillMetadata {
  /** Skill folder name, used as the skill's id. */
  name: string;
  /** One-line description from the YAML front-matter. */
  description: string;
  /** Optional license field. */
  license?: string;
  /** Optional compatibility string. */
  compatibility?: string;
  /** Free-form metadata block. */
  metadata: Record<string, string>;
  /** Tags from the metadata block, normalized to lowercase strings. */
  tags: string[];
  /** Optional category. */
  category?: string;
  /** Path to the SKILL.md on disk. */
  path: string;
  /** Body content (front-matter stripped). */
  body: string;
}

let cached: SkillMetadata[] | null = null;

export function loadAllSkills(): SkillMetadata[] {
  if (cached) return cached;
  if (!existsSync(SKILLS_DIR)) {
    cached = [];
    return cached;
  }
  const out: SkillMetadata[] = [];
  for (const entry of readdirSync(SKILLS_DIR)) {
    const skillDir = join(SKILLS_DIR, entry);
    if (!statSync(skillDir).isDirectory()) continue;
    const skillMd = join(skillDir, 'SKILL.md');
    if (!existsSync(skillMd)) continue;
    try {
      out.push(parseSkillFile(entry, skillMd));
    } catch (err: any) {
      console.warn(`[SkillsCatalog] Failed to parse ${skillMd}: ${err.message}`);
    }
  }
  cached = out;
  return cached;
}

export function invalidateSkillsCatalog() {
  cached = null;
}

export function getSkill(name: string): SkillMetadata | undefined {
  return loadAllSkills().find((s) => s.name === name);
}

function parseSkillFile(name: string, path: string): SkillMetadata {
  const raw = readFileSync(path, 'utf8');
  const { frontMatter, body } = splitFrontMatter(raw);
  const meta: Record<string, string> = {};
  let description = '';
  let license: string | undefined;
  let compatibility: string | undefined;
  let category: string | undefined;
  if (frontMatter) {
    // Very small YAML subset: top-level `key: value` lines plus a
    // single `metadata:` block with `key: value` children.
    const lines = frontMatter.split('\n');
    let inMetadata = false;
    for (const line of lines) {
      if (/^\s*$/.test(line)) continue;
      if (line.startsWith('metadata:')) {
        inMetadata = true;
        continue;
      }
      if (inMetadata) {
        const m = line.match(/^\s+([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+?)\s*$/);
        if (m) meta[m[1]] = m[2];
        else inMetadata = false;
      } else {
        const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.+?)\s*$/);
        if (!m) continue;
        const key = m[1];
        const val = m[2];
        if (key === 'name') description = description || val;
        else if (key === 'description') description = val;
        else if (key === 'license') license = val;
        else if (key === 'compatibility') compatibility = val;
      }
    }
    // The MCP-style front-matter uses `metadata.category` and
    // `metadata.tags` (comma-separated). Pull them out.
    if (meta.category) category = meta.category;
  }
  const tags = (meta.tags || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  return {
    name,
    description,
    license,
    compatibility,
    metadata: meta,
    tags,
    category,
    path,
    body,
  };
}

function splitFrontMatter(raw: string): { frontMatter: string; body: string } {
  if (!raw.startsWith('---')) return { frontMatter: '', body: raw };
  const end = raw.indexOf('\n---', 3);
  if (end === -1) return { frontMatter: '', body: raw };
  const frontMatter = raw.slice(3, end).trim();
  const body = raw.slice(end + 4).replace(/^\s*\n/, '');
  return { frontMatter, body };
}

/**
 * Materialize a skill's body as a system-prompt override. The skill
 * body is treated as a security clearance: it is injected verbatim
 * (no template substitution) so the operator can audit exactly what
 * the agent will see.
 */
export function renderSkillPrompt(skill: SkillMetadata): string {
  return [
    `# Skill Loaded: ${skill.name}`,
    `# Category: ${skill.category || '(unspecified)'}`,
    `# Tags: ${skill.tags.join(', ') || '(none)'}`,
    '',
    skill.body,
  ].join('\n');
}
