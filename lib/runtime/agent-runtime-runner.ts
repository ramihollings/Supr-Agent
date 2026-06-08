import crypto from 'crypto';
import dbClient from '@/lib/database/db_client';
import { integrationRegistry } from '@/lib/integrations/registry';
import { getActiveProvider } from '@/lib/providers/model';
import { operationalMetrics } from '@/lib/services/operational-metrics';
import { providerRouteDecisionService } from '@/lib/services/provider-route-decisions';
import { skillLearningService } from '@/lib/services/skill-learning';
import { executeAgentAction, getAgentAction } from './agent-actions';
import { assembleAgentContext } from './context-assembler';
import { getRuntimeMode } from './runtime-mode';
import { StateGraph, Annotation, START, END } from '@langchain/langgraph';
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
import { memorySectionService } from '@/lib/services/memory-sections';
import { costTracker } from '@/lib/services/cost-tracker';
import { telemetry } from '@/lib/telemetry';
import { redactSensitive, redactSensitiveText, serializeRedacted } from '@/lib/security/redaction';

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
  const redacted = redactSensitive(value);
  const text = typeof redacted === 'string' ? redacted : JSON.stringify(redacted);
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
    `Inputs: ${serializeRedacted(action.inputs || {})}`,
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
    serializeRedacted(toolResults),
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
    [eventId, input.missionId, input.agentId || null, input.eventType, redactSensitiveText(input.summary), serializeRedacted({ ...(input.metadata || {}), agentRunId: input.runId })],
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
  usageSink: { inputTokens: number; outputTokens: number; reported: boolean };
}): Promise<string> {
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
    const stream = provider.streamContentWithUsage
      ? provider.streamContentWithUsage(prompt, modelOptions)
      : null;
    if (stream) {
      for await (const chunk of stream) {
        if (chunk.text) {
          streamed += chunk.text;
          if (chunk.text.trim()) {
            const safeChunk = redactSensitiveText(chunk.text);
            input.transcriptIds.push(await recordStep({
              missionId: input.action.missionId,
              agentId: input.action.agentId,
              runId: input.runId,
              eventType: 'runtime_model_stream',
              summary: safeChunk.slice(0, 500),
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
                chunk: safeChunk,
                provider: provider.name,
                role,
              },
            });
          }
        }
        if (chunk.usage) {
          // Use the LAST usage the stream reports. Providers that report
          // cumulative usage update this on every chunk; providers that
          // only know it at the end send it on the final chunk.
          input.usageSink.inputTokens = chunk.usage.inputTokens;
          input.usageSink.outputTokens = chunk.usage.outputTokens;
          input.usageSink.reported = chunk.usage.reported;
        }
      }
    } else {
      // No usage-aware stream available; fall back to the plain stream.
      for await (const chunk of provider.streamContent(prompt, modelOptions)) {
        streamed += chunk;
        if (chunk.trim()) {
          const safeChunk = redactSensitiveText(chunk);
          input.transcriptIds.push(await recordStep({
            missionId: input.action.missionId,
            agentId: input.action.agentId,
            runId: input.runId,
            eventType: 'runtime_model_stream',
            summary: safeChunk.slice(0, 500),
            metadata: { provider: provider.name, role },
          }));
          sessionEventBus.emitEvent({
            sessionId: '',
            missionId: input.action.missionId,
            kind: 'model_chunk',
            at: new Date().toISOString(),
            data: {
              agentId: input.action.agentId,
              chunk: safeChunk,
              provider: provider.name,
              role,
            },
          });
        }
      }
      // Estimate from text length when the provider can't report usage.
      input.usageSink.inputTokens = Math.max(1, Math.ceil(prompt.length / 4));
      input.usageSink.outputTokens = Math.max(0, Math.ceil(streamed.length / 4));
      input.usageSink.reported = false;
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
      failureReason: redactSensitiveText(error.message || String(error)),
    });
    const fallback = await withRuntimeTimeout(
      provider.generateContentWithUsage
        ? provider.generateContentWithUsage(prompt, modelOptions)
        : provider.generateContent(prompt, modelOptions).then((text) => ({ text, usage: { inputTokens: Math.max(1, Math.ceil(prompt.length / 4)), outputTokens: Math.max(0, Math.ceil(text.length / 4)), reported: false } })),
      input.deadline,
      'model response',
    );
    streamed = typeof fallback === 'string' ? fallback : fallback.text;
    if (typeof fallback !== 'string' && fallback.usage) {
      input.usageSink.inputTokens = fallback.usage.inputTokens;
      input.usageSink.outputTokens = fallback.usage.outputTokens;
      input.usageSink.reported = fallback.usage.reported;
    }
    return streamed;
  }
}

async function updateAgentRun(runId: string, status: string, result?: unknown, error?: string, logs: string[] = []) {
  await dbClient.execute(
    `UPDATE Agent_Runs
     SET status = ?, result = ?, error = ?, logs = ?, completed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [status, result ? summarize(result) : null, error ? redactSensitiveText(error) : null, serializeRedacted(logs), runId],
  );
}

async function appendAgentRunStep(input: { runId: string, step: number, event: string, detail: any }) {
  // best-effort heartbeat update
  await dbClient.execute(`UPDATE Agent_Runs SET heartbeat = ? WHERE id = ?`, [input.step, input.runId]);
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
    [error ? 'failed' : 'completed', output === undefined ? null : summarize(output), error ? redactSensitiveText(error) : null, invocationId],
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
    // Accumulated usage for the most recent model call. Reset on every
    // getModelResponse invocation; the runner reads it after the call
    // returns so the cost tracker can be fed real token counts.
    const lastModelUsage: { inputTokens: number; outputTokens: number; reported: boolean } = {
      inputTokens: 0,
      outputTokens: 0,
      reported: false,
    };
    let lastProviderName = 'unknown';
    let lastModelName = 'unknown';

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

      const AgentState = Annotation.Root({
        step: Annotation<number>({ reducer: (x, y) => y }),
        toolResults: Annotation<Array<{ invocationId: string; toolName: string; output: unknown }>>({ reducer: (x, y) => y }),
        evidence: Annotation<Record<string, string[]>>({ reducer: (x, y) => y }),
        logs: Annotation<string[]>({ reducer: (x, y) => y }),
        transcriptIds: Annotation<string[]>({ reducer: (x, y) => y }),
        metricIds: Annotation<string[]>({ reducer: (x, y) => y }),
        lastModelUsage: Annotation<{ inputTokens: number; outputTokens: number; reported: boolean }>({ reducer: (x, y) => y }),
        response: Annotation<any>({ reducer: (x, y) => y }),
        result: Annotation<any>({ reducer: (x, y) => y }),
        error: Annotation<any>({ reducer: (x, y) => y })
      });

      const graph = new StateGraph(AgentState)
        .addNode('agent', async (state) => {
          assertNotCancelled(normalized);
          if (Date.now() >= deadline) {
            return { error: new Error(`Runtime timeout exceeded after ${Date.now() - startedAt}ms.`) };
          }
          if (state.step >= maxSteps) {
            return { error: new Error(`Runtime exceeded max step budget (${maxSteps}) without final evidence.`) };
          }

          const raw = await withRuntimeTimeout(getModelResponse({
            action,
            context,
            toolResults: state.toolResults,
            runId,
            mode,
            deadline,
            transcriptIds: state.transcriptIds,
            budget,
            usageSink: state.lastModelUsage,
          }), deadline, 'model response');

          lastProviderName = inferProviderRole(action.capability, action.intent);
          lastModelName = action.capability;

          try {
            await costTracker.recordCostEvent({
              missionId: action.missionId || undefined,
              agentId: action.agentId || undefined,
              taskId: action.taskId || undefined,
              agentRunId: runId || undefined,
              provider: lastProviderName,
              model: lastModelName,
              inputTokens: state.lastModelUsage.inputTokens,
              outputTokens: state.lastModelUsage.outputTokens,
              reported: state.lastModelUsage.reported,
            });
          } catch (costError: any) {
            if (costError?.code === 'budget_exceeded') return { error: costError };
            telemetry.warn('runtime.cost_record_failed', { reason: redactSensitiveText(costError?.message || String(costError)) });
          }
          
          const response = parseModelToolResponse(raw);

          try {
            await appendAgentRunStep({
              runId,
              step: state.step,
              event: response.type === 'final' ? 'final' : response.type === 'message' ? 'model_thinking' : 'model_thinking',
              detail: {
                kind: response.type,
                modelChars: raw.length,
              },
            });
          } catch {}

          if (response.type === 'invalid') {
            state.transcriptIds.push(await recordStep({
              missionId: action.missionId,
              agentId: action.agentId,
              runId,
              eventType: 'runtime_failure',
              summary: response.reason,
              metadata: { step: state.step, raw: response.raw?.slice(0, 1000), mode },
            }));
            return { error: new Error(response.reason) };
          }
          if (response.type === 'needs_approval') {
            state.transcriptIds.push(await recordStep({
              missionId: action.missionId,
              agentId: action.agentId,
              runId,
              eventType: 'runtime_approval',
              summary: response.reason,
              metadata: { step: state.step, mode },
            }));
            return { error: new Error(`Runtime requested approval: ${response.reason}`) };
          }
          if (response.type === 'message') {
            state.transcriptIds.push(await recordStep({
              missionId: action.missionId,
              agentId: action.agentId,
              runId,
              eventType: 'runtime_model',
              summary: response.content,
              metadata: { step: state.step },
            }));
            state.logs.push(redactSensitiveText(response.content));
            return { response, step: state.step + 1 };
          }
          if (response.type === 'final') {
            mergeEvidence(state.evidence, response.evidence as Record<string, string[]>);
            if (!hasCompletionEvidence(state.evidence)) {
              return { error: new Error('Runtime final response had no durable evidence.') };
            }
            const finalEventId = await recordStep({
              missionId: action.missionId,
              agentId: action.agentId,
              runId,
              eventType: 'runtime_final',
              summary: response.summary,
              metadata: { evidence: state.evidence, mode },
            });
            state.transcriptIds.push(finalEventId);
            state.evidence.events.push(finalEventId);
            const result = {
              summary: response.summary,
              mode,
              agentRunId: runId,
              transcriptIds: state.transcriptIds,
              evidence: state.evidence,
              injectedSections: context.injectedSections,
            };
            await updateAgentRun(runId, 'completed', result, undefined, state.logs);

            try {
              await memorySectionService.upsert({
                missionId: action.missionId,
                title: `Run ${action.id.slice(0, 8)}: ${action.capability}`,
                content: [
                  `Summary: ${redactSensitiveText(response.summary)}`,
                  `Evidence: artifacts=${(state.evidence.artifacts || []).length} toolCalls=${(state.evidence.toolCalls || []).length} events=${(state.evidence.events || []).length}`,
                  `Mode: ${mode}`,
                ].join('\n'),
                provenance: 'agent',
                injectionStatus: 'active',
              });
            } catch (memoryError: any) {
              telemetry.warn('runtime.memory_persist_failed', {
                actionId: action.id,
                reason: redactSensitiveText(memoryError?.message || String(memoryError)),
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
            state.metricIds.push(metric.id);
            return { result, response, step: state.step + 1 };
          }
          
          return { response, step: state.step + 1 };
        })
        .addNode('tool', async (state) => {
          const response = state.response;
          state.transcriptIds.push(await recordStep({
            missionId: action.missionId,
            agentId: action.agentId,
            runId,
            eventType: 'runtime_tool',
            summary: `Calling ${response.toolName}`,
            metadata: { step: state.step - 1, rationale: response.rationale },
          }));
          try {
            await appendAgentRunStep({
              runId,
              step: state.step - 1,
              event: 'tool_calling',
              detail: { toolName: response.toolName },
            });
          } catch {}
          sessionEventBus.emitEvent({
            sessionId: '',
            missionId: action.missionId,
            kind: 'tool_called',
            at: new Date().toISOString(),
            data: redactSensitive({ agentId: action.agentId, toolName: response.toolName, args: response.arguments, step: state.step - 1 }) as Record<string, unknown>,
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
                const adapterResult = await withRuntimeTimeout(
                  integrationRegistry.execute(response.toolName, {
                    sessionId: normalized.sessionId,
                    agentId: action.agentId,
                    missionId: action.missionId,
                    agentActionId: action.id,
                  }, response.arguments),
                  deadline,
                  `${response.toolName} tool call`,
                );
                if (!adapterResult.ok) {
                  const adapterError = new Error(adapterResult.error || `${response.toolName} adapter failed.`);
                  (adapterError as any).detail = adapterResult.errorDetail;
                  throw adapterError;
                }
                output = adapterResult.output;
                if (!hasMeaningfulToolOutput(output)) {
                  throw new Error(`${response.toolName} returned empty output; refusing to treat it as durable execution evidence.`);
                }
                if (attempt > 0) {
                  state.transcriptIds.push(await recordStep({
                    missionId: action.missionId,
                    agentId: action.agentId,
                    runId,
                    eventType: 'runtime_warning',
                    summary: `${response.toolName} succeeded on retry ${attempt}.`,
                    metadata: { step: state.step - 1, attempt, retryLimit },
                  }));
                }
                break;
              } catch (error: any) {
                lastError = error;
                if (attempt >= retryLimit) throw error;
                state.transcriptIds.push(await recordStep({
                  missionId: action.missionId,
                  agentId: action.agentId,
                  runId,
                  eventType: 'runtime_warning',
                  summary: `${response.toolName} failed attempt ${attempt + 1}; retrying after backoff.`,
                  metadata: { step: state.step - 1, attempt: attempt + 1, retryLimit, reason: redactSensitiveText(error.message || String(error)) },
                }));
                await backoffSleepMs(attempt);
              }
            }
            if (output === undefined) throw lastError || new Error(`${response.toolName} produced no output.`);
            await completeToolInvocation(invocationId, output);
            state.toolResults.push({ invocationId, toolName: response.toolName, output });
            state.evidence.toolCalls.push(invocationId);
            const parsedOutput = typeof output === 'string' ? safeJson<Record<string, any>>(output, {}) : output as Record<string, any>;
            if (parsedOutput?.evidence) mergeEvidence(state.evidence, parsedOutput.evidence);
            state.logs.push(`${response.toolName} completed`);
            sessionEventBus.emitEvent({
              sessionId: '',
              missionId: action.missionId,
              kind: 'tool_completed',
              at: new Date().toISOString(),
              data: { agentId: action.agentId, toolName: response.toolName, invocationId, hasOutput: output !== undefined },
            });
            const metric = await operationalMetrics.record({
              missionId: action.missionId,
              agentId: action.agentId,
              eventType: 'tool',
              outcome: 'completed',
              durationMs: Date.now() - startedAt,
              metadata: { toolName: response.toolName, mode },
            });
            state.metricIds.push(metric.id);
            return {};
          } catch (error: any) {
            await completeToolInvocation(invocationId, error.commandResult || null, error.message || String(error));
            return { error };
          }
        })
        .addConditionalEdges('agent', (state) => {
          if (state.error || state.result) return END;
          if (state.response?.type === 'tool_call') return 'tool';
          return 'agent';
        })
        .addEdge('tool', 'agent')
        .addEdge(START, 'agent')
        .compile();

      const finalState = await graph.invoke({
        step: 0,
        toolResults,
        evidence,
        logs,
        transcriptIds,
        metricIds,
        lastModelUsage,
        response: null,
        result: null,
        error: null
      });

      if (finalState.error) {
        throw finalState.error;
      }
      
      return finalState.result;
    } catch (error: any) {
      await updateAgentRun(runId, 'failed', undefined, error.message || String(error), logs);
      const metric = await operationalMetrics.record({
        missionId: action.missionId,
        agentId: action.agentId,
        eventType: 'failure',
        outcome: 'failed',
        durationMs: Date.now() - startedAt,
        metadata: { capability: action.capability, mode, reason: redactSensitiveText(error.message || String(error)) },
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
