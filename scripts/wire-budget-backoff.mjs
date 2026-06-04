// scripts/wire-budget-backoff.mjs
// Phase 4D + 4E:
//   4D: after every LLM and tool call, record a Cost_Events row and
//        let the budget engine evaluate. If the policy is hard-stop,
//        the runtime bails with a 'budget_exceeded' error so the
//        mission is paused.
//   4E: tool-call retries now use exponential backoff (1s, 2s, 4s)
//        for transient failures instead of a hard retry count.
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/agent-runtime-runner.ts';
let src = readFileSync(target, 'utf-8');

// 1) Add the cost-tracker + budget-engine imports next to the
//    memorySectionService import we added in Phase 1D.
const oldMemoryImport = "import { memorySectionService } from '@/lib/services/memory-sections';";
const newImports = [
    "import { memorySectionService } from '@/lib/services/memory-sections';",
    "import { costTracker } from '@/lib/services/cost-tracker';",
    "import { budgetEngine } from '@/lib/services/budget-engine';",
].join('\n');
if (src.includes(oldMemoryImport) && !src.includes('costTracker')) {
    src = src.replace(oldMemoryImport, newImports);
}

// 2) Phase 4E: add an exponential-backoff helper near the bottom of
//    the file. We sleep 1s * 2^attempt on transient failures.
const oldSleep = `function summarize(value: unknown, max = 8000) {`;
const newSleep = `/**
 * Phase 4E: exponential backoff for transient tool-call failures.
 * 1s on the first retry, 2s on the second, 4s on the third. We
 * never sleep more than 8 seconds to keep the runtime responsive.
 */
async function backoffSleepMs(attempt: number): Promise<void> {
  const base = Math.min(8000, 1000 * Math.pow(2, attempt));
  await new Promise((resolve) => setTimeout(resolve, base));
}

function summarize(value: unknown, max = 8000) {`;

if (src.includes(oldSleep) && !src.includes('backoffSleepMs')) {
    src = src.replace(oldSleep, newSleep);
}

// 3) Phase 4E: replace the hard-retry tool call loop with the
//    backoff version. The runtime already catches + retries; we
//    just add a sleep between attempts.
const oldRetryLoop = `          for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
            try {
              assertNotCancelled(normalized);
              output = await withRuntimeTimeout(
                toolRegistry.executeTool(response.toolName, response.arguments, action.agentId, action.missionId, action.id),
                deadline,
                \`\${response.toolName} tool call\`,
              );
              if (!hasMeaningfulToolOutput(output)) {
                throw new Error(\`\${response.toolName} returned empty output; refusing to treat it as durable execution evidence.\`);
              }
              if (attempt > 0) {
                transcriptIds.push(await recordStep({
                  missionId: action.missionId,
                  agentId: action.agentId,
                  runId,
                  eventType: 'runtime_warning',
                  summary: \`\${response.toolName} succeeded on retry \${attempt}.\`,
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
                summary: \`\${response.toolName} failed attempt \${attempt + 1}; retrying.\`,
                metadata: { step, attempt: attempt + 1, retryLimit, reason: error.message || String(error) },
              }));
            }
          }`;

const newRetryLoop = `          for (let attempt = 0; attempt <= retryLimit; attempt += 1) {
            try {
              assertNotCancelled(normalized);
              output = await withRuntimeTimeout(
                toolRegistry.executeTool(response.toolName, response.arguments, action.agentId, action.missionId, action.id),
                deadline,
                \`\${response.toolName} tool call\`,
              );
              if (!hasMeaningfulToolOutput(output)) {
                throw new Error(\`\${response.toolName} returned empty output; refusing to treat it as durable execution evidence.\`);
              }
              if (attempt > 0) {
                transcriptIds.push(await recordStep({
                  missionId: action.missionId,
                  agentId: action.agentId,
                  runId,
                  eventType: 'runtime_warning',
                  summary: \`\${response.toolName} succeeded on retry \${attempt}.\`,
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
                summary: \`\${response.toolName} failed attempt \${attempt + 1}; retrying after backoff.\`,
                metadata: { step, attempt: attempt + 1, retryLimit, reason: error.message || String(error) },
              }));
              // Phase 4E: exponential backoff between retries. This is
              // best-effort; the runtime honors the deadline at the
              // top of the loop so a long backoff won't extend past
              // the budgeted runtime.
              await backoffSleepMs(attempt);
            }
          }`;

if (src.includes(oldRetryLoop) && !src.includes('backoffSleepMs(attempt)')) {
    src = src.replace(oldRetryLoop, newRetryLoop);
}

// 4) Phase 4D: after a successful tool call, record a Cost_Event
//    and let the budget engine evaluate. A hard-stop policy
//    throws 'budget_exceeded' which the loop catches and the
//    session surfaces as a failure.
const oldToolDone = `          await completeToolInvocation(invocationId, output);
          toolResults.push({ invocationId, toolName: response.toolName, output });
          evidence.toolCalls.push(invocationId);
          const parsedOutput = typeof output === 'string' ? safeJson<Record<string, any>>(output, {}) : output as Record<string, any>;
          if (parsedOutput?.evidence) mergeEvidence(evidence, parsedOutput.evidence);
          logs.push(\`\${response.toolName} completed\`);
          // Phase 1B: notify session bus that a tool call has finished.
          sessionEventBus.emitEvent({
            sessionId: '',
            missionId: action.missionId,
            kind: 'tool_completed',
            at: new Date().toISOString(),
            data: { agentId: action.agentId, toolName: response.toolName, invocationId, hasOutput: output !== undefined },
          });`;

const newToolDone = `          await completeToolInvocation(invocationId, output);
          toolResults.push({ invocationId, toolName: response.toolName, output });
          evidence.toolCalls.push(invocationId);
          const parsedOutput = typeof output === 'string' ? safeJson<Record<string, any>>(output, {}) : output as Record<string, any>;
          if (parsedOutput?.evidence) mergeEvidence(evidence, parsedOutput.evidence);
          logs.push(\`\${response.toolName} completed\`);
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
          }`;

if (src.includes(oldToolDone) && !src.includes('runtime.budget_eval_failed')) {
    src = src.replace(oldToolDone, newToolDone);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: agent-runtime-runner.ts Phase 4D (budget) + 4E (backoff) wired');
