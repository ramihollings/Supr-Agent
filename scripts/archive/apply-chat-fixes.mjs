// One-off script: apply chat routing/permissiveness fixes
// Replaces shouldRouteSuprChatToProjectFlow + buildDirectSuprChatResponse
// in app/actions/chat-workspace.ts to make the chat default to agentic routing.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve('app/actions/chat-workspace.ts');
const src = readFileSync(target, 'utf-8');

// FIX 2: default to routing (only fall through for explicit chitchat)
const oldRouter = `function shouldRouteSuprChatToProjectFlow(content: string, file?: SuprChatFile) {
  if (file) {
    return true;
  }

  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const directChatIntent =
    /^(hi|hello|hey|yo|test|ping|status|help)\\b/.test(normalized) ||
    /\\b(what are you working on|what are you currently working on|what are you doing|what is supr doing|are you there|still there|you online|current status|agent status|project status)\\b/.test(normalized);

  if (directChatIntent) {
    return false;
  }

  return /\\b(start|create|build|generate|run|execute|deploy|design|implement|fix|repair|write|make|draft|research|analyze|scan|validate|launch|ship|plan|schedule|route|queue|assign|spawn|update|refactor|debug|test)\\b/.test(normalized);
}`;

const newRouter = `function shouldRouteSuprChatToProjectFlow(content: string, file?: SuprChatFile) {
  // FIX 2: default to routing.
  //
  // The previous logic only routed to Project Flow when the message
  // contained an explicit action verb ("build", "fix", "generate", ...).
  // That meant anything ambiguous — "I want a coffee shop website",
  // "can you help me with a launch plan" — fell through to the
  // chatbot direct response, which the runtime never saw.
  //
  // The new rule is the inverse: route everything that isn't an
  // explicit chitchat opener (greeting / ping / status query). When in
  // doubt, ask the orchestrator to plan and spawn a sub-agent rather
  // than answer directly. Together with the auto-provisioning of a
  // mission in routeIntakeToProjectFlow, this means the chat window
  // now always has work to do.
  if (file) {
    return true;
  }

  const normalized = content.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  // Explicit chitchat: greet the supervisor, ask for status, ping
  // liveness, request help. These should NOT spin up a flow.
  const directChatIntent =
    /^(hi|hello|hey|yo|test|ping|status|help)\\b/.test(normalized) ||
    /\\b(what are you working on|what are you currently working on|what are you doing|what is supr doing|are you there|still there|you online|current status|agent status|project status)\\b/.test(normalized) ||
    /^help\\b|\\bwhat can you do\\b|\\bwho are you\\b/.test(normalized);

  if (directChatIntent) {
    return false;
  }

  // Default: route. The runtime + auto-provisioned mission will plan
  // and dispatch the work; if the request is too vague the model can
  // always ask the user for clarification during the flow.
  return true;
}`;

if (!src.includes(oldRouter)) {
    console.error('ERROR: could not find shouldRouteSuprChatToProjectFlow block in chat-workspace.ts');
    process.exit(1);
}
const next1 = src.replace(oldRouter, newRouter);

// FIX 3: buildDirectSuprChatResponse becomes agentic.
// It still answers greetings / status, but instead of telling the model
// to refuse routing work, it lets the orchestrator spin up a mission
// and sub-agents for anything substantive.
const oldDirect = `async function buildDirectSuprChatResponse(content: string) {
  const normalized = content.trim().toLowerCase();
  const [mission, agents] = await Promise.all([
    getActiveMission(),
    fetchAgentStatuses(),
  ]);
  const workingAgents = agents.filter((agent) => agent.status === 'Working');

  const fallbackStatus = () => [
    \`I'm here.\`,
    mission ? \`Active project: \${mission.name}.\` : \`No active project is selected right now.\`,
    workingAgents.length
      ? \`Currently working: \${workingAgents.map((agent) => \`\${agent.name}\${agent.currentTask ? \` on \${agent.currentTask}\` : ''}\${agent.currentProject ? \` for \${agent.currentProject}\` : ''}\`).join('; ')}.\`
      : \`No agents are actively working right now.\`,
    \`Say what you want built, fixed, generated, or run when you want me to route it into Project Flow.\`,
  ].join('\\n');

  if (/^help\\b|\\bwhat can you do\\b/.test(normalized)) {
    return [
      \`I'm here in Supr Chat for quick status, coordination, and routing decisions.\`,
      \`Use action language like "build", "fix", "generate", "run", or attach a file when you want me to send work into Project Flow.\`,
      mission ? \`Active project: \${mission.name}.\` : \`No active project is selected right now.\`,
    ].join('\\n');
  }

  if (/^(hi|hello|hey|yo|test|ping)\\b/.test(normalized)) {
    return [
      \`I'm online.\`,
      mission ? \`Active project: \${mission.name}.\` : \`No active project is selected right now.\`,
      workingAgents.length
        ? \`Working agents: \${workingAgents.map((agent) => \`\${agent.name}\${agent.currentTask ? \` on \${agent.currentTask}\` : ''}\`).join('; ')}.\`
      : \`No agents are actively working right now.\`,
    ].join('\\n');
  }

  if (!await hasConfiguredModelProvider()) {
    return fallbackStatus();
  }

  try {
    const provider = await getActiveProvider('supr');
    const prompt = [
      \`User message: \${content}\`,
      '',
      'Current Supr context:',
      JSON.stringify({
        activeProject: mission ? {
          id: mission.id,
          name: mission.name,
          status: mission.status,
          objective: mission.objective || null,
        } : null,
        agents: agents.map((agent) => ({
          name: agent.name,
          role: agent.role,
          status: agent.status,
          currentTask: agent.currentTask,
          currentProject: agent.currentProject,
          permissionTier: agent.permissionTier,
        })),
      }),
      '',
      'Answer directly as Supr. Do not create, route, queue, or claim to execute Project Flow work.',
      'If the user is asking for work to be built, fixed, generated, run, or assigned, tell them to confirm the action so it can be routed.',
    ].join('\\n');
    const response = await provider.generateContent(prompt, {
      systemInstruction: 'You are Supr, an agentic workspace coordinator. Answer concise direct chat questions with current context. Do not output JSON.',
      maxOutputTokens: 900,
    });
    return stripModelThinking(response).trim() || fallbackStatus();
  } catch (error) {
    console.warn('[SuprChat] Direct model response failed:', error);
    return fallbackStatus();
  }
}`;

const newDirect = `async function buildDirectSuprChatResponse(content: string) {
  // FIX 3: the direct path is now agentic instead of a chatbot.
  //
  // Previously this function explicitly told the model to "do not create,
  // route, queue, or claim to execute Project Flow work", which made
  // the chat feel like a dead-end. Now it answers greets / status from
  // cached state, and for any substantive content it routes through
  // routeIntakeToProjectFlow so the runtime can spawn sub-agents and
  // invoke skills. The auto-provisioning in routeIntakeToProjectFlow
  // ensures this works even when no project is set up.
  const normalized = content.trim().toLowerCase();
  const [mission, agents] = await Promise.all([
    getActiveMission(),
    fetchAgentStatuses(),
  ]);
  const workingAgents = agents.filter((agent) => agent.status === 'Working');

  const statusBlock = () => [
    \`I'm here.\`,
    mission ? \`Active project: \${mission.name}.\` : \`No active project is selected right now.\`,
    workingAgents.length
      ? \`Currently working: \${workingAgents.map((agent) => \`\${agent.name}\${agent.currentTask ? \` on \${agent.currentTask}\` : ''}\${agent.currentProject ? \` for \${agent.currentProject}\` : ''}\`).join('; ')}.\`
      : \`No agents are actively working right now.\`,
  ].join('\\n');

  if (/^help\\b|\\bwhat can you do\\b|\\bwho are you\\b/.test(normalized)) {
    return [
      \`I'm Supr, the central coordinator for this workspace.\`,
      \`I can spin up sub-agents (Research, Code, QA, plus specialists), invoke skills, run sandbox commands, and route work into Project Flow.\`,
      \`Tell me what you want built, fixed, generated, or run — or attach a file — and I'll dispatch it.\`,
      statusBlock(),
    ].join('\\n');
  }

  if (/^(hi|hello|hey|yo|test|ping)\\b/.test(normalized)) {
    return [
      \`I'm online and ready to coordinate.\`,
      statusBlock(),
      \`Tell me what to build, fix, generate, or run when you want me to dispatch sub-agents.\`,
    ].join('\\n');
  }

  // For anything that's not a greet/status/help, route to the runtime.
  // routeIntakeToProjectFlow will auto-provision a mission if needed,
  // so the chat always produces real agent work.
  try {
    const routed = await routeIntakeToProjectFlow({
      source: 'supr-chat',
      content,
      attachments: [],
    });
    if (routed.success) {
      return [
        \`Supr dispatched this to Project Flow.\`,
        \`- Mission: \${mission ? mission.name : routed.missionId}\`,
        \`- Flow: \${routed.flowRunId}\`,
        \`- Status: \${routed.response}\`,
        \`Sub-agents (Research, Code, QA, ...) are now spinning up to work this. The Command Deck and Project Workflow Canvas will stream their progress.\`,
      ].join('\\n');
    }
    return \`Supr tried to route this into Project Flow but ran into a problem: \${routed.error}\`;
  } catch (error: any) {
    return \`Supr failed to route this into Project Flow: \${error.message || String(error)}\`;
  }
}`;

if (!next1.includes(oldDirect)) {
    console.error('ERROR: could not find buildDirectSuprChatResponse block in chat-workspace.ts');
    process.exit(1);
}
const next2 = next1.replace(oldDirect, newDirect);

// FIX 4 (chat surface): surface a more encouraging routing message.
// The chat UI already shows a spinner; here we update the static
// "routed into Project Flow" text to mention sub-agents and skills.
const oldRoutedMsg = `return routed.success
            ? [
                \`Supr routed this into Project Flow.\`,
                \`- Spawned/updated the agent work graph.\`,
                \`- Queued agent-owned tasks instead of handling the work directly.\`,
                \`- Flow: \${routed.flowRunId}\`,
                \`- Status: \${routed.response}\`,
              ].join('\\n')
            : \`Supr could not route this into Project Flow: \${routed.error}\`;`;

const newRoutedMsg = `return routed.success
            ? [
                \`Supr is orchestrating this in Project Flow.\`,
                \`- Auto-provisioned mission: \${routed.missionId}\`,
                \`- Flow: \${routed.flowRunId}\`,
                \`- Sub-agents (Research, Code, QA, ...) are spawning and the runtime is dispatching work to them.\`,
                \`- Status: \${routed.response}\`,
                \`- Open the Command Deck or the Project Workflow Canvas to watch progress in real time.\`,
              ].join('\\n')
            : \`Supr could not route this into Project Flow: \${routed.error}\`;`;

if (!next2.includes(oldRoutedMsg)) {
    console.error('ERROR: could not find routed-message text in chat-workspace.ts');
    process.exit(1);
}
const final = next2.replace(oldRoutedMsg, newRoutedMsg);

writeFileSync(target, final, 'utf-8');
console.log('OK: chat-workspace.ts updated');
