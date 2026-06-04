// scripts/wire-glidepath.mjs
// Phase 3A: wire agent-config/glidepath_templates/*.json to the
// project-flow planner. The templates exist and define 5-7 phase
// feature-development pipelines; the planner was ignoring them and
// using a hard-coded 4-phase preset instead.
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/project-flow.ts';
let src = readFileSync(target, 'utf-8');

// 1. Add the loader + selector helpers. We append them near the
//    top of the file (right after the existing helpers like
//    `safeJson` and `logFlowEvent`) so they're available to both
//    `buildModelProjectPlan` and `presetPlan`.
const safeJsonEnd = `function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}`;

const newHelpers = safeJsonEnd + `

// ---------------------------------------------------------------------------
// Glidepath templates — Phase 3A.
// ---------------------------------------------------------------------------

export interface GlidepathPhase {
  id: string;
  name: string;
  requiredAgents: string[];
  approvalGate: boolean;
  maxRetries?: number;
  escalateOnFailure?: boolean;
  outputs: string[];
}

export interface GlidepathTemplate {
  templateId: string;
  name: string;
  description: string;
  phases: GlidepathPhase[];
  failurePolicy: { maxRetriesPerTask: number; escalationTarget: string; onEscalation: string };
}

/**
 * Load a single glidepath template by id from
 * \`agent-config/glidepath_templates/\`. Returns null if the file is
 * missing or malformed so callers can fall back to the hard-coded
 * preset plan.
 */
export function loadGlidepathTemplate(templateId: string): GlidepathTemplate | null {
  const path = require('node:path');
  const fs = require('node:fs');
  const filePath = path.resolve(process.cwd(), 'agent-config', 'glidepath_templates', \`\${templateId}.json\`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as GlidepathTemplate;
  } catch {
    return null;
  }
}

/**
 * Heuristic: pick the best template for a given objective. The
 * \`feature_development\` template wins for objectives that mention
 * "feature", "implement", "build a", "develop"; otherwise the
 * \`default_mission\` template wins. Returning null lets the planner
 * fall back to the hard-coded preset if no template matches.
 */
export function selectGlidepathTemplateForObjective(objective: string): GlidepathTemplate | null {
  const lower = (objective || '').toLowerCase();
  if (/\\b(feature|implement|build a|develop|new feature|add a)\\b/.test(lower)) {
    return loadGlidepathTemplate('feature_development');
  }
  return loadGlidepathTemplate('default_mission');
}

/**
 * Convert a GlidepathTemplate into the PlannedWork[] shape that
 * buildModelProjectPlan consumes. The mapping is:
 *   \`requiredAgents: ['research']\`   -> \`capability: 'web_scrape'\`
 *   \`requiredAgents: ['planner']\`     -> \`capability: 'delivery_package'\`
 *   \`requiredAgents: ['code']\`        -> \`capability: 'workspace_write_artifact'\`
 *   \`requiredAgents: ['qa_critic']\`   -> \`capability: 'workspace_validate_outputs'\`
 *   \`requiredAgents: ['security']\`    -> \`capability: 'governance_review'\`
 *   \`requiredAgents: ['supr']\`        -> \`capability: 'delivery_package'\`
 * Unknown agents get \`workspace_write_artifact\` as a safe default.
 * Approval-gated phases get a higher risk level so the runtime
 * prompts the operator before executing.
 */
const PHASE_AGENT_TO_CAPABILITY: Record<string, string> = {
  research: 'web_scrape',
  planner: 'delivery_package',
  code: 'workspace_write_artifact',
  qa_critic: 'workspace_validate_outputs',
  security: 'governance_review',
  supr: 'delivery_package',
};

const PHASE_AGENT_TO_ROLE: Record<string, string> = {
  research: 'Research',
  planner: 'Planner',
  code: 'Code',
  qa_critic: 'QA',
  security: 'Security',
  supr: 'Writer',
};

const PHASE_AGENT_TO_TIER: Record<string, string> = {
  research: 'Observe',
  planner: 'Draft',
  code: 'Edit',
  qa_critic: 'Draft',
  security: 'Edit',
  supr: 'Draft',
};

export function glidepathToPlan(template: GlidepathTemplate, objective: string): PlannedWork[] {
  return template.phases.map((phase) => {
    const agentKey = phase.requiredAgents[0] || 'code';
    return {
      role: PHASE_AGENT_TO_ROLE[agentKey] || 'Code',
      agentName: \`\${PHASE_AGENT_TO_ROLE[agentKey] || 'Code'} Agent\`,
      capability: PHASE_AGENT_TO_CAPABILITY[agentKey] || 'workspace_write_artifact',
      permissionTier: (PHASE_AGENT_TO_TIER[agentKey] || 'Edit') as any,
      riskLevel: phase.approvalGate ? 'High' : 'Medium',
      phase: phase.name,
      title: \`\${phase.name}: \${objective}\`.slice(0, 240),
      inputs: {
        objective,
        phaseId: phase.id,
        requiredOutputs: phase.outputs,
        approvalGate: phase.approvalGate,
      },
      plannerSource: 'glidepath_template' as const,
    } satisfies PlannedWork;
  });
}
`;

if (src.includes(safeJsonEnd) && !src.includes('loadGlidepathTemplate')) {
    src = src.replace(safeJsonEnd, newHelpers);
}

// 2. Update buildProjectPlan() to prefer a glidepath template over
//    the hard-coded preset.
const oldBuildProjectPlan = `async function buildProjectPlan(objective: string) {
  const mode = await getRuntimeMode();
  try {
    const plan = await buildModelProjectPlan(objective, mode);
    const plannerSource: 'model' | 'preset_fallback' = plan.some((item) => item.plannerSource === 'model') ? 'model' : 'preset_fallback';
    return { mode, plannerSource, plan };
  } catch (error: any) {
    console.warn(\`[Supr] buildModelProjectPlan failed; falling back to preset plan. reason=\${error?.message || String(error)}\`);
    telemetry.warn('planner.fallback', { reason: error?.message || String(error), source: 'buildProjectPlan' });
    return { mode, plannerSource: 'preset_fallback' as const, plan: presetPlan(objective) };
  }
}`;

const newBuildProjectPlan = `async function buildProjectPlan(objective: string) {
  const mode = await getRuntimeMode();
  // Phase 3A: if a glidepath template matches the objective, use
  // it directly. Glidepath templates are deterministic and don't
  // require a model call, so we save a round-trip and the user
  // gets a structurally richer plan (5-7 phases, explicit
  // approval gates, named outputs). We still defer to the model
  // planner when the template is missing or the objective is
  // non-standard.
  const template = selectGlidepathTemplateForObjective(objective);
  if (template) {
    try {
      const plan = glidepathToPlan(template, objective);
      telemetry.info('planner.glidepath_used', { templateId: template.templateId, phaseCount: plan.length });
      return { mode, plannerSource: 'glidepath_template' as const, plan };
    } catch (error: any) {
      console.warn(\`[Supr] glidepathToPlan failed; falling through. reason=\${error?.message || String(error)}\`);
    }
  }
  try {
    const plan = await buildModelProjectPlan(objective, mode);
    const plannerSource: 'model' | 'preset_fallback' = plan.some((item) => item.plannerSource === 'model') ? 'model' : 'preset_fallback';
    return { mode, plannerSource, plan };
  } catch (error: any) {
    console.warn(\`[Supr] buildModelProjectPlan failed; falling back to preset plan. reason=\${error?.message || String(error)}\`);
    telemetry.warn('planner.fallback', { reason: error?.message || String(error), source: 'buildProjectPlan' });
    return { mode, plannerSource: 'preset_fallback' as const, plan: presetPlan(objective) };
  }
}`;

if (src.includes(oldBuildProjectPlan) && !src.includes('planner.glidepath_used')) {
    src = src.replace(oldBuildProjectPlan, newBuildProjectPlan);
}

// 3. Add a new value to the PlannerSource type. Find the existing
//    'model' | 'preset_fallback' and add 'glidepath_template'.
const oldPlannerType = `      plannerSource: 'model' | 'preset_fallback' | 'none';`;
const newPlannerType = `      plannerSource: 'model' | 'preset_fallback' | 'glidepath_template' | 'none';`;
if (src.includes(oldPlannerType)) {
    src = src.replace(oldPlannerType, newPlannerType);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: project-flow.ts glidepath templates wired');
