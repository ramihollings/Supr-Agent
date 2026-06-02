import crypto from "node:crypto";
import dbClient from "../../lib/database/db_client";

export interface AgentGroupMember {
  agentId: string;
  role: string;
  status: "active" | "paused" | "removed";
}

export interface AgentGroup {
  id: string;
  missionId: string;
  name: string;
  supervisorAgentId: string;
  sharedContext: string;
  status: "active" | "paused" | "archived";
  members: AgentGroupMember[];
}

function id() {
  return `grp-${crypto.randomUUID()}`;
}

export class AgentGroupService {
  async createGroup(input: {
    missionId: string;
    name: string;
    supervisorAgentId: string;
    sharedContext?: string;
    members?: Array<Omit<AgentGroupMember, "status"> & { status?: AgentGroupMember["status"] }>;
  }): Promise<AgentGroup> {
    const groupId = id();
    await dbClient.execute(
      `INSERT INTO Agent_Groups (id, mission_id, name, supervisor_agent_id, shared_context, status)
       VALUES (?, ?, ?, ?, ?, 'active')`,
      [groupId, input.missionId, input.name, input.supervisorAgentId, input.sharedContext || ""],
    );

    for (const member of input.members || []) {
      await this.addMember(groupId, member.agentId, member.role, member.status || "active");
    }

    const group = await this.getGroup(groupId);
    if (!group) throw new Error(`Agent group was not persisted: ${groupId}`);
    return group;
  }

  async addMember(groupId: string, agentId: string, role: string, status: AgentGroupMember["status"] = "active") {
    await dbClient.execute(
      `INSERT INTO Agent_Group_Members (group_id, agent_id, role, status)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(group_id, agent_id) DO UPDATE SET role = excluded.role, status = excluded.status`,
      [groupId, agentId, role, status],
    );
  }

  async updateSharedContext(groupId: string, sharedContext: string) {
    await dbClient.execute(
      `UPDATE Agent_Groups SET shared_context = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [sharedContext, groupId],
    );
  }

  async getGroup(groupId: string): Promise<AgentGroup | null> {
    const row = await dbClient.queryOne<any>(`SELECT * FROM Agent_Groups WHERE id = ?`, [groupId]);
    if (!row) return null;
    const members = await dbClient.query<any>(
      `SELECT agent_id, role, status FROM Agent_Group_Members WHERE group_id = ? ORDER BY joined_at ASC`,
      [groupId],
    );
    return {
      id: row.id,
      missionId: row.mission_id,
      name: row.name,
      supervisorAgentId: row.supervisor_agent_id,
      sharedContext: row.shared_context || "",
      status: row.status || "active",
      members: members.map((member) => ({
        agentId: member.agent_id,
        role: member.role,
        status: member.status || "active",
      })),
    };
  }

  async listForMission(missionId: string): Promise<AgentGroup[]> {
    const rows = await dbClient.query<any>(`SELECT id FROM Agent_Groups WHERE mission_id = ? ORDER BY created_at DESC`, [missionId]);
    const groups = await Promise.all(rows.map((row) => this.getGroup(row.id)));
    return groups.filter(Boolean) as AgentGroup[];
  }

  composeSupervisorContext(group: AgentGroup): string {
    const members = group.members.map((member) => `${member.agentId}:${member.role}:${member.status}`).join(", ");
    return `Supervisor group "${group.name}" (${group.status}). Lead: ${group.supervisorAgentId}. Members: ${members}. Shared context: ${group.sharedContext}`;
  }
}

export const agentGroupService = new AgentGroupService();
