/**
 * Agent session — the OpenClaw / Hermes-grade "supervisor loop" on top of
 * the existing per-step runtime.
 *
 * Why this exists
 * ---------------
 * `lib/runtime/agent-runtime-runner.ts` operates on a single
 * `Agent_Actions` row at a time. It runs the model, gets a tool call,
 * executes it, persists one transcript event, and loops up to
 * `maxSteps` (default 4). When it returns, the session is over: any
 * next "step" has to be a brand-new action, with its own status row,
 * its own DB roundtrip, and no in-memory continuity.
 *
 * That is the wrong shape for an agentic loop. OpenClaw and Hermes
 * treat one task as one session that can iterate freely across tools,
 * share evidence + transcript across steps, and only emit a single
 * consolidated "final" event at the end. This file implements that
 * shape on top of the existing per-action runtime, so we keep the
 * durable state model (Agent_Actions / Agent_Runs / Event_Log) but
 * also get a free-flowing in-process loop.
 *
 * Wire-in
 * -------
 * The session wraps the existing `runAgentRuntimeAction` call. For
 * each step the model takes inside the session:
 *   1. We re-derive the action from the DB so the runtime is the
 *      single source of truth (no stale in-memory action state).
 *   2. We call `runAgentRuntimeAction` and capture its transcript +
 *      evidence. We then MERGE that into the session-level bag
 *      so the next step sees the previous step's results.
 *   3. If the action reached a `final` response with hard evidence,
 *      we break out of the loop. Otherwise we keep stepping.
 *
 * The session ALSO owns the optional reflection pass (Phase 2A in the
 * plan) and the context-compaction hook (Phase 2B). They're wired
 * here as no-op stubs so the architecture is in place; the actual
 * reflection/compaction calls live in their respective services.
 *
 * Event-streaming
 * ---------------
 * The session emits `session:event` notifications on a small in-process
 * bus (separate from the global `missionEventBus`) so the chat UI can
 * stream model chunks, tool calls, and reflections in real time. The
 * `/api/mission/stream` route is taught about this in Phase 1B.
 */

import crypto from 'crypto';
import { addActivityLog, getMissionById } from '@/lib/db';
import { runAgentRuntimeAction } from './agent-runtime-runner';
import { createAgentAction, getAgentAction } from './agent-actions';
import { getActiveProvider } from '@/lib/providers/model';
import { notifyMissionChanged } from '@/lib/events/bus';
import { parseModelJson } from './model-json';
import { telemetry } from '@/lib/telemetry';
import type { AgentActionRecord, AgentContextBundle, AgentRuntimeRunResult, ModelToolResponse } from './types';

const REFLECTION_PROMPT_VERSION = 'reflection-v1';
const REFLECTION_MAX_GUIDANCE_CHARS = 800;

// ---------------------------------------------------------------------------
// Session event bus — process-local, in addition to the global mission bus.
// The chat UI subscribes to this to render streaming model output, tool
// invocations, and reflection summaries as they happen.
// ---------------------------------------------------------------------------

export type SessionEventKind =
    | 'session_started'
    | 'plan_item_started'
    | 'plan_item_completed'
    | 'model_chunk'
    | 'tool_called'
    | 'tool_completed'
    | 'reflection_started'
    | 'reflection_completed'
    | 'session_completed'
    | 'session_failed';

export interface SessionEvent {
    sessionId: string;
    missionId: string;
    kind: SessionEventKind;
    at: string;
    // Free-form payload, depends on `kind`. The chat UI is defensive
    // about unknown shapes, so adding a new event kind is safe.
    data: Record<string, unknown>;
}

import { EventEmitter } from 'node:events';

class SessionEventBus extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(100);
    }
    emitEvent(event: SessionEvent): void {
        this.emit('event', event);
    }
    onEvent(handler: (event: SessionEvent) => void): () => void {
        this.on('event', handler);
        return () => this.off('event', handler);
    }
}

const sessionEventBus = new SessionEventBus();
export { sessionEventBus };

// ---------------------------------------------------------------------------
// Session plan
// ---------------------------------------------------------------------------

export type PlanItem =
    | { kind: 'agent_action'; actionId: string; label: string; }
    | { kind: 'reflection'; label: string; basedOn: 'last_final'; }
    | { kind: 'noop'; label: string; };

export interface AgentSessionInput {
    sessionId?: string;
    missionId: string;
    plan: PlanItem[];
    budget?: {
        maxSessionSteps?: number;
        timeoutMs?: number;
        enableReflection?: boolean;
    };
}

// ---------------------------------------------------------------------------
// Session result
// ---------------------------------------------------------------------------

export interface AgentSessionResult {
    sessionId: string;
    missionId: string;
    status: 'completed' | 'failed' | 'partial' | 'needs_approval';
    steps: number;
    finalSummary?: string;
    evidence: Record<string, string[]>;
    transcriptIds: string[];
    reflectionSummaries: string[];
    perStep: Array<{
        planItem: PlanItem;
        status: 'completed' | 'failed' | 'pending_approval' | 'skipped';
        summary?: string;
        error?: string;
    }>;
    startedAt: string;
    completedAt: string;
    durationMs: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeId(prefix: string): string {
    return `${prefix}-${crypto.randomUUID()}`;
}

function mergeEvidence(current: Record<string, string[]>, next: Record<string, string[]>): void {
    for (const [key, values] of Object.entries(next || {})) {
        current[key] = Array.from(new Set([...(current[key] || []), ...(Array.isArray(values) ? values : [])]));
    }
}

function sessionEvent(
    sessionId: string,
    missionId: string,
    kind: SessionEventKind,
    data: Record<string, unknown> = {},
): SessionEvent {
    return { sessionId, missionId, kind, at: new Date().toISOString(), data };
}

// ---------------------------------------------------------------------------
// Reflection — Phase 2A. Calls the active LLM as a judge over the
// session's final summary and evidence. The verdict schema is fixed so
// downstream callers don't have to change if the prompt is tuned.
//
// Schema:
//   {
//     "verdict": "pass" | "retry",
//     "guidance"?: string,   // required when verdict is "retry"
//     "summary": string      // one-line summary for the transcript
//   }
//
// If the LLM call fails for any reason, reflection degrades gracefully
// to a `pass` verdict (with a telemetry warning) so a single broken
// reflection never blocks an otherwise-valid session.
// ---------------------------------------------------------------------------

function buildReflectionPrompt(input: {
    intent: string;
    finalSummary?: string;
    evidence: Record<string, string[]>;
}): string {
    const evidenceShape = Object.entries(input.evidence)
        .map(([k, v]) => `${k}=${(v || []).length}`)
        .join(', ');
    const finalText = input.finalSummary && input.finalSummary.trim()
        ? input.finalSummary.slice(0, 4000)
        : '(no final summary was produced)';
    return [
        'You are Supr Reflection. You audit a completed agent session and decide whether the work is satisfactory.',
        '',
        `Mission intent: ${input.intent}`,
        `Evidence (count by category): ${evidenceShape || 'none'}`,
        '',
        'Final summary from the session:',
        finalText,
        '',
        'Respond with STRICT JSON ONLY (no markdown, no commentary):',
        '{"verdict":"pass","summary":"<one line>"}',
        'or',
        '{"verdict":"retry","guidance":"<concrete fix>","summary":"<one line>"}',
        '',
        'Rules:',
        '- verdict is "retry" only when the final summary is empty, contradicts the evidence counts, or the work is clearly incomplete.',
        '- guidance must be a concrete, single-sentence instruction a follow-up step can act on (no more than 800 chars).',
        '- Never invent evidence ids; only refer to categories shown above.',
    ].join('\n');
}

function isReflectionVerdict(value: unknown): value is 'pass' | 'retry' {
    return value === 'pass' || value === 'retry';
}

function heuristicReflection(input: {
    intent: string;
    finalSummary?: string;
    evidence: Record<string, string[]>;
}): { verdict: 'pass' | 'retry'; guidance?: string; summary: string } {
    const finalText = (input.finalSummary || '').trim();
    const toolCallCount = (input.evidence.toolCalls || []).length;
    const artifactCount = (input.evidence.artifacts || []).length;
    const eventCount = (input.evidence.events || []).length;

    if (!finalText) {
        return {
            verdict: 'retry',
            guidance: 'Re-run the finalization step with a non-empty summary that names what was actually done.',
            summary: `No final summary produced after ${toolCallCount} tool call(s).`,
        };
    }
    if (toolCallCount === 0 && artifactCount === 0 && eventCount === 0) {
        return {
            verdict: 'retry',
            guidance: 'At least one tool invocation or artifact is required to call this session complete.',
            summary: 'Session produced no tool calls and no artifacts.',
        };
    }
    return {
        verdict: 'pass',
        summary: `Audited ${toolCallCount} tool call(s) and ${artifactCount} artifact(s); final summary present.`,
    };
}

async function callReflectionLlm(prompt: string): Promise<string> {
    const provider = await getActiveProvider('reflection');
    return provider.generateContent(prompt, {
        systemInstruction: 'You are Supr Reflection. Return only one JSON object matching the schema. No markdown.',
        maxOutputTokens: 600,
    });
}

export async function runReflection(input: {
    sessionId: string;
    missionId: string;
    intent: string;
    finalSummary?: string;
    evidence: Record<string, string[]>;
}): Promise<{ verdict: 'pass' | 'retry'; guidance?: string; summary: string }> {
    sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_started', {
        intent: input.intent,
        promptVersion: REFLECTION_PROMPT_VERSION,
    }));

    const prompt = buildReflectionPrompt(input);

    let parsed: Record<string, unknown> | null = null;
    let llmCalled = false;
    try {
        const raw = await callReflectionLlm(prompt);
        llmCalled = true;
        parsed = parseModelJson<Record<string, unknown>>(raw);
    } catch (error: any) {
        telemetry.warn('session.reflection.llm_failed', {
            sessionId: input.sessionId,
            missionId: input.missionId,
            reason: error?.message || String(error),
        });
    }

    let verdict: 'pass' | 'retry';
    let guidance: string | undefined;
    let summary: string;
    if (parsed && isReflectionVerdict(parsed.verdict) && typeof parsed.summary === 'string' && parsed.summary.trim()) {
        verdict = parsed.verdict;
        summary = parsed.summary.trim().slice(0, 1000);
        if (verdict === 'retry') {
            const rawGuidance = typeof parsed.guidance === 'string' ? parsed.guidance.trim() : '';
            if (!rawGuidance) {
                // A retry verdict without guidance is a model bug. Demote to pass
                // rather than risk an ungrounded retry loop.
                telemetry.warn('session.reflection.retry_without_guidance', { sessionId: input.sessionId });
                verdict = 'pass';
            } else {
                guidance = rawGuidance.slice(0, REFLECTION_MAX_GUIDANCE_CHARS);
            }
        }
    } else {
        // LLM returned no usable verdict. Fall back to a deterministic
        // heuristic so the session can still complete cleanly.
        const heuristic = heuristicReflection(input);
        verdict = heuristic.verdict;
        guidance = heuristic.guidance;
        summary = heuristic.summary;
        telemetry.warn('session.reflection.llm_unparseable', {
            sessionId: input.sessionId,
            missionId: input.missionId,
            llmCalled,
            parsedKeys: parsed ? Object.keys(parsed) : null,
        });
    }

    sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_completed', {
        summary,
        verdict,
        guidance,
        source: llmCalled && parsed ? 'llm' : 'heuristic',
    }));
    return verdict === 'retry' && guidance ? { verdict, guidance, summary } : { verdict, summary };
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

export async function runAgentSession(input: AgentSessionInput): Promise<AgentSessionResult> {
    const sessionId = input.sessionId || safeId('session');
    const startedAt = new Date();
    const maxSessionSteps = input.budget?.maxSessionSteps ?? Math.max(8, input.plan.length * 2);
    const enableReflection = input.budget?.enableReflection ?? true;

    const evidence: Record<string, string[]> = { artifacts: [], memory: [], events: [], toolCalls: [] };
    const transcriptIds: string[] = [];
    const reflectionSummaries: string[] = [];
    const perStep: AgentSessionResult['perStep'] = [];

    // Verify the mission still exists. A long-running session that
    // outlives a deleted mission should bail with a clear error rather
    // than silently writing events.
    const mission = await getMissionById(input.missionId);
    if (!mission) {
        return {
            sessionId,
            missionId: input.missionId,
            status: 'failed',
            steps: 0,
            evidence,
            transcriptIds,
            reflectionSummaries,
            perStep: input.plan.map((p) => ({ planItem: p, status: 'skipped', error: 'Mission not found' })),
            startedAt: startedAt.toISOString(),
            completedAt: new Date().toISOString(),
            durationMs: 0,
        };
    }

    sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'session_started', {
        planSize: input.plan.length,
        missionName: mission.name,
    }));
    notifyMissionChanged(input.missionId, 'flow_started');

    let overallStatus: AgentSessionResult['status'] = 'completed';
    let finalSummary: string | undefined;
    let stepsTaken = 0;

    for (let i = 0; i < input.plan.length; i += 1) {
        if (stepsTaken >= maxSessionSteps) {
            telemetry.warn('session.max_steps_reached', { sessionId, stepsTaken, maxSessionSteps });
            overallStatus = 'partial';
            break;
        }

        const planItem = input.plan[i];
        sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'plan_item_started', {
            index: i,
            kind: planItem.kind,
            label: planItem.label,
        }));

        if (planItem.kind === 'noop') {
            perStep.push({ planItem, status: 'skipped' });
            sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'plan_item_completed', {
                index: i,
                kind: planItem.kind,
                status: 'skipped',
            }));
            continue;
        }

        if (planItem.kind === 'reflection') {
            // The reflection step audits the LAST `final` summary. If there
            // is no prior final, this is a no-op pass.
            const reflection = await runReflection({
                sessionId,
                missionId: input.missionId,
                intent: planItem.label,
                finalSummary,
                evidence,
            });
            reflectionSummaries.push(reflection.summary);
            if (reflection.verdict === 'retry' && reflection.guidance) {
                // Surface the guidance so the chat UI and supervisor can
                // show what the reflection agent wants to retry. The
                // guidance is not yet re-injected into the next step —
                // that wiring lands when a follow-up run can read the
                // session's reflection_summaries.
                perStep.push({ planItem, status: 'completed', summary: reflection.summary, error: `retry: ${reflection.guidance}` });
                overallStatus = 'partial';
            } else {
                perStep.push({ planItem, status: 'completed', summary: reflection.summary });
            }
            sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'plan_item_completed', {
                index: i,
                kind: planItem.kind,
                status: 'completed',
                summary: reflection.summary,
                verdict: reflection.verdict,
                guidance: reflection.guidance,
            }));
            continue;
        }

        // planItem.kind === 'agent_action'
        const actionBefore = await getAgentAction(planItem.actionId);
        if (!actionBefore) {
            perStep.push({ planItem, status: 'skipped', error: `Action ${planItem.actionId} not found` });
            overallStatus = 'failed';
            sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'plan_item_completed', {
                index: i,
                kind: planItem.kind,
                status: 'skipped',
                error: 'action not found',
            }));
            continue;
        }

        try {
            // Run the existing per-step runtime. It does its own
            // context assembly, model call, tool execution, and evidence
            // recording. We then merge the per-step evidence into the
            // session bag so subsequent steps see prior results.
            const execution: AgentRuntimeRunResult = await runAgentRuntimeAction({
                actionId: planItem.actionId,
                budget: input.budget?.timeoutMs ? { timeoutMs: input.budget.timeoutMs } : undefined,
            });

            mergeEvidence(evidence, (execution.result as any)?.evidence || {});
            for (const tid of execution.transcriptIds || []) transcriptIds.push(tid);

            const stepSummary = execution.finalSummary || `Action ${planItem.kind} returned status ${execution.status}`;
            perStep.push({ planItem, status: 'completed', summary: stepSummary });
            stepsTaken += 1;
            finalSummary = stepSummary;

            // Update the agent-action row to reflect the session's progress
            // narrative. This is what shows up in the supervisor console.
            await addActivityLog(input.missionId, {
                eventType: 'supr_decision',
                actor: 'Supr Session',
                actorIcon: 'psychology',
                summary: `Session step ${i + 1}/${input.plan.length}: ${planItem.label}`,
                detail: stepSummary,
            });

            if (execution.status === 'failed') {
                overallStatus = 'failed';
                perStep[perStep.length - 1] = {
                    planItem,
                    status: 'failed',
                    summary: stepSummary,
                    error: execution.failureReason,
                };
                sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'plan_item_completed', {
                    index: i,
                    kind: planItem.kind,
                    status: 'failed',
                    error: execution.failureReason,
                }));
                break;
            }

            if (execution.status === 'pending_approval') {
                overallStatus = 'needs_approval';
                perStep[perStep.length - 1] = {
                    planItem,
                    status: 'pending_approval',
                    summary: execution.failureReason || 'Approval required before continuing',
                };
                sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'plan_item_completed', {
                    index: i,
                    kind: planItem.kind,
                    status: 'pending_approval',
                }));
                break;
            }

            sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'plan_item_completed', {
                index: i,
                kind: planItem.kind,
                status: 'completed',
                summary: stepSummary,
            }));

            // If reflection is enabled and we just received a final
            // response, slot in a reflection step right after.
            if (enableReflection && execution.status === 'completed' && execution.finalSummary) {
                input.plan.splice(i + 1, 0, {
                    kind: 'reflection',
                    label: `Audit: ${planItem.label}`,
                    basedOn: 'last_final',
                });
            }
        } catch (error: any) {
            perStep.push({
                planItem,
                status: 'failed',
                error: error?.message || String(error),
            });
            overallStatus = 'failed';
            sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId, 'plan_item_completed', {
                index: i,
                kind: planItem.kind,
                status: 'failed',
                error: error?.message || String(error),
            }));
            break;
        }
    }

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    sessionEventBus.emitEvent(sessionEvent(sessionId, input.missionId,
        overallStatus === 'completed' ? 'session_completed' : 'session_failed',
        { status: overallStatus, steps: stepsTaken, durationMs },
    ));
    notifyMissionChanged(input.missionId, overallStatus === 'completed' ? 'flow_completed' : 'mission_updated');

    await addActivityLog(input.missionId, {
        eventType: 'supr_decision',
        actor: 'Supr Session',
        actorIcon: 'psychology',
        summary: `Session ${sessionId} ${overallStatus} after ${stepsTaken} step(s)`,
        detail: finalSummary || `Steps: ${stepsTaken}, Duration: ${durationMs}ms`,
    });

    return {
        sessionId,
        missionId: input.missionId,
        status: overallStatus,
        steps: stepsTaken,
        finalSummary,
        evidence,
        transcriptIds,
        reflectionSummaries,
        perStep,
        startedAt: startedAt.toISOString(),
        completedAt: completedAt.toISOString(),
        durationMs,
    };
}

/**
 * Helper: build a default plan for a mission from the active
 * `Agent_Actions` queue. The plan is the natural order: pending
 * actions first, then any draft/approved actions that are still
 * running. The session runs them in that order, sharing evidence
 * across them. A reflection step is appended at the end so the
 * session audits its own final summary.
 *
 * Called by `startProjectFlowAction` / `runProjectFlowAction` to
 * upgrade the existing per-action loop to the new session shape
 * without changing the public surface of the project-flow module.
 */
import dbClient from '@/lib/database/db_client';

export async function buildSessionPlanFromMission(
  missionId: string,
  options: { withReflectionTail?: boolean } = {},
): Promise<PlanItem[]> {
  const actions = await dbClient.query<any>(
    `SELECT id, capability, intent FROM Agent_Actions
     WHERE mission_id = ? AND status IN ('draft','approved','failed')
     ORDER BY created_at ASC, rowid ASC
     LIMIT 50`,
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
