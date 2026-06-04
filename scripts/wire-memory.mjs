// scripts/wire-memory.mjs
// Phase 1D: after a successful `final` response, the runtime writes a
// compact Memory_Section summarising the run so the next iteration of
// the same mission (or the next session) sees what was decided.
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/agent-runtime-runner.ts';
let src = readFileSync(target, 'utf-8');

// 1. Import memorySectionService and the database at the top of the
//    file. The runtime already imports dbClient; we just need the
//    service.
const oldAddActivityLogImport = "import { addActivityLog, getMissionById } from '@/lib/db';";
if (!src.includes('memorySectionService')) {
    src = src.replace(
        oldAddActivityLogImport,
        "import { addActivityLog, getMissionById } from '@/lib/db';\nimport { memorySectionService } from '@/lib/services/memory-sections';"
    );
}

// 2. After the `final` block writes the result row, also persist a
//    short Memory_Section so the next session/agent sees the
//    outcome. The runtime is a single-shot: the next session is
//    a brand-new `runAgentSession()` call which calls
//    `assembleAgentContext()` which reads Memory_Sections. Without
//    this hook the next session starts with an empty memory bag.
const oldFinalBlock = `          const result = {
            summary: response.summary,
            mode,
            agentRunId: runId,
            transcriptIds,
            evidence,
            injectedSections: context.injectedSections,
          };
          await updateAgentRun(runId, 'completed', result, undefined, logs);`;

const newFinalBlock = `          const result = {
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
              title: \`Run \${action.id.slice(0, 8)}: \${action.capability}\`,
              content: [
                \`Summary: \${response.summary}\`,
                \`Evidence: artifacts=\${(evidence.artifacts || []).length} toolCalls=\${(evidence.toolCalls || []).length} events=\${(evidence.events || []).length}\`,
                \`Mode: \${mode}\`,
              ].join('\\n'),
              provenance: 'agent',
              injectionStatus: 'active',
            });
          } catch (memoryError: any) {
            telemetry.warn('runtime.memory_persist_failed', {
              actionId: action.id,
              reason: memoryError?.message || String(memoryError),
            });
          }`;

if (src.includes(oldFinalBlock) && !src.includes('memory_persist_failed')) {
    src = src.replace(oldFinalBlock, newFinalBlock);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: agent-runtime-runner.ts memory auto-snapshot wired');
