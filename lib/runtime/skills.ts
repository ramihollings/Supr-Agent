import fs from 'fs/promises';
import path from 'path';

export async function loadWorkspaceSkills(root = process.cwd()) {
  const candidates = [
    path.join(root, '.agents', 'skills'),
    path.join(root, 'skills'),
  ];
  const skills: Array<{ id: string; path: string; content: string }> = [];
  for (const base of candidates) {
    try {
      const entries = await fs.readdir(base, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillPath = path.join(base, entry.name, 'SKILL.md');
        try {
          skills.push({ id: entry.name, path: skillPath, content: await fs.readFile(skillPath, 'utf8') });
        } catch {}
      }
    } catch {}
  }
  return skills;
}

export function compactContext(messages: Array<{ role: string; content: string }>, maxChars = 12000) {
  let remaining = maxChars;
  const kept: typeof messages = [];
  for (const message of [...messages].reverse()) {
    const size = message.content.length;
    if (size > remaining) break;
    kept.unshift(message);
    remaining -= size;
  }
  const dropped = messages.length - kept.length;
  return {
    messages: dropped > 0
      ? [{ role: 'system', content: `${dropped} older messages were compacted. Preserve explicit user requirements and active approvals.` }, ...kept]
      : kept,
    dropped,
  };
}
