import { execFile } from "node:child_process";
import { promisify } from "node:util";
import dbClient from "../../lib/database/db_client";

const execFileAsync = promisify(execFile);

async function upsertSetting(key: string, value: string) {
  await dbClient.execute(
    `INSERT INTO Settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

async function recordComputerHealth(id: string, status: string, detail: string) {
  await dbClient.execute(
    `UPDATE Computers SET status = ?, last_health_check = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, new Date().toISOString(), id],
  );
  await dbClient.execute(
    `INSERT INTO Provider_Health (id, name, provider_type, status, last_error, updated_at)
     VALUES (?, ?, 'runtime', ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(id) DO UPDATE SET status = excluded.status, last_error = excluded.last_error, updated_at = CURRENT_TIMESTAMP`,
    [`runtime-${id}`, id === "docker" ? "Docker Sandbox" : id, status, detail],
  );
}

export async function probeDockerAvailability() {
  try {
    const { stdout, stderr } = await execFileAsync("docker", ["version", "--format", "{{.Server.Version}}"], {
      timeout: 8000,
      windowsHide: true,
      maxBuffer: 128 * 1024,
    });
    const version = String(stdout || "").trim();
    const detail = version ? `Docker server ${version}` : String(stderr || "Docker responded without version output.").trim();
    await upsertSetting("docker_available", "true");
    await upsertSetting("docker_last_probe", new Date().toISOString());
    await recordComputerHealth("docker", "available", detail);
    return { success: true, available: true, detail };
  } catch (error: any) {
    const detail = error?.stderr || error?.message || "Docker is unavailable.";
    await upsertSetting("docker_available", "false");
    await upsertSetting("docker_last_probe", new Date().toISOString());
    await recordComputerHealth("docker", "requires_config", detail);
    return { success: true, available: false, detail };
  }
}
