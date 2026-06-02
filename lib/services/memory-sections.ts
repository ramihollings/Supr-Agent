import crypto from "node:crypto";
import dbClient from "../../lib/database/db_client";

export interface MemorySection {
  id: string;
  missionId?: string | null;
  title: string;
  content: string;
  provenance: "user" | "agent" | "imported" | "system";
  userEdited: boolean;
  injectionStatus: "active" | "inactive";
}

function id() {
  return `memsec-${crypto.randomUUID()}`;
}

export class MemorySectionService {
  async upsert(input: Omit<MemorySection, "id" | "userEdited"> & { id?: string; userEdited?: boolean }): Promise<MemorySection> {
    const section: MemorySection = {
      id: input.id || id(),
      missionId: input.missionId || null,
      title: input.title,
      content: input.content,
      provenance: input.provenance,
      userEdited: input.userEdited ?? input.provenance === "user",
      injectionStatus: input.injectionStatus,
    };

    await dbClient.execute(
      `INSERT INTO Memory_Sections
        (id, mission_id, title, content, provenance, user_edited, injection_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         content = excluded.content,
         provenance = excluded.provenance,
         user_edited = excluded.user_edited,
         injection_status = excluded.injection_status,
         updated_at = CURRENT_TIMESTAMP`,
      [
        section.id,
        section.missionId,
        section.title,
        section.content,
        section.provenance,
        section.userEdited ? 1 : 0,
        section.injectionStatus,
      ],
    );

    return section;
  }

  async listActiveForMission(missionId: string): Promise<MemorySection[]> {
    const rows = await dbClient.query<any>(
      `SELECT * FROM Memory_Sections WHERE mission_id = ? AND injection_status = 'active' ORDER BY updated_at DESC`,
      [missionId],
    );
    return rows.map((row) => ({
      id: row.id,
      missionId: row.mission_id,
      title: row.title,
      content: row.content,
      provenance: row.provenance || "system",
      userEdited: row.user_edited === 1,
      injectionStatus: row.injection_status || "inactive",
    }));
  }

  async list(missionId?: string | null): Promise<MemorySection[]> {
    const rows = missionId
      ? await dbClient.query<any>(`SELECT * FROM Memory_Sections WHERE mission_id = ? ORDER BY updated_at DESC`, [missionId])
      : await dbClient.query<any>(`SELECT * FROM Memory_Sections ORDER BY updated_at DESC LIMIT 20`);
    return rows.map((row) => ({
      id: row.id,
      missionId: row.mission_id,
      title: row.title,
      content: row.content,
      provenance: row.provenance || "system",
      userEdited: row.user_edited === 1,
      injectionStatus: row.injection_status || "inactive",
    }));
  }

  async composePromptContext(missionId: string): Promise<string> {
    const sections = await this.listActiveForMission(missionId);
    return sections
      .map((section) => `## ${section.title}\nProvenance: ${section.provenance}${section.userEdited ? " (user edited)" : ""}\n${section.content}`)
      .join("\n\n");
  }
}

export const memorySectionService = new MemorySectionService();
