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

test('governance and research routes expose real status labels instead of silent simulation', () => {
  const agentRoute = readFileSync('app/api/agent/route.ts', 'utf8');
  const researchRoute = readFileSync('app/api/research/route.ts', 'utf8');

  assert.match(agentRoute, /extractRequestedAction/);
  assert.match(agentRoute, /createAgentAction/);
  assert.match(agentRoute, /executeAgentAction/);
  assert.match(researchRoute, /fetchResearchSource/);
  assert.match(researchRoute, /Mode/);
  assert.match(researchRoute, /mode = 'Live'/);
});

test('agent runtime orchestration is backed by shared tables and modules', () => {
  const initSql = readFileSync('lib/database/init.ts', 'utf8');
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const runtime = readFileSync('lib/runtime/agent-actions.ts', 'utf8');
  const glidepath = readFileSync('lib/runtime/glidepath.ts', 'utf8');
  const codeRoute = readFileSync('app/api/code-agent/route.ts', 'utf8');
  const researchRoute = readFileSync('app/api/research/route.ts', 'utf8');

  for (const table of ['Agent_Actions', 'Provider_Health', 'Computers', 'Plugin_Registry', 'Knowledge_Pages', 'Roles', 'Audit_Log']) {
    assert.match(initSql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.ok(pkg.dependencies['@langchain/langgraph']);
  assert.match(runtime, /resumeAgentActionFromApproval/);
  assert.match(runtime, /humanGateRequired/);
  assert.match(glidepath, /@langchain\/langgraph/);
  assert.match(codeRoute, /evaluateAgentAction/);
  assert.match(researchRoute, /executeAgentAction/);
});

test('timeline, approvals, and connector health read runtime state', () => {
  const actions = readFileSync('app/actions.ts', 'utf8');

  assert.match(actions, /fetchAgentActionsForMission/);
  assert.match(actions, /resumeAgentActionFromApproval/);
  assert.match(actions, /Provider_Health/);
  assert.match(actions, /recordProviderSuccess/);
  assert.match(actions, /recordProviderFailure/);
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

  assert.match(page, /ProjectWorkflowCanvas/);
  assert.match(page, /spawnProjectAgentAction/);
  assert.match(page, /fetchProjectOperatingGraphAction/);
  assert.match(actions, /export async function spawnProjectAgentAction/);
  assert.match(actions, /createRuntimeAgentAction/);
  assert.match(actions, /export async function fetchProjectOperatingGraphAction/);
  assert.match(workflowCanvas, /Spawn Agent/);
  assert.match(workflowCanvas, /mission phases, tasks, agent actions, approvals, and artifacts/);
  assert.doesNotMatch(page, /COMPETITOR SIGNAL TELEMETRY BRIEF/);
  assert.doesNotMatch(page, /Simulated Logs/);
  assert.doesNotMatch(page, /Simulated Traces/);
});
