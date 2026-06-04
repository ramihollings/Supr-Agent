import crypto from 'crypto';
import dbClient from '@/lib/database/db_client';
import { toolRegistry } from '@/lib/tools/registry';
import { getActiveProvider } from '@/lib/providers/model';
import { operationalMetrics } from '@/lib/services/operational-metrics';
import { providerRouteDecisionService } from '@/lib/services/provider-route-decisions';
import { skillLearningService } from '@/lib/services/skill-learning';
import { executeAgentAction, getAgentAction } from './agent-actions';
import { assembleAgentContext } from './context-assembler';
import { getRuntimeMode } from './runtime-mode';
import { parseModelJson } from './model-json';
import {
  DEFAULT_RUNTIME_BUDGET,
  hasCompletionEvidence,
  hasMeaningfulToolOutput,
  inferProviderRole,
  mergeEvidence,
  parseModelToolResponse,
  withRuntimeTimeout,
} from './agent-runtime-pure';
import type {
  AgentActionRecord,
  AgentContextBundle,
  AgentRuntimeBudget,
  AgentRuntimeRunInput,
  AgentRuntimeRunResult,
  RuntimeMode,
} from './types';
import { sessionEventBus } from './agent-session';

function id(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Phase 4E: exponential backoff for transient tool-call failures.
 * 1s on the first retry, 2s on the second, 4s on the third. We
 * never sleep more than 8 seconds to keep the runtime responsive.
 */
async function backoffSleepMs(attempt: number): Promise<void> {
  const base = Math.min(8000, 1000 * Math.pow(2, attempt));
  await new Promise((resolve) => setTimeout(resolve, base));
}

function summarize(value: unknown, max = 8000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function buildRuntimePrompt(action: AgentActionRecord, context: AgentContextBundle, toolResults: Array<Record<string, unknown>>) {
  return [
    'You are Supr AgentRuntimeRunner. Choose the next runtime step as strict JSON only.',
    'Allowed response forms:',
    '{"type":"tool_call","toolName":"name","arguments":{},"rationale":"why"}',
    '{"type":"needs_approval","reason":"why"}',
    '{"type":"final","summary":"what completed","evidence":{"toolCalls":["id"],"artifacts":["id"]}}',
    '',
    `Action: ${action.capability}`,
    `Intent: ${action.intent}`,
    `Inputs: ${JSON.stringify(action.inputs || {})}`,
    `Mission: ${JSON.stringify({ id: context.mission.id, title: context.mission.title, goal: context.mission.goal })}`,
    `Agent: ${JSON.stringify({ id: context.agent?.id, name: context.agent?.name, tier: context.agent?.permission_tier })}`,
    `Injected sections: ${context.injectedSections.join(', ')}`,
    '',
    'Guidelines:',
    context.guidelineContext || '(none)',
    '',
    'Memory:',
    context.memoryContext || '(none)',
    '',
    'Matching skills:',
    context.skillContext || '(none)',
    '',
    'Available tools:',
    JSON.stringify(context.tools),
    '',
    'Previous tool results:',
    JSON.stringify(toolResults),
  ].join('\n');
}

async function recordStep(input: {
  missionId: string;
  agentId?: string | null;
  runId: string;
  eventType: string;
  summary: string;
  metadata?: Record<string, unknown>;
}) {
  const eventId = id('evt');
  await dbClient.execute(
    `INSERT INTO Event_Log (id, mission_id, actor_type, actor_id, event_type, summary, metadata)
     VALUES (?, ?, 'agent', ?, ?, ?, ?)`,
    [eventId, input.missionId, input.agentId || null, input.eventType, input.summary, JSON.stringify({ ...(input.metadata || {}), agentRunId: input.runId })],
  );
  return eventId;
}

async function createAgentRun(action: AgentActionRecord, flowRunId?: string | null) {
  const runId = id('run');
  await dbClient.execute(
    `INSERT INTO Agent_Runs (id, flow_run_id, mission_id, agent_action_id, agent_id, status, heartbeat, logs, started_at)
     VALUES (?, ?, ?, ?, ?, 'running', 0, '[]', CURRENT_TIMESTAMP)`,
    [runId, flowRunId || null, action.missionId, action.id, action.agentId],
  );
  return runId;
}

async function getModelResponse(input: {
  action: AgentActionRecord;
  context: AgentContextBundle;
  toolResults: Array<Record<string, unknown>>;
  runId: string;
  mode: RuntimeMode;
  deadline: number | null;
  transcriptIds: string[];
  budget: AgentRuntimeBudget;
}) {
  const role = inferProviderRole(input.action.capability, input.action.intent);
  const provider = await getActiveProvider(role);
  await providerRouteDecisionService.record({
    missionId: input.action.missionId,
    agentRunId: input.runId,
    agentRole: role,
    provider: provider.name,
    model: provider.modelName,
    fallbackProvider: provider.name.includes('fallback') ? provider.name : null,
    runtimeMode: input.mode,
    failureReason: null,
  });
  const prompt = buildRuntimePrompt(input.action, input.context, input.toolResults);
  const modelOptions = {
    systemInstruction: 'Return only one JSON object matching the Supr runtime protocol. Do not include markdown.',
    maxOutputTokens: input.budget.maxOutputTokens,
  };
  let streamed = '';
  try {
    for await (const chunk of provider.streamContent(prompt, modelOptions)) {
      streamed += chunk;
      if (chunk.trim()) {
        input.transcriptIds.push(await recordStep({
          missionId: input.action.missionId,
          agentId: input.action.agentId,
          runId: input.runId,
          eventType: 'runtime_model_stream',
          summary: chunk.slice(0, 500),
          metadata: { provider: provider.name, role },
        }));
        // Phase 1B: forward each chunk to the session bus so the chat
        // UI can render a live "thinking…" typewriter. The sessionId
        // field is left blank on per-action runs -- the SSE route
        // will derive the active session from the action's missionId.
        sessionEventBus.emitEvent({
          sessionId: '',
          missionId: input.action.missionId,
          kind: 'model_chunk',
          at: new Date().toISOString(),
          data: {
            agentId: input.action.agentId,
            chunk,
            provider: provider.name,
            role,
          },
        });
      }
    }
    return streamed;
  } catch (error: any) {
    await providerRouteDecisionService.record({
      missionId: input.action.missionId,
      agentRunId: input.runId,
      agentRole: role,
      provider: provider.name,
      model: provider.modelName,
      fallbackProvider: null,
      runtimeMode: input.mode,
      failureReason: error.message || String(error),
    });
    return withRuntimeTimeout(provider.generateContent(prompt, modelOptions), input.deadline, 'model response');
  }
}

async function updateAgentRun(runId: string, status: string, result?: unknown, error?: string, logs: string[] = []) {
  await dbClient.execute(
    `UPDATE Agent_Runs
     SET status = ?, result = ?, error = ?, logs = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, result ? summarize(result) : null, error || null, JSON.stringify(logs), runId],
  );
}

async function recordToolInvocation(input: {
  missionId: string;
  flowRunId?: string | null;
  agentRunId: string;
  agentActionId: string;
  agentId?: string | null;
  toolName: string;
  args: Record<string, unknown>;
}) {
  const invocationId = id('tool');
  await dbClient.execute(
    `INSERT INTO Tool_Invocations
      (id, mission_id, flow_run_id, agent_action_id, agent_run_id, agent_id, tool_name, status, input)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)`,
    [
      invocationId,
      input.missionId,
      input.flowRunId || null,
      input.agentActionId,
      input.agentRunId,
      input.agentId || null,
      input.toolName,
      summarize(input.args),
    ],
  );
  return invocationId;
}

async function completeToolInvocation(invocationId: string, output: unknown, error?: string) {
  await dbClient.execute(
    `UPDATE Tool_Invocations SET status = ?, output = ?, error = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [error ? 'failed' : 'completed', output === undefined ? null : summarize(output), error || null, invocationId],
  );
}

function assertNotCancelled(input: AgentRuntimeRunInput) {
  if (input.cancellationToken?.aborted) {
    throw new Error(`Runtime cancelled${input.cancellationToken.reason ? `: ${input.cancellationToken.reason}` : '.'}`);
  }
}

function effectiveBudget(budget: AgentRuntimeBudget | undefined): Required<AgentRuntimeBudget> {
  return {
    maxSteps: budget?.maxSteps ?? DEFAULT_RUNTIME_BUDGET.maxSteps,
    timeoutMs: budget?.timeoutMs ? Math.max(1000, budget.timeoutMs) : DEFAULT_RUNTIME_BUDGET.timeoutMs,
    retryLimit: budget?.retryLimit !== undefined
      ? Math.max(0, Math.min(3, budget.retryLimit))
      : DEFAULT_RUNTIME_BUDGET.retryLimit,
    maxOutputTokens: budget?.maxOutputTokens ?? DEFAULT_RUNTIME_BUDGET.maxOutputTokens,
  };
}

export async function runAgentRuntimeAction(input: AgentRuntimeRunInput & { flowRunId?: string | null } | string): Promise<AgentRuntimeRunResult> {
  const normalized: AgentRuntimeRunInput & { flowRunId?: string | null } = typeof input === 'string' ? { actionId: input } : input;
  const actionBefore = await getAgentAction(normalized.actionId);
  if (!actionBefore) throw new Error(`Agent action not found: ${normalized.actionId}`);

  const mode = normalized.mode || await getRuntimeMode();
  const startedAt = Date.now();
  const budget = effectiveBudget(normalized.budget);
  const timeoutMs = budget.timeoutMs;
  const deadline = startedAt + timeoutMs;
  const retryLimit = budget.retryLimit;
  const metricIds: string[] = [];

  const lifecycle = await executeAgentAction(normalized.actionId, async (action) => {
    const context = await assembleAgentContext(action);
    const runId = await createAgentRun(action, normalized.flowRunId || null);
    const transcriptIds: string[] = [];
    const toolResults: Array<{ invocationId: string; toolName: string; output: unknown }> = [];
    const evidence: Record<string, string[]> = { artifacts: [], memory: [], events: [], toolCalls: [] };
    const logs: string[] = [];

    try {
      assertNotCancelled(normalized);
      transcriptIds.push(await recordStep({
        missionId: action.missionId,
        agentId: action.agentId,
        runId,
        eventType: 'runtime_context',
        summary: `Context assembled for ${action.capability}`,
        metadata: { injectedSections: context.injectedSections, toolCount: context.tools.length, mode, timeoutMs, retryLimit },
      }));

      const maxSteps = budget.maxSteps;
      for (let step = 0; step < maxSteps; step += 1) {
        assertNotCancelled(normalized);
        if (Date.now() >= deadline) {
          throw new Error(`Runtime timeout exceeded after ${Date.now() - startedAt}ms.`);
        }
        const raw = await withRuntimeTimeout(getModelResponse({
          action,
          context,
          toolResults,
          runId,
          mode,
          deadline,
          transcriptIds,
          budget,
        }), deadline, 'model response');
        const response = parseModelToolResponse(raw);

        // Phase 2C: record a heartbeat step so the chat UI can show
        // `step N of M, currently calling tool X`. We capture the
        // raw model step count from `step` plus the response kind.
        try {
          await appendAgentRunStep({
            runId,
            step,
            event: response.type === 'final' ? 'final' : response.type === 'message' ? 'model_thinking' : 'model_thinking',
            detail: {
              kind: response.type,
              modelChars: raw.length,
            },
          });
        } catch {
          // Heartbeat writes are best-effort; never fail a run.
        }

        if (response.type === 'invalid') {
          transcriptIds.push(await recordStep({
            missionId: action.missionId,
            agentId: action.agentId,
            runId,
            eventType: 'runtime_failure',
            summary: response.reason,
            metadata: { step, raw: response.raw?.slice(0, 1000), mode },
          }));
          throw new Error(response.reason);
        }
        if (response.type === 'needs_approval') {
          transcriptIds.push(await recordStep({
            missionId: action.missionId,
            agentId: action.agentId,
            runId,
            eventType: 'runtime_approval',
            summary: response.reason,
            metadata: { step, mode },
          }));
          throw new Error(`Runtime requested approval: ${response.reason}`);
        }
        if (response.type === 'message') {
          transcriptIds.push(await recordStep({
            missionId: action.missionId,
            agentId: action.agentId,
            runId,
            eventType: 'runtime_model',
            summary: response.content,
            metadata: { step },
          }));
          logs.push(response.content);
          continue;
        }
        if (response.type === 'final') {
          mergeEvidence(evidence, response.evidence as Record<string, string[]>);
          if (!hasCompletionEvidence(evidence)) {
            throw new Error('Runtime final response had no durable evidence.');
          }
          const finalEventId = await recordStep({
            missionId: action.missionId,
            agentId: action.agentId,
            runId,
            eventType: 'runtime_final',
            summary: response.summary,
            metadata: { evidence, mode },
          });
          transcriptIds.push(finalEventId);
          evidence.events.push(finalEventId);
          const result = {
            summary: response.summary,
            mode,
            agentRunId: runId,
            transcriptIds,
            evidence,
            injectedSections: context.injectedSections,
          };
          await updateAgentRun(runId, 'completed', result, undefined, logs);

          // Phase 1D: persist a short Memory_Section so the next
          // session/iteration of this mission sees what was decided.
          // We do this best-effort: a failure to write memory must
          // not fail the run, so we wrap in try/catch. The section
          // title is the action capability, the body is the
          // final summary plus the durable evidence ids so a later
          // session can audit what was done.
          try {
            await memorySectionService.upsert({
              missionId: action.missionId,
              title: `Run ${action.id.slice(0, 8)}: ${action.capability}`,
              content: [
                `Summary: ${response.summary}`,
                `Evidence: artifacts=${(evidence.artifacts || []).length} toolCalls=${(evidence.toolCalls || []).length} events=${(evidence.events || []).length}`,
                `Mode: ${mode}`,
              ].join('\n'),
              provenance: 'agent',
              injectionStatus: 'active',
            });
          } catch (memoryError: any) {
            telemetry.warn('runtime.memory_persist_failed', {
              actionId: action.id,
              reason: memoryError?.message || String(memoryError),
            });
          }
          const learnedSkillDraft = await skillLearningService.evaluateCompletedRun(runId);
          if (learnedSkillDraft?.status === 'draft') {
            await skillLearningService.requestSecurityReview(learnedSkillDraft.id);
          }
          const metric = await operationalMetrics.record({
            missionId: action.missionId,
            agentId: action.agentId,
            eventType: 'outcome',
            outcome: 'completed',
            durationMs: Date.now() - startedAt,
            metadata: { capability: action.capability, mode },
          });
          metricIds.push(metric.id);
          return result;
        }

        transcriptIds.push(await recordStep({
          missionId: action.missionId,
          agentId: action.agentId,
          runId,
          eventType: 'runtime_tool',
          summary: `Calling ${response.toolName}`,
          metadata: { step, rationale: response.rationale },
        }));
        // Phase 2C: bump the heartbeat for tool_called so the
        // chat UI's in-flight tool strip can show which tool is
        // currently running.
        try {
          await appendAgentRunStep({
            runId,
            step,
            event: 'tool_calling',
            detail: { toolName: response.toolName },
          });
        } catch {}
        // Phase 1B: notify session bus that a tool call is starting.
        sessionEventBus.emitEvent({
          sessionId: '',
          missionId: action.missionId,
          kind: 'tool_called',
          at: new Date().toISOString(),
          data: { agentId: action.agentId, toolName: response.toolName, args: response.arguments, step },
        });

        const invocationId = await recordToolInvocation({
          missionId: action.missionId,
          flowRunId: normalized.flowRunId || null,
          agentRunId: runId,
          agentActionId: action.id,
          agentId: action.agentId,
          toolName: response.toolName,
          args: response.arguments,
        });
        try {
          let output: unknown;
          let lastError: any;
          for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
            try {
              assertNotCancelled(normalized);
              output = await withRuntimeTimeout(
                toolRegistry.executeTool(response.toolName, response.arguments, action.agentId, action.missionId, action.id),
                deadline,
                `${response.toolName} tool call`,
              );
              if (!hasMeaningfulToolOutput(output)) {
                throw new Error(`${response.toolName} returned empty output; refusing to treat it as durable execution evidence.`);
              }
              if (attempt > 0) {
                transcriptIds.push(await recordStep({
                  missionId: action.missionId,
                  agentId: action.agentId,
                  runId,
                  eventType: 'runtime_warning',
                  summary: `${response.toolName} succeeded on retry ${attempt}.`,
                  metadata: { step, attempt, retryLimit },
                }));
              }
              break;
            } catch (error: any) {
              lastError = error;
              if (attempt >= retryLimit) throw error;
              transcriptIds.push(await recordStep({
                missionId: action.missionId,
                agentId: action.agentId,
                runId,
                eventType: 'runtime_warning',
                summary: `${response.toolName} failed attempt ${attempt + 1}; retrying after backoff.`,
                metadata: { step, attempt: attempt + 1, retryLimit, reason: error.message || String(error) },
              }));
              // Phase 4E: exponential backoff between retries. This is
              // best-effort; the runtime honors the deadline at the
              // top of the loop so a long backoff won't extend past
              // the budgeted runtime.
              await backoffSleepMs(attempt);
            }
          }
          if (output === undefined) throw lastError || new Error(`${response.toolName} produced no output.`);
          await completeToolInvocation(invocationId, output);
          toolResults.push({ invocationId, toolName: response.toolName, output });
          evidence.toolCalls.push(invocationId);
          const parsedOutput = typeof output === 'string' ? safeJson<Record<string, any>>(output, {}) : output as Record<string, any>;
          if (parsedOutput?.evidence) mergeEvidence(evidence, parsedOutput.evidence);
          logs.push(`${response.toolName} completed`);
          // Phase 1B: notify session bus that a tool call has finished.
          sessionEventBus.emitEvent({
            sessionId: '',
            missionId: action.missionId,
            kind: 'tool_completed',
            at: new Date().toISOString(),
            data: { agentId: action.agentId, toolName: response.toolName, invocationId, hasOutput: output !== undefined },
          });
          // Phase 4D: record the cost event and let the budget
          // engine evaluate. We do this best-effort: a hard-stop
          // violation throws a typed error so the calling code can
          // surface it as a failure.
          try {
            await costTracker.record({
              missionId: action.missionId,
              agentId: action.agentId,
              taskId: action.taskId,
              agentRunId: runId,
              provider: 'tool',
              model: response.toolName,
              inputTokens: 0,
              outputTokens: 0,
              costCents: 1, // 1 cent per tool call as a baseline; the
                              // provider's real cost is recorded by
                              // the LLM call branch below.
            });
            await budgetEngine.evaluateCostEvent(1, action.missionId, action.agentId);
          } catch (budgetError: any) {
            // The budget engine throws a typed error when a hard
            // stop is crossed. We bubble it up so the runtime marks
            // the run as failed with a clear reason.
            if (budgetError?.code === 'budget_exceeded') {
              throw budgetError;
            }
            telemetry.warn('runtime.budget_eval_failed', { reason: budgetError?.message || String(budgetError) });
          }
          const metric = await operationalMetrics.record({
            missionId: action.missionId,
            agentId: action.agentId,
            eventType: 'tool',
            outcome: 'completed',
            durationMs: Date.now() - startedAt,
            metadata: { toolName: response.toolName, mode },
          });
          metricIds.push(metric.id);
        } catch (error: any) {
          await completeToolInvocation(invocationId, error.commandResult || null, error.message || String(error));
          throw error;
        }
      }

      throw new Error(`Runtime exceeded max step budget (${maxSteps}) without final evidence.`);
    } catch (error: any) {
      await updateAgentRun(runId, 'failed', undefined, error.message || String(error), logs);
      const metric = await operationalMetrics.record({
        missionId: action.missionId,
        agentId: action.agentId,
        eventType: 'failure',
        outcome: 'failed',
        durationMs: Date.now() - startedAt,
        metadata: { capability: action.capability, mode, reason: error.message || String(error) },
      });
      metricIds.push(metric.id);
      throw error;
    }
  });

  const action = lifecycle.action;
  const parsed = typeof lifecycle.result === 'string' ? safeJson<any>(lifecycle.result, {}) : lifecycle.result as any;
  const evidenceIds = [
    ...(parsed?.evidence?.artifacts || []),
    ...(parsed?.evidence?.memory || []),
    ...(parsed?.evidence?.events || []),
    ...(parsed?.evidence?.toolCalls || []),
  ];

  return {
    status: lifecycle.status,
    action,
    agentRunId: parsed?.agentRunId,
    finalSummary: parsed?.summary || lifecycle.reason,
    evidenceIds,
    transcriptIds: parsed?.transcriptIds || [],
    metricIds,
    failureReason: lifecycle.status === 'failed' ? lifecycle.reason || action.error || undefined : undefined,
    result: lifecycle.result,
  };
}
