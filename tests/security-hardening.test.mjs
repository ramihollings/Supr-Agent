import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
  assert.match(agentRoute, /INSERT INTO Approvals/);
  assert.match(researchRoute, /fetchResearchSource/);
  assert.match(researchRoute, /Mode/);
  assert.match(researchRoute, /mode = 'Live'/);
});
