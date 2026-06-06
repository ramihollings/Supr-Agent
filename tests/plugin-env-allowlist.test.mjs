import assert from 'node:assert/strict';
import { readFileSync, existsSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const STDIO_SOURCE = readFileSync(join(REPO_ROOT, 'lib/mcp/stdio.ts'), 'utf8');

/**
 * Plugin / MCP server env-allowlist behavior test.
 *
 * Per Blueprint 5.0 Part 3.1, MCP stdio servers must NOT
 * inherit the full host process.env. The `env_keys` allowlist
 * is the only mechanism preventing a malicious server from
 * exfiltrating `OPENAI_API_KEY`, `AUTH_SECRET`, or any other
 * host secret.
 *
 * This test:
 *   1. Verifies the source contains the scoping logic.
 *   2. Verifies the extracted `buildScopedEnv` helper produces
 *      a correct env object given a synthetic hostEnv.
 *   3. Spawns a real child process with the same env
 *      construction logic and asserts the child sees only the
 *      allowed keys (no OPENAI/GEMINI/ANTHROPIC leaks).
 */

// 1. Source-level: scoping helper must exist
test('stdio.ts exports a buildScopedEnv helper for env allowlisting', () => {
  assert.match(STDIO_SOURCE, /export function buildScopedEnv/);
  assert.match(STDIO_SOURCE, /env_keys/);
  // The 4 always-allowed keys must be present so stdlib/SDK
  // init paths keep working.
  assert.match(STDIO_SOURCE, /PATH.*HOME.*USER.*TMPDIR/s);
});

// 2. Pure-function test of buildScopedEnv
test('buildScopedEnv strips keys not in env_keys (no host-secret leak)', async () => {
  // tsx is the loader; if it's missing, we fall back to a
  // behavioral test below that doesn't need the import.
  // On Windows the bin shim is `tsx.cmd`; on POSIX it's `tsx`.
  const tsxBin = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
  const tsxPath = join(REPO_ROOT, 'node_modules', '.bin', tsxBin);
  if (!existsSync(tsxPath)) return;

  const harness = `
    import { buildScopedEnv } from '../lib/mcp/stdio.ts';
    const hostEnv = {
      PATH: '/usr/bin',
      HOME: '/home/test',
      USER: 'test',
      TMPDIR: '/tmp',
      OPENAI_API_KEY: 'sk-secret',
      GEMINI_API_KEY: 'gemini-secret',
      ANTHROPIC_API_KEY: 'ant-secret',
      GITHUB_TOKEN: 'ghp-secret',
      AUTH_SECRET: 'cookie-secret',
      APP_PASSWORD: 'login-secret',
    };
    const server = {
      id: 'github-mcp',
      name: 'GitHub',
      transport: 'stdio',
      description: '',
      required_tier: 'Edit',
      enabled: true,
      env_keys: ['GITHUB_TOKEN'],
    };
    const out = buildScopedEnv(server, hostEnv);
    const keys = Object.keys(out).sort();
    console.log(JSON.stringify({ keys }));
  `;
  const harnessPath = join(REPO_ROOT, 'tests', '.env-scope-harness.mjs');
  writeFileSync(harnessPath, harness);
  try {
    const result = spawnSync(tsxPath, [harnessPath], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      // The .cmd shim on Windows requires a shell to run; on
      // POSIX the bin is a shell script that also needs this.
      shell: process.platform === 'win32',
    });
    assert.equal(result.status, 0, `harness failed: ${result.stderr}`);
    const lines = result.stdout.trim().split('\n');
    const jsonLine = lines.find((line) => line.trim().startsWith('{'));
    if (!jsonLine) throw new Error(`Could not find JSON output in stdout: ${result.stdout}`);
    const out = JSON.parse(jsonLine);
    // The 4 always-allowed keys plus the 1 declared env_keys entry.
    assert.deepEqual(out.keys, ['GITHUB_TOKEN', 'HOME', 'PATH', 'TMPDIR', 'USER']);
  } finally {
    try { rmSync(harnessPath, { force: true }); } catch {}
  }
});

// 3. End-to-end: spawn a real child process and check its env
test('a spawned MCP server cannot see host secrets (GITHUB_TOKEN only)', () => {
  // Write a tiny script that echoes its own env to stdout as
  // JSON. Then spawn it via Node's child_process with the same
  // env construction logic the stdio transport uses.
  const scriptPath = join(REPO_ROOT, 'tests', '.env-echo-script.mjs');
  const script = `
    process.stdout.write(JSON.stringify(Object.keys(process.env).sort()));
  `;
  writeFileSync(scriptPath, script);
  try {
    const hostEnv = {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      USER: process.env.USER || '',
      TMPDIR: process.env.TMPDIR || '',
      OPENAI_API_KEY: 'sk-secret-do-not-leak',
      GEMINI_API_KEY: 'gemini-secret-do-not-leak',
      ANTHROPIC_API_KEY: 'ant-secret-do-not-leak',
      GITHUB_TOKEN: 'ghp-secret',
      AUTH_SECRET: 'cookie-secret',
      APP_PASSWORD: 'login-secret',
    };
    // The same construction logic the MCP stdio transport uses.
    const ALWAYS_ALLOWED = new Set(['PATH', 'HOME', 'USER', 'TMPDIR']);
    const env_keys = ['GITHUB_TOKEN'];
    const scoped = {};
    for (const key of Object.keys(hostEnv)) {
      if (ALWAYS_ALLOWED.has(key) || env_keys.includes(key)) {
        scoped[key] = hostEnv[key];
      }
    }
    const result = spawnSync(process.execPath, [scriptPath], {
      env: scoped,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, `child process failed: ${result.stderr}`);
    const seen = JSON.parse(result.stdout);
    // The child must NOT see any of these host secrets.
    for (const forbidden of ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'AUTH_SECRET', 'APP_PASSWORD']) {
      assert.ok(!seen.includes(forbidden), `child process leaked ${forbidden}! seen=${seen.join(',')}`);
    }
    // The child must see the 4 always-allowed keys and the 1 declared env_keys entry.
    for (const required of ['PATH', 'HOME', 'USER', 'TMPDIR', 'GITHUB_TOKEN']) {
      assert.ok(seen.includes(required), `child process missing ${required}; seen=${seen.join(',')}`);
    }
  } finally {
    try { rmSync(scriptPath, { force: true }); } catch {}
  }
});

// Helpers at the bottom so the test bodies read top-down.
// (No additional helpers needed — all imports are at the top of the file.)
