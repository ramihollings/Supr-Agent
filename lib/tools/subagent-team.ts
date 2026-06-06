import { z } from 'zod';
import crypto from 'node:crypto';
import { toolRegistry, type ToolDefinition } from './registry';
import { TeamCoordinator, type TeamMemberSpec, type TeamCoordinationMode } from '@/lib/services/team-coordinator';

/**
 * `spawn_subagent_team` — run a coordinated sub-agent team with a
 * shared working memory and inter-agent message bus.
 *
 * Every team always includes:
 *   - A QA Agent  (slot: 'qa')        — final acceptance pass
 *   - A Planner   (slot: 'planner')   — breaks the brief into a plan
 *   - A Researcher (slot: 'research') — gathers external context
 *   - A Supr sub-agent (slot: 'supervisor') — synthesizes the final
 *     team report and resolves disagreements
 *
 * The caller can add any number of `extra` members (e.g. Code
 * Extractor, Spec Writer, Demo Builder) in the `members` array. The
 * tool pre-validates the team shape (all four required slots
 * present, no file overlap, every tool name lowercase + a-z0-9_),
 * then delegates execution to `TeamCoordinator.run`.
 *
 * Coordination modes:
 *   - 'pipeline'  — every member runs in parallel; supervisor
 *                   reduces. Cheapest, best for independent briefs.
 *   - 'chain'     — Planner runs first, then everyone else in
 *                   parallel using the planner's output as shared
 *                   context. Best when the work needs an upfront
 *                   plan before downstream work begins.
 */
const TeamMemberInput = z.object({
  name: z.string().min(1).max(120),
  role: z.string().min(1).max(200),
  task: z.string().min(1).max(32_000),
  permissionTier: z.enum(['Observe', 'Draft', 'Edit', 'Execute', 'External_Act', 'Root']).default('Observe'),
  tools: z.array(z.string()).default([]),
  targetFiles: z.array(z.string()).default([]),
});

const SpawnSubagentTeamParams = z.object({
  name: z.string().min(1).max(120).describe('Human-readable team name, e.g. "Stitch Spec Audit Squad".'),
  sharedBrief: z.string().min(1).max(16_000).describe('A short, shared mission brief that every member sees.'),
  coordinationMode: z.enum(['pipeline', 'chain']).default('pipeline').describe('How members are scheduled.'),
  missionId: z.string().optional().describe('Optional mission ID context; defaults to an ephemeral team mission.'),
  members: z.array(TeamMemberInput).default([]).describe('Caller-supplied extras (Code, Spec, Demo, etc.).'),
});

type SpawnSubagentTeamParamsType = z.infer<typeof SpawnSubagentTeamParams>;

export const spawnSubagentTeamTool: ToolDefinition<SpawnSubagentTeamParamsType, string> = {
  name: 'spawn_subagent_team',
  description:
    'Spawns a coordinated sub-agent team with QA, Planner, Research, and a Supr supervisor. Members share a working memory (Team_Context) and a message bus (Team_Messages).',
  parameters: SpawnSubagentTeamParams,
  requiredTier: 'Edit',
  riskLevel: 'Medium',
  execute: async (params) => {
    const teamId = `team-${crypto.randomUUID()}`;
    const missionId = params.missionId || `team-mission-${teamId}`;

    // Build the required members. We pre-seed their tasks from the
    // shared brief so the caller doesn't have to repeat themselves.
    const required: TeamMemberSpec[] = [
      {
        slot: 'planner',
        name: 'Planner Agent',
        role: 'Sub-agent Planner',
        task: `Break down the following brief into a 3-6 step plan, with explicit dependencies and the success criteria for each step.\n\nBrief: ${params.sharedBrief}`,
        permissionTier: 'Draft',
        tools: ['todo', 'read_workspace_file'],
        targetFiles: [],
      },
      {
        slot: 'research',
        name: 'Research Agent',
        role: 'Sub-agent Research',
        task: `Gather the external context (URLs, citations, competitor signals) that the team needs to deliver the brief.\n\nBrief: ${params.sharedBrief}`,
        permissionTier: 'External_Act',
        tools: ['web_search', 'web_scrape'],
        targetFiles: [],
      },
      {
        slot: 'qa',
        name: 'QA Agent',
        role: 'Sub-agent Quality Assurance',
        task: `Define the acceptance criteria and review checklist for the team's output.\n\nBrief: ${params.sharedBrief}`,
        permissionTier: 'Draft',
        tools: ['read_workspace_file'],
        targetFiles: [],
      },
      {
        slot: 'supervisor',
        name: 'Supr Team Supervisor',
        role: 'Sub-agent Supervisor',
        task: `After the other members complete, synthesize the team's work into a single short report. Highlight disagreements, recommend the final decision, and record it to the shared team context under the key 'final_recommendation'.\n\nBrief: ${params.sharedBrief}`,
        permissionTier: 'Edit',
        tools: ['todo'],
        targetFiles: [],
      },
    ];

    // Caller-supplied extras. Each becomes a 'extra' slot. We do a
    // soft semantic-route pass so the LLM output (if any) can later
    // see the route hint, but we don't auto-promote the tier — the
    // caller is responsible for the permission they grant.
    const extras: TeamMemberSpec[] = (params.members || []).map((m) => ({
      slot: 'extra',
      name: m.name,
      role: m.role,
      task: m.task,
      permissionTier: m.permissionTier,
      tools: m.tools || [],
      targetFiles: m.targetFiles || [],
    }));

    const allMembers = [...required, ...extras];

    // Two-phase commit (mirrors `spawn_subagent`):
    //   Phase 1: build the team shape + checksum.
    //   Phase 2: audit (always-required slots, no file overlap, safe
    //            paths, valid tool names).
    const checksum = crypto
      .createHash('sha256')
      .update(JSON.stringify({
        name: params.name,
        brief: params.sharedBrief,
        members: allMembers.map((m) => ({ slot: m.slot, name: m.name, role: m.role })),
      }))
      .digest('hex');

    const audit = auditTeam(allMembers);
    if (!audit.ok) {
      throw new Error(`Team intent rejected: ${audit.reason}`);
    }

    const coordinationMode: TeamCoordinationMode = params.coordinationMode;
    const result = await TeamCoordinator.run({
      teamId,
      missionId,
      name: params.name,
      sharedBrief: params.sharedBrief,
      coordinationMode,
      members: allMembers,
    });

    return [
      `[Team ${params.name} Report]`,
      `Team ID: ${result.teamId}`,
      `Status: ${result.status.toUpperCase()}`,
      `Coordination: ${coordinationMode}`,
      `Members: ${result.memberResults.length}`,
      `Pre-execution checksum: ${checksum.slice(0, 12)}`,
      `Post-execution checksum: ${result.checksum.slice(0, 12)}`,
      ``,
      result.coordinatorSummary,
    ].join('\n');
  },
};

function auditTeam(members: TeamMemberSpec[]): { ok: boolean; reason?: string } {
  const required: Array<TeamMemberSpec['slot']> = ['qa', 'planner', 'research', 'supervisor'];
  for (const slot of required) {
    if (!members.find((m) => m.slot === slot)) {
      return { ok: false, reason: `Team is missing the required '${slot}' member.` };
    }
  }
  const fileOwners = new Map<string, string[]>();
  for (const m of members) {
    for (const tool of m.tools) {
      if (tool !== tool.toLowerCase() || !/^[a-z0-9_]+$/.test(tool)) {
        return { ok: false, reason: `Tool name '${tool}' on member '${m.name}' must be lowercase a-z0-9_.` };
      }
    }
    for (const file of m.targetFiles || []) {
      if (file.startsWith('/') || file.includes('..')) {
        return { ok: false, reason: `Member '${m.name}' targets unsafe path '${file}'.` };
      }
      const owners = fileOwners.get(file) ?? [];
      owners.push(m.name);
      fileOwners.set(file, owners);
    }
  }
  for (const [file, owners] of fileOwners.entries()) {
    if (owners.length > 1) {
      return { ok: false, reason: `File '${file}' is targeted by ${owners.join(' and ')}; team members must not overlap.` };
    }
  }
  return { ok: true };
}

toolRegistry.registerTool(spawnSubagentTeamTool);
export default spawnSubagentTeamTool;
