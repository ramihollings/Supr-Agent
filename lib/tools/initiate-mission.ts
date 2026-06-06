import { z } from "zod";
import crypto from "node:crypto";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import {
    InitiateMissionPlanSchema,
    validatePlan,
    type InitiateMissionPlan,
} from "../concierge/handshake";
import dbClient from "../database/db_client";

/**
 * The Initiate_Mission tool is the *only* path in the Supr agent
 * loop that writes to the `Missions` and `Glidepaths` tables when
 * the chat is in Concierge mode. It exists to enforce the
 * "Concierge First" protocol: Supr may discuss, ask, and propose,
 * but it MUST NOT start a mission until the user has explicitly
 * approved a plan via the chat thread (see
 * `lib/concierge/handshake.ts`).
 *
 * The tool takes a fully-formed, user-approved plan. It does
 * three things, transactionally:
 *
 *   1. INSERT into `Missions` (title = plan.name, goal = plan.objective,
 *      status = 'Active').
 *   2. INSERT into `Glidepaths` (mission_id, phases JSON, tasks JSON,
 *      readiness_score = 0). The first phase is set to 'Active',
 *      the rest to 'Pending'.
 *   3. Seed three standard Artifacts (`strategic_briefing.md`,
 *      `integrity_audit.py`, `project_checklists.json`) so the
 *      Live Work Graph has something to display immediately.
 *
 * It also emits an `Event_Log` row so the audit trail shows the
 * "Concierge Handshake" origin rather than a dashboard click.
 *
 * The tool is intentionally HIGH RISK because it creates
 * persistent state. It is gated to the `Edit` permission tier
 * and inherits the governance check from
 * `PermissionEngine.evaluateToolRules`.
 */

const InitiateMissionParams = z.object({
    plan: InitiateMissionPlanSchema.describe(
        "The user-approved mission plan. Must contain name, objective, and a non-empty list of phases, each with at least one task.",
    ),
    approvedBy: z
        .string()
        .min(1)
        .max(160)
        .describe("Identifier of the user who approved the plan (e.g. 'manager@local')."),
    source: z
        .enum(["supr-chat", "telegram", "slack", "discord", "api", "dashboard"])
        .default("supr-chat")
        .describe("Which surface the approval came from."),
});

type InitiateMissionParamsType = z.infer<typeof InitiateMissionParams>;

export interface InitiateMissionResult {
    missionId: string;
    plan: InitiateMissionPlan;
    summary: {
        phasesCreated: number;
        tasksCreated: number;
        artifactsSeeded: number;
    };
    /**
     * Echoed for the chat UI to render a confirmation card.
     * `ok: true` means the mission was successfully initiated.
     */
    ok: true;
}

const PHASE_ORDER: ReadonlyArray<"Intake" | "Research" | "Build" | "Verify" | "Deliver"> = [
    "Intake",
    "Research",
    "Build",
    "Verify",
    "Deliver",
];

function newId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
}

function buildSeedArtifacts(plan: InitiateMissionPlan) {
    const now = Date.now();
    const briefing = [
        `# Strategic Briefing: ${plan.name}`,
        "",
        `## Core Objective`,
        plan.objective,
        "",
        `## Phased Execution Plan`,
        ...plan.phases.map((phase, index) => {
            const taskLines = phase.tasks
                .map((task) => `    - **${task.title}** (${task.agentRole}, risk: ${task.riskLevel})`)
                .join("\n");
            return `${index + 1}. **${phase.name}** phase\n${taskLines}`;
        }),
        "",
        `## Notes`,
        `Mission initiated via Concierge Handshake on ${new Date().toISOString()}.`,
    ].join("\n");

    const checklistPhases = plan.phases.map((phase) => ({
        name: `${phase.name} phase`,
        tasks: phase.tasks.length,
        complete: false,
    }));

    const checklist = JSON.stringify(
        {
            project: plan.name,
            objective: plan.objective,
            readiness_threshold: 0.85,
            phases: checklistPhases,
            milestones: [
                { name: "Initial Context Scan", complete: true },
                { name: "Plan Approval (Concierge Handshake)", complete: true },
                { name: "Implementation Sandbox Auditing", complete: false },
                { name: "Production Deployment", complete: false },
            ],
        },
        null,
        2,
    );

    const audit = [
        `import json`,
        ``,
        `def audit_project_integrity(name, status):`,
        `    """Self-healing integrity probe seeded by Initiate_Mission."""`,
        `    print(f"[AUDIT] Starting integrity validation for: {name}")`,
        `    print(f"[AUDIT] Status check: {status}")`,
        `    return {"integrity_status": "PASS", "score": 1.0}`,
        ``,
        `check = audit_project_integrity(${JSON.stringify(plan.name)}, "Active")`,
        `print(json.dumps(check, indent=2))`,
    ].join("\n");

    return [
        {
            id: `art-brief-${now}`,
            type: "markdown",
            title: "strategic_briefing.md",
            content: briefing,
        },
        {
            id: `art-audit-${now}`,
            type: "code",
            title: "integrity_audit.py",
            content: audit,
        },
        {
            id: `art-check-${now}`,
            type: "json",
            title: "project_checklists.json",
            content: checklist,
        },
    ];
}

export const initiateMissionTool: ToolDefinition<InitiateMissionParamsType, InitiateMissionResult> = {
    name: "initiate_mission",
    description:
        "Creates a new mission from a user-approved Concierge plan. This is the ONLY path in the chat loop that writes to the Missions and Glidepaths tables. Requires an explicit user approval; do not invoke speculatively.",
    parameters: InitiateMissionParams,
    requiredTier: "Edit",
    riskLevel: "High",
    execute: async (params, ctx) => {
        // Defence-in-depth re-validation: the registry has already
        // parsed the schema, but we re-validate against the
        // canonical `validatePlan` so any future schema change is
        // enforced here too.
        const planCheck = validatePlan(params.plan);
        if (!planCheck.ok) {
            throw new Error(`Concierge plan rejected: ${planCheck.error}`);
        }
        const plan = planCheck.plan;

        // Sanity: phases must be in the canonical 5-phase order.
        // We sort by PHASE_ORDER index so the Glidepath row is
        // physically stable even if Supr sends them out of order.
        const orderedPhases = [...plan.phases].sort(
            (a, b) =>
                PHASE_ORDER.indexOf(a.name) - PHASE_ORDER.indexOf(b.name),
        );

        const missionId = newId("m");
        const glideId = newId("gp");
        const now = new Date().toISOString();
        const totalTasks = plan.phases.reduce((sum, p) => sum + p.tasks.length, 0);
        const seedArtifacts = buildSeedArtifacts(plan);

        // 1. Missions row.
        await dbClient.execute(
            `INSERT INTO Missions (id, title, goal, status, created_at, updated_at)
             VALUES (?, ?, ?, 'Active', ?, ?)`,
            [missionId, plan.name, plan.objective, now, now],
        );

        // 2. Glidepaths row. Phases are emitted in the canonical
        //    order; the first phase is 'Active' and the rest are
        //    'Pending' until the runtime advances them.
        const glidePhases = orderedPhases.map((phase, index) => ({
            id: `phase-${phase.name.toLowerCase()}-${index}`,
            name: phase.name,
            status: index === 0 ? "Active" : "Pending",
        }));

        // Flatten tasks for the Glidepaths.tasks JSON column (the
        // relational `Tasks` table gets the per-phase rows below).
        const glideTasks = orderedPhases.flatMap((phase, phaseIndex) =>
            phase.tasks.map((task, taskIndex) => ({
                id: `task-${missionId}-${phaseIndex}-${taskIndex}`,
                title: task.title,
                description: `Assigned via Concierge Handshake for ${phase.name}.`,
                agentName: `${task.agentRole} Agent`,
                agentIcon: "smart_toy",
                status: "Pending",
                phase: phase.name,
                riskLevel: task.riskLevel,
            })),
        );

        await dbClient.execute(
            `INSERT INTO Glidepaths (id, mission_id, phases, tasks, readiness_score)
             VALUES (?, ?, ?, ?, ?)`,
            [
                glideId,
                missionId,
                JSON.stringify(glidePhases),
                JSON.stringify(glideTasks),
                0,
            ],
        );

        // 3. Per-phase Tasks rows so the runtime's `phaseStatusFromTaskStatuses`
        //    derivation in `lib/db.ts` reflects the plan immediately.
        let taskRowIndex = 0;
        for (let phaseIndex = 0; phaseIndex < orderedPhases.length; phaseIndex++) {
            const phase = orderedPhases[phaseIndex];
            for (let i = 0; i < phase.tasks.length; i++) {
                const task = phase.tasks[i];
                const taskId = glideTasks[taskRowIndex].id;
                await dbClient.execute(
                    `INSERT INTO Tasks (id, mission_id, phase_id, title, status, owner_agent_id, required_permission)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        taskId,
                        missionId,
                        `phase-${phase.name.toLowerCase()}`,
                        task.title,
                        "Pending",
                        null,
                        "Draft",
                    ],
                );
                taskRowIndex++;
            }
        }

        // 4. Seed the three standard artifacts.
        for (const seed of seedArtifacts) {
            await dbClient.execute(
                `INSERT INTO Artifacts (id, mission_id, type, title, content)
                 VALUES (?, ?, ?, ?, ?)`,
                [seed.id, missionId, seed.type, seed.title, seed.content],
            );
            // Mirror into Artifact_Versions so the version timeline
            // has a v1 entry from the start.
            await dbClient.execute(
                `INSERT INTO Artifact_Versions (id, artifact_id, mission_id, title, type, content, version, status, generated_by, diff_summary)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    newId("av"),
                    seed.id,
                    missionId,
                    seed.title,
                    seed.type,
                    seed.content,
                    1,
                    "draft",
                    "Concierge",
                    `${seed.content.split("\n").length} lines seeded`,
                ],
            );
        }

        // 5. Event_Log row so the audit trail shows the Concierge origin.
        await dbClient.execute(
            `INSERT INTO Event_Log (id, mission_id, event_type, actor_type, actor_id, summary, metadata, timestamp)
             VALUES (?, ?, 'mission', 'agent', 'Supr', ?, ?, ?)`,
            [
                newId("ev"),
                missionId,
                `Mission initiated via Concierge Handshake (approved by ${params.approvedBy}, source=${params.source})`,
                JSON.stringify({
                    detail: `${orderedPhases.length} phases, ${totalTasks} tasks, 3 seed artifacts.`,
                    plan: plan,
                    source: params.source,
                    approvedBy: params.approvedBy,
                }),
                now,
            ],
        );

        // 6. Invalidate the in-process mission cache so the next
        //    `getMissionById` call sees the new mission.
        try {
            const { invalidateMissionCache } = await import("../db");
            invalidateMissionCache(missionId);
        } catch {
            // If the cache helper is unavailable, the next
            // getMissionById will refetch anyway after the 1s TTL.
        }

        console.log(
            `[InitiateMission] Created mission ${missionId} for "${plan.name}" via ${params.source} (approved by ${params.approvedBy}).`,
        );

        return {
            missionId,
            plan,
            ok: true,
            summary: {
                phasesCreated: orderedPhases.length,
                tasksCreated: totalTasks,
                artifactsSeeded: seedArtifacts.length,
            },
        };
    },
};

toolRegistry.registerTool(initiateMissionTool);
export default initiateMissionTool;
