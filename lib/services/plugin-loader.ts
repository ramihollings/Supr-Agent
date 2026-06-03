import fs from "node:fs";
import path from "node:path";
import { pluginRegistry } from "./plugin-registry";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  entrypoint: string;
  capabilities?: string[];
  permissions?: string[];
}

/**
 * Strict allowlist for plugin ids. Plugin ids are used to derive
 * filesystem paths (`plugins/<id>/...`), so they must be safe to
 * embed in a path. The previous implementation accepted any string,
 * letting a manifest with `id: "../../etc/passwd"` escape the
 * plugins directory.
 */
const PLUGIN_ID_PATTERN = /^[a-zA-Z0-9._-]{1,64}$/;

export function isValidPluginId(id: unknown): id is string {
  return typeof id === "string" && PLUGIN_ID_PATTERN.test(id);
}

/**
 * Verify that a manifest's `id` matches the folder it was loaded from.
 * Without this check, a malicious manifest could claim a different id
 * and confuse the worker (which trusts the registered id to find
 * entrypoint paths) or impersonate another plugin at runtime.
 */
function isValidEntrypointPath(entrypoint: unknown): entrypoint is string {
  if (typeof entrypoint !== "string" || entrypoint.length === 0) return false;
  // Reject absolute paths and any traversal segments.
  if (path.isAbsolute(entrypoint)) return false;
  const segments = entrypoint.split(/[\\/]+/);
  return !segments.includes("..");
}

export class PluginLoader {
  private pluginsDir: string;

  constructor(pluginsDir: string = "plugins") {
    this.pluginsDir = path.resolve(process.cwd(), pluginsDir);
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
    }
  }

  /**
   * Scans the plugins directory, parses manifestations, and registers them.
   */
  async discoverAndRegister(): Promise<PluginManifest[]> {
    const discovered: PluginManifest[] = [];
    if (!fs.existsSync(this.pluginsDir)) return discovered;

    try {
      const entries = await fs.promises.readdir(this.pluginsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // The folder name must itself be a valid plugin id; we treat
        // the folder name as the canonical id and reject the manifest
        // if it claims anything different.
        if (!isValidPluginId(entry.name)) {
          console.warn(`[PluginLoader] Skipping folder '${entry.name}': name does not match the plugin id allowlist.`);
          continue;
        }

        const folderPath = path.join(this.pluginsDir, entry.name);
        const manifestPaths = [
          path.join(folderPath, "plugin.json"),
          path.join(folderPath, "manifest.json")
        ];

        let manifestContent = "";
        let foundManifest = false;

        for (const p of manifestPaths) {
          if (fs.existsSync(p)) {
            manifestContent = await fs.promises.readFile(p, "utf8");
            foundManifest = true;
            break;
          }
        }

        if (!foundManifest) continue;

        try {
          const manifest = JSON.parse(manifestContent) as PluginManifest;
          if (!manifest.id || !manifest.name || !manifest.version || !manifest.entrypoint) {
            console.warn(`[PluginLoader] Invalid manifest in folder: ${entry.name}. Missing required fields.`);
            continue;
          }
          // Manifest id must equal the folder name and pass the allowlist.
          if (manifest.id !== entry.name || !isValidPluginId(manifest.id)) {
            console.warn(`[PluginLoader] Manifest id '${manifest.id}' in folder '${entry.name}' does not match the folder name. Skipping.`);
            continue;
          }
          // Entrypoint must be a safe relative path with no traversal.
          if (!isValidEntrypointPath(manifest.entrypoint)) {
            console.warn(`[PluginLoader] Entrypoint '${manifest.entrypoint}' in folder '${entry.name}' is not a safe relative path. Skipping.`);
            continue;
          }

          // Register in the database registry
          await pluginRegistry.registerPlugin({
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            manifest,
            permissions: manifest.permissions || []
          });

          discovered.push(manifest);
          console.log(`[PluginLoader] Registered plugin: ${manifest.name} (${manifest.id})`);
        } catch (err: any) {
          console.warn(`[PluginLoader] Failed to parse manifest in ${folderPath}: ${err.message}`);
        }
      }
    } catch (err: any) {
      console.error("[PluginLoader] Error reading plugins directory:", err);
    }

    return discovered;
  }
}

export const pluginLoader = new PluginLoader();
