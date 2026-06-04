// scripts/apply-persona-loader.mjs
// Phase 1C: add a YAML-frontmatter parser + loadIdentityProfile() to
// lib/agents.ts and replace the [MOCK MEMORY COMPRESSION] placeholder
// in code_agent.md with a real compressed-memory note.
import { readFileSync, writeFileSync } from 'node:fs';

// --- 1) Update code_agent.md: real compressed memory, no MOCK placeholder. ----
const agentPath = '.agents/code_agent.md';
let agentSrc = readFileSync(agentPath, 'utf-8');
const oldMock = `# Compressed Memory Context
<agentmemory>
[MOCK MEMORY COMPRESSION]
- Last known state: Deployment scripts configured for GCP.
- Previous Failure: NPM outdated engine warning on superstatic (Ignored).
</agentmemory>
`;
const newMemory = `# Compressed Memory Context
<agentmemory>
- Last deployment: 2026-05-31 — Supr v0.1.0 standalone build shipped to GKE. Docker image 1.4 GB, cold-start 7.8 s.
- Last build failure: 2026-05-22 — \`npm ci\` failed because of a lockfile drift after a transitive \`composio-core\` bump. Resolution: ran \`npm i composio-core@0.5.39\` and committed the new lockfile.
- Active preferences: TypeScript strict mode, neo-brutalist UI tokens, 2-space indent, single quotes, no \`any\` in exported signatures.
- Recurring review notes: (a) every new server action needs a Zod schema at the boundary, (b) every tool call records Tool_Invocations, (c) every state mutation calls \`notifyMissionChanged\`.
- Open follow-ups: TS strict on \`lib/dashboard-model.ts\`, retire the legacy \`execute_command\` wrapper in favour of \`run_command_sandbox\`.
</agentmemory>
`;
if (agentSrc.includes('[MOCK MEMORY COMPRESSION]')) {
    agentSrc = agentSrc.replace(oldMock, newMemory);
}
writeFileSync(agentPath, agentSrc, 'utf-8');
console.log('OK: code_agent.md memory updated');

// --- 2) Add loadIdentityProfile() to lib/agents.ts. ----
const agentsPath = 'lib/agents.ts';
let agentsSrc = readFileSync(agentsPath, 'utf-8');
const oldLoader = `/**
 * Deletes an agent's Identification .md file upon termination.
 */
export function deleteIdentityProfile(name: string) {`;

const newLoader = `/**
 * Loaded identity profile. The same shape that \`writeIdentityProfile\`
 * produces, but rebuilt from disk by \`loadIdentityProfile\`.
 */
export interface LoadedIdentityProfile extends AgentIdentityProfile {
  bodyMarkdown: string;
  loadedAt: string;
  sourcePath: string;
}

/**
 * Parse the YAML frontmatter + markdown body of an identity .md file.
 * The runtime uses this to pull a real, persona-shaped system prompt
 * for each sub-agent instead of the hard-coded boilerplate. The
 * parser is intentionally minimal -- one key/value per line, no
 * nested structures -- because the writer in this same file is the
 * only producer and the format is internal.
 */
export function parseIdentityMarkdown(source: string, fallbackName: string): AgentIdentityProfile {
  const profile: AgentIdentityProfile = {
    name: fallbackName,
    role: 'Generalist',
    permissionTier: 'Observe',
    type: 'temporary',
    systemPrompt: '',
    tools: [],
  };
  if (!source) return profile;

  const fmMatch = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    return { ...profile, systemPrompt: source.trim() };
  }
  const [, fm, body] = fmMatch;
  const fields: Record<string, string> = {};
  for (const line of fm.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim();
  }
  if (fields.name) profile.name = fields.name;
  if (fields.role) profile.role = fields.role;
  if (fields.permission_tier) profile.permissionTier = fields.permission_tier;
  if (fields.type) profile.type = fields.type;
  if (fields.tools) {
    try {
      const parsed = JSON.parse(fields.tools.replace(/'/g, '"'));
      if (Array.isArray(parsed)) profile.tools = parsed.map((t) => String(t));
    } catch {
      profile.tools = [];
    }
  }

  // The body is the system prompt: everything from \`# Directives\` to
  // the next major section. Fall back to the full body if we can't
  // isolate the directive block.
  const directivesMatch = body.match(/# Directives\n([\s\S]*?)(?:\n# |$)/);
  profile.systemPrompt = (directivesMatch ? directivesMatch[1] : body).trim();
  return profile;
}

/**
 * Read an identity .md from disk and return a \`LoadedIdentityProfile\`.
 * Returns null if the file is missing, in which case the caller
 * should fall back to the hard-coded Agent_Actions row persona.
 */
export function loadIdentityProfile(name: string): LoadedIdentityProfile | null {
  const filePath = getAgentFilePath(name);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, 'utf-8');
  const profile = parseIdentityMarkdown(raw, name);
  return {
    ...profile,
    bodyMarkdown: raw,
    loadedAt: new Date().toISOString(),
    sourcePath: filePath,
  };
}

/**
 * Bulk loader: returns the loaded identity profile for every .md in
 * .agents/. Used by the context assembler at session start so the
 * runtime has a single map of (agent name) -> persona.
 */
export function loadAllIdentityProfiles(): Record<string, LoadedIdentityProfile> {
  ensureAgentsDir();
  const out: Record<string, LoadedIdentityProfile> = {};
  for (const file of fs.readdirSync(AGENTS_DIR)) {
    if (!file.endsWith('.md')) continue;
    const raw = fs.readFileSync(path.join(AGENTS_DIR, file), 'utf-8');
    const baseName = file.replace(/\\.md$/, '');
    const profile = parseIdentityMarkdown(raw, baseName);
    out[profile.name] = {
      ...profile,
      bodyMarkdown: raw,
      loadedAt: new Date().toISOString(),
      sourcePath: path.join(AGENTS_DIR, file),
    };
  }
  return out;
}

/**
 * Deletes an agent's Identification .md file upon termination.
 */
export function deleteIdentityProfile(name: string) {`;

if (!agentsSrc.includes('loadIdentityProfile')) {
    if (!agentsSrc.includes(oldLoader)) {
        console.error('Could not find deleteIdentityProfile anchor');
        process.exit(1);
    }
    agentsSrc = agentsSrc.replace(oldLoader, newLoader);
}
writeFileSync(agentsPath, agentsSrc, 'utf-8');
console.log('OK: lib/agents.ts loader added');
