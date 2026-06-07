// scripts/wire-personas.mjs
// Phase 1C: wire loadAllIdentityProfiles() into the context-assembler
// so the runtime pulls the actual persona from .agents/*.md.
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/context-assembler.ts';
let src = readFileSync(target, 'utf-8');

const oldImport = "import { guidelinePackService } from '@/lib/services/guideline-packs';";
const newImport = [
    "import { guidelinePackService } from '@/lib/services/guideline-packs';",
    "import { loadAllIdentityProfiles, type LoadedIdentityProfile } from '@/lib/agents';",
].join('\n');
if (src.includes(oldImport) && !src.includes("loadAllIdentityProfiles")) {
    src = src.replace(oldImport, newImport);
}

// Inject the persona into the returned bundle. The runtime model
// call already injects the agent row's name, so we add the persona
// body right after, sourced from .agents/<name>.md.
const oldReturn = `  return {
    mission: mission || { id: action.missionId },
    task,
    agent,
    action,
    memoryContext,
    guidelineContext,
    recentTranscript,
    artifacts,
    approvals,
    tools,
    skillContext: skillSelection.context,
    skillMatches: skillSelection.matches,
    injectedSections: [`;
const newReturn = `  // Phase 1C: pull the agent's persona from .agents/<name>.md and
  // surface it as a dedicated context section. The runtime adds the
  // persona body to the prompt before the model decides what tool to
  // call next, so each sub-agent (Code, Research, QA, ...) gets the
  // exact identity it was provisioned with instead of the hard-coded
  // boilerplate in the agent row.
  const allPersonas = loadAllIdentityProfiles();
  const persona = allPersonas[agent?.name as string] || null;
  const personaContext = persona
    ? \`## Agent Identity\\n\\nName: \${persona.name}\\nRole: \${persona.role}\\nTier: \${persona.permissionTier}\\n\\n\${persona.systemPrompt}\\n\\n(loaded from \${persona.sourcePath} at \${persona.loadedAt})\`
    : '';

  return {
    mission: mission || { id: action.missionId },
    task,
    agent,
    action,
    memoryContext,
    guidelineContext,
    recentTranscript,
    artifacts,
    approvals,
    tools,
    skillContext: skillSelection.context,
    skillMatches: skillSelection.matches,
    personaContext,
    injectedSections: [`;
if (src.includes(oldReturn) && !src.includes('personaContext')) {
    src = src.replace(oldReturn, newReturn);
}

// Add 'persona' to the injectedSections array if it's not already there.
const oldSections = `injectedSections: [
      'mission',
      task ? 'task' : '',
      agent ? 'agent' : '',
      memoryContext ? 'memory_sections' : '',
      guidelineContext ? 'guideline_packs' : '',
      skillSelection.matches.length ? 'matching_skill_summaries' : '',
      'tool_manifest',
      'recent_transcript',
    ].filter(Boolean),`;
const newSections = `injectedSections: [
      'mission',
      task ? 'task' : '',
      agent ? 'agent' : '',
      memoryContext ? 'memory_sections' : '',
      guidelineContext ? 'guideline_packs' : '',
      skillSelection.matches.length ? 'matching_skill_summaries' : '',
      'tool_manifest',
      'recent_transcript',
      persona ? 'agent_persona' : '',
    ].filter(Boolean),`;
if (src.includes(oldSections) && !src.includes('agent_persona')) {
    src = src.replace(oldSections, newSections);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: context-assembler.ts persona wired');
