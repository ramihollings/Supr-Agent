// Complete the agent-session.ts file
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/agent-session.ts';
const src = readFileSync(target, 'utf-8');

// Remove the truncated trailing content (the half-written JSDoc) and append the complete version
const truncatedStart = '/**\n * Helper: build a default plan for a mission from the active';
const truncatedEnd = 'A reflection step is appended at';
const truncateIdx = src.indexOf(truncatedStart);
if (truncateIdx === -1) {
    console.error('Could not find truncated helper section');
    process.exit(1);
}
const before = src.substring(0, truncateIdx);

const suffix = `/**
 * Helper: build a default plan for a mission from the active
 * \`Agent_Actions\` queue. The plan is the natural order: pending
 * actions first, then any draft/approved actions that are still
 * running. The session runs them in that order, sharing evidence
 * across them. A reflection step is appended at the end so the
 * session audits its own final summary.
 *
 * Called by \`startProjectFlowAction\` / \`runProjectFlowAction\` to
 * upgrade the existing per-action loop to the new session shape
 * without changing the public surface of the project-flow module.
 */
import dbClient from '@/lib/database/db_client';

export async function buildSessionPlanFromMission(
  missionId: string,
  options: { withReflectionTail?: boolean } = {},
): Promise<PlanItem[]> {
  const actions = await dbClient.query<any>(
    \`SELECT id, capability, intent FROM Agent_Actions
     WHERE mission_id = ? AND status IN ('draft','approved','failed')
     ORDER BY created_at ASC, rowid ASC
     LIMIT 50\`,
    [missionId],
  );
  const plan: PlanItem[] = actions.map((a) => ({
    kind: 'agent_action' as const,
    actionId: a.id,
    label: a.intent || a.capability,
  }));
  if (options.withReflectionTail !== false) {
    plan.push({
      kind: 'reflection',
      label: 'Final audit',
      basedOn: 'last_final',
    });
  }
  return plan;
}
`;

writeFileSync(target, before + suffix, 'utf-8');
console.log('OK: agent-session.ts completed');
