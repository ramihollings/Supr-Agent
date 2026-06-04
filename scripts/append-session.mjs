// Append missing code to agent-session.ts
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/agent-session.ts';
let src = readFileSync(target, 'utf-8');

// Find the end of the truncated comment - we need to remove the partial comment and add a complete one
// The file currently ends with: "A reflection step is appended at" (no closing)
const marker = 'A reflection step is appended at';
const markerIdx = src.indexOf(marker);
if (markerIdx === -1) {
    console.error('Marker not found');
    process.exit(1);
}

// Keep everything up to and including the marker
const truncated = src.substring(0, src.indexOf('/**\n * Helper:', markerIdx));
// Wait - we want to keep up to the START of the truncated comment
const helperStart = src.lastIndexOf('/**', markerIdx);
const before = src.substring(0, helperStart);

// Append the complete helper plus closing
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
console.log('Last 200 chars:', (before + suffix).slice(-200));
