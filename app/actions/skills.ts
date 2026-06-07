/**
 * Skills & cron actions.
 *
 * Per Blueprint 5.0 Part 3.2, skills are first-class citizens
 * in the agent runtime. This module owns the CRUD over the
 * Skills and Cron_Jobs tables — both used by the skills page
 * and the orchestration hub.
 */
import crypto from 'crypto';
import dbClient from '@/lib/database/db_client';
import { triggerScheduledJob } from '@/lib/runtime/durable-executions';

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function fetchSkillsState() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Skills ORDER BY created_at DESC`);
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      provider: r.provider,
      tools: JSON.parse(r.tools || '[]'),
    }));
  } catch (error) {
    console.error("Failed to fetch skills:", error);
    return [];
  }
}

export async function createSkillAction(skill: { name: string; description: string; provider: string; tools: string[] }) {
  try {
    const id = newId('sk');
    const sql = `
      INSERT INTO Skills (id, name, description, provider, tools)
      VALUES (?, ?, ?, ?, ?)
    `;
    await dbClient.execute(sql, [id, skill.name, skill.description, skill.provider, JSON.stringify(skill.tools)]);
    return { success: true, id };
  } catch (error) {
    console.error("Failed to create skill:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteSkillAction(id: string) {
  try {
    await dbClient.execute(`DELETE FROM Skills WHERE id = ?`, [id]);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete skill:", error);
    return { success: false, error: String(error) };
  }
}

export async function fetchCronJobsState() {
  try {
    const rows = await dbClient.query(`SELECT * FROM Cron_Jobs ORDER BY created_at DESC`);
    return rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      interval: r.interval,
      targetAction: r.target_action,
      lastRun: r.last_run,
      status: r.status,
      assignedAgentId: r.assigned_agent_id || null,
      associatedTaskId: r.associated_task_id || null,
      scheduleExpression: r.schedule_expression || null,
      timezone: r.timezone || 'UTC',
      nextRunAt: r.next_run_at || null,
      maxConcurrency: Number(r.max_concurrency || 1),
      previousResult: r.previous_result || null,
      lastError: r.last_error || null,
    }));
  } catch (error) {
    console.error("Failed to fetch cron jobs:", error);
    return [];
  }
}

export async function toggleCronJobAction(id: string, currentStatus: string) {
  try {
    const newStatus = currentStatus === 'Active' ? 'Paused' : 'Active';
    await dbClient.execute(`UPDATE Cron_Jobs SET status = ? WHERE id = ?`, [newStatus, id]);
    return { success: true, newStatus };
  } catch (error) {
    console.error("Failed to toggle cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function triggerCronJobAction(id: string) {
  try {
    const execution = await triggerScheduledJob(id);
    return { success: true, lastRun: execution.scheduledFor, executionId: execution.id };
  } catch (error) {
    console.error("Failed to trigger cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function createCronJobAction(data: { name: string; interval: string; targetAction: string; assignedAgentId?: string; associatedTaskId?: string }) {
  try {
    const id = newId('cr');
    const sql = `
      INSERT INTO Cron_Jobs (id, name, interval, target_action, last_run, status, assigned_agent_id, associated_task_id)
      VALUES (?, ?, ?, ?, NULL, 'Active', ?, ?)
    `;
    await dbClient.execute(sql, [id, data.name, data.interval, data.targetAction, data.assignedAgentId || null, data.associatedTaskId || null]);
    return { success: true, id };
  } catch (error) {
    console.error("Failed to create cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function updateCronJobAction(id: string, data: { name: string; interval: string; targetAction: string; assignedAgentId?: string; associatedTaskId?: string }) {
  try {
    const sql = `
      UPDATE Cron_Jobs SET name = ?, interval = ?, target_action = ?, assigned_agent_id = ?, associated_task_id = ? WHERE id = ?
    `;
    await dbClient.execute(sql, [data.name, data.interval, data.targetAction, data.assignedAgentId || null, data.associatedTaskId || null, id]);
    return { success: true };
  } catch (error) {
    console.error("Failed to update cron job:", error);
    return { success: false, error: String(error) };
  }
}

export async function deleteCronJobAction(id: string) {
  try {
    await dbClient.execute(`DELETE FROM Cron_Jobs WHERE id = ?`, [id]);
    return { success: true };
  } catch (error) {
    console.error("Failed to delete cron job:", error);
    return { success: false, error: String(error) };
  }
}
