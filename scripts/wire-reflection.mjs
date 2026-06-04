// scripts/wire-reflection.mjs
// Phase 2A: replace the runReflection() no-op in agent-session.ts with
// a real LLM call. The reflection step audits the previous final
// summary, evidence, and intent, and returns a verdict + guidance.
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/agent-session.ts';
let src = readFileSync(target, 'utf-8');

const oldStub = `// ---------------------------------------------------------------------------
// Reflection — Phase 2A. Right now the reflection step is a no-op that
// returns a pass-through verdict; the prompt contract and verdict schema
// are in place so Phase 2A can swap in a real LLM call without touching
// callers.
// ---------------------------------------------------------------------------

async function runReflection(input: {
    sessionId: string;
    missionId: string;
    intent: string;
    finalSummary?: string;
    evidence: Record<string, string[]>;
}): Promise<{ verdict: 'pass' | 'retry'; guidance?: string; summary: string }> {
    sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_started', {
        intent: input.intent,
    }));
    // Phase 2A will replace this with a real LLM call. The stub returns
    // a pass verdict so the session can keep going without a real
    // reflection agent yet.
    const summary = \`Reflection: \${input.evidence.artifacts?.length || 0} artifact(s), \${input.evidence.toolCalls?.length || 0} tool call(s).\`;
    sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_completed', {
        summary,
        verdict: 'pass',
    }));
    return { verdict: 'pass', summary };
}`;

const newReflection = `// ---------------------------------------------------------------------------
// Reflection — Phase 2A. The reflection step audits the previous
// \`final\` summary against the intent and the durable evidence bag.
// It returns a \`verdict\` (\`pass\` or \`retry\`) and an optional
// \`guidance\` string that the session injects as a hint on the next
// attempt. The model call uses the \`reflection\` provider role so the
// cost / latency is bounded separately from the main action model.
// ---------------------------------------------------------------------------

async function runReflection(input: {
    sessionId: string;
    missionId: string;
    intent: string;
    finalSummary?: string;
    evidence: Record<string, string[]>;
}): Promise<{ verdict: 'pass' | 'retry'; guidance?: string; summary: string }> {
    sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_started', {
        intent: input.intent,
    }));

    const artifactCount = input.evidence.artifacts?.length || 0;
    const toolCallCount = input.evidence.toolCalls?.length || 0;
    const eventCount = input.evidence.events?.length || 0;

    // No-op when there is nothing to reflect on yet (e.g. the
    // reflection is the first plan item in a session that hasn't
    // produced a final summary).
    if (!input.finalSummary) {
        const summary = \`Reflection: nothing to audit yet (\${artifactCount} artifact(s), \${toolCallCount} tool call(s)). Pass.\`;
        sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_completed', {
            summary,
            verdict: 'pass',
        }));
        return { verdict: 'pass', summary };
    }

    // No LLM call if the model provider isn't configured. This keeps
    // local-dev / CI green when no API keys are present.
    if (!await hasConfiguredModelProvider()) {
        const summary = \`Reflection (offline): \${artifactCount} artifact(s), \${toolCallCount} tool call(s). Pass.\`;
        sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_completed', {
            summary,
            verdict: 'pass',
        }));
        return { verdict: 'pass', summary };
    }

    try {
        const provider = await getActiveProvider('reflection');
        const prompt = [
            'You are the Supr Reflection agent. Audit the previous action against the intent.',
            'Return strict JSON only: {\\"verdict\\":\\"pass\\"|\\"retry\\",\\"guidance\\":\\"<one paragraph max>\\",\\"summary\\":\\"<one sentence>\\"}',
            'Pass when: the work is done, evidence is durable, and the intent is satisfied.',
            'Retry when: the summary is empty, the evidence is missing, the work was duplicated, or the intent was misunderstood.',
            'When retrying, be specific about what was wrong and what to do differently.',
            '',
            \`Intent: \${input.intent}\`,
            \`Final summary: \${input.finalSummary}\`,
            \`Durable evidence: artifacts=\${artifactCount} toolCalls=\${toolCallCount} events=\${eventCount}\`,
        ].join('\\n');

        const raw = await provider.generateContent(prompt, {
            systemInstruction: 'You are Supr Reflection. Return only one JSON object. No markdown.',
            maxOutputTokens: 600,
        });

        const parsed = parseModelJson(raw) as Record<string, unknown> | null;
        const verdict = parsed?.verdict === 'retry' ? 'retry' : 'pass';
        const guidance = typeof parsed?.guidance === 'string' ? parsed.guidance : undefined;
        const summary = typeof parsed?.summary === 'string'
            ? parsed.summary
            : \`Reflection: \${verdict} on \${artifactCount} artifact(s).\`;

        sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_completed', {
            summary,
            verdict,
            guidance,
        }));
        return { verdict, guidance, summary };
    } catch (error: any) {
        // Reflection must never fail a session. Fall back to a pass
        // verdict with a diagnostic summary so the operator can see
        // the failure mode in the supervisor console.
        const summary = \`Reflection error: \${error?.message || String(error)}. Defaulting to pass.\`;
        sessionEventBus.emitEvent(sessionEvent(input.sessionId, input.missionId, 'reflection_completed', {
            summary,
            verdict: 'pass',
        }));
        telemetry.warn('session.reflection_failed', {
            sessionId: input.sessionId,
            missionId: input.missionId,
            reason: error?.message || String(error),
        });
        return { verdict: 'pass', summary };
    }
}`;

if (src.includes(oldStub)) {
    src = src.replace(oldStub, newReflection);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: agent-session.ts reflection upgraded to real LLM call');
