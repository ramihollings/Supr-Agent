import fs from 'fs';
import path from 'path';

export interface AgentIdentityProfile {
  name: string;
  role: string;
  permissionTier: string;
  type: string;
  systemPrompt: string;
  tools: string[];
  injectedSkills?: string;
  memoryContext?: string;
}

const AGENTS_DIR = path.resolve(process.cwd(), '.agents');

/**
 * Ensures the .agents directory exists.
 */
function ensureAgentsDir() {
  if (!fs.existsSync(AGENTS_DIR)) {
    fs.mkdirSync(AGENTS_DIR, { recursive: true });
  }
}

/**
 * Formats a clean filename based on the agent's name.
 */
function getAgentFilePath(name: string): string {
  const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return path.join(AGENTS_DIR, `${safeName}.md`);
}

/**
 * Creates or overwrites an Identification .md file for a sub-agent.
 */
export function writeIdentityProfile(profile: AgentIdentityProfile) {
  ensureAgentsDir();
  const filePath = getAgentFilePath(profile.name);

  const markdownContent = `---
name: ${profile.name}
role: ${profile.role}
type: ${profile.type}
permission_tier: ${profile.permissionTier}
tools: [${profile.tools.map(t => `"${t}"`).join(', ')}]
---

# Identity
You are ${profile.name}, acting as the ${profile.role} within the Supr orchestration framework.
Your operational clearance is **${profile.permissionTier}**.

# Directives
${profile.systemPrompt}

# Operational Constraints
- Adhere strictly to the Supr Neo-Brutalist communication style.
- Request approval for actions exceeding your permission tier.

${profile.injectedSkills ? `# Acquired Skills & Rules\n${profile.injectedSkills}\n` : ''}
${profile.memoryContext ? `# Compressed Memory Context\n<agentmemory>\n${profile.memoryContext}\n</agentmemory>\n` : ''}
`;

  fs.writeFileSync(filePath, markdownContent, 'utf-8');
  return filePath;
}

/**
 * Deletes an agent's Identification .md file upon termination.
 */
export function deleteIdentityProfile(name: string) {
  const filePath = getAgentFilePath(name);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}
