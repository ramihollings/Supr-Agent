import dbClient from "../../lib/database/db_client";

export interface PluginRecord {
  id: string;
  name: string;
  version: string;
  status: "enabled" | "disabled";
  manifest: Record<string, any>;
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export class PluginRegistry {
  /**
   * Register or update a plugin in the database.
   */
  async registerPlugin(data: {
    id: string;
    name: string;
    version: string;
    manifest: Record<string, any>;
    permissions?: string[];
  }): Promise<void> {
    const permissionsJson = JSON.stringify(data.permissions || []);
    const manifestJson = JSON.stringify(data.manifest);

    await dbClient.execute(
      `INSERT INTO Plugin_Registry (id, name, version, status, manifest, permissions, updated_at)
       VALUES (?, ?, ?, 'disabled', ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         version = excluded.version,
         manifest = excluded.manifest,
         permissions = excluded.permissions,
         updated_at = CURRENT_TIMESTAMP`,
      [data.id, data.name, data.version, manifestJson, permissionsJson]
    );
  }

  /**
   * Set plugin status to enabled.
   */
  async enablePlugin(id: string): Promise<void> {
    await dbClient.execute(
      "UPDATE Plugin_Registry SET status = 'enabled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]
    );
  }

  /**
   * Set plugin status to disabled.
   */
  async disablePlugin(id: string): Promise<void> {
    await dbClient.execute(
      "UPDATE Plugin_Registry SET status = 'disabled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [id]
    );
  }

  /**
   * Get a plugin record by ID.
   */
  async getPlugin(id: string): Promise<PluginRecord | null> {
    const row = await dbClient.queryOne<any>(
      "SELECT * FROM Plugin_Registry WHERE id = ?",
      [id]
    );
    if (!row) return null;
    return this.mapRow(row);
  }

  /**
   * List all registered plugins.
   */
  async listPlugins(): Promise<PluginRecord[]> {
    const rows = await dbClient.query<any>("SELECT * FROM Plugin_Registry ORDER BY name ASC");
    return rows.map(r => this.mapRow(r));
  }

  private mapRow(row: any): PluginRecord {
    let manifest = {};
    let permissions = [];
    try {
      manifest = JSON.parse(row.manifest);
    } catch {}
    try {
      permissions = JSON.parse(row.permissions);
    } catch {}

    return {
      id: row.id,
      name: row.name,
      version: row.version,
      status: row.status,
      manifest,
      permissions,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}

export const pluginRegistry = new PluginRegistry();
