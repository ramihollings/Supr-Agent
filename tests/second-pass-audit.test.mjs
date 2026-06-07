import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const TELEGRAM_SOURCE = readFileSync(join(REPO_ROOT, 'app/api/telegram/route.ts'), 'utf8');
const WEB_SEARCH_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/web-search.ts'), 'utf8');
const SAFE_FETCH_SOURCE = readFileSync(join(REPO_ROOT, 'lib/net/safe-fetch.ts'), 'utf8');
const SANDBOX_SOURCE = readFileSync(join(REPO_ROOT, 'lib/providers/local-node-sandbox.ts'), 'utf8');
const PLUGIN_WORKERS_SOURCE = readFileSync(join(REPO_ROOT, 'lib/services/plugin-workers.ts'), 'utf8');
const COMPOSIO_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/composio.ts'), 'utf8');
const SHELL_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/shell.ts'), 'utf8');
const ACTIVITY_SOURCE = readFileSync(join(REPO_ROOT, 'lib/services/activity-log.ts'), 'utf8');
const COST_SOURCE = readFileSync(join(REPO_ROOT, 'lib/services/cost-tracker.ts'), 'utf8');
const PLUGIN_HOST_SOURCE = readFileSync(join(REPO_ROOT, 'lib/services/plugin-host.ts'), 'utf8');
const TODO_SOURCE = readFileSync(join(REPO_ROOT, 'lib/tools/todo.ts'), 'utf8');

/**
 * Second-pass audit regression test. This covers the items from the
 * followup audit that weren't in the original 14-finding set:
 *   - Telegram webhook forgery (X-Telegram-Bot-Api-Secret-Token)
 *   - web_search SSRF bypass
 *   - sandbox path/session containment
 *   - plugin symlink containment
 *   - Composio key resolution from Settings
 *   - shell command policy approval gate
 *   - remaining persisted IDs in activity-log / cost-tracker /
 *     plugin-host / todo
 *
 * Each test asserts the fix is in place via source-pattern matching,
 * following the codebase's established testing convention.
 */

// 1. Telegram webhook forgery
test('telegram route requires the X-Telegram-Bot-Api-Secret-Token header', () => {
  // The header must be checked before any body parsing or command
  // dispatch, so a forged POST that knows the chat id is still rejected.
  assert.match(TELEGRAM_SOURCE, /x-telegram-bot-api-secret-token/);
  // The configured secret must come from the secrets store (not
  // process.env only) so operators can rotate it from the Settings UI.
  assert.match(TELEGRAM_SOURCE, /getSecretSetting\(['"]telegram_webhook_secret['"]/);
  // A constant-time comparison must guard the secret, so a timing
  // attack can't be used to recover it.
  assert.match(TELEGRAM_SOURCE, /safeEqual\(providedSecret, configuredSecret\)/);
  // The route must reject with 401 when the secret is missing/wrong.
  assert.match(TELEGRAM_SOURCE, /\{ status: 401 \}/);
  // The route must refuse to dispatch when no secret is configured
  // at all (503), rather than fall back to the forgeable chat-id check.
  assert.match(TELEGRAM_SOURCE, /\{ status: 503 \}/);
});

// 2. web_search SSRF bypass
test('web_search uses the shared safeFetch for user-controlled URLs', () => {
  // The user-supplied URL branch must NOT call bare fetch().
  assert.doesNotMatch(WEB_SEARCH_SOURCE, /^\s*const response = await fetch\(params\.url\)/m);
  // It must use the shared safeFetch / safeFetchText instead.
  assert.match(WEB_SEARCH_SOURCE, /safeFetchText\(params\.url/);
});

test('safeFetch enforces the full SSRF defense (private IPs, DNS pin, redirects, size cap)', () => {
  assert.match(SAFE_FETCH_SOURCE, /isPrivateIp/);
  assert.match(SAFE_FETCH_SOURCE, /assertSafeUrl/);
  assert.match(SAFE_FETCH_SOURCE, /resolveAndVetPublicAddress/);
  // The shared module must reject non-HTTP(S) protocols.
  assert.match(SAFE_FETCH_SOURCE, /\['http:', 'https:'\]/);
  // Must cap response size and enforce timeout.
  assert.match(SAFE_FETCH_SOURCE, /maxBytes/);
  assert.match(SAFE_FETCH_SOURCE, /timeoutMs/);
  // Must re-validate every redirect target.
  assert.match(SAFE_FETCH_SOURCE, /\[(301|302|303|307|308)/);
});

// 3. Sandbox path/session containment
test('sandbox validates sessionId with a strict regex', () => {
  // The regex must be anchored end-to-end (^...$) so a partial match
  // cannot bypass the allowlist.
  assert.match(SANDBOX_SOURCE, /SANDBOX_ID_PATTERN/);
  assert.match(SANDBOX_SOURCE, /\^\[a-zA-Z0-9\._-\]\{1,128\}\$/);
  assert.match(SANDBOX_SOURCE, /isValidSessionId/);
});

test('sandbox uses path.relative (not startsWith) for containment', () => {
  // The previous startsWith() check was vulnerable to prefix-sibling
  // bugs (session "abc" passes containment for sessionDir "abc-evil").
  assert.match(SANDBOX_SOURCE, /path\.relative\(sessionDir, absoluteTargetPath\)/);
  // The new check must reject `..` starts and absolute paths.
  assert.match(SANDBOX_SOURCE, /!rel\.startsWith\('\.\.'\)/);
  assert.match(SANDBOX_SOURCE, /path\.isAbsolute\(rel\)/);
});

test('sandbox sessionId uses crypto.randomUUID() instead of Date.now()', () => {
  // createSession must not use Date.now() for the id.
  const createSessionBlock = SANDBOX_SOURCE.match(/async createSession\([\s\S]*?\n  \}/)?.[0] || '';
  assert.ok(createSessionBlock.includes('crypto.randomUUID()'), 'createSession must use crypto.randomUUID()');
  assert.doesNotMatch(createSessionBlock, /Date\.now\(\)/);
});

// 4. Plugin symlink containment
test('plugin worker uses fs.realpathSync to defeat symlink escape', () => {
  assert.match(PLUGIN_WORKERS_SOURCE, /fs\.realpathSync\(pluginsDir\)/);
  assert.match(PLUGIN_WORKERS_SOURCE, /fs\.realpathSync\(pluginRoot\)/);
  assert.match(PLUGIN_WORKERS_SOURCE, /fs\.realpathSync\(entryPath\)/);
  // The realpath-resolved entry must be passed to fork(), not the
  // lexical path (which could resolve to a symlinked location).
  assert.match(PLUGIN_WORKERS_SOURCE, /fork\(realEntryPath/);
});

test('plugin worker re-verifies containment using realpath-resolved paths', () => {
  assert.match(PLUGIN_WORKERS_SOURCE, /realPluginRoot\.startsWith\(realPluginsDir/);
  assert.match(PLUGIN_WORKERS_SOURCE, /realEntryPath\.startsWith\(realPluginRoot/);
});

// 5. Composio key resolution
test('composio resolves the API key from Settings, not only process.env', () => {
  // The previous version only read process.env.COMPOSIO_API_KEY at
  // module load; the Settings UI field had no effect. The fix must
  // call getSecretSetting('integrations_composio', ...) at execution
  // time.
  assert.match(COMPOSIO_SOURCE, /getSecretSetting\(['"]integrations_composio['"]/);
  // And the import must be present.
  assert.match(COMPOSIO_SOURCE, /import \{ getSecretSetting \}/);
  // The error message must mention the Settings field, not just the env var.
  assert.match(COMPOSIO_SOURCE, /integrations_composio/);
});

// 6. Shell command policy approval gate
test('shell tool enforces approvalRequired from the execution policy', () => {
  assert.match(SHELL_SOURCE, /assertExecutionAllowedOrThrow/);
  // The gate must be invoked on the local-execution path.
  const shellToolBody = SHELL_SOURCE.match(/name: "execute_command"[\s\S]*?^\};/m)?.[0] || '';
  assert.ok(shellToolBody.includes('assertExecutionAllowedOrThrow'), 'shell tool must call assertExecutionAllowedOrThrow');
  // The error must carry the policy so the approval UI can route it.
  // The flag is set as a property on the thrown error so callers can
  // `if (error.approvalRequired) ...` to route to the approval UI.
  assert.match(SHELL_SOURCE, /\(error as any\)\.approvalRequired = true/);
});

test('hard-denied shell commands cannot be bypassed by a trusted approval id', () => {
  const blockedCheck = SHELL_SOURCE.indexOf('executionPolicy.selectedEnvironment === "blocked"');
  const approvalBypass = SHELL_SOURCE.indexOf('if (trustedApprovedActionId)');
  assert.ok(blockedCheck >= 0);
  assert.ok(approvalBypass > blockedCheck);
});

// 7. Remaining persisted IDs
test('activity-log uses crypto.randomUUID() for all persisted ids', () => {
  // Both logAudit() and logEvent() must use UUIDs. The audit covered
  // logAudit() in the first pass; logEvent() was a real gap that
  // was caught by this test.
  assert.match(ACTIVITY_SOURCE, /import crypto/);
  // No remaining Date.now() / Math.random() id interpolation.
  assert.doesNotMatch(ACTIVITY_SOURCE, /Date\.now\(\).*Math\.random/s);
  assert.doesNotMatch(ACTIVITY_SOURCE, /Math\.random.*Date\.now/s);
  // Both id generators use randomUUID.
  const idMatches = ACTIVITY_SOURCE.match(/crypto\.randomUUID\(\)/g) || [];
  assert.ok(idMatches.length >= 2, `expected >= 2 randomUUID calls, found ${idMatches.length}`);
});

test('cost-tracker uses crypto.randomUUID() for cost ids', () => {
  assert.match(COST_SOURCE, /import crypto/);
  assert.match(COST_SOURCE, /crypto\.randomUUID\(\)/);
});

test('plugin-host uses crypto.randomUUID() for plugin audit ids', () => {
  assert.match(PLUGIN_HOST_SOURCE, /import crypto/);
  assert.match(PLUGIN_HOST_SOURCE, /crypto\.randomUUID\(\)/);
});

test('todo tool uses crypto.randomUUID() for task ids', () => {
  assert.match(TODO_SOURCE, /import crypto/);
  assert.match(TODO_SOURCE, /crypto\.randomUUID\(\)/);
});
