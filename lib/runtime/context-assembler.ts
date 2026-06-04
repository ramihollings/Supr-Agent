import dbClient from '@/lib/database/db_client';
import { toolRegistry } from '@/lib/tools/registry';
import { guidelinePackService } from '@/lib/services/guideline-packs';
import { loadAllIdentityProfiles, type LoadedIdentityProfile } from '@/lib/agents';
import { memorySectionService } from '@/lib/services/memory-sections';
import type { AgentActionRecord, AgentContextBundle, SkillMatch } from './types';

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ensureNativeToolsRegistered() {
  await toolRegistry.ensureNativeToolsRegistered();
}

function detectLanguage(artifacts: Array<Record<string, unknown>>) {
  const names = artifacts.map((artifact) => String(artifact.title || artifact.filename || '')).join(' ').toLowerCase();
  if (/\.(ts|tsx)\b/.test(names)) return 'typescript';
  if (/\.py\b/.test(names)) return 'python';
  if (/\.js\b/.test(names)) return 'javascript';
  return 'typescript';
}

function detectFramework(artifacts: Array<Record<string, unknown>>) {
  const haystack = artifacts.map((artifact) => `${artifact.title || ''} ${String(artifact.content || '').slice(0, 800)}`).join('\n').toLowerCase();
  if (haystack.includes('next') || haystack.includes('tsx')) return 'next';
  if (haystack.includes('react')) return 'react';
  return 'next';
}

async function findSkillMatches(action: AgentActionRecord): Promise<{ matches: SkillMatch[]; context: string }> {
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return { matches: [], context: '' };
  }

  const skillCatalogModule = '@/lib/services/' + 'skill-catalog';
  const { skillCatalog } = await import(skillCatalogModule);
  const haystack = [
    action.capability,
    action.intent,
    JSON.stringify(action.inputs || {}),
  ].join(' ').toLowerCase();
  const skills = await skillCatalog.listSkills();
  const matches: SkillMatch[] = [];

  for (const skill of skills) {
    const tokens = [skill.name, skill.description, ...Object.values(skill.metadata || {})]
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4);
    const overlap = tokens.filter((token) => haystack.includes(token));
    if (overlap.length === 0) continue;
    const confidence = Math.min(0.95, 0.35 + overlap.length * 0.15);
    matches.push({
      name: skill.name,
      description: skill.description,
      path: skill.path,
      matchReason: `Matched ${overlap.slice(0, 4).join(', ')}`,
      confidence,
      injected: confidence >= 0.65 ? 'full' : 'summary',
    });
  }

  const top = matches.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
  const contextBlocks: string[] = [];
  for (const match of top) {
    if (match.injected === 'full') {
      const body = await skillCatalog.getSkillPrompt(match.name).catch(() => '');
      contextBlocks.push(`## ${match.name}\n${body.slice(0, 6000)}`);
    } else {
      contextBlocks.push(`## ${match.name}\n${match.description}\nReason: ${match.matchReason}`);
    }
  }
  return { matches: top, context: contextBlocks.join('\n\n') };
}

export async function assembleAgentContext(action: AgentActionRecord): Promise<AgentContextBundle> {
  await ensureNativeToolsRegistered();

  const [mission, task, agent, artifacts, approvals, events] = await Promise.all([
    dbClient.queryOne<any>(`SELECT * FROM Missions WHERE id = ?`, [action.missionId]),
    action.taskId ? dbClient.queryOne<any>(`SELECT * FROM Tasks WHERE id = ?`, [action.taskId]) : Promise.resolve(null),
    dbClient.queryOne<any>(`SELECT * FROM Agents WHERE id = ?`, [action.agentId]),
    dbClient.query<any>(`SELECT id, title, type, content, quality_status, evidence_refs FROM Artifacts WHERE mission_id = ? ORDER BY created_at DESC LIMIT 12`, [action.missionId]),
    dbClient.query<any>(`SELECT id, action, risk_level, status, reason FROM Approvals WHERE mission_id = ? ORDER BY rowid DESC LIMIT 12`, [action.missionId]),
    dbClient.query<any>(`SELECT event_type, actor_id, summary, metadata, timestamp FROM Event_Log WHERE mission_id = ? ORDER BY timestamp DESC LIMIT 16`, [action.missionId]),
  ]);

  const language = detectLanguage(artifacts);
  const framework = detectFramework(artifacts);
  const contextKind = action.capability.includes('workspace') || action.capability.includes('execute') ? 'frontend' : 'code-review';
  const packs = await guidelinePackService.select({ language, framework, context: contextKind });
  const guidelineContext = guidelinePackService.composeReviewContext(packs);
  const memoryContext = await memorySectionService.composePromptContext(action.missionId);
  const skillSelection = await findSkillMatches(action);
  const tools = toolRegistry.getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    requiredTier: tool.requiredTier,
    riskLevel: tool.riskLevel,
  }));

  return {
    mission: mission || { id: action.missionId },
    task,
    agent,
    action,
    memoryContext,
    guidelineContext,
    recentTranscript: events.map((event) => {
      const metadata = safeJson<Record<string, unknown>>(event.metadata, {});
      return `[${event.timestamp}] ${event.actor_id || 'system'} ${event.event_type}: ${event.summary}${metadata.detail ? ` - ${metadata.detail}` : ''}`;
    }).join('\n'),
    artifacts,
    approvals,
    tools,
    skillContext: skillSelection.context,
    skillMatches: skillSelection.matches,
    injectedSections: [
      'mission',
      task ? 'task' : '',
      agent ? 'agent' : '',
      memoryContext ? 'memory_sections' : '',
      guidelineContext ? 'guideline_packs' : '',
      skillSelection.matches.length ? 'matching_skill_summaries' : '',
      'tool_manifest',
      'recent_transcript',
      persona ? 'agent_persona' : '',
    ].filter(Boolean),
  };
}
