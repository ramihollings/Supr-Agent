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

