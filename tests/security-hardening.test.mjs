import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function gitFiles() {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split(/\r?\n/)
    .filter(Boolean);
}

test('runtime artifacts and WIN4 duplicates are not tracked', () => {
  const files = gitFiles();
  assert.equal(files.some((file) => file.includes('-WIN4')), false);
  assert.equal(files.some((file) => /(^|\/)supr_local.*\.db/.test(file)), false);
  assert.equal(files.includes('tsconfig.tsbuildinfo'), false);
});

test('auth routes do not issue literal boolean auth cookies', () => {
  const loginRoute = readFileSync('app/api/auth/login/route.ts', 'utf8');
  const setupRoute = readFileSync('app/api/auth/setup/route.ts', 'utf8');
  assert.equal(/supr_auth_token['"]\s*,\s*['"]true/.test(loginRoute + setupRoute), false);
  assert.match(loginRoute, /createSessionToken/);
  assert.match(loginRoute, /LOGIN_MAX_ATTEMPTS/);
  assert.match(setupRoute, /hashPassword/);
  assert.match(setupRoute, /SETUP_MAX_ATTEMPTS/);
});

test('global auth gate uses the Next proxy convention', () => {
  const proxyRoute = readFileSync('proxy.ts', 'utf8');
  assert.match(proxyRoute, /export async function proxy/);
  assert.match(proxyRoute, /verifySessionToken/);
  assert.match(proxyRoute, /api\/slack/);
  assert.match(proxyRoute, /api\/discord/);
  assert.match(proxyRoute, /api\/telegram/);
  assert.equal(existsSync('middleware.ts'), false);
});

test('production health is authenticated and reports live readiness without secrets', () => {
  const route = readFileSync('app/api/health/production/route.ts', 'utf8');
  const health = readFileSync('lib/production-health.ts', 'utf8');
  const session = readFileSync('lib/session.ts', 'utf8');
  const supervisor = readFileSync('app/supervisor/page.tsx', 'utf8');
  const actions = readFileSync('app/actions.ts', 'utf8');

  assert.match(route, /requireApiAuth/);
  assert.match(route, /probeModel/);
  assert.match(health, /getProductionHealth/);
  assert.match(health, /minimaxPlaceholder/);
  assert.match(health, /passwordLooksDefault/);
  assert.match(health, /No live LLM provider is configured/);
  assert.match(health, /runModelProbe/);
  assert.doesNotMatch(health, /console\.log/);
  assert.match(session, /getAuthSecretMetadata/);
  assert.match(session, /secure: process\.env\.NODE_ENV === 'production' \|\| isHttps/);
  assert.match(actions, /fetchProductionHealthAction/);
  assert.match(supervisor, /Production Health/);
  assert.match(supervisor, /Probe Live Model/);
});

test('optional disabled channels are ignored without blocking live runtime and logs are scrubbed', () => {
  const scrubber = readFileSync('lib/channel-logging.ts', 'utf8');
  const telegram = readFileSync('app/api/telegram/route.ts', 'utf8');
  const slack = readFileSync('app/api/slack/route.ts', 'utf8');
  const discord = readFileSync('app/api/discord/route.ts', 'utf8');

  assert.match(scrubber, /scrubChannelPayload/);
  assert.match(scrubber, /SCRUBBED/);
  for (const route of [telegram, slack, discord]) {
    assert.match(route, /serializeChannelPayload/);
    assert.match(route, /core Supr runtime remains live/);
    assert.match(route, /ignored/);
    assert.match(route, /enabled !== 'true'/);
  }
  assert.doesNotMatch(telegram + slack + discord, /JSON\.stringify\(update\)|JSON\.stringify\(payload\)/);
});

test('theme bootstrap only applies whitelisted appearance classes', () => {
  const layout = readFileSync('app/layout.tsx', 'utf8');
  const settingsPage = readFileSync('app/settings/page.tsx', 'utf8');

  assert.match(layout, /allowedThemes/);
  assert.match(layout, /allowedPalettes/);
  assert.match(layout, /allowedThemes\.indexOf\(theme\) === -1/);
  assert.match(layout, /allowedPalettes\.indexOf\(palette\) === -1/);
  assert.match(settingsPage, /sanitizeTheme/);
  assert.match(settingsPage, /sanitizePalette/);
  assert.match(settingsPage, /ALLOWED_THEMES/);
  assert.match(settingsPage, /ALLOWED_PALETTES/);
});

test('non-auth API routes use the shared auth guard', () => {
  for (const file of [
    'app/api/agent/route.ts',
    'app/api/code-agent/route.ts',
    'app/api/mission/stream/route.ts',
    'app/api/proxy/route.ts',
    'app/api/research/route.ts',
  ]) {
    assert.match(readFileSync(file, 'utf8'), /requireApiAuth/);
  }
});

test('production boot refuses to serve without APP_PASSWORD and AUTH_SECRET', () => {
  const auth = readFileSync('lib/auth.ts', 'utf8');
  const proxy = readFileSync('proxy.ts', 'utf8');
  assert.match(auth, /assertProductionAuthEnvironment/);
  assert.match(auth, /APP_PASSWORD/);
  assert.match(auth, /AUTH_SECRET/);
  assert.match(proxy, /assertProductionAuthEnvironment/);
  assert.match(proxy, /\b503\b/);
});

test('production auth check caches the result, not just a checked flag', () => {
  // The previous version of assertProductionAuthEnvironment used a
  // boolean `productionEnvChecked` and returned `{ ok: true }` after
  // the first call regardless of outcome. That meant a startup
  // failure could be silently masked by a later successful call (or
  // vice-versa). The fix caches the actual result object so a failed
  // assertion stays failed for the rest of the process lifetime.
  const auth = readFileSync('lib/auth.ts', 'utf8');
  // Must not use the old boolean flag.
  assert.doesNotMatch(auth, /productionEnvChecked/);
  // Must cache the result object itself.
  assert.match(auth, /productionEnvResult/);
  // The early-return must check the cached result, not a boolean.
  assert.match(auth, /if\s*\(\s*productionEnvResult\s*\)\s*return\s+productionEnvResult/);
  // The failure path must assign to productionEnvResult (not set a boolean).
  // The assignment is a ternary: productionEnvResult = missing.length
  //   ? { ok: false, reason: ... }
  //   : { ok: true };
  // No `{` immediately after `=` — the ternary sits between.
  assert.match(auth, /productionEnvResult\s*=[\s\S]*ok:\s*false/);
  // Non-production must short-circuit without touching the cache.
  assert.match(auth, /if\s*\(\s*process\.env\.NODE_ENV\s*!==\s*['"]production['"]\s*\)\s*return\s*\{\s*ok:\s*true\s*\}/);
});

test('proxy keeps SSRF defenses enabled', () => {
  const proxyRoute = readFileSync('app/api/proxy/route.ts', 'utf8');
  assert.match(proxyRoute, /redirect:\s*'manual'/);
  assert.match(proxyRoute, /MAX_REDIRECTS/);
  assert.match(proxyRoute, /MAX_BYTES/);
  assert.match(proxyRoute, /isPrivateIp/);
});

test('proxy pins the resolved IP for the actual fetch to prevent DNS rebinding (TOCTOU)', () => {
  const proxyRoute = readFileSync('app/api/proxy/route.ts', 'utf8');
  // The fetch must go to a pinned IP, not the hostname. Asserted by
  // checking that the fetch target is built from a resolved IP and
  // that the original Host header is forwarded.
  assert.match(proxyRoute, /resolvePinnedUrl/);
  assert.match(proxyRoute, /'Host':\s*current\.originalHost/);
  // Redirects must also be re-resolved through the same pin path.
  assert.match(proxyRoute, /resolvePinnedUrl\(reCheck\.logUrl\)/);
  // The old pattern (fetching the hostname URL directly) must be gone.
  assert.doesNotMatch(proxyRoute, /await fetch\(currentUrl/);
});

test('runbooks and artifact versions are backed by persistence tables and actions', () => {
  const initSql = readFileSync('lib/database/init.ts', 'utf8');
  const actions = readFileSync('app/actions.ts', 'utf8');
  const db = readFileSync('lib/db.ts', 'utf8');

  assert.match(initSql, /CREATE TABLE IF NOT EXISTS Runbooks/);
  assert.match(initSql, /CREATE TABLE IF NOT EXISTS Artifact_Versions/);
  assert.match(actions, /fetchRunbooksAction/);
  assert.match(actions, /startRunbookAction/);
  assert.match(actions, /fetchArtifactVersionsAction/);
  assert.match(actions, /rollbackArtifactVersionAction/);
  assert.match(db, /INSERT INTO Artifact_Versions/);
});

test('memory review and connector validation stay wired to real actions', () => {
  const actions = readFileSync('app/actions.ts', 'utf8');
  const settingsPage = readFileSync('app/settings/page.tsx', 'utf8');

  assert.match(actions, /updateMemoryReviewAction/);
  assert.match(actions, /testConnectorAction/);
  assert.match(settingsPage, /handleMemoryReview/);
  assert.match(settingsPage, /handleConnectorTest/);
  assert.match(settingsPage, /showPinnedOnly/);
});

test('agent and research routes expose real status labels instead of silent simulation', () => {
  const agentRoute = readFileSync('app/api/agent/route.ts', 'utf8');
  const researchRoute = readFileSync('app/api/research/route.ts', 'utf8');
  const researchPage = readFileSync('app/research/page.tsx', 'utf8');

  assert.match(agentRoute, /routeIntakeToProjectFlow/);
  assert.match(agentRoute, /Project Flow/);
  assert.match(researchRoute, /fetchResearchSource/);
  assert.match(researchRoute, /ResearchSourceEvidence/);
  assert.match(researchRoute, /Mode/);
  assert.match(researchRoute, /mode = 'Live'/);
  assert.match(researchRoute, /completionStatus/);
  assert.match(researchRoute, /confidence/);
  assert.match(researchRoute, /Source Manifest/);
  assert.match(researchRoute, /research_source/);
  assert.match(researchRoute, /phase: completionStatus === 'complete' \? 'done' : 'partial'/);
  assert.match(researchPage, /sourceCards/);
  assert.match(researchPage, /setCompletionStatus/);
  assert.match(researchPage, /Source evidence is missing/);
  assert.match(researchPage, /Source-backed brief saved to SQLite/);
});

test('agent runtime orchestration is backed by shared tables and modules', () => {
  const initSql = readFileSync('lib/database/init.ts', 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const runtime = readFileSync('lib/runtime/agent-actions.ts', 'utf8');
  const runner = readFileSync('lib/runtime/agent-runtime-runner.ts', 'utf8');
  const runtimeTypes = readFileSync('lib/runtime/types.ts', 'utf8');
  const contextAssembler = readFileSync('lib/runtime/context-assembler.ts', 'utf8');
  const glidepath = readFileSync('lib/runtime/glidepath.ts', 'utf8');
  const shellTool = readFileSync('lib/tools/shell.ts', 'utf8');
  const dashboardModel = readFileSync('lib/dashboard-model.ts', 'utf8');
  const transcriptView = readFileSync('components/RunTranscriptView.tsx', 'utf8');
  const workflowCanvas = readFileSync('components/ProjectWorkflowCanvas.tsx', 'utf8');
  const actions = readFileSync('app/actions.ts', 'utf8');
  const codeRoute = readFileSync('app/api/code-agent/route.ts', 'utf8');
  const codePage = readFileSync('app/code/page.tsx', 'utf8');
  const researchRoute = readFileSync('app/api/research/route.ts', 'utf8');

  for (const table of ['Agent_Actions', 'Flow_Runs', 'Flow_Nodes', 'Agent_Runs', 'Channel_Commands', 'Tool_Invocations', 'Provider_Health', 'Computers', 'Plugin_Registry', 'Knowledge_Pages', 'Roles', 'Audit_Log']) {
    assert.match(initSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.ok(pkg.dependencies['@langchain/langgraph']);
  assert.match(runtime, /resumeAgentActionFromApproval/);
  assert.match(runtime, /humanGateRequired/);
  assert.match(runner, /ModelToolResponse/);
  assert.match(runner, /toolRegistry\.executeTool/);
  // The runtime delegates JSON parsing to the pure helper
  // `parseModelToolResponse` in agent-runtime-pure.ts, which itself
  // calls `parseModelJson` after stripping provider thinking preambles.
  assert.match(runner, /parseModelToolResponse\(raw\)/);
  assert.match(runner, /Tool_Invocations/);
  assert.match(runner, /runtime_context/);
  assert.match(runner, /runtime_failure/);
  assert.match(runner, /runtime_approval/);
  assert.match(runner, /hasMeaningfulToolOutput/);
  assert.match(runner, /returned empty output; refusing to treat it as durable execution evidence/);
  assert.match(runner, /withRuntimeTimeout/);
  assert.match(runner, /Runtime timeout exceeded/);
  assert.match(runner, /assertNotCancelled/);
  assert.match(runner, /retryLimit/);
  assert.match(runner, /failed attempt/);
  assert.match(runner, /succeeded on retry/);
  assert.match(runner, /error\.commandResult/);
  assert.match(runner, /operationalMetrics\.record/);
  assert.match(runtimeTypes, /cancellationToken/);
  assert.match(contextAssembler, /guidelinePackService/);
  assert.match(contextAssembler, /memorySectionService/);
  assert.match(glidepath, /@langchain\/langgraph/);
  assert.match(shellTool, /CommandResult/);
  assert.match(shellTool, /stdout/);
  assert.match(shellTool, /stderr/);
  assert.match(shellTool, /exitCode/);
  assert.match(shellTool, /durationMs/);
  assert.match(shellTool, /evidence: \{ commands: \[id\] \}/);
  assert.match(shellTool, /result\.exitCode !== 0/);
  assert.match(shellTool, /commandResult/);
  assert.match(actions, /Tool_Invocations WHERE mission_id/);
  assert.match(actions, /type: tool\.tool_name === 'execute_command' \? 'command' : 'tool'/);
  assert.match(dashboardModel, /command:/);
  assert.match(dashboardModel, /exitCode/);
  assert.match(transcriptView, /STDOUT/);
  assert.match(transcriptView, /STDERR/);
  assert.match(transcriptView, /Exit \{/);
  assert.match(workflowCanvas, /exitCode/);
  assert.match(workflowCanvas, /stdout/);
  assert.match(workflowCanvas, /stderr/);
  assert.match(codeRoute, /evaluateAgentAction/);
  assert.match(codeRoute, /runAgentRuntimeAction/);
  assert.match(codeRoute, /proposeCodePatch/);
  assert.match(codeRoute, /getActiveProvider/);
  assert.match(codeRoute, /validationCommand/);
  assert.match(codeRoute, /validationApprovalId/);
  assert.match(codeRoute, /validatesActionId/);
  assert.match(codeRoute, /patchSummary/);
  assert.match(codeRoute, /buildValidationCommand/);
  assert.match(codeRoute, /Buffer\.from\(content, 'utf-8'\)\.toString\('base64'\)/);
  assert.match(codeRoute, /py_compile/);
  assert.match(codeRoute, /node --check/);
  assert.doesNotMatch(codeRoute, /stage: \\\\"code-agent-validation\\\\"/);
  assert.match(codeRoute, /validationEvidenceIds/);
  assert.match(codeRoute, /validationFeedback/);
  assert.match(codeRoute, /retryPatchActionId/);
  assert.match(codeRoute, /retryValidationActionId/);
  assert.match(codeRoute, /Retry after validation failure/);
  assert.match(codeRoute, /Retry validation completed/);
  assert.match(codePage, /Patch evidence/);
  assert.match(codePage, /Validation evidence/);
  assert.match(codePage, /Validation blocked until approval/);
  assert.match(codePage, /Patch retry action/);
  assert.match(codePage, /Validation retry action/);
  assert.match(researchRoute, /runAgentRuntimeAction/);
});

test('timeline, approvals, and connector health read runtime state', () => {
  const actions = readFileSync('app/actions.ts', 'utf8');

  assert.match(actions, /fetchAgentActionsForMission/);
  assert.match(actions, /resumeAgentActionFromApproval/);
  assert.match(actions, /Provider_Health/);
  assert.match(actions, /recordProviderSuccess/);
  assert.match(actions, /recordProviderFailure/);
});

test('project flow runtime exposes controls, intake routing, and telegram commands', () => {
  const actions = readFileSync('app/actions.ts', 'utf8');
  const initSql = readFileSync('lib/database/init.ts', 'utf8');
  const runtime = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  const governance = readFileSync('lib/services/governance.ts', 'utf8');
  const agentActions = readFileSync('lib/runtime/agent-actions.ts', 'utf8');
  const runner = readFileSync('lib/runtime/agent-runtime-runner.ts', 'utf8');
  const toolAdapters = readFileSync('lib/runtime/tool-adapters.ts', 'utf8');
  const projectFlowTools = readFileSync('lib/tools/project-flow.ts', 'utf8');
  const page = readFileSync('app/page.tsx', 'utf8');
  const workflowCanvas = readFileSync('components/ProjectWorkflowCanvas.tsx', 'utf8');
  const chatPage = readFileSync('app/supr-chat/page.tsx', 'utf8');
  const telegramRoute = readFileSync('app/api/telegram/route.ts', 'utf8');
  const agentRoute = readFileSync('app/api/agent/route.ts', 'utf8');

  for (const action of [
    'startProjectFlowAction',
    'runProjectFlowAction',
    'pauseProjectFlowAction',
    'resumeProjectFlowAction',
    'retryFailedFlowNodesAction',
    'approveLowRiskActionsAction',
    'routeIntakeToProjectFlowAction',
  ]) {
    assert.match(actions, new RegExp(`export async function ${action}`));
  }
  assert.match(runtime, /AGENT_PRESETS/);
  assert.match(runtime, /buildModelProjectPlan/);
  assert.match(runtime, /buildProjectPlan/);
  assert.match(runtime, /plannerSource/);
  assert.match(runtime, /preset_fallback/);
  assert.match(runtime, /Live Project Flow planning requires MiniMax or another configured model provider/);
  assert.match(runtime, /Agent_Runs/);
  assert.match(runtime, /Channel_Commands/);
  assert.match(runtime, /routeIntakeToProjectFlow/);
  assert.match(runtime, /workspace_write_artifact/);
  assert.match(runtime, /workspace_write_file/);
  assert.match(runtime, /workspace_validate_outputs/);
  assert.match(runtime, /execute_command/);
  assert.match(runtime, /governance_review/);
  assert.match(runtime, /delivery_package/);
  assert.match(initSql, /Seed\/update default capabilities and bindings/);
  assert.doesNotMatch(initSql, /if \(capCount\.cnt === 0\)/);
  assert.match(initSql, /insertCap\.run\('web_search'/);
  assert.match(initSql, /insertAgentCap\.run\('a2', 'web_search'\)/);
  assert.match(runtime, /runAgentRuntimeAction/);
  assert.doesNotMatch(runtime, /executeConcreteAgentWork/);
  assert.match(runner, /toolRegistry\.executeTool/);
  assert.match(projectFlowTools, /workspaceWriteFileTool/);
  assert.match(projectFlowTools, /buildLineDiff/);
  assert.match(projectFlowTools, /```diff/);
  assert.match(projectFlowTools, /workspaceWriteArtifactTool/);
  assert.match(projectFlowTools, /validateOutputsTool/);
  assert.match(agentActions, /durable work evidence/);
  assert.match(toolAdapters, /Tool_Invocations/);
  assert.match(toolAdapters, /tool_started/);
  assert.match(toolAdapters, /tool_completed/);
  assert.match(workflowCanvas, /toolInvocations/);
  assert.match(workflowCanvas, /workspace_write_file/);
  assert.match(actions, /PROJECT_FLOW_CAPABILITIES/);
  assert.match(governance, /Refusing open-ended execution/);
  assert.match(agentRoute, /routeIntakeToProjectFlow/);
  assert.match(actions, /source: 'supr-chat'/);
  assert.match(telegramRoute, /\/start_flow/);
  assert.match(telegramRoute, /\/retry_failed/);
  assert.match(telegramRoute, /\/approve/);
  assert.match(telegramRoute, /configuredChatId/);
  assert.match(workflowCanvas, /Start Project Flow/);
  assert.match(page, /approveLowRiskActionsAction/);
  assert.match(chatPage, /Supr is orchestrating/);
});

test('docker build context and runtime image avoid common secret leaks', () => {
  const dockerignore = readFileSync('.dockerignore', 'utf8');
  const dockerfile = readFileSync('Dockerfile', 'utf8');
  const compose = readFileSync('docker-compose.yml', 'utf8');

  assert.match(dockerignore, /^\.env$/m);
  assert.match(dockerignore, /^\.env\.\*$/m);
  assert.match(dockerignore, /^\*\.db$/m);
  assert.match(dockerignore, /^\*-WIN4\*$/m);
  assert.match(dockerfile, /CLOAKBROWSER_DOWNLOAD_URL/);
  assert.match(dockerfile, /sha256sum -c/);
  assert.doesNotMatch(dockerfile, /storage\.googleapis\.com\/supr-build-assets\/cloakbrowser-linux-amd64/);
  assert.doesNotMatch(compose, /^version:/m);
});

test('front page defaults to live agent orchestration instead of fake glidepath telemetry', () => {
  const page = readFileSync('app/page.tsx', 'utf8');
  const actions = readFileSync('app/actions.ts', 'utf8');
  const workflowCanvas = readFileSync('components/ProjectWorkflowCanvas.tsx', 'utf8');
  const setupWizard = readFileSync('components/SetupWizard.tsx', 'utf8');
  const orchestrationPage = readFileSync('app/orchestration/page.tsx', 'utf8');
  const suprChat = readFileSync('app/supr-chat/page.tsx', 'utf8');
  const codePage = readFileSync('app/code/page.tsx', 'utf8');
  const agentsPage = readFileSync('app/agents/page.tsx', 'utf8');
  const initSql = readFileSync('lib/database/init.ts', 'utf8');

  assert.match(page, /ProjectWorkflowCanvas/);
  assert.match(page, /spawnProjectAgentAction/);
  assert.match(page, /fetchProjectOperatingGraphAction/);
  assert.match(actions, /export async function spawnProjectAgentAction/);
  assert.match(actions, /createRuntimeAgentAction/);
  assert.match(actions, /export async function fetchProjectOperatingGraphAction/);
  assert.match(page, /SetupWizard/);
  assert.match(page, /fetchBootstrapStateAction/);
  assert.match(page, /bootstrap\.wizardRequired/);
  assert.doesNotMatch(page, /global_minimax_key_configured\s*!==\s*'true'/);
  assert.doesNotMatch(actions, /has_completed_wizard\s*!==\s*'true'\s*\|\|\s*settings\.global_minimax_key_configured/);
  assert.match(workflowCanvas, /Spawn Agent/);
  assert.match(workflowCanvas, /Start Project Flow/);
  assert.match(workflowCanvas, /Supr directs agents through phases, tasks, approvals, run records, and deliverables/);
  assert.doesNotMatch(page, /COMPETITOR SIGNAL TELEMETRY BRIEF/);
  assert.doesNotMatch(page, /Simulated Logs/);
  assert.doesNotMatch(page, /Simulated Traces/);
  assert.match(setupWizard, /Supr Bootstrap/);
  assert.match(setupWizard, /MiniMax API Key/);
  assert.match(setupWizard, /Run Live Probe/);
  assert.doesNotMatch(initSql, /mock_tickets/);
  assert.doesNotMatch(setupWizard, /Simulated Telemetry|sandbox emulator|>Simulated</);
  assert.doesNotMatch(orchestrationPage, /LIVE_EVENTS|live-\$\{Date\.now\(\)\}|Simulated live updates/);
  assert.match(orchestrationPage, /Poll persisted orchestration state/);
  assert.doesNotMatch(suprChat, /simulated telemetry|Simulated \/ Real Shell Execution Output/i);
  assert.doesNotMatch(codePage, /mock_tickets|Active mock verification/);
  assert.match(codePage, /sample_tickets\.json/);
  assert.doesNotMatch(agentsPage, /override mocks|mock metrics/);
});

test('broken harness hardening wires native governance, tools, heartbeat, and plugins', () => {
  const initSql = readFileSync('lib/database/init.ts', 'utf8');
  const governance = readFileSync('lib/services/governance.ts', 'utf8');
  const registry = readFileSync('lib/tools/registry.ts', 'utf8');
  const nativeRegister = readFileSync('lib/tools/register.ts', 'utf8');
  const heartbeat = readFileSync('lib/services/heartbeat.ts', 'utf8');
  const pluginDispatcher = readFileSync('lib/tools/plugin-dispatcher.ts', 'utf8');
  const pluginWorkers = readFileSync('lib/services/plugin-workers.ts', 'utf8');
  const eslintConfig = readFileSync('eslint.config.mjs', 'utf8');
  const tsconfig = readFileSync('tsconfig.json', 'utf8');
  const skillCatalog = readFileSync('lib/services/skill-catalog.ts', 'utf8');
  const hexProvider = readFileSync('lib/adapters/HexAgentProvider.ts', 'utf8');
  const traceProvider = readFileSync('lib/adapters/TraceProvider.ts', 'utf8');
  const rules = readFileSync('agent-config/governance_rules.json', 'utf8');
  const importHarness = readFileSync('scripts/import-harness.ps1', 'utf8');
  const gitignore = readFileSync('.gitignore', 'utf8');

  assert.match(governance, /evaluateToolRules/);
  assert.match(governance, /SafetyRuleEngine/);
  assert.match(governance, /RuleEngine/);
  assert.match(registry, /evaluateToolRules\(name, params/);
  for (const tool of ['shell', 'web-search', 'subagent', 'todo', 'skill-invoker', 'project-flow']) {
    assert.match(nativeRegister, new RegExp(`\\.\\/${tool}`));
  }
  assert.doesNotMatch(nativeRegister, /\.\/plugin-dispatcher/);
  assert.match(heartbeat, /runAgentRuntimeAction/);
  assert.doesNotMatch(heartbeat, /heartbeat_task/);
  assert.doesNotMatch(heartbeat, /createAgentAction/);
  assert.doesNotMatch(heartbeat, /Simulate work completion/);
  assert.doesNotMatch(initSql, /insertCap(?:Always)?\.run\('heartbeat_task'/);
  assert.doesNotMatch(initSql, /insertAgentCap\.run\('[^']+', 'heartbeat_task'\)/);
  assert.match(pluginDispatcher, /pluginWorkerManager\.invokeTool/);
  assert.doesNotMatch(pluginDispatcher, /MOCK RUNNER/);
  assert.match(pluginWorkers, /pendingReplies/);
  assert.match(pluginWorkers, /type: "tool_call"/);
  assert.doesNotMatch(eslintConfig, /lib\/external/);
  assert.doesNotMatch(eslintConfig, /components\/external/);
  assert.doesNotMatch(tsconfig, /lib\/external|components\/external|Broken Harness/);
  assert.doesNotMatch(skillCatalog, /lib\/external/);
  assert.doesNotMatch(hexProvider, /external\/hexagent|external\\\\hexagent/);
  assert.doesNotMatch(traceProvider, /components\/external|external\\\\umami/);
  assert.equal(existsSync('lib/external'), false);
  assert.equal(existsSync('components/external'), false);
  assert.match(rules, /execute_command/);
  assert.match(importHarness, /Bulk import disabled/);
  assert.doesNotMatch(importHarness, /Copy-Item/);
  assert.doesNotMatch(importHarness, /Broken Harness\\|Broken Harness\/|C:\\\\Users|OneDrive\\\\Desktop/);
  assert.doesNotMatch(importHarness, /lib\\external|components\\external|lib\/external|components\/external/);
  assert.match(gitignore, /^lib\/external\/$/m);
  assert.match(gitignore, /^components\/external\/$/m);
});

test('supervisor features expose groups, blueprints, editable memory, analytics, and guidelines', () => {
  const initSql = readFileSync('lib/database/init.ts', 'utf8');
  const actions = readFileSync('app/actions.ts', 'utf8');
  const page = readFileSync('app/supervisor/page.tsx', 'utf8');
  const sidebar = readFileSync('components/Sidebar.tsx', 'utf8');
  const groups = readFileSync('lib/services/agent-groups.ts', 'utf8');
  const blueprints = readFileSync('lib/services/agent-blueprints.ts', 'utf8');
  const memorySections = readFileSync('lib/services/memory-sections.ts', 'utf8');
  const metrics = readFileSync('lib/services/operational-metrics.ts', 'utf8');
  const guidelines = readFileSync('lib/services/guideline-packs.ts', 'utf8');

  for (const table of ['Agent_Groups', 'Agent_Group_Members', 'Agent_Blueprints', 'Memory_Sections', 'Operational_Metrics', 'Guideline_Packs']) {
    assert.match(initSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(groups, /supervisorAgentId/);
  assert.match(groups, /composeSupervisorContext/);
  assert.match(blueprints, /permissionTier/);
  assert.match(blueprints, /budgetProfile/);
  assert.match(memorySections, /userEdited/);
  assert.match(memorySections, /composePromptContext/);
  assert.match(metrics, /scrubMetadata/);
  assert.match(metrics, /prompt\|body\|content\|secret\|token\|key/);
  assert.match(guidelines, /GuidelinePack/);
  assert.match(guidelines, /TypeScript Review Standards/);
  assert.match(guidelines, /composeReviewContext/);
  assert.match(actions, /fetchSupervisorConsoleAction/);
  assert.match(actions, /createAgentBlueprintAction/);
  assert.match(actions, /createAgentGroupAction/);
  assert.match(actions, /upsertMemorySectionAction/);
  assert.match(page, /Supervisor Console/);
  assert.match(page, /Agent Groups/);
  assert.match(page, /White-Box Memory/);
  assert.match(page, /Privacy Metrics/);
  assert.match(sidebar, /Supervisor/);
});

test('planned native skills are discoverable by matching folder and skill names', () => {
  for (const skill of ['code-refactor', 'pdf', 'docx', 'frontend-design', 'mcp-builder', 'web-artifacts-builder']) {
    const body = readFileSync(`.agents/skills/${skill}/SKILL.md`, 'utf8');
    assert.match(body, new RegExp(`name: ${skill}`));
    assert.match(body, /description:/);
  }
});

test('organization import requires server-side overwrite confirmation', () => {
  const actions = readFileSync('app/actions.ts', 'utf8');
  const portability = readFileSync('lib/services/portability.ts', 'utf8');
  const settings = readFileSync('app/settings/page.tsx', 'utf8');

  assert.match(actions, /importOrganizationAction\(serializedData: string, options\?: \{ allowOverwrite\?: boolean \}/);
  assert.match(actions, /allowOverwrite/);
  assert.match(actions, /collisions/);
  assert.match(portability, /detectCollisions/);
  assert.match(portability, /!options\?\.allowOverwrite/);
  assert.match(portability, /INSERT OR REPLACE/);
  assert.match(settings, /importOrganizationAction\(JSON\.stringify\(importBundle\), \{ allowOverwrite: confirmOverwrite \}\)/);
});

test('live runtime is the only active mode and blocks diagnostic mock successes', () => {
  const runtimeMode = readFileSync('lib/runtime/runtime-mode.ts', 'utf8');
  const webSearch = readFileSync('lib/tools/web-search.ts', 'utf8');
  const browser = readFileSync('lib/tools/browser.ts', 'utf8');
  const composio = readFileSync('lib/tools/composio.ts', 'utf8');
  const httpProvider = readFileSync('lib/adapters/HttpAgentProvider.ts', 'utf8');
  const modelProvider = readFileSync('lib/providers/model.ts', 'utf8');

  assert.match(runtimeMode, /RuntimeMode/);
  assert.match(runtimeMode, /return MODES\.has\(mode as RuntimeMode\) \? \(mode as RuntimeMode\) : 'real'/);
  assert.match(runtimeMode, /isMockAllowed/);
  assert.match(runtimeMode, /return false/);
  assert.match(webSearch, /real runtime mode/);
  assert.doesNotMatch(browser, /mock diagnostic|isMockAllowed/);
  // The error message must mention BOTH the Settings field and the
  // env var fallback, so an operator without a Composio key gets a
  // clear pointer to where to set one.
  assert.match(composio, /requires integrations_composio in Settings or COMPOSIO_API_KEY in env/);
  assert.match(httpProvider, /EXTERNAL_AGENT_ENDPOINT must point to a live provider in real runtime mode/);
  assert.match(modelProvider, /No model provider is configured\. Set at least one of MINIMAX_API_KEY/);
});

test('gap closure wires governed learning, replanning, messaging, streaming, and execution policy', () => {
  const initSql = readFileSync('lib/database/init.ts', 'utf8');
  const runtimeTypes = readFileSync('lib/runtime/types.ts', 'utf8');
  const runner = readFileSync('lib/runtime/agent-runtime-runner.ts', 'utf8');
  const projectFlow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  const contextAssembler = readFileSync('lib/runtime/context-assembler.ts', 'utf8');
  const skillLearning = readFileSync('lib/services/skill-learning.ts', 'utf8');
  const messaging = readFileSync('lib/services/messaging-gateway.ts', 'utf8');
  const executionPolicy = readFileSync('lib/services/command-execution-policy.ts', 'utf8');
  const shellTool = readFileSync('lib/tools/shell.ts', 'utf8');
  const browser = readFileSync('lib/tools/browser.ts', 'utf8');
  const agentBlueprints = readFileSync('lib/services/agent-blueprints.ts', 'utf8');

  for (const table of ['Learned_Skill_Drafts', 'Outbound_Messages', 'Replan_Decisions', 'Provider_Route_Decisions']) {
    assert.match(initSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  for (const symbol of ['LearnedSkillDraft', 'SkillMatch', 'ReplanDecision', 'ProviderRouteDecision', 'MessagingGatewayAdapter', 'CommandExecutionPolicy']) {
    assert.match(runtimeTypes, new RegExp(`interface ${symbol}|type ${symbol}`));
  }

  assert.match(skillLearning, /MIN_COMPLEX_TOOL_CALLS = 3/);
  assert.match(skillLearning, /learned_skill_draft/);
  assert.match(skillLearning, /parseSkillMd/);
  assert.match(skillLearning, /distillSkillMarkdown/);
  assert.match(skillLearning, /getActiveProvider/);
  assert.match(skillLearning, /governance_review/);
  assert.match(skillLearning, /requestSecurityReview/);
  assert.match(skillLearning, /rejectDraft/);
  assert.match(skillLearning, /listDrafts/);
  assert.match(skillLearning, /Approval is required before writing learned skills/);
  assert.match(skillLearning, /\.agents[\\/\\\\]skills/);
  assert.match(agentBlueprints, /SIAL Agent/);
  assert.doesNotMatch(projectFlow, /Reflection['"]\s*,/);

  assert.match(contextAssembler, /skillCatalog/);
  assert.match(contextAssembler, /SkillMatch/);
  assert.match(contextAssembler, /matching_skill_summaries/);
  assert.match(runner, /streamContent/);
  assert.match(runner, /runtime_model_stream/);
  assert.match(runner, /providerRouteDecisionService/);
  assert.match(runner, /skillLearningService\.evaluateCompletedRun/);
  assert.match(runner, /requestSecurityReview/);

  assert.match(projectFlow, /evaluatePhaseGate/);
  assert.match(projectFlow, /maybeReplanFlow/);
  assert.match(projectFlow, /buildReplanRecoveryWork/);
  assert.match(projectFlow, /cancelIncompleteDownstreamWork/);
  assert.match(projectFlow, /Replan_Decisions/);
  assert.match(projectFlow, /insertedActionIds/);
  assert.match(projectFlow, /removedActionIds/);
  assert.match(projectFlow, /status = 'cancelled'/);
  assert.match(projectFlow, /preserve completed nodes/);

  assert.match(messaging, /telegramGatewayAdapter/);
  assert.match(messaging, /slackGatewayAdapter/);
  assert.match(messaging, /discordGatewayAdapter/);
  assert.match(messaging, /Outbound_Messages/);
  assert.match(messaging, /SLACK_WEBHOOK_URL/);
  assert.match(messaging, /DISCORD_WEBHOOK_URL/);
  assert.match(messaging, /fetch\(webhookUrl/);
  assert.match(messaging, /action completed|approval needed|mission finished/);

  const slackRoute = readFileSync('app/api/slack/route.ts', 'utf8');
  const discordRoute = readFileSync('app/api/discord/route.ts', 'utf8');
  assert.match(slackRoute, /verifySlackSignature/);
  assert.match(slackRoute, /x-slack-signature/);
  assert.match(slackRoute, /routeIntakeToProjectFlow/);
  assert.match(slackRoute, /url_verification/);
  assert.match(discordRoute, /verifyDiscordToken/);
  assert.match(discordRoute, /DISCORD_WEBHOOK_TOKEN/);
  assert.match(discordRoute, /routeIntakeToProjectFlow/);

  assert.match(executionPolicy, /resolveCommandExecutionPolicy/);
  assert.match(executionPolicy, /docker_available/);
  assert.match(executionPolicy, /remote_disabled/);
  const executionEnvironment = readFileSync('lib/services/execution-environment.ts', 'utf8');
  const settingsPage = readFileSync('app/settings/page.tsx', 'utf8');
  const permissionsSection = readFileSync('components/settings/PermissionsSection.tsx', 'utf8');
  const channelsSection = readFileSync('app/settings/page.tsx', 'utf8'); // channels not yet extracted
  const actions = readFileSync('app/actions.ts', 'utf8');
  assert.match(executionEnvironment, /probeDockerAvailability/);
  assert.match(executionEnvironment, /docker_last_probe/);
  // After PR28, the Probe Docker + Remote Execution cards live in
  // PermissionsSection. Discord is still inline in the page.
  assert.match(permissionsSection, /Probe Docker/);
  assert.match(permissionsSection, /Remote Execution/);
  assert.match(settingsPage, /Discord Webhook Hook/);
  assert.match(actions, /probeDockerAvailabilityAction/);
  assert.match(shellTool, /resolveCommandExecutionPolicy/);
  assert.match(shellTool, /executionPolicy/);
  assert.match(shellTool, /execute_sandboxed_command/);
  assert.match(shellTool, /execute_remote/);
  assert.match(shellTool, /runLocalCommand/);
  assert.match(shellTool, /selectedEnvironment !== "docker"/);
  assert.match(shellTool, /selectedEnvironment !== "remote"/);
  assert.match(initSql, /execute_sandboxed_command/);
  assert.match(initSql, /execute_remote/);
  assert.match(browser, /CLOAKBROWSER_PATH environment variable is required for live browser scraping/);

  const supervisorPage = readFileSync('app/supervisor/page.tsx', 'utf8');
  assert.match(actions, /requestLearnedSkillReviewAction/);
  assert.match(actions, /promoteLearnedSkillDraftAction/);
  assert.match(actions, /rejectLearnedSkillDraftAction/);
  assert.match(actions, /learnedSkillDrafts/);
  assert.match(actions, /runtimeDecisions/);
  assert.match(actions, /Provider_Route_Decisions/);
  assert.match(actions, /Outbound_Messages/);
  assert.match(actions, /Replan_Decisions/);
  assert.match(supervisorPage, /Learned Skill Drafts/);
  assert.match(supervisorPage, /handlePromoteSkill/);
  assert.match(supervisorPage, /handleRejectSkill/);
  assert.match(supervisorPage, /Runtime Decisions/);
  assert.match(supervisorPage, /Sandbox Choice/);
  assert.match(supervisorPage, /Provider Routing/);
  assert.match(supervisorPage, /Outbound Messages/);
});

test('model JSON parsing tolerates provider thinking preambles', () => {
  const parser = readFileSync('lib/runtime/model-json.ts', 'utf8');
  const runner = readFileSync('lib/runtime/agent-runtime-runner.ts', 'utf8');
  const projectFlow = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  const codeRoute = readFileSync('app/api/code-agent/route.ts', 'utf8');

  assert.match(parser, /stripModelThinking/);
  assert.match(parser, /<think>\[\\s\\S\]\*\?<\\\/think>/);
  assert.match(parser, /extractFirstJsonObject/);
  assert.match(parser, /parseModelJson/);
  assert.match(runner, /parseModelToolResponse\(raw\)/);
  assert.match(projectFlow, /parseModelJson\(raw\)/);
  assert.match(codeRoute, /parseModelJson\(raw\)/);
});

test('llm provider catalog exposes current model choices and live refresh action', () => {
  const catalog = readFileSync('lib/providers/catalog.ts', 'utf8');
  const actions = readFileSync('app/actions.ts', 'utf8');
  const settingsPage = readFileSync('app/settings/page.tsx', 'utf8');
  const chatPage = readFileSync('app/supr-chat/page.tsx', 'utf8');

  for (const model of [
    'MiniMax-M3',
    'gemini-3.5-flash',
    'gpt-5.5',
    'claude-opus-4-7',
    'grok-4.3',
    'deepseek-v4-pro',
    'mistral-medium-latest',
  ]) {
    assert.match(catalog, new RegExp(model.replace(/[.]/g, '\\.')));
  }
  assert.match(actions, /fetchLiveProviderModelsAction/);
  assert.match(actions, /generativelanguage\.googleapis\.com\/v1beta\/models/);
  assert.match(actions, /api\.anthropic\.com\/v1\/models/);
  assert.match(actions, /\/models/);
  assert.match(settingsPage, /fetchLiveProviderModelsAction/);
  assert.match(chatPage, /fetchLiveProviderModelsAction/);
});

test('LLM entry routes delegate to thinking-tolerant structured parsers', () => {
  const agentRoute = readFileSync('app/api/agent/route.ts', 'utf8');
  const researchRoute = readFileSync('app/api/research/route.ts', 'utf8');
  const codeRoute = readFileSync('app/api/code-agent/route.ts', 'utf8');
  const slackRoute = readFileSync('app/api/slack/route.ts', 'utf8');
  const discordRoute = readFileSync('app/api/discord/route.ts', 'utf8');
  const telegramRoute = readFileSync('app/api/telegram/route.ts', 'utf8');
  const actions = readFileSync('app/actions.ts', 'utf8');
  const skillLearning = readFileSync('lib/services/skill-learning.ts', 'utf8');

  assert.match(agentRoute, /routeIntakeToProjectFlow/);
  assert.match(slackRoute, /routeIntakeToProjectFlow/);
  assert.match(discordRoute, /routeIntakeToProjectFlow/);
  assert.match(telegramRoute, /routeIntakeToProjectFlow/);
  assert.match(actions, /routeIntakeToProjectFlow/);
  assert.match(researchRoute, /runAgentRuntimeAction/);
  assert.match(codeRoute, /runAgentRuntimeAction/);
  assert.match(codeRoute, /parseModelJson\(raw\)/);
  assert.match(skillLearning, /stripModelThinking\(raw\)/);
  assert.match(actions, /stripModelThinking\(response\)\.trim\(\)/);
});

test('project flow registers native tools before runtime context and records routing failures', () => {
  const registry = readFileSync('lib/tools/registry.ts', 'utf8');
  const contextAssembler = readFileSync('lib/runtime/context-assembler.ts', 'utf8');
  const projectFlow = readFileSync('lib/runtime/project-flow.ts', 'utf8');

  assert.match(registry, /nativeRegistrationPromise: Promise<void> \| null/);
  assert.match(registry, /await this\.ensureNativeToolsRegisteredInternal\(\)/);
  assert.match(registry, /const nativeToolsModule = '\.\.\/tools\/' \+ 'register'/);
  assert.match(registry, /import\(nativeToolsModule\)/);
  assert.doesNotMatch(registry, /eval\('require'\)/);
  assert.match(contextAssembler, /await toolRegistry\.ensureNativeToolsRegistered\(\)/);
  assert.match(projectFlow, /catch \(error: any\)/);
  assert.match(projectFlow, /UPDATE Channel_Commands SET status = 'failed', response = \?/);
  assert.match(projectFlow, /Unable to route Project Flow request/);
});

test('activity log event ids are collision resistant under rapid chat routing', () => {
  const db = readFileSync('lib/db.ts', 'utf8');

  assert.match(db, /crypto\.randomUUID\(\)/);
  assert.match(db, /id\('ev'\)/);
  assert.doesNotMatch(db, /`ev-\$\{Date\.now\(\)\}`/);
});

test('supr chat only routes explicit work requests into project flow', () => {
  const actions = readFileSync('app/actions.ts', 'utf8');

  assert.match(actions, /function shouldRouteSuprChatToProjectFlow/);
  assert.match(actions, /function buildDirectSuprChatResponse/);
  assert.match(actions, /getActiveProvider\('supr'\)/);
  assert.match(actions, /hasConfiguredModelProvider/);
  assert.match(actions, /Do not create, route, queue, or claim to execute Project Flow work/);
  assert.match(actions, /what are you currently working on/);
  assert.match(actions, /No agents are actively working right now/);
  assert.match(actions, /Use action language like "build", "fix", "generate", "run"/);
  assert.match(actions, /routeIntakeToProjectFlow\(\{/);
  assert.match(actions, /chatMessageId\(\)/);
  assert.doesNotMatch(actions, /`chat-\$\{Date\.now\(\)\}`/);
});

test('code workspace falls back to governed local execution when Docker is unavailable', () => {
  const actions = readFileSync('app/actions.ts', 'utf8');

  assert.match(actions, /const dockerAvailable = settings\.docker_available === 'true'/);
  assert.match(actions, /const runLocal = async \(\) =>/);
  assert.match(actions, /executionEnvironment: 'local_governed'/);
  assert.match(actions, /executionEnvironment: 'docker'/);
  assert.match(actions, /_KEY\$|_TOKEN\$|_SECRET\$|PASSWORD\$/);
  assert.match(actions, /dockerDesktopLinuxEngine|Cannot connect to the Docker daemon|docker daemon/);
});

test('research runtime avoids legacy approval timestamps and duplicate log ids', () => {
  const contextAssembler = readFileSync('lib/runtime/context-assembler.ts', 'utf8');
  const researchPage = readFileSync('app/research/page.tsx', 'utf8');

  assert.match(contextAssembler, /const skillCatalogModule = '@\/lib\/services\/' \+ 'skill-catalog'/);
  assert.match(contextAssembler, /await import\(skillCatalogModule\)/);
  assert.doesNotMatch(contextAssembler, /eval\('require'\)/);
  assert.match(contextAssembler, /FROM Approvals WHERE mission_id = \? ORDER BY rowid DESC LIMIT 12/);
  assert.doesNotMatch(contextAssembler, /FROM Approvals WHERE mission_id = \? ORDER BY created_at DESC/);
  assert.match(researchPage, /const logCounterRef = useRef\(0\)/);
  assert.match(researchPage, /const nextLogId = \(\) => Date\.now\(\) \+ \(logCounterRef\.current\+\+ % 1000\) \/ 1000/);
  assert.doesNotMatch(researchPage, /id: Date\.now\(\)/);

  const researchRoute = readFileSync('app/api/research/route.ts', 'utf8');
  assert.match(researchRoute, /Governed runtime paused/);
  assert.match(researchRoute, /Continuing with direct source collection/);
  assert.match(researchRoute, /catch \(runtimeError/);
});

test('minimax live runtime defaults do not depend on telegram', () => {
  const initSql = readFileSync('lib/database/init.ts', 'utf8');
  const runtimeMode = readFileSync('lib/runtime/runtime-mode.ts', 'utf8');
  const telegramRoute = readFileSync('app/api/telegram/route.ts', 'utf8');
  const supervisorPage = readFileSync('app/supervisor/page.tsx', 'utf8');
  const setupWizard = readFileSync('components/SetupWizard.tsx', 'utf8');
  const settingsPage = readFileSync('app/settings/page.tsx', 'utf8');

  assert.match(initSql, /insertSetting\.run\('runtime_mode', 'real'\)/);
  assert.match(initSql, /insertSetting\.run\('channels_slack', 'false'\)/);
  assert.match(initSql, /insertSetting\.run\('default_channel', 'telegram'\)/);
  assert.match(runtimeMode, /const MODES = new Set<RuntimeMode>\(\['real'\]\)/);
  assert.match(runtimeMode, /return false/);
  assert.match(telegramRoute, /Telegram channel disabled; core Supr runtime remains live/);
  assert.match(telegramRoute, /return Response\.json\(\{ ok: true, ignored: true/);
  assert.match(supervisorPage, /runtime_mode \|\| "real"/);
  assert.doesNotMatch(setupWizard, /Demo\/offline|demo mode/i);
  assert.doesNotMatch(settingsPage, /simulation|demo mode/i);
});
