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
  assert.match(setupRoute, /hashPassword/);
});

test('global auth gate uses the Next proxy convention', () => {
  const proxyRoute = readFileSync('proxy.ts', 'utf8');
  assert.match(proxyRoute, /export async function proxy/);
  assert.match(proxyRoute, /verifySessionToken/);
  assert.equal(existsSync('middleware.ts'), false);
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

test('proxy keeps SSRF defenses enabled', () => {
  const proxyRoute = readFileSync('app/api/proxy/route.ts', 'utf8');
  assert.match(proxyRoute, /redirect:\s*'manual'/);
  assert.match(proxyRoute, /MAX_REDIRECTS/);
  assert.match(proxyRoute, /MAX_BYTES/);
  assert.match(proxyRoute, /isPrivateIp/);
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
  const shellTool = readFileSync('src/tools/shell.ts', 'utf8');
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
  assert.match(runner, /validationCommand/);
  assert.match(runner, /patchSummary/);
  assert.match(runner, /Tool_Invocations/);
  assert.match(runner, /runtime_context/);
  assert.match(runner, /runtime_failure/);
  assert.match(runner, /runtime_approval/);
  assert.match(runner, /hasMeaningfulToolOutput/);
  assert.match(runner, /returned empty output; refusing to treat it as durable execution evidence/);
  assert.match(runner, /withRuntimeTimeout/);
  assert.match(runner, /Runtime timeout during/);
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
  const runtime = readFileSync('lib/runtime/project-flow.ts', 'utf8');
  const governance = readFileSync('lib/services/governance.ts', 'utf8');
  const agentActions = readFileSync('lib/runtime/agent-actions.ts', 'utf8');
  const runner = readFileSync('lib/runtime/agent-runtime-runner.ts', 'utf8');
  const toolAdapters = readFileSync('lib/runtime/tool-adapters.ts', 'utf8');
  const projectFlowTools = readFileSync('src/tools/project-flow.ts', 'utf8');
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
  assert.match(runtime, /Real runtime mode requires a configured model provider before Project Flow planning/);
  assert.match(runtime, /Agent_Runs/);
  assert.match(runtime, /Channel_Commands/);
  assert.match(runtime, /routeIntakeToProjectFlow/);
  assert.match(runtime, /workspace_write_artifact/);
  assert.match(runtime, /workspace_write_file/);
  assert.match(runtime, /workspace_validate_outputs/);
  assert.match(runtime, /execute_command/);
  assert.match(runtime, /governance_review/);
  assert.match(runtime, /delivery_package/);
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
  const visionLab = readFileSync('components/AgentVisionLab.tsx', 'utf8');
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
  assert.match(workflowCanvas, /Spawn Agent/);
  assert.match(workflowCanvas, /Start Project Flow/);
  assert.match(workflowCanvas, /Supr directs agents through phases, tasks, approvals, run records, and deliverables/);
  assert.doesNotMatch(page, /COMPETITOR SIGNAL TELEMETRY BRIEF/);
  assert.doesNotMatch(page, /Simulated Logs/);
  assert.doesNotMatch(page, /Simulated Traces/);
  assert.match(setupWizard, /Live Integrations/);
  assert.match(setupWizard, /Unavailable/);
  assert.doesNotMatch(initSql, /mock_tickets/);
  assert.doesNotMatch(setupWizard, /Simulated Telemetry|sandbox emulator|>Simulated</);
  assert.match(visionLab, /Demo Fixture/);
  assert.doesNotMatch(visionLab, /Simulated Step Mocks|Load r\/saas mock|Load Hacker News mock/);
  assert.doesNotMatch(visionLab, /MockPost/);
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
  const nativeRegister = readFileSync('src/tools/register.ts', 'utf8');
  const heartbeat = readFileSync('src/services/heartbeat.ts', 'utf8');
  const pluginDispatcher = readFileSync('src/tools/plugin-dispatcher.ts', 'utf8');
  const pluginWorkers = readFileSync('src/services/plugin-workers.ts', 'utf8');
  const eslintConfig = readFileSync('eslint.config.mjs', 'utf8');
  const tsconfig = readFileSync('tsconfig.json', 'utf8');
  const skillCatalog = readFileSync('src/services/skill-catalog.ts', 'utf8');
  const hexProvider = readFileSync('lib/adapters/HexAgentProvider.ts', 'utf8');
  const traceProvider = readFileSync('lib/adapters/TraceProvider.ts', 'utf8');
  const rules = readFileSync('agent-config/governance_rules.json', 'utf8');
  const importHarness = readFileSync('scripts/import-harness.ps1', 'utf8');
  const gitignore = readFileSync('.gitignore', 'utf8');

  assert.match(governance, /evaluateToolRules/);
  assert.match(governance, /SafetyRuleEngine/);
  assert.match(governance, /RuleEngine/);
  assert.match(registry, /evaluateToolRules\(name, params/);
  for (const tool of ['shell', 'web-search', 'subagent', 'todo', 'skill-invoker', 'plugin-dispatcher', 'project-flow']) {
    assert.match(nativeRegister, new RegExp(`\\.\\/${tool}`));
  }
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
  const groups = readFileSync('src/services/agent-groups.ts', 'utf8');
  const blueprints = readFileSync('src/services/agent-blueprints.ts', 'utf8');
  const memorySections = readFileSync('src/services/memory-sections.ts', 'utf8');
  const metrics = readFileSync('src/services/operational-metrics.ts', 'utf8');
  const guidelines = readFileSync('src/services/guideline-packs.ts', 'utf8');

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
  const portability = readFileSync('src/services/portability.ts', 'utf8');
  const settings = readFileSync('app/settings/page.tsx', 'utf8');

  assert.match(actions, /importOrganizationAction\(serializedData: string, options\?: \{ allowOverwrite\?: boolean \}/);
  assert.match(actions, /allowOverwrite/);
  assert.match(actions, /collisions/);
  assert.match(portability, /detectCollisions/);
  assert.match(portability, /!options\?\.allowOverwrite/);
  assert.match(portability, /INSERT OR REPLACE/);
  assert.match(settings, /importOrganizationAction\(JSON\.stringify\(importBundle\), \{ allowOverwrite: confirmOverwrite \}\)/);
});

test('real runtime mode blocks diagnostic mock successes', () => {
  const runtimeMode = readFileSync('lib/runtime/runtime-mode.ts', 'utf8');
  const webSearch = readFileSync('src/tools/web-search.ts', 'utf8');
  const browser = readFileSync('lib/tools/browser.ts', 'utf8');
  const composio = readFileSync('lib/tools/composio.ts', 'utf8');
  const httpProvider = readFileSync('src/adapters/HttpAgentProvider.ts', 'utf8');
  const modelProvider = readFileSync('lib/providers/model.ts', 'utf8');

  assert.match(runtimeMode, /RuntimeMode/);
  assert.match(runtimeMode, /isMockAllowed/);
  assert.match(webSearch, /real runtime mode/);
  assert.match(browser, /isMockAllowed\(mode\)/);
  assert.match(composio, /requires COMPOSIO_API_KEY in real runtime mode/);
  assert.match(httpProvider, /EXTERNAL_AGENT_ENDPOINT must point to a live provider in real runtime mode/);
  assert.match(modelProvider, /Real runtime mode requires/);
});
