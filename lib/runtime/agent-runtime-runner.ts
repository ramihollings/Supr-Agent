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
import type {
  AgentActionRecord,
  AgentContextBundle,
  AgentRuntimeRunInput,
  AgentRuntimeRunResult,
  ModelToolResponse,
  RuntimeMode,
} from './types';

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

function summarize(value: unknown, max = 8000) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function parseModelToolResponse(raw: string): ModelToolResponse {
  if (!raw.trim()) return { type: 'invalid', reason: 'Model returned empty output.', raw };
  try {
    const parsed = parseModelJson(raw);
    if (parsed.type === 'tool_call' && parsed.toolName && parsed.arguments && typeof parsed.arguments === 'object') {
      return {
        type: 'tool_call',
        toolName: String(parsed.toolName),
        arguments: parsed.arguments,
        rationale: parsed.rationale ? String(parsed.rationale) : undefined,
      };
    }
    if (parsed.type === 'final' && parsed.summary) {
      return { type: 'final', summary: String(parsed.summary), evidence: parsed.evidence || undefined };
    }
    if (parsed.type === 'needs_approval' && parsed.reason) {
      return { type: 'needs_approval', reason: String(parsed.reason) };
    }
    if (parsed.type === 'message' && parsed.content) {
      return { type: 'message', content: String(parsed.content) };
    }
    return { type: 'invalid', reason: 'Model response did not match the runtime protocol.', raw };
  } catch (error: any) {
    return { type: 'invalid', reason: `Model response was not valid JSON: ${error.message}`, raw };
  }
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

function inferProviderRole(action: AgentActionRecord): 'supr' | 'code' | 'research' | 'reflection' | 'sub' {
  if (action.capability.includes('web')) return 'research';
  if (action.capability.includes('workspace') || action.capability.includes('execute')) return 'code';
  if (action.capability.includes('skill') || /sial|reflection|learn/i.test(action.intent || '')) return 'reflection';
  return 'supr';
}

async function getModelResponse(input: {
  action: AgentActionRecord;
  context: AgentContextBundle;
  toolResults: Array<Record<string, unknown>>;
  runId: string;
  mode: RuntimeMode;
  deadline: number | null;
  transcriptIds: string[];
}) {
  const role = inferProviderRole(input.action);
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
  let streamed = '';
  try {
    for await (const chunk of provider.streamContent(prompt, {
      systemInstruction: 'Return only one JSON object matching the Supr runtime protocol. Do not include markdown.',
      maxOutputTokens: 1200,
    })) {
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
    return withRuntimeTimeout(provider.generateContent(prompt, {
      systemInstruction: 'Return only one JSON object matching the Supr runtime protocol. Do not include markdown.',
      maxOutputTokens: 1200,
    }), input.deadline, 'model response');
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

function mergeEvidence(current: Record<string, string[]>, next: Record<string, string[]> = {}) {
  for (const [key, values] of Object.entries(next)) {
    current[key] = Array.from(new Set([...(current[key] || []), ...(Array.isArray(values) ? values : [])]));
  }
}

function hasCompletionEvidence(evidence: Record<string, string[]>) {
  return Object.values(evidence).some((values) => Array.isArray(values) && values.length > 0);
}

function hasMeaningfulToolOutput(output: unknown) {
  if (output === null || output === undefined) return false;
  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (!trimmed) return false;
    if (trimmed === '[]' || trimmed === '{}') return false;
    return true;
  }
  if (Array.isArray(output)) return output.length > 0;
  if (typeof output === 'object') return Object.keys(output).length > 0;
  return true;
}

function assertNotCancelled(input: AgentRuntimeRunInput) {
  if (input.cancellationToken?.aborted) {
    throw new Error(`Runtime cancelled${input.cancellationToken.reason ? `: ${input.cancellationToken.reason}` : '.'}`);
  }
}

function remainingTime(deadline: number | null) {
  if (!deadline) return null;
  return Math.max(0, deadline - Date.now());
}

async function withRuntimeTimeout<T>(operation: Promise<T>, deadline: number | null, label: string): Promise<T> {
  const remaining = remainingTime(deadline);
  if (remaining === null) return operation;
  if (remaining <= 0) throw new Error(`Runtime timeout before ${label}.`);
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Runtime timeout during ${label}.`)), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function runAgentRuntimeAction(input: AgentRuntimeRunInput & { flowRunId?: string | null } | string): Promise<AgentRuntimeRunResult> {
  const normalized: AgentRuntimeRunInput & { flowRunId?: string | null } = typeof input === 'string' ? { actionId: input } : input;
  const actionBefore = await getAgentAction(normalized.actionId);
  if (!actionBefore) throw new Error(`Agent action not found: ${normalized.actionId}`);

  const mode = normalized.mode || await getRuntimeMode();
  const startedAt = Date.now();
  const timeoutMs = normalized.budget?.timeoutMs ? Math.max(1000, normalized.budget.timeoutMs) : null;
  const deadline = timeoutMs ? startedAt + timeoutMs : null;
  const retryLimit = Math.max(0, Math.min(3, normalized.budget?.retryLimit || 0));
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

      const maxSteps = Math.max(1, Math.min(10, normalized.budget?.maxSteps || 4));
      for (let step = 0; step < maxSteps; step += 1) {
        assertNotCancelled(normalized);
        if (deadline && Date.now() >= deadline) {
          throw new Error(`Runtime timeout exceeded after ${Date.now() - startedAt}ms.`);
        }
        // Note: getModelResponse() already calls getActiveProvider(), which
        // throws a helpful "No model provider is configured..." error if
        // no key is set. No need to pre-check here.
        const raw = await withRuntimeTimeout(getModelResponse({
          action,
          context,
          toolResults,
          runId,
          mode,
          deadline,
          transcriptIds,
        }), deadline, 'model response');
        const response = parseModelToolResponse(raw);

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
                toolRegistry.executeTool(response.toolName, response.arguments, action.agentId, action.missionId),
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
                summary: `${response.toolName} failed attempt ${attempt + 1}; retrying.`,
                metadata: { step, attempt: attempt + 1, retryLimit, reason: error.message || String(error) },
              }));
            }
          }
          if (output === undefined) throw lastError || new Error(`${response.toolName} produced no output.`);
          await completeToolInvocation(invocationId, output);
          toolResults.push({ invocationId, toolName: response.toolName, output });
          evidence.toolCalls.push(invocationId);
          const parsedOutput = typeof output === 'string' ? safeJson<Record<string, any>>(output, {}) : output as Record<string, any>;
          if (parsedOutput?.evidence) mergeEvidence(evidence, parsedOutput.evidence);
          logs.push(`${response.toolName} completed`);
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
