import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const REPO_ROOT = join(import.meta.dirname, '..');
const LOADER_SOURCE = readFileSync(join(REPO_ROOT, 'lib/services/plugin-loader.ts'), 'utf8');
const WORKER_SOURCE = readFileSync(join(REPO_ROOT, 'lib/services/plugin-workers.ts'), 'utf8');

/**
 * Plugin path-trust boundary regression test.
 *
 * Plugins are loaded from disk and executed as child processes. The
 * plugin id (from the manifest) and the entrypoint path are both used
 * to derive filesystem paths, so untrusted values must be confined to
 * a strict allowlist. A previous version accepted any string, letting
 * a manifest with `id: "../../etc/passwd"` escape the plugins
 * directory.
 *
 * The fix:
 * 1. A strict regex (`^[a-zA-Z0-9._-]{1,64}$`) gates which ids are
 *    even considered.
 * 2. The manifest's `id` must equal its folder name.
 * 3. The entrypoint must be a safe relative path with no `..` segments.
 * 4. The worker re-validates the id and verifies pluginRoot itself
 *    stays inside pluginsDir.
 */

test('plugin loader defines an allowlist regex for plugin ids', () => {
  assert.match(LOADER_SOURCE, /PLUGIN_ID_PATTERN/);
  assert.match(LOADER_SOURCE, /\[a-zA-Z0-9\._-\]\{1,64\}/);
  assert.match(LOADER_SOURCE, /export function isValidPluginId/);
});

test('plugin loader validates the folder name before reading the manifest', () => {
  // The allowlist must be checked on the directory entry name BEFORE
  // we open the manifest file, so a folder named "../../etc" never
  // gets its manifest parsed.
  assert.match(LOADER_SOURCE, /isValidPluginId\(entry\.name\)/);
});

test('plugin loader rejects manifests whose id does not match the folder', () => {
  assert.match(LOADER_SOURCE, /manifest\.id !== entry\.name/);
});

test('plugin loader rejects entrypoints that are not safe relative paths', () => {
  // The check must reject:
  //  - non-strings
  //  - absolute paths
  //  - paths with `..` segments
  assert.match(LOADER_SOURCE, /path\.isAbsolute\(entrypoint\)/);
  assert.match(LOADER_SOURCE, /segments\.includes\("\.\."\)/);
});

test('plugin worker re-validates the plugin id from the registry', () => {
  assert.match(WORKER_SOURCE, /isValidPluginId\(pluginId\)/);
  // And it must throw on a bad id rather than silently continuing.
  assert.match(WORKER_SOURCE, /isValidPluginId\(pluginId\)\)[\s\S]{0,80}throw new Error/);
});

test('plugin worker verifies pluginRoot stays inside pluginsDir', () => {
  // Defense-in-depth: even if a future change weakened the id check,
  // the worker must verify the resolved pluginRoot is contained.
  assert.match(WORKER_SOURCE, /pluginRoot\.startsWith\(pluginsDir \+ path\.sep\)/);
});
