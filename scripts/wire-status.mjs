// scripts/wire-status.mjs
// Phase 2C: real-time per-agent status. The runtime bumps
// Agent_Runs.heartbeat on every step, and writes a compact log line
// to Agent_Runs.logs so the chat UI can show "step N/M, currently
// calling tool X" rather than a binary Working/Idle.
import { readFileSync, writeFileSync } from 'node:fs';

// --- 1) Runtime: bump heartbeat + log current step on every step.
const runnerPath = 'lib/runtime/agent-runtime-runner.ts';
let runnerSrc = readFileSync(runnerPath, 'utf-8');

const oldHeartbeat = `async function createAgentRun(action: AgentActionRecord, flowRunId?: string | null) {
  const runId = id('run');
  await dbClient.execute(
    \`INSERT INTO Agent_Runs
      (id, flow_run_id, mission_id, agent_action_id, agent_id, status, heartbeat, logs, started_at)
     VALUES (?, ?, ?, ?, ?, 'running', 0, '[]', CURRENT_TIMESTAMP)\`,
    [
      runId,
      flowRunId || null,
      action.missionId,
      action.id,
      action.agentId || null,
    ],
  );
  return runId;
}`;

const newHeartbeat = `async function createAgentRun(action: AgentActionRecord, flowRunId?: string | null) {
  const runId = id('run');
  await dbClient.execute(
    \`INSERT INTO Agent_Runs
      (id, flow_run_id, mission_id, agent_action_id, agent_id, status, heartbeat, logs, started_at)
     VALUES (?, ?, ?, ?, ?, 'running', 0, '[]', CURRENT_TIMESTAMP)\`,
    [
      runId,
      flowRunId || null,
      action.missionId,
      action.id,
      action.agentId || null,
    ],
  );
  return runId;
}

/**
 * Phase 2C: append a structured entry to Agent_Runs.logs and bump
 * the heartbeat counter. The chat UI reads the last log entry to
 * surface "step N of M, currently calling tool X" without polling
 * the runtime.
 */
async function appendAgentRunStep(input: {
  runId: string;
  step: number;
  event: 'model_thinking' | 'tool_calling' | 'tool_returned' | 'final' | 'failure';
  detail?: Record<string, unknown>;
}) {
  const entry = {
    at: new Date().toISOString(),
    step: input.step,
    event: input.event,
    ...(input.detail || {}),
  };
  await dbClient.execute(
    \`UPDATE Agent_Runs
     SET heartbeat = heartbeat + 1,
         logs = json_insert(COALESCE(logs, '[]'), '$[#]', json(?), updated_at = CURRENT_TIMESTAMP
     WHERE id = ?\`,
    [JSON.stringify(entry), input.runId],
  );
}`;

if (runnerSrc.includes(oldHeartbeat) && !runnerSrc.includes('appendAgentRunStep')) {
    runnerSrc = runnerSrc.replace(oldHeartbeat, newHeartbeat);
}

// Wire appendAgentRunStep() into the per-step loop. We do this by
// placing a call right after the model response is parsed.
const oldModelResponse = `        const response = parseModelToolResponse(raw);

        if (response.type === 'invalid') {`;
const newModelResponse = `        const response = parseModelToolResponse(raw);

        // Phase 2C: record a heartbeat step so the chat UI can show
        // \`step N of M, currently calling tool X\`. We capture the
        // raw model step count from \`step\` plus the response kind.
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

        if (response.type === 'invalid') {`;

if (runnerSrc.includes(oldModelResponse) && !runnerSrc.includes('appendAgentRunStep({\n            runId')) {
    runnerSrc = runnerSrc.replace(oldModelResponse, newModelResponse);
}

// Also bump heartbeat on tool_called / tool_completed so the squad
// panel can show which tool is in flight.
const oldToolRecordStep = `        transcriptIds.push(await recordStep({
          missionId: action.missionId,
          agentId: action.agentId,
          runId,
          eventType: 'runtime_tool',
          summary: \`Calling \${response.toolName}\`,
          metadata: { step, rationale: response.rationale },
        }));`;
const newToolRecordStep = `        transcriptIds.push(await recordStep({
          missionId: action.missionId,
          agentId: action.agentId,
          runId,
          eventType: 'runtime_tool',
          summary: \`Calling \${response.toolName}\`,
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
        } catch {}`;

if (runnerSrc.includes(oldToolRecordStep) && !runnerSrc.includes("event: 'tool_calling'")) {
    runnerSrc = runnerSrc.replace(oldToolRecordStep, newToolRecordStep);
}

writeFileSync(runnerPath, runnerSrc, 'utf-8');
console.log('OK: agent-runtime-runner.ts heartbeat bumping wired');

// --- 2) Chat-action: surface the real-time status from the latest
//       Agent_Runs.logs entry. Currently fetchAgentStatuses returns
//       a binary Working/Idle based on a Tasks-row lookup. We add
//       a `detail` field that, when set, is what the squad panel
//       shows ("step 3/4, calling web_scrape").
const chatPath = 'app/actions/chat-workspace.ts';
let chatSrc = readFileSync(chatPath, 'utf-8');

const oldAgentStatusReturn = `      return {
        id: a.id,
        name: a.name,
        role: a.role,
        permissionTier: a.permission_tier,
        isPermanent: a.type === 'permanent',
        currentTask: task?.title || null,
        currentProject: missionName || null,
        status: task ? 'Working' : 'Idle',
      };`;

const newAgentStatusReturn = `      // Phase 2C: pull the latest Agent_Runs.logs entry for this
      // agent so the chat UI can render "step N/M, currently
      // calling tool X" instead of a binary Working/Idle.
      let detail: { step?: number; toolName?: string; lastEventAt?: string } | null = null;
      try {
        const runRows = await dbClient.query<any>(
          \`SELECT logs, heartbeat, updated_at FROM Agent_Runs
           WHERE agent_id = ? AND status = 'running'
           ORDER BY updated_at DESC LIMIT 1\`,
          [a.id],
        );
        const lastLog = runRows[0]?.logs ? safeJson<any[]>(runRows[0].logs, []).slice(-1)[0] : null;
        if (lastLog && (lastLog.toolName || lastLog.kind)) {
          detail = {
            step: typeof lastLog.step === 'number' ? lastLog.step : undefined,
            toolName: typeof lastLog.toolName === 'string' ? lastLog.toolName : (lastLog.kind === 'tool_call' ? lastLog.toolName : undefined),
            lastEventAt: lastLog.at,
          };
        }
      } catch {}

      return {
        id: a.id,
        name: a.name,
        role: a.role,
        permissionTier: a.permission_tier,
        isPermanent: a.type === 'permanent',
        currentTask: task?.title || null,
        currentProject: missionName || null,
        status: task ? 'Working' : 'Idle',
        detail,
      };`;

if (chatSrc.includes(oldAgentStatusReturn) && !chatSrc.includes('Phase 2C: pull the latest Agent_Runs.logs')) {
    chatSrc = chatSrc.replace(oldAgentStatusReturn, newAgentStatusReturn);
}

writeFileSync(chatPath, chatSrc, 'utf-8');
console.log('OK: chat-workspace.ts fetchAgentStatuses returns real-time detail');
