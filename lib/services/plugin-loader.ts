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
