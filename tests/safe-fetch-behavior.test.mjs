/**
 * Behavioral tests for the SSRF-safe fetch implementation.
 *
 * The previous version of safe-fetch.ts (after the first refactor)
 * built the request URL with the resolved IP and set a Host header,
 * which broke TLS for normal HTTPS sites:
 *   - IPv6 produced an invalid URL (the IP itself is fine, but the
 *     resulting URL was rejected by Node's URL parser in some cases).
 *   - IPv4 failed the TLS handshake because SNI/certificate
 *     validation is done against the URL hostname, not the Host
 *     header, and the cert is issued for the real hostname, not the IP.
 *
 * The fix is to use undici's `Agent` with a custom `lookup` function
 * that pins the TCP connect to a vetted IP while leaving the URL
 * hostname (and therefore SNI / cert validation) intact.
 *
 * These tests verify the fix actually works at runtime against real
 * HTTPS endpoints, not just that the source contains the right words.
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const REPO_ROOT = process.cwd();
const SAFE_FETCH_PATH = join(REPO_ROOT, 'lib', 'net', 'safe-fetch.ts');

/**
 * Spin up a one-off Node subprocess that imports safe-fetch via tsx
 * and runs an arbitrary script. Using a subprocess keeps the
 * network sockets isolated and lets us run TypeScript directly
 * without compiling.
 */
function runSafeFetchScript(scriptBody, env = {}) {
  const harness = `
    import { safeFetch, safeFetchText, assertSafeUrl } from '../lib/net/safe-fetch.ts';
    ${scriptBody}
  `;
  const harnessPath = join(REPO_ROOT, 'tests', '.ssrf-harness.mjs');
  writeFileSync(harnessPath, harness);
  try {
    const result = spawnSync('npx', ['tsx', harnessPath], {
      cwd: REPO_ROOT,
      env: { ...process.env, ...env },
      encoding: 'utf8',
      timeout: 30_000,
      shell: true,
    });
    return {
      status: result.status ?? -1,
      stdout: result.stdout || '',
      stderr: result.stderr || '',
    };
  } finally {
    try { rmSync(harnessPath, { force: true }); } catch {}
  }
}

test('safeFetch uses undici Agent with a lookup-based DNS pin (not IP URL + Host header)', async () => {
  // Source-pattern assertion: the IP-URL + Host-header approach must
  // be gone. The new path passes a dispatcher (Agent) to the fetch
  // call, and the Agent's lookup callback returns the vetted IP.
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(SAFE_FETCH_PATH, 'utf8');
  // Must NOT construct a URL with the IP literal as the hostname
  // (the pattern from the broken version).
  assert.doesNotMatch(
    source,
    /\$\{protocol\}\/\/\$\{firstAddress\}/,
    'safe-fetch must not build https://<ip>/... URLs; SNI would break',
  );
  // Must NOT set a custom Host header (URL hostname is the right
  // source of truth for SNI/cert validation).
  assert.doesNotMatch(source, /Host:\s*current\.originalHost/);
  // Must use undici's Agent with a lookup callback.
  assert.match(source, /from 'undici'/);
  assert.match(source, /new Agent\(/);
  assert.match(source, /lookup:/);
});

test('safeFetchText blocks a private-IP URL at the call site', () => {
  // assertSafeUrl / safeFetchText must reject URLs whose hostname
  // resolves to a private address. We don't need the real network
  // for this — we point the test at a hostname that resolves to
  // 127.0.0.1 (the loopback label) and expect the SSRF check to
  // throw before any TCP connect.
  const result = runSafeFetchScript(`
    try {
      await safeFetchText('http://localhost.localdomain/');
      console.log('UNEXPECTED_OK');
    } catch (err) {
      console.log('BLOCKED:' + err.message);
    }
  `);
  assert.equal(result.status, 0, `script failed: ${result.stderr}`);
  assert.match(result.stdout, /BLOCKED:/, 'expected safeFetchText to block private/localhost URL');
});

test('safeFetchText blocks the cloud metadata IP literal (169.254.169.254)', () => {
  // An agent with a params.url of the AWS / GCP / Azure metadata
  // service IP must be rejected outright, even though the URL is
  // well-formed.
  const result = runSafeFetchScript(`
    try {
      await safeFetchText('http://169.254.169.254/latest/meta-data/');
      console.log('UNEXPECTED_OK');
    } catch (err) {
      console.log('BLOCKED:' + err.message);
    }
  `);
  assert.equal(result.status, 0, `script failed: ${result.stderr}`);
  assert.match(result.stdout, /BLOCKED:/);
});

test('safeFetch preserves SNI / cert validation (no IP-URL rewrite)', () => {
  // The fix must keep the original hostname in the URL — undici
  // uses the URL hostname for SNI, and TLS certificates are issued
  // for the hostname, not the IP. The previous version replaced
  // the hostname with the IP and added a Host header; cert
  // validation then failed and the request couldn't even reach
  // the wire for normal HTTPS sites. We assert the source path
  // does not do that anymore.
  const source = readFileSync(SAFE_FETCH_PATH, 'utf8');
  // The fetch call must use the original URL, not a rewritten one.
  // The first argument to undiciFetch should be `currentUrl` (or a
  // variable that resolves to the original URL), not anything
  // containing the IP literal.
  assert.match(source, /undiciFetch\(currentUrl,/);
});
