// Wire session bus emissions into the runtime runner (Phase 1B)
import { readFileSync, writeFileSync } from 'node:fs';

const target = 'lib/runtime/agent-runtime-runner.ts';
let src = readFileSync(target, 'utf-8');

// 1. Add the session bus import next to the existing `notifyMissionChanged` import area.
//    We insert after the existing `import { ... } from './types';` line.
const typesImport = "import type {\n  AgentActionRecord,\n  AgentContextBundle,\n  AgentRuntimeBudget,\n  AgentRuntimeRunInput,\n  AgentRuntimeRunResult,\n  RuntimeMode,\n} from './types';";
if (!src.includes(typesImport)) {
    console.error('Could not find types import anchor');
    process.exit(1);
}
const sessionBusImport = "\nimport { sessionEventBus } from './agent-session';";
if (!src.includes(sessionBusImport)) {
    src = src.replace(typesImport, typesImport + sessionBusImport);
}

// 2. Emit a model_chunk event for every non-empty streaming chunk.
//    Original block (around line 137):
//      for await (const chunk of provider.streamContent(prompt, modelOptions)) {
//        streamed += chunk;
//        if (chunk.trim()) {
//          input.transcriptIds.push(await recordStep({ ... eventType: 'runtime_model_stream' ... }));
//        }
//      }
const oldStreamingLoop = `    for await (const chunk of provider.streamContent(prompt, modelOptions)) {
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
    }`;
const newStreamingLoop = `    for await (const chunk of provider.streamContent(prompt, modelOptions)) {
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
    }`;
if (src.includes(oldStreamingLoop)) {
    src = src.replace(oldStreamingLoop, newStreamingLoop);
} else {
    console.error('Could not find streaming loop block');
    process.exit(1);
}

// 3. Emit tool_called before recordToolInvocation.
const oldToolStart = `        transcriptIds.push(await recordStep({
          missionId: action.missionId,
          agentId: action.agentId,
          runId,
          eventType: 'runtime_tool',
          summary: \`Calling \${response.toolName}\`,
          metadata: { step, rationale: response.rationale },
        }));

        const invocationId = await recordToolInvocation({`;
const newToolStart = `        transcriptIds.push(await recordStep({
          missionId: action.missionId,
          agentId: action.agentId,
          runId,
          eventType: 'runtime_tool',
          summary: \`Calling \${response.toolName}\`,
          metadata: { step, rationale: response.rationale },
        }));
        // Phase 1B: notify session bus that a tool call is starting.
        sessionEventBus.emitEvent({
          sessionId: '',
          missionId: action.missionId,
          kind: 'tool_called',
          at: new Date().toISOString(),
          data: { agentId: action.agentId, toolName: response.toolName, args: response.arguments, step },
        });

        const invocationId = await recordToolInvocation({`;
if (src.includes(oldToolStart)) {
    src = src.replace(oldToolStart, newToolStart);
}

// 4. Emit tool_completed after the tool invocation completes successfully.
const oldToolDone = `          await completeToolInvocation(invocationId, output);
          toolResults.push({ invocationId, toolName: response.toolName, output });
          evidence.toolCalls.push(invocationId);
          const parsedOutput = typeof output === 'string' ? safeJson<Record<string, any>>(output, {}) : output as Record<string, any>;
          if (parsedOutput?.evidence) mergeEvidence(evidence, parsedOutput.evidence);
          logs.push(\`\${response.toolName} completed\`);`;
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
          });`;
if (src.includes(oldToolDone)) {
    src = src.replace(oldToolDone, newToolDone);
}

writeFileSync(target, src, 'utf-8');
console.log('OK: agent-runtime-runner.ts wired for session bus');
