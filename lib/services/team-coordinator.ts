/**
 * Team coordinator for the `spawn_subagent_team` tool.
 *
 * The coordinator is a Supr sub-agent that:
 *   1. Synthesizes a shared team brief from the caller's objective.
 *   2. Seeds `Team_Context` with that brief so every member starts
 *      from the same page.
 *   3. Runs the always-required members (QA, Planner, Research) +
 *      the caller-supplied extras, in parallel (pipeline mode) or
 *      in a planner-first / parallel-rest sequence (chain mode).
 *   4. Mediates inter-agent messages: members can post a question
 *      addressed to a specific peer (or to "*") and the coordinator
 *      re-injects relevant answers into the next run.
 *   5. Reduces the per-member results into a single team report
 *      with a SHA-256 checksum the operator can compare against
 *      the runtime event log.
 *
 * The coordinator is intentionally synchronous in its happy path
 * (wait for all members → reduce). A future async/callback mode
 * could stream results to Mission Control while the team is still
 * running, but the schema already supports it (Team_Messages and
 * Team_Context rows are written incrementally).
 */
import crypto from 'node:crypto';
import { getActiveProvider } from '@/lib/providers/model';
import dbClient from '@/lib/database/db_client';
import { AgentLifecycleManager } from '@/lib/services/agent-lifecycle';
import { assembleSubagentContext } from '@/lib/context/budget';
import { addActivityLog, addArtifact } from '@/lib/db';
import { notifyTeamEvent } from '@/lib/events/team-bus';
import { parseStructuredMemberOutput } from '@/lib/ide/team-parser';

export type TeamSlot = 'qa' | 'planner' | 'research' | 'supervisor' | 'extra';

export type TeamCoordinationMode = 'pipeline' | 'chain';

// Lightweight retry helper for transient LLM failures. We retry
// once on any error that looks like a transient provider hiccup
// (timeout, 5xx, network reset). The retry waits `baseMs` (default
// 800ms) and doubles. We do NOT retry on parse errors, validation
// errors, or explicit 4xx responses — those won't get better.
async function withProviderRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseMs?: number; label?: string } = {}): Promise<T> {
  const retries = opts.retries ?? 1;
  const baseMs = opts.baseMs ?? 800;
  let attempt = 0;
  let lastErr: any;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const message = String(err?.message ?? err ?? '');
      const transient = /timeout|ETIMEDOUT|ECONNRESET|ENOTFOUND|429|5\d\d|rate.?limit|overloaded|service.?unavailable/i.test(message);
      if (!transient || attempt === retries) break;
      const wait = baseMs * Math.pow(2, attempt);
      console.warn(`[TeamCoordinator] ${opts.label ?? 'provider'} call failed (attempt ${attempt + 1}/${retries + 1}), retrying in ${wait}ms: ${message.slice(0, 160)}`);
      await new Promise((r) => setTimeout(r, wait));
      attempt += 1;
    }
  }
  throw lastErr;
}

export interface TeamMemberSpec {
  slot: TeamSlot;
  name: string;
  role: string;
  task: string;
  permissionTier: 'Observe' | 'Draft' | 'Edit' | 'Execute' | 'External_Act' | 'Root';
  tools: string[];
  targetFiles?: string[];
}

export interface TeamRunInput {
  teamId: string;
  missionId: string;
  name: string;
  sharedBrief: string;
  coordinationMode: TeamCoordinationMode;
  members: TeamMemberSpec[];
}

export interface TeamRunResult {
  teamId: string;
  status: 'completed' | 'failed';
  brief: string;
  memberResults: Array<{
    memberId: string;
    slot: TeamSlot;
    name: string;
    role: string;
    status: 'completed' | 'failed';
    output: string;
    error?: string;
    contextKeysWritten: string[];
  }>;
  coordinatorSummary: string;
  checksum: string;
  startedAt: string;
  completedAt: string;
}

const TIER_RANK: Record<TeamMemberSpec['permissionTier'], number> = {
  Observe: 1,
  Draft: 2,
  Edit: 3,
  Execute: 4,
  External_Act: 5,
  Root: 6,
};

function isSafePath(p: string): boolean {
  return !p.startsWith('/') && !p.includes('..');
}

function detectFileOverlap(members: TeamMemberSpec[]): string[] {
  const byFile = new Map<string, string[]>();
  const conflicts: string[] = [];
  for (const m of members) {
    for (const file of m.targetFiles ?? []) {
      if (!isSafePath(file)) {
        conflicts.push(`Member '${m.name}' targets unsafe path '${file}'.`);
        continue;
      }
      const list = byFile.get(file) ?? [];
      list.push(m.name);
      byFile.set(file, list);
    }
  }
  for (const [file, owners] of byFile.entries()) {
    if (owners.length > 1) {
      conflicts.push(`File '${file}' is targeted by ${owners.join(' and ')}; team members must not overlap.`);
    }
  }
  return conflicts;
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function checksumResult(parts: Record<string, unknown>): string {
  return crypto.createHash('sha256').update(JSON.stringify(parts, Object.keys(parts).sort())).digest('hex');
}

async function writeContext(teamId: string, key: string, value: string, updatedBy: string): Promise<void> {
  await dbClient.execute(
    `INSERT INTO Team_Context (team_id, key, value, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(team_id, key) DO UPDATE SET
         value = excluded.value,
         updated_by = excluded.updated_by,
         updated_at = excluded.updated_at`,
    [teamId, key, value, updatedBy, new Date().toISOString()],
  );
}

async function readContext(teamId: string): Promise<Record<string, string>> {
  const rows = await dbClient
    .query<{ key: string; value: string }>(`SELECT key, value FROM Team_Context WHERE team_id = ?`, [teamId])
    .catch(() => [] as any[]);
  return Object.fromEntries((rows || []).map((r) => [r.key, r.value]));
}

async function postMessage(teamId: string, fromMemberId: string, toMemberId: string, kind: string, body: string): Promise<void> {
  await dbClient.execute(
    `INSERT INTO Team_Messages (id, team_id, from_member_id, to_member_id, kind, body, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [newId('msg'), teamId, fromMemberId, toMemberId, kind, body, new Date().toISOString()],
  );
}

async function fetchMessagesFor(teamId: string, memberId: string): Promise<Array<{ from: string; body: string; created_at: string }>> {
  const rows = await dbClient
    .query<{ from_member_id: string; body: string; created_at: string }>(
      `SELECT from_member_id, body, created_at FROM Team_Messages
        WHERE team_id = ? AND (to_member_id = ? OR to_member_id = '*')
        ORDER BY created_at ASC`,
      [teamId, memberId],
    )
    .catch(() => [] as any[]);
  return (rows || []).map((r) => ({ from: r.from_member_id, body: r.body, created_at: r.created_at }));
}

async function insertMember(spec: TeamMemberSpec & { teamId: string; memberId: string }): Promise<void> {
  await dbClient.execute(
    `INSERT INTO Team_Members (
        member_id, team_id, slot, name, role, task, permission_tier, tools, target_files, status, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    [
      spec.memberId,
      spec.teamId,
      spec.slot,
      spec.name,
      spec.role,
      spec.task,
      spec.permissionTier,
      JSON.stringify(spec.tools ?? []),
      JSON.stringify(spec.targetFiles ?? []),
      new Date().toISOString(),
    ],
  );
}

async function updateMember(memberId: string, fields: { status?: string; result?: string | null; error?: string | null; completed_at?: string | null }): Promise<void> {
  const set: string[] = [];
  const args: unknown[] = [];
  if (fields.status !== undefined) { set.push('status = ?'); args.push(fields.status); }
  if (fields.result !== undefined) { set.push('result = ?'); args.push(fields.result); }
  if (fields.error !== undefined) { set.push('error = ?'); args.push(fields.error); }
  if (fields.completed_at !== undefined) { set.push('completed_at = ?'); args.push(fields.completed_at); }
  if (set.length === 0) return;
  args.push(memberId);
  await dbClient.execute(`UPDATE Team_Members SET ${set.join(', ')} WHERE member_id = ?`, args);
}

async function runOneMember(
  spec: TeamMemberSpec & { teamId: string; missionId: string; memberId: string }
): Promise<{ memberId: string; slot: TeamSlot; name: string; role: string; status: 'completed' | 'failed'; output: string; error?: string; contextKeysWritten: string[] }> {
  const startedAt = new Date().toISOString();
  await updateMember(spec.memberId, { status: 'running' });
  await postMessage(spec.teamId, spec.memberId, '*', 'status', `${spec.name} started: ${spec.task.slice(0, 80)}`);
  let output = '';
  let writtenKeys: string[] = [];
  try {
    const provider = await getActiveProvider('sub');
    const ctx = await assembleSubagentContext({ missionId: spec.missionId, task: spec.task });
    const shared = await readContext(spec.teamId);
    const sharedBrief = shared['brief'] ?? '';
    const inbox = await fetchMessagesFor(spec.teamId, spec.memberId);
    const inboxText = inbox.length > 0
      ? `## Inbox (${inbox.length} messages from teammates)\n` + inbox.map((m) => `- from ${m.from}: ${m.body.slice(0, 200)}`).join('\n')
      : '';
    const prompt = [
      `You are ${spec.name}, the ${spec.role} on a sub-agent team.`,
      ``,
      `## Shared team brief`,
      sharedBrief || '(no brief written yet)',
      ``,
      `## Your task`,
      spec.task,
      ``,
      `## Shared team context (other members may have written this)`,
      Object.entries(shared).filter(([k]) => k !== 'brief').map(([k, v]) => `- ${k}: ${String(v).slice(0, 240)}`).join('\n') || '(empty)',
      ``,
      inboxText,
      ``,
      `## Available tools: [${(spec.tools ?? []).join(', ')}]`,
      ``,
      `## Output format`,
      `Respond with two parts:`,
      `1. <work>your detailed solution</work>`,
      `2. <context>key=value pairs, one per line, that you want to write to shared team context</context>`,
      `Limit the total response to 6000 characters.`,
    ].join('\n');
    const response = await withProviderRetry(
      () => provider.generateContent(prompt, {
        systemInstruction: `You are ${spec.name}, acting as the ${spec.role}. Provide a detailed, premium solution. Only respond with original, high-quality work.`,
      }),
      { label: `member:${spec.name}` },
    );
    output = response;
    // Parse the structured payload. The parser is tolerant of
    // JSON, fenced JSON, legacy <work>/<context> tags, and
    // free-form prose (in which case the whole response is work).
    const parsed = parseStructuredMemberOutput(response);
    const work = parsed.work;
    const writtenKeys: string[] = [];
    for (const [key, value] of Object.entries(parsed.context)) {
      await writeContext(spec.teamId, key, value, spec.memberId);
      writtenKeys.push(key);
    }
    await updateMember(spec.memberId, {
      status: 'completed',
      result: work.slice(0, 32_000),
      completed_at: new Date().toISOString(),
    });
    await postMessage(spec.teamId, spec.memberId, '*', 'output', `${spec.name} finished: ${work.slice(0, 160)}`);
    notifyTeamEvent({
      teamId: spec.teamId,
      missionId: (spec as any).missionId ?? null,
      name: (spec as any).teamName ?? '',
      reason: 'team_progress',
      payload: {
        memberId: spec.memberId,
        memberName: spec.name,
        slot: spec.slot,
        status: 'completed',
        contextKeysWritten: writtenKeys,
        outputPreview: work.slice(0, 200),
      },
    });
    return { memberId: spec.memberId, slot: spec.slot, name: spec.name, role: spec.role, status: 'completed', output: work, contextKeysWritten: writtenKeys };
  } catch (error: any) {
    await updateMember(spec.memberId, {
      status: 'failed',
      error: error.message || String(error),
      completed_at: new Date().toISOString(),
    });
    await postMessage(spec.teamId, spec.memberId, '*', 'error', `${spec.name} failed: ${error.message || error}`);
    // Publish a per-member progress event so the SSE stream can
    // surface a live "X of Y members done" bar in Mission Control.
    // The `total` is filled in by TeamCoordinator.run via a
    // post-hoc patch (we don't know it here) -- the SSE handler
    // is tolerant of unknown total.
    notifyTeamEvent({
      teamId: spec.teamId,
      missionId: (spec as any).missionId ?? null,
      name: (spec as any).teamName ?? '',
      reason: 'team_progress',
      payload: {
        memberId: spec.memberId,
        memberName: spec.name,
        slot: spec.slot,
        status: 'failed',
        error: error.message || String(error),
      },
    });
    return { memberId: spec.memberId, slot: spec.slot, name: spec.name, role: spec.role, status: 'failed', output: '', error: error.message || String(error), contextKeysWritten: writtenKeys };
  }
}

export class TeamCoordinator {
  /**
   * Public entry point. Validates the team, runs the always-included
   * members (qa, planner, research) plus the caller's extras, and
   * returns a structured TeamRunResult.
   */
  static async run(input: TeamRunInput): Promise<TeamRunResult> {
    const startedAt = new Date().toISOString();
    if (!input.members.find((m) => m.slot === 'qa')) throw new Error('Team must include a QA agent.');
    if (!input.members.find((m) => m.slot === 'planner')) throw new Error('Team must include a Planner agent.');
    if (!input.members.find((m) => m.slot === 'research')) throw new Error('Team must include a Research agent.');
    if (!input.members.find((m) => m.slot === 'supervisor')) throw new Error('Team must include a Supr sub-agent supervisor.');

    const overlap = detectFileOverlap(input.members);
    if (overlap.length > 0) {
      throw new Error(`Team file-overlap check failed: ${overlap.join('; ')}`);
    }
    const highestTier = input.members.reduce<number>((acc, m) => Math.max(acc, TIER_RANK[m.permissionTier] ?? 0), 0);
    const supervisor = input.members.find((m) => m.slot === 'supervisor')!;

    // Persist the team run
    await dbClient.execute(
      `INSERT INTO Team_Runs (
         team_id, mission_id, name, supervisor_member_id, shared_brief, coordination_mode,
         status, member_count, checksum, started_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)`,
      [
        input.teamId,
        input.missionId,
        input.name,
        '', // will be filled after the supervisor member is inserted
        input.sharedBrief,
        input.coordinationMode,
        input.members.length,
        checksumResult({ name: input.name, members: input.members.map((m) => m.name) }),
        startedAt,
      ],
    );
    await writeContext(input.teamId, 'brief', input.sharedBrief, supervisor.name);

    // Insert member rows
    for (const m of input.members) {
      const memberId = newId(`${m.slot}-m`);
      const enriched = { ...m, teamId: input.teamId, memberId };
      await insertMember(enriched);
      if (m.slot === 'supervisor') {
        await dbClient.execute(`UPDATE Team_Runs SET supervisor_member_id = ? WHERE team_id = ?`, [memberId, input.teamId]);
      }
    }

    // Coordination mode:
    //   - 'pipeline' (default): every member fires in parallel.
    //   - 'chain': the Planner member runs FIRST, alone, and the
    //     rest of the team starts only after the Planner writes
    //     to the shared Team_Context. This is the mode you want
    //     when downstream work depends on an upfront plan; in
    //     'pipeline' mode every member would have started with
    //     empty context and made the planner's work irrelevant.
    const planner = input.members.find((m) => m.slot === 'planner');
    const others = input.members.filter((m) => m.slot !== 'planner');
    // runMemberOnce: hire + run a single member, return a
    // normalized result. Used for both 'pipeline' (concurrent
    // fan-out) and 'chain' (planner-first gating) modes.
    const runMemberOnce = async (m: typeof input.members[number]) => {
      const memberId = (await dbClient.query<{ member_id: string }>(
        `SELECT member_id FROM Team_Members WHERE team_id = ? AND name = ? AND slot = ? LIMIT 1`,
        [input.teamId, m.name, m.slot],
      ) as any[])[0]?.member_id;
      if (!memberId) {
        return { ok: false as const, error: `No member_id for ${m.name} (${m.slot}).` };
      }
      await AgentLifecycleManager.hireAgent(
        input.missionId,
        memberId,
        m.name,
        m.role,
        m.permissionTier,
        m.tools,
        `Team member of '${input.name}': ${m.task}`,
      ).catch(() => 'unavailable');
      try {
        const result = await runOneMember({ ...m, teamId: input.teamId, missionId: input.missionId, memberId });
        return { ok: true as const, result, memberId };
      } finally {
        await AgentLifecycleManager.terminateAgent(input.missionId, memberId, m.name).catch(() => {});
      }
    };
    // Helper: aggregate a list of settled-runner results into the
    // canonical `memberResults` array and update the team status.
    const collect = (settled: Awaited<ReturnType<typeof runMemberOnce>>[]) => {
      const out: Array<{ memberId: string; slot: TeamSlot; name: string; role: string; status: 'completed' | 'failed'; output: string; error?: string; contextKeysWritten: string[] }> = [];
      let teamStatus: 'completed' | 'failed' = 'completed';
      for (const s of settled) {
        if (s && 'ok' in s && s.ok) {
          out.push(s.result);
          if (s.result.status === 'failed') teamStatus = 'failed';
        } else {
          teamStatus = 'failed';
        }
      }
      return { out, teamStatus };
    };
    let memberResults: Array<{ memberId: string; slot: TeamSlot; name: string; role: string; status: 'completed' | 'failed'; output: string; error?: string; contextKeysWritten: string[] }> = [];
    let teamStatus: 'completed' | 'failed' = 'completed';

    if (input.coordinationMode === 'chain' && planner) {
      // Chain mode: run the planner first, then fire the rest in
      // parallel. The rest read the shared Team_Context for the
      // planner's output, so the upstream plan is visible to
      // every downstream member before they start.
      const plannerSettled = await runMemberOnce(planner);
      const plannerCollected = collect([plannerSettled]);
      memberResults.push(...plannerCollected.out);
      if (plannerCollected.teamStatus === 'failed') teamStatus = 'failed';

      const restSettled = await Promise.allSettled(others.map((m) => runMemberOnce(m)));
      const rest: any[] = restSettled.map((s) => (s.status === 'fulfilled' ? s.value : { ok: false as const, error: 'promise rejected' }));
      const restCollected = collect(rest);
      memberResults.push(...restCollected.out);
      if (restCollected.teamStatus === 'failed') teamStatus = 'failed';
    } else {
      // Pipeline mode: every member fires concurrently.
      const settled = await Promise.allSettled(input.members.map((m) => runMemberOnce(m)));
      const results: any[] = settled.map((s) => (s.status === 'fulfilled' ? s.value : { ok: false as const, error: 'promise rejected' }));
      const collected = collect(results);
      memberResults = collected.out;
      teamStatus = collected.teamStatus;
    }

    // Reduce: supervisor synthesizes a final team report
    const supervisorMember = memberResults.find((r) => r.slot === 'supervisor');
    const shared = await readContext(input.teamId);
    const completedMembers = memberResults.filter((m) => m.status === 'completed');
    const failedMembers = memberResults.filter((m) => m.status === 'failed');
    const summary = [
      `[Team ${input.name} Report]`,
      `Status: ${teamStatus.toUpperCase()}`,
      `Mode: ${input.coordinationMode}`,
      `Members: ${memberResults.length} (${completedMembers.length} completed, ${failedMembers.length} failed)`,
      `Highest tier requested: ${Object.entries(TIER_RANK).find(([, v]) => v === highestTier)?.[0] ?? 'Observe'}`,
      ``,
      `## Shared brief`,
      input.sharedBrief,
      ``,
      `## Shared context (final)`,
      Object.entries(shared).map(([k, v]) => `- ${k}: ${String(v).slice(0, 240)}`).join('\n') || '(empty)',
      ``,
      `## Per-member output`,
      memberResults.map((m) => `### ${m.name} (${m.role}, ${m.slot})\n${m.status === 'completed' ? m.output.slice(0, 1200) : `[failed] ${m.error}`}`).join('\n\n'),
    ].join('\n');

    // Hire a fresh provider round to summarize, but only if the
    // supervisor member produced output; otherwise fall back to the
    // mechanical summary above.
    let coordinatorSummary = summary;
    if (supervisorMember && supervisorMember.status === 'completed') {
      try {
        const provider = await getActiveProvider('sub');
        const brief = await readContext(input.teamId);
        const response = await withProviderRetry(
          () => provider.generateContent(
            [
              `You are the Supr team supervisor. The team has just completed its work.`,
              `Produce a 4-6 sentence team report that highlights: what each member delivered, `,
              `where they disagreed (if any), and what the final recommendation is for the caller.`,
              `Do NOT add a work or context block; just the report.`,
              ``,
              `## Shared brief`,
              brief['brief'] ?? '',
              ``,
              `## Per-member output`,
              memberResults.map((m) => `### ${m.name}\n${m.status === 'completed' ? m.output : `[failed] ${m.error}`}`).join('\n\n'),
            ].join('\n'),
            { systemInstruction: 'You are the Supr team supervisor. Be concise and decisive.' },
          ),
          { label: 'supervisor:reduce' },
        );
        if (response && response.trim().length > 0) {
          coordinatorSummary = [
            summary,
            ``,
            `## Supervisor summary`,
            response.trim(),
          ].join('\n');
        }
      } catch {
        // Fall back to the mechanical summary
      }
    }

    const completedAt = new Date().toISOString();
    const finalChecksum = checksumResult({
      teamId: input.teamId,
      memberIds: memberResults.map((m) => m.memberId),
      contextKeys: Object.keys(shared).sort(),
      status: teamStatus,
    });
    await dbClient.execute(
      `UPDATE Team_Runs SET status = ?, result = ?, checksum = ?, completed_at = ? WHERE team_id = ?`,
      [teamStatus, coordinatorSummary.slice(0, 64_000), finalChecksum, completedAt, input.teamId],
    );
    // Publish the run-level event. Mission Control's SSE handler
    // listens for this to flip the team chip from "running" to
    // "completed" or "failed" and to clear the live progress bar.
    notifyTeamEvent({
      teamId: input.teamId,
      missionId: input.missionId,
      name: input.name,
      reason: teamStatus === 'completed' ? 'team_completed' : 'team_failed',
      payload: {
        status: teamStatus,
        checksum: finalChecksum,
        durationMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        memberCount: memberResults.length,
        completedCount: memberResults.filter((m) => m.status === 'completed').length,
        failedCount: memberResults.filter((m) => m.status === 'failed').length,
      },
    });
    // Persist the team report as a Brief artifact so the Library,
    // downstream agents, and the project export all see it. A
    // failed run also gets an artifact (with the failure summary)
    // so the operator can still inspect what the team produced.
    try {
      await addArtifact(input.missionId, {
        type: 'markdown',
        filename: `[Team] ${input.name} (${teamStatus})`,
        content: coordinatorSummary,
      });
    } catch (artErr) {
      console.warn(`[TeamCoordinator] Failed to write team artifact for ${input.name}:`, artErr);
    }
    await addActivityLog(input.missionId, {
      eventType: teamStatus === 'completed' ? 'agent_action' : 'failure',
      actor: 'Team Coordinator',
      actorIcon: 'groups',
      summary: `Team '${input.name}' ${teamStatus} (${memberResults.length} members).`,
      detail: coordinatorSummary.slice(0, 1200),
    }).catch(() => {});

    return {
      teamId: input.teamId,
      status: teamStatus,
      brief: input.sharedBrief,
      memberResults,
      coordinatorSummary,
      checksum: finalChecksum,
      startedAt,
      completedAt,
    };
  }
}
