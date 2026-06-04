#!/usr/bin/env node
/**
 * Supr Composio CLI.
 *
 * Operator-facing tool for managing third-party SaaS app connections
 * via Composio. Subcommands:
 *
 *   supr-composio apps                      List apps supported by Composio.
 *   supr-composio connections               List active OAuth connections.
 *   supr-composio connect <appKey>          Print a URL to initiate OAuth.
 *   supr-composio invoke <action> [json]    Invoke a Composio action.
 *   supr-composio bridge <action> <json>    Alias for invoke.
 *   supr-composio status                    Show whether Composio is configured.
 *
 * The API key is read from process.env.COMPOSIO_API_KEY or
 * integrations_composio in the Supr Settings table (via a tsx
 * import of lib/secrets). For the CLI, we only need the env var
 * — the Settings table is for the in-process agent runtime.
 *
 * Usage examples:
 *   node bin/supr-composio.mjs status
 *   node bin/supr-composio.mjs apps
 *   node bin/supr-composio.mjs connect github
 *   node bin/supr-composio.mjs invoke GITHUB_CREATE_ISSUE '{"owner":"o","repo":"r","title":"hi"}'
 */
import process from 'node:process';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

function printTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length)),
  );
  const fmt = (cells) =>
    cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  console.log(fmt(headers));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(fmt(row));
}

async function ensureKey() {
  if (!process.env.COMPOSIO_API_KEY) {
    console.error('COMPOSIO_API_KEY is not set.');
    console.error('Set it in your environment or in Supr Settings (integrations_composio).');
    console.error('Get a key at https://app.composio.dev/settings/api-keys');
    process.exit(2);
  }
}

/**
 * The bridge uses composio-core, which is an ESM/TS module. We
 * load it through tsx in a child process so this CLI file can stay
 * plain Node and the SDK's typing/loader quirks don't leak into
 * the rest of the codebase.
 */
async function callBridge(method, args = []) {
  const tsxBin = join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
  if (!existsSync(tsxBin)) {
    // Fall back to running the bridge via a temp file in plain JS.
    return await runBridgePlain(method, args);
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(
      tsxBin,
      ['-e', bridgeScript(method, args)],
      { cwd: REPO_ROOT, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('exit', (code) => {
      if (code === 0) {
        try { resolve(JSON.parse(stdout)); }
        catch { resolve({ raw: stdout }); }
      } else {
        reject(new Error(stderr || `bridge exited with code ${code}`));
      }
    });
    child.on('error', reject);
  });
}

async function runBridgePlain(method, args) {
  // Use the API key as a header and call Composio's REST API
  // directly. Useful when tsx is not installed (e.g. production
  // Docker image with a slimmed devDeps).
  const apiKey = process.env.COMPOSIO_API_KEY;
  const base = process.env.COMPOSIO_BASE_URL || 'https://backend.composio.dev';
  const headers = { 'Content-Type': 'application/json', 'x-api-key': apiKey };
  let path = '';
  if (method === 'listApps') path = '/api/v1/apps';
  else if (method === 'listConnections') path = '/api/v1/connections';
  else if (method === 'initiateConnection') path = `/api/v1/connections/initiate?appName=${encodeURIComponent(args[0])}`;
  else if (method === 'executeAction') {
    path = `/api/v1/actions/execute`;
    const res = await fetch(base + path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ actionName: args[0], input: args[1] || {} }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return await res.json();
  }
  if (!path) throw new Error(`No REST mapping for method '${method}'`);
  const res = await fetch(base + path, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

function bridgeScript(method, args) {
  // tsx executes a one-off TypeScript program that imports the
  // bridge and prints the result as JSON.
  const argsJson = JSON.stringify(args);
  return `
    import { composioBridge } from './lib/tools/composio.ts';
    (async () => {
      try {
        const r = await composioBridge.${method}(...${argsJson});
        process.stdout.write(JSON.stringify(r));
      } catch (err) {
        process.stderr.write(err.message);
        process.exit(1);
      }
    })();
  `;
}

function usage() {
  console.log('Usage: supr-composio <command> [args]');
  console.log('');
  console.log('Commands:');
  console.log('  status                Show whether Composio is configured.');
  console.log('  apps                  List supported apps.');
  console.log('  connections           List active OAuth connections.');
  console.log('  connect <app>         Print a URL to initiate OAuth for <app>.');
  console.log('  invoke <action> [json]');
  console.log('                       Invoke a Composio action with a JSON params object.');
  console.log('');
  console.log('Environment:');
  console.log('  COMPOSIO_API_KEY      Required. Composio server-side API key.');
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    usage();
    process.exit(cmd ? 0 : 1);
  }

  if (cmd === 'status') {
    if (process.env.COMPOSIO_API_KEY) {
      console.log('COMPOSIO_API_KEY is set.');
    } else {
      console.log('COMPOSIO_API_KEY is NOT set. Set it or configure integrations_composio in Supr Settings.');
    }
    return;
  }

  if (cmd === 'apps') {
    await ensureKey();
    const apps = await callBridge('listApps');
    if (!Array.isArray(apps) || apps.length === 0) {
      console.log('No apps returned (or the API key is invalid).');
      return;
    }
    printTable(['key', 'name'], apps.map((a) => [a.key, a.name]));
    return;
  }

  if (cmd === 'connections') {
    await ensureKey();
    const conns = await callBridge('listConnections');
    if (!Array.isArray(conns) || conns.length === 0) {
      console.log('No active connections. Use `supr-composio connect <app>` to start one.');
      return;
    }
    printTable(['id', 'app', 'status', 'createdAt'], conns.map((c) => [c.id, c.app, c.status, c.createdAt || '']));
    return;
  }

  if (cmd === 'connect') {
    await ensureKey();
    const app = argv[1];
    if (!app) {
      console.error('Usage: supr-composio connect <app>');
      process.exit(2);
    }
    const result = await callBridge('initiateConnection', [app]);
    printJson(result);
    if (result.redirectUrl) {
      console.error(`\nOpen the redirect URL above in a browser to complete OAuth for ${app}.`);
    }
    return;
  }

  if (cmd === 'invoke' || cmd === 'bridge') {
    await ensureKey();
    const action = argv[1];
    if (!action) {
      console.error('Usage: supr-composio invoke <action> [json]');
      process.exit(2);
    }
    let params = {};
    if (argv[2]) {
      try { params = JSON.parse(argv[2]); }
      catch (err) {
        console.error(`Invalid JSON params: ${err.message}`);
        process.exit(2);
      }
    }
    const result = await callBridge('executeAction', [action, params]);
    printJson(result);
    return;
  }

  console.error(`Unknown command: ${cmd}`);
  usage();
  process.exit(2);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
