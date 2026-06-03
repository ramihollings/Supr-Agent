import crypto from "crypto";
import { z } from "zod";
import { ToolDefinition, toolRegistry } from "../../lib/tools/registry";
import dbClient from "../../lib/database/db_client";

const TodoParams = z.object({
  action: z.enum(["list", "add", "update", "delete"]),
  missionId: z.string().describe("The mission ID context for the tasks."),
  taskId: z.string().optional().describe("Task ID (required for update or delete)."),
  title: z.string().optional().describe("Task title (required for add)."),
  status: z.enum(["Pending", "Active", "Completed", "Blocked"]).optional().describe("Task status (used for update)."),
  ownerAgentId: z.string().optional().describe("Agent ID to assign task to."),
  requiredPermission: z.string().optional().describe("Required permission level (e.g. 'Execute').")
});

type TodoParamsType = z.infer<typeof TodoParams>;

export const todoTool: ToolDefinition<TodoParamsType, string> = {
  name: "manage_todo",
  description: "Create, view, modify, and delete tasks/checklist items associated with a mission in the database.",
  parameters: TodoParams,
  requiredTier: "Edit",
  riskLevel: "Medium",
  execute: async (params) => {
    if (params.action === "list") {
      const rows = await dbClient.query<any>(
        "SELECT id, title, status, owner_agent_id as owner, required_permission as permission FROM Tasks WHERE mission_id = ?",
        [params.missionId]
      );
      if (rows.length === 0) {
        return `No tasks found for mission '${params.missionId}'.`;
      }
      return rows.map((r: any) => `- [${r.status === 'Completed' ? 'x' : ' '}] ${r.title} (ID: ${r.id}, Owner: ${r.owner || 'Unassigned'}, Permission: ${r.permission || 'Observe'})`).join("\n");
    }

    if (params.action === "add") {
      if (!params.title) {
        throw new Error("Title is required when adding a task.");
      }
      const taskId = `task-${crypto.randomUUID()}`;
      const status = params.status || "Pending";
      
      await dbClient.execute(
        `INSERT INTO Tasks (id, mission_id, title, status, owner_agent_id, required_permission)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [taskId, params.missionId, params.title, status, params.ownerAgentId || null, params.requiredPermission || "Observe"]
      );

      return `Successfully added task: "${params.title}" (ID: ${taskId})`;
    }

    if (params.action === "update") {
      if (!params.taskId) {
        throw new Error("taskId is required when updating a task.");
      }

      const updates: string[] = [];
      const values: any[] = [];

      if (params.title !== undefined) {
        updates.push("title = ?");
        values.push(params.title);
      }
      if (params.status !== undefined) {
        updates.push("status = ?");
        values.push(params.status);
      }
      if (params.ownerAgentId !== undefined) {
        updates.push("owner_agent_id = ?");
        values.push(params.ownerAgentId);
      }
      if (params.requiredPermission !== undefined) {
        updates.push("required_permission = ?");
        values.push(params.requiredPermission);
      }

      if (updates.length === 0) {
        return "No updates specified.";
      }

      values.push(params.taskId);
      values.push(params.missionId);

      await dbClient.execute(
        `UPDATE Tasks SET ${updates.join(", ")} WHERE id = ? AND mission_id = ?`,
        values
      );

      return `Successfully updated task ${params.taskId}`;
    }

    if (params.action === "delete") {
      if (!params.taskId) {
        throw new Error("taskId is required when deleting a task.");
      }

      await dbClient.execute(
        "DELETE FROM Tasks WHERE id = ? AND mission_id = ?",
        [params.taskId, params.missionId]
      );

      return `Successfully deleted task ${params.taskId}`;
    }

    return "Invalid action.";
  }
};

toolRegistry.registerTool(todoTool);
export default todoTool;
