/**
 * Pure helpers for the agent runtime.
 *
 * Every helper in this file is a small, side-effect-free function
 * that's testable in isolation. The runtime loop in
 * `agent-runtime-runner.ts` composes them. The split exists so the
 * `tests/agent-runtime-pure.test.mjs` suite can import these
 * helpers directly and exercise the protocol parser, the
 * hard-evidence rule, the timeout race, and the role-inference
 * table without a database or a model.
 *
 * The "hard evidence rule" lives here: a model response of type
 * "final" must carry at least one piece of evidence (artifact
 * id, memory id, transcript event id, or tool-call id) or the
 * run is rejected as a failed finalization. This is the runtime's
 * defense against a model that emits "done" without actually
 * doing anything.
 */

import type { ModelToolResponse } from './types';

/**
 * The Supr runtime protocol. The model must return one of these
 * JSON shapes; anything else is treated as `invalid` and the
 * step is retried up to the budget.
 */
export type RuntimeProtocolResponse = ModelToolResponse;

/**
 * Parse a raw model output into a runtime-protocol response.
 *
 * The parser is strict: an unknown `type` is invalid, a missing
 * required field for a known type is invalid, and a non-JSON
 * payload is invalid. The raw text is preserved on the response
 * for transcript persistence and the runner can record it in
 * Event_Log for the operator to inspect.
 */
export function parseModelToolResponse(raw: string): ModelToolResponse {
  if (!raw.trim()) return { type: 'invalid', reason: 'Model returned empty output.', raw };
  try {
    // Lazy import to avoid a circular dep: model-json.ts imports
    // nothing from this file but agent-runtime-runner.ts re-exports
    // these helpers.
    const { parseModelJson } = require('./model-json') as typeof import('./model-json');
    const parsed = parseModelJson<Record<string, unknown>>(raw);
    if (parsed.type === 'tool_call' && parsed.toolName && parsed.arguments && typeof parsed.arguments === 'object') {
      return {
        type: 'tool_call',
        toolName: String(parsed.toolName),
        arguments: parsed.arguments as Record<string, unknown>,
        rationale: parsed.rationale ? String(parsed.rationale) : undefined,
      };
    }
    if (parsed.type === 'final' && parsed.summary) {
      return { type: 'final', summary: String(parsed.summary), evidence: parsed.evidence as Record<string, string[]> | undefined };
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

/**
 * The hard evidence rule. A "final" response must carry at least
 * one piece of evidence in any of the four categories, or the
 * runtime rejects the finalization. Returns true when the
 * evidence bag is non-empty in at least one category.
 */
export function hasCompletionEvidence(evidence: Record<string, string[]> | undefined): boolean {
  if (!evidence) return false;
  return Object.values(evidence).some((values) => Array.isArray(values) && values.length > 0);
}

/**
 * Reject empty tool output as durable evidence. Strings that
 * trim to '' or the literal `[]` / `{}` do not count; arrays and
 * objects with no keys do not count. A non-empty string, array,
 * or object passes.
 */
export function hasMeaningfulToolOutput(output: unknown): boolean {
  if (output === null || output === undefined) return false;
  if (typeof output === 'string') {
    const trimmed = output.trim();
    if (!trimmed) return false;
    if (trimmed === '[]' || trimmed === '{}') return false;
    return true;
  }
  if (Array.isArray(output)) return output.length > 0;
  if (typeof output === 'object') return Object.keys(output as object).length > 0;
  return true;
}

/**
 * Merge two evidence bags. The next bag's entries are appended
 * (deduped) to the current bag. Used to fold a tool's own
 * `output.evidence` into the runtime's running evidence list.
 */
export function mergeEvidence(current: Record<string, string[]>, next: Record<string, string[]> = {}): void {
  for (const [key, values] of Object.entries(next)) {
    current[key] = Array.from(new Set([...(current[key] || []), ...(Array.isArray(values) ? values : [])]));
  }
}

/**
 * Infer the provider role from the action's capability + intent.
 * Used by the runtime to pick the right provider override
 * (e.g. a "research_web" capability should go to the research
 * provider, not the default supr chain).
 *
 * Pure: depends only on the strings. The original regex had a
 * typo (`/sial|/`); this version uses `/skill|/` so the
 * 'skill' capability substring actually matches.
 */
export function inferProviderRole(capability: string, intent?: string): 'supr' | 'code' | 'research' | 'reflection' | 'sub' {
  if (capability.includes('web')) return 'research';
  if (capability.includes('workspace') || capability.includes('execute')) return 'code';
  if (capability.includes('skill') || /reflection|learn/i.test(intent || '')) return 'reflection';
  return 'supr';
}

/**
 * Race a Promise against a deadline. The label is included in
 * the timeout error so operators can see which phase stalled.
 *
 * If `deadline` is null, the operation is awaited as-is
 * (no timeout enforced). Callers that want a hard fallback
 * must set a deadline -- agent-runtime-runner.ts does this
 * by defaulting to 60 seconds when the budget is missing.
 */
export async function withRuntimeTimeout<T>(operation: Promise<T>, deadline: number | null, label: string): Promise<T> {
  if (deadline === null) return operation;
  const remaining = Math.max(0, deadline - Date.now());
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

/**
 * Default per-call budget when the caller doesn't supply one.
 * The runtime's hard fallback: a 60-second total deadline and
 * 4 max steps. This is what runAgentRuntimeAction applies when
 * `normalized.budget` is missing or partial.
 */
export const DEFAULT_RUNTIME_BUDGET = {
  maxSteps: 4,
  timeoutMs: 60_000,
  retryLimit: 0,
  maxOutputTokens: 4096,
} as const;
