/**
 * Skill feedback loop.
 *
 * Per Blueprint 5.0 Part 3.2, skills are not static. When a skill
 * execution completes (success or failure), the runtime writes
 * telemetry and corrective observations to a per-skill
 * `.lessons.md` file. On subsequent launches, the skill invoker
 * reads the latest lessons and prepends them to the system
 * prompt so the agent adapts its behavior based on past runs.
 *
 * The file lives at:
 *   .agents/skills/<name>/.lessons.md
 *
 * It is gitignored and regenerated on each run. Operators can
 * pin a lesson by appending `[pin]` to the line — pinned entries
 * are kept verbatim across regenerations.
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

const REPO_ROOT = process.cwd();
const SKILLS_DIR = join(REPO_ROOT, '.agents', 'skills');

export interface SkillLesson {
  /** When the lesson was recorded. */
  timestamp: string;
  /** What happened. */
  observation: string;
  /** What the agent should do differently next time. */
  correctiveAction: string;
  /** Free-form tags (e.g. 'timeout', 'truncation', 'hallucination'). */
  tags: string[];
  /** True if the operator pinned this entry — never garbage-collected. */
  pinned?: boolean;
}

function lessonsPathFor(skillName: string): string {
  return join(SKILLS_DIR, skillName, '.lessons.md');
}

/**
 * Append a single lesson to the skill's `.lessons.md` file. The
 * file is created if missing. Lessons are timestamped and
 * tagged so the operator can grep them later.
 */
export function appendLesson(skillName: string, lesson: SkillLesson): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(skillName)) {
    throw new Error(`Invalid skill name: ${skillName}`);
  }
  const path = lessonsPathFor(skillName);
  mkdirSync(dirname(path), { recursive: true });
  const tagStr = lesson.tags.length > 0 ? ` [${lesson.tags.join(', ')}]` : '';
  const pinStr = lesson.pinned ? ' [pin]' : '';
  const block = [
    '',
    `## ${lesson.timestamp}${tagStr}${pinStr}`,
    '',
    `**Observation:** ${lesson.observation}`,
    '',
    `**Corrective action:** ${lesson.correctiveAction}`,
    '',
  ].join('\n');
  appendFileSync(path, block, 'utf8');
}

/**
 * Read the most recent N lessons for a skill. Returns them in
 * reverse chronological order (newest first). Pinned lessons
 * are always returned regardless of the limit.
 */
export function readRecentLessons(skillName: string, limit = 5): SkillLesson[] {
  const path = lessonsPathFor(skillName);
  if (!existsSync(path)) return [];
  const raw = readFileSync(path, 'utf8');
  return parseLessons(raw, limit);
}

function parseLessons(raw: string, limit: number): SkillLesson[] {
  // Split on `## YYYY-...` headings and parse each block.
  const blocks = raw.split(/^## /m).filter((b) => b.trim().length > 0);
  const lessons: SkillLesson[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const headLine = lines[0] || '';
    const tsMatch = headLine.match(/^(\d{4}-\d{2}-\d{2}T\S+)/);
    if (!tsMatch) continue;
    const timestamp = tsMatch[1];
    // The pin marker is a standalone [pin] token in the heading
    // line. The first [tag1, tag2, ...] block carries the tags.
    // We look for both independently so they don't shadow each
    // other when 'pin' also appears in the tag list.
    const tags: string[] = [];
    let pinned = false;
    const allBrackets = headLine.match(/\[([^\]]*)\]/g) || [];
    for (const bracket of allBrackets) {
      const inner = bracket.slice(1, -1).trim();
      if (inner === 'pin') {
        pinned = true;
        continue;
      }
      for (const piece of inner.split(',')) {
        const t = piece.trim();
        if (t && t !== 'pin') tags.push(t);
      }
    }
    const body = lines.slice(1).join('\n');
    const obsMatch = body.match(/\*\*Observation:\*\*\s*([\s\S]*?)\n\s*\n\*\*Corrective action:\*\*\s*([\s\S]*?)(?:\n\s*\n|$)/);
    if (!obsMatch) continue;
    lessons.push({
      timestamp,
      tags,
      pinned,
      observation: obsMatch[1].trim(),
      correctiveAction: obsMatch[2].trim(),
    });
  }
  // Sort newest-first; pinned entries are always included.
  lessons.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const pinned = lessons.filter((l) => l.pinned);
  const recent = lessons.filter((l) => !l.pinned).slice(0, limit);
  return [...pinned, ...recent].slice(0, Math.max(limit, pinned.length));
}

/**
 * Garbage-collect old unpinned lessons, keeping only the
 * most recent N. Pinned entries are preserved. Useful for
 * keeping the lessons file from growing without bound.
 */
export function pruneLessons(skillName: string, keep: number = 20): { kept: number; removed: number } {
  const path = lessonsPathFor(skillName);
  if (!existsSync(path)) return { kept: 0, removed: 0 };
  const all = parseLessons(readFileSync(path, 'utf8'), Number.MAX_SAFE_INTEGER);
  // The parseLessons helper already sorts and de-dups; just trim.
  const pinned = all.filter((l) => l.pinned);
  const unpinned = all.filter((l) => !l.pinned);
  const survivors = [...pinned, ...unpinned.slice(0, keep)];
  const removed = all.length - survivors.length;
  // Rewrite the file.
  const header = `# Lessons for skill: ${skillName}\n\n> Auto-generated by lib/skills/lessons.ts. Pinned entries are preserved across regenerations.\n`;
  const body = survivors
    .map((l) => {
      const tagPart = l.tags.length > 0 ? ` [${l.tags.join(', ')}]` : '';
      const pinPart = l.pinned ? ' [pin]' : '';
      return `## ${l.timestamp}${tagPart}${pinPart}\n\n**Observation:** ${l.observation}\n\n**Corrective action:** ${l.correctiveAction}`;
    })
    .join('\n\n');
  writeFileSync(path, `${header}\n${body}\n`, 'utf8');
  return { kept: survivors.length, removed };
}

/**
 * Render the lessons as a system-prompt section. The output is
 * injected after the skill body when the skill is loaded. The
 * block is fenced so the agent can tell where the lessons end
 * and the user's task begins.
 */
export function renderLessonsSection(skillName: string, limit = 5): string {
  const lessons = readRecentLessons(skillName, limit);
  if (lessons.length === 0) return '';
  const lines: string[] = [];
  lines.push('');
  lines.push(`## Lessons learned from past runs of '${skillName}'`);
  lines.push('');
  lines.push('These are telemetry-driven observations from previous skill invocations. Adapt your behavior accordingly.');
  lines.push('');
  for (const l of lessons) {
    const tagPart = l.tags.length > 0 ? ` (${l.tags.join(', ')})` : '';
    lines.push(`- ${l.timestamp}${tagPart}`);
    lines.push(`  - Observed: ${l.observation}`);
    lines.push(`  - Do differently: ${l.correctiveAction}`);
  }
  return lines.join('\n');
}
